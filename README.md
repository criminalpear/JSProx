# JS Console Proxy

Load sites through your own origin and inject a floating JavaScript console into every
page, so you can run JS against the **real page** (its DOM, its variables) — the thing a
normal webpage can't do across origins, and the thing a disabled-DevTools browser won't
give you.

There are **two tiers**. Both need a machine that runs Node.js (the "host"); the
Chromebook just opens the result in a browser.

| | `ultraviolet/` (recommended) | root (`server.js`) |
|---|---|---|
| Engine | Ultraviolet (service-worker rewriting) | node-unblocker (server rewriting) |
| Site compatibility | High — handles most runtime-built URLs, SPAs, logins | Low — static / simple-dynamic sites only |
| Setup | `npm install` pulls a real proxy stack | tiny, single server file |
| Use when | You want GitHub / most sites + logins to actually work | Quick test, minimal dependencies |

Also included: `console.html` — a standalone console that runs only in its own page (no
proxy). Good as a plain JS scratchpad when DevTools is off.

---

## Tier 1 — Ultraviolet (recommended)

Much better site + login compatibility. Uses Ultraviolet + a wisp server + bare-mux/epoxy.

```bash
cd ultraviolet
npm install
npm start
```

Open the printed URL (`http://localhost:8080` locally, or the host's LAN / cloud URL).
Type a site in the address bar, press **Go**. On any loaded page:

- **Ctrl + `** toggles the console, or click the round **>_** button (bottom-right).
- **Execute** button or **Enter** runs; **Shift+Enter** = newline; **↑/↓** = history.
- Captures the page's `console.log/warn/error` and uncaught errors too.

The console is injected by `public/uv/sw.js`, which appends `public/inject.js` to every
HTML response the service worker produces.

## Tier 2 — node-unblocker (simple fallback)

```bash
npm install
npm start        # http://localhost:8080
```

Enter a site on the landing page and hit **Load**. Same console controls as above.

---

## Where to host it (the GitHub Pages question)

**GitHub Pages alone can't run this.** Pages is static-only; a proxy needs a server to
fetch cross-origin content. Your options:

1. **GitHub Codespaces (easiest all-in-one).** This repo ships a `.devcontainer/` that
   auto-installs and auto-starts the UV server. Steps:
   - Push this folder to a GitHub repo → **Code ▸ Codespaces ▸ Create codespace**.
   - Wait for setup: it runs `npm install` in `ultraviolet/`, then starts the server on
     port 8080 (logs at `/tmp/uv.log`; restart manually with `cd ultraviolet && npm start`).
   - Open the **Ports** tab, find **UV Console Proxy (8080)**, and open its
     `https://…app.github.dev` URL — **that's the link you use on the Chromebook.**
   - To open it on a different device (your Chromebook), right-click the port and set
     **Port Visibility ▸ Public** (GitHub can't force this from the devcontainer file).
2. **Any Node host** — Render / Fly.io / Replit / a VPS / your other computer. Run Tier 1,
   open the URL it gives you.
3. **GitHub Pages + a separate server (advanced).** You *can* put `ultraviolet/public/`
   on Pages, but the frontend must point its wisp/transport at a Node "bare/wisp" server
   running elsewhere (a Codespace or host), and that server needs matching CORS +
   `Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` headers. More moving parts;
   only worth it if you specifically want the UI on Pages. For a personal test, option 1 or 2 is simpler.

## Known limits (not bugs)

- **Logins live in the proxy's session**, not your browser — you log in *as the proxy*.
- **Hardened sites still resist.** Google login, banks, DRM video (YouTube), and anything
  with serious anti-proxy / anti-bot defense may refuse or fail even under Ultraviolet.
  This is them defending against exactly this technique — not a fixable bug here.
- Ultraviolet needs cross-origin isolation (COOP/COEP) — already set in `src/index.js`.

## Files

**`ultraviolet/`**
- `src/index.js` — Express + wisp server; serves the UV / epoxy / baremux vendor bundles and `public/`.
- `public/index.html` · `index.css` · `index.js` — address-bar UI + iframe browser.
- `public/uv/uv.config.js` — Ultraviolet config (paths, URL codec).
- `public/uv/sw.js` — service worker; runs UV **and** injects the console into HTML responses.
- `public/register-sw.js` · `search.js` — SW registration + URL/search parsing.
- `public/inject.js` — the floating console.

**root (Tier 2)**
- `server.js` — Express + node-unblocker; splices the console into HTML before `</body>`.
- `inject.js` — the floating console.
- `console.html` — standalone in-page console, no proxy.
