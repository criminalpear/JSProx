import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { once } from "node:events";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = String(8200 + Math.floor(Math.random() * 500));
const origin = `http://localhost:${port}`;
const password = "correct horse battery";
let server;

before(async () => {
  server = spawn(process.execPath, ["src/index.js"], {
    cwd: root,
    env: { ...process.env, PORT: port, JSPROX_PASSWORD: password },
    stdio: "ignore",
    windowsHide: true,
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
});
after(async () => {
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
});

const login = (value, headers = {}) =>
  fetch(origin + "/login", {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams({ password: value }),
  });

function upgrade(cookie) {
  return new Promise((resolve, reject) => {
    const req = request(origin + "/wisp/", {
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve(res.statusCode);
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", reject);
    req.end();
  });
}

test("password gate protects pages, assets and the Wisp WebSocket", async () => {
  const page = await fetch(origin + "/", { redirect: "manual", headers: { accept: "text/html" } });
  assert.equal(page.status, 303);
  assert.equal(page.headers.get("location"), "/login");
  assert.equal((await fetch(origin + "/health")).status, 200);
  assert.equal((await fetch(origin + "/scram/scramjet.all.js")).status, 401);
  assert.equal(await upgrade(), 401);

  const wrong = await login("nope", { "cf-connecting-ip": "203.0.113.1" });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null);

  const right = await login(password);
  assert.equal(right.status, 303);
  const cookie = right.headers.get("set-cookie").split(";")[0];
  assert.match(right.headers.get("set-cookie"), /HttpOnly/i);
  assert.equal(cookie.includes(password), false);

  assert.equal((await fetch(origin + "/", { headers: { cookie } })).status, 200);
  assert.equal((await fetch(origin + "/sw.js", { headers: { cookie } })).status, 200);
  assert.equal(await upgrade(cookie), 101);
  assert.equal(await upgrade(cookie.replace(/.$/, "0")), 401);
});

test("repeated wrong passwords are locked out per visitor", async () => {
  const visitor = { "cf-connecting-ip": "198.51.100.7" };
  for (let i = 0; i < 5; i++) assert.equal((await login("guess" + i, visitor)).status, 401);
  assert.equal((await login(password, visitor)).status, 429);
  // Another visitor is unaffected.
  assert.equal((await login(password, { "cf-connecting-ip": "198.51.100.8" })).status, 303);
});

test("patched Scramjet bundle is served pre-compressed with a stable ETag", async () => {
  const cookie = (await login(password)).headers.get("set-cookie").split(";")[0];
  const res = await new Promise((resolve, reject) =>
    request(origin + "/scram/scramjet.all.js", { headers: { cookie, "accept-encoding": "gzip" } }, (r) => {
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => resolve({ headers: r.headers, body: Buffer.concat(chunks) }));
    })
      .on("error", reject)
      .end(),
  );
  assert.equal(res.headers["content-encoding"], "gzip");
  assert.match(gunzipSync(res.body).toString("utf8"), /normalizeProxyHeaders/);
  const etag = res.headers.etag;
  assert.ok(etag);
  // node:http rather than fetch: fetch adds its own cache headers to conditional requests.
  const status = await new Promise((resolve, reject) =>
    request(origin + "/scram/scramjet.all.js", { headers: { cookie, "if-none-match": etag } }, (r) => {
      r.resume();
      resolve(r.statusCode);
    })
      .on("error", reject)
      .end(),
  );
  assert.equal(status, 304);
});

test("SIGTERM exits promptly even with an open Wisp WebSocket", async () => {
  const shutdownPort = String(Number(port) + 1);
  // Delivered from inside the process: on Windows an external SIGTERM is a hard kill.
  const script = `
    process.env.PORT = ${JSON.stringify(shutdownPort)};
    await import(${JSON.stringify(new URL("../src/index.js", import.meta.url).href)});
    await new Promise((r) => setTimeout(r, 1500));
    const ws = new WebSocket("ws://localhost:${shutdownPort}/wisp/");
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    process.emit("SIGTERM");
  `;
  const started = Date.now();
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true,
  });
  const exited = once(child, "exit");
  const timer = setTimeout(() => child.kill(), 15000);
  const [code] = await exited;
  clearTimeout(timer);
  assert.equal(code, 0);
  assert.ok(Date.now() - started < 8000, "took " + (Date.now() - started) + " ms");
});
