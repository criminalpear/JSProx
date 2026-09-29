import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { patchScramjetBundle } from "./scramjet-compat.js";
import { createAuth } from "./auth.js";
import { dirname, join } from "node:path";
import { hostname } from "node:os";
import { createServer } from "node:http";
import express from "express";
import compression from "compression";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicPath = join(__dirname, "..", "public");

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.get("/health", (req, res) => res.set("Cache-Control", "no-store").json({ ok: true, name: "JSProx" }));

// Set JSPROX_PASSWORD on any server reachable by other people. Without it the
// proxy is open to anyone who finds the address.
const auth = createAuth(process.env.JSPROX_PASSWORD);
if (auth) app.use(auth.router);

// Our own public files first so our uv.config.js / sw.js win over the vendor copies.
app.use(express.static(publicPath, { maxAge: 0 }));
// Vendor bundles.
// The patched bundle is large and never changes while the server runs, so it is
// compressed once here instead of on every request.
const scramjetBundle = patchScramjetBundle(readFileSync(join(scramjetPath, "scramjet.all.js"), "utf8"));
const scramjetGzip = gzipSync(scramjetBundle, { level: 9 });
const scramjetEtag = `"${createHash("sha256").update(scramjetBundle).digest("base64url").slice(0, 27)}"`;
app.get("/scram/scramjet.all.js", (req, res) => {
  // no-cache still allows 304 revalidation; a server restart with new patches changes the ETag.
  res.set({ "Cache-Control": "no-cache", ETag: scramjetEtag, Vary: "Accept-Encoding" });
  res.type("application/javascript");
  if (req.acceptsEncodings("gzip") === "gzip") {
    res.set("Content-Encoding", "gzip").send(scramjetGzip);
  } else {
    res.send(scramjetBundle);
  }
});
app.use("/scram/", express.static(scramjetPath));
app.use("/uv/", express.static(uvPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/libcurl/", express.static(libcurlPath));
app.use("/baremux/", express.static(baremuxPath));

app.use((req, res) => {
  res.status(404).sendFile(join(publicPath, "404.html"));
});

const server = createServer();

server.on("request", (req, res) => {
  // Ultraviolet needs cross-origin isolation for its transports.
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  app(req, res);
});

server.on("upgrade", (req, socket, head) => {
  if (auth && !auth.authorized(req)) {
    socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    return;
  }
  if (new URL(req.url, "http://localhost").pathname === "/wisp/") {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.end();
  }
});

let port = parseInt(process.env.PORT || "");
if (isNaN(port)) port = 8080;

server.on("listening", () => {
  const address = server.address();
  console.log(
    auth
      ? "Password protection is on."
      : "No JSPROX_PASSWORD set: anyone who can reach this port can use it.",
  );
  console.log("JSProx listening on:");
  console.log(`\thttp://localhost:${address.port}`);
  console.log(`\thttp://${hostname()}:${address.port}`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));

server.listen({ port });
