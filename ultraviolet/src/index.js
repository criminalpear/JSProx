import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { patchScramjetBundle } from "./scramjet-compat.js";
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

// Our own public files first so our uv.config.js / sw.js win over the vendor copies.
app.use(express.static(publicPath, { maxAge: 0 }));
// Vendor bundles.
const scramjetBundle=patchScramjetBundle(readFileSync(join(scramjetPath,'scramjet.all.js'),'utf8'));
app.get('/scram/scramjet.all.js',(_req,res)=>res.type('application/javascript').send(scramjetBundle));
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
  console.log("JSProx listening on:");
  console.log(`\thttp://localhost:${address.port}`);
  console.log(`\thttp://${hostname()}:${address.port}`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));

server.listen({ port });
