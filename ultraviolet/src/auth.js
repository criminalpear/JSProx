// Optional shared-password gate. Enabled only when JSPROX_PASSWORD is set, so
// local development keeps working without a login.
//
// A successful login sets an HttpOnly cookie. Browsers send it with every
// same-origin request, including the service worker's script fetches and the
// Wisp WebSocket upgrade, so one check covers the whole proxy.
import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";

const COOKIE = "jsprox_auth";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 60 * 1000;
// Cap for all addresses together. The per-address limit trusts cf-connecting-ip,
// which a client can fake when the server is not behind Cloudflare.
const MAX_TOTAL_FAILURES = 30;
// Pages that must work before login: the form itself and the dashboard's health check.
const PUBLIC_PATHS = new Set(["/login", "/health", "/favicon.svg", "/icon.png"]);

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function sameText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function loginPage(message = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JSProx</title>
<style>body{background:#101714;color:#dbece6;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}
form{display:grid;gap:12px;width:min(320px,90vw)}input,button{font:inherit;padding:10px 12px;border-radius:8px;border:1px solid #356257;background:#152723;color:inherit}
button{background:#6ee7b7;color:#10251b;border:0;font-weight:700;cursor:pointer}p{color:#ff9b8d;margin:0;min-height:1.2em}</style></head>
<body><form method="post" action="/login"><h1>JSProx</h1><label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
<p role="status">${message}</p><button>Sign in</button></form></body></html>`;
}

export function createAuth(password, { now = () => Date.now() } = {}) {
  if (!password) return null;
  // The cookie holds a MAC of the password, never the password itself.
  // Changing JSPROX_PASSWORD signs everyone out.
  const token = createHmac("sha256", password).update("jsprox-session-v1").digest("hex");
  const failures = new Map();
  let total = { first: 0, count: 0 };

  function authorized(req) {
    return sameText(readCookie(req.headers.cookie, COOKIE), token);
  }

  function lockedOut(ip) {
    if (now() - total.first <= LOCKOUT_MS && total.count >= MAX_TOTAL_FAILURES) return true;
    const entry = failures.get(ip);
    if (!entry) return false;
    if (now() - entry.first > LOCKOUT_MS) {
      failures.delete(ip);
      return false;
    }
    return entry.count >= MAX_FAILURES;
  }

  function recordFailure(ip) {
    if (now() - total.first > LOCKOUT_MS) total = { first: now(), count: 0 };
    total.count++;
    const entry = failures.get(ip);
    if (!entry || now() - entry.first > LOCKOUT_MS) failures.set(ip, { first: now(), count: 1 });
    else entry.count++;
    // Bound memory if many addresses fail.
    if (failures.size > 10000) failures.delete(failures.keys().next().value);
  }

  const router = express.Router();
  router.get("/login", (req, res) => {
    if (authorized(req)) return res.redirect(303, "/");
    res.set("Cache-Control", "no-store").type("html").send(loginPage());
  });
  router.post("/login", express.urlencoded({ extended: false, limit: "2kb" }), (req, res) => {
    // Behind Cloudflare every request arrives from the Worker; the visitor is in cf-connecting-ip.
    const ip = req.get("cf-connecting-ip") || req.ip || req.socket.remoteAddress || "";
    res.set("Cache-Control", "no-store");
    if (lockedOut(ip))
      return res.status(429).type("html").send(loginPage("Too many attempts. Wait a minute and try again."));
    if (!sameText(req.body?.password ?? "", password)) {
      recordFailure(ip);
      return res.status(401).type("html").send(loginPage("Incorrect password."));
    }
    failures.delete(ip);
    const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: MAX_AGE_SECONDS * 1000,
      path: "/",
    });
    res.redirect(303, "/");
  });
  router.post("/logout", (req, res) => {
    res.clearCookie(COOKIE, { path: "/" }).redirect(303, "/login");
  });
  router.use((req, res, next) => {
    if (PUBLIC_PATHS.has(req.path) || authorized(req)) return next();
    res.set("Cache-Control", "no-store");
    // Page loads go to the login form; scripts, workers and API calls get a plain 401.
    if (
      req.method === "GET" &&
      req.accepts(["html", "*/*"]) === "html" &&
      req.get("sec-fetch-dest") !== "script"
    )
      return res.redirect(303, "/login");
    res.status(401).type("text").send("JSProx sign-in required.");
  });

  return {
    router,
    // For the WebSocket upgrade, which bypasses Express.
    authorized,
  };
}
