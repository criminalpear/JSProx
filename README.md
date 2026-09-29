# JSProx

A self-hosted web proxy with a customizable home dashboard and an in-page JavaScript console. Scramjet is the default proxy engine; Ultraviolet is available as a fallback.

Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Run it

Node.js 22 or newer:

    cd ultraviolet
    npm ci
    npm start

Open http://localhost:8080. Service workers need HTTPS on any host other than localhost.

Stop the server before running `npm ci`, especially on Windows: loaded native modules can be locked and leave the install incomplete. After updating, restart the server and reload the JSProx page so the patched Scramjet bundle and the service worker update.

### Password

Anyone who can reach the server can use it as a proxy. On any server other people can reach, set a password:

    JSPROX_PASSWORD="choose-something-long" npm start

Visitors then get a sign-in page. A successful sign-in sets an HttpOnly cookie for 30 days. The cookie protects the pages, the proxy engine files and the Wisp WebSocket. After 5 wrong passwords, an address is locked out for a minute, and the whole server stops accepting attempts after 30 failures in a minute. Changing the password signs everyone out. Without `JSPROX_PASSWORD`, the server prints a warning and stays open (fine for localhost).

The Wisp relay refuses connections to localhost and private network addresses (wisp-js defaults), so the proxy cannot be used to reach machines on the server's own network.

### Cloudflare Containers

The repository root deploys the same server as a Cloudflare Container (`wrangler.jsonc`, `cloudflare/worker.js`, `Dockerfile`):

    npm ci
    npx wrangler secret put JSPROX_PASSWORD
    npm run deploy

The Worker passes the secret to the container. Open WebSockets count as activity, so a game session keeps the container awake. `sleepAfter` only applies once nothing is connected.

### Docker

    docker build -t jsprox .
    docker run -p 8080:8080 -e JSPROX_PASSWORD=... jsprox

## How it works

```
browser tab
 └─ dashboard (public/index.html + scripts)        ← served by src/index.js (Express)
     └─ <iframe id="uv-frame"> /service/<url>       ← proxied page
          │ fetches go to the service worker (public/sw.js)
          ▼
     Scramjet / Ultraviolet rewrite the page and its requests
          │ BareMux SharedWorker → resilient-transport.mjs (Libcurl or Epoxy)
          ▼
     WebSocket /wisp/  ──►  src/index.js Wisp server  ──►  the real website
```

- **Server** (`ultraviolet/src/`): serves the dashboard and the vendor bundles, patches Scramjet 1.1.0 at startup (`scramjet-compat.js`), runs the Wisp relay, and applies the optional password gate (`auth.js`).
- **Service worker** (`public/sw.js`, `public/uv/sw.js`): routes proxied requests through the engine. `console-response.js` adds JSProx's page scripts to proxied HTML: the console (`inject.js`), `_top` form handling (`form-target-compat.js`), and, for pages opened in the whole tab, `transport-bootstrap.js`, which starts that page's own connection.
- **Transports** (`public/resilient-transport.mjs`): uses Libcurl or Epoxy. On an SSL-handshake failure or a dropped connection, it retries a bodyless GET/HEAD once on the other transport and remembers the working one per site for ten minutes. POST requests and certificate errors are never retried.
- **Dashboard** (`public/`): plain scripts loaded in order from `index.html`. They share globals, and `main.js` starts the app.

  | File | Contents |
  | --- | --- |
  | `app-state.js` | preferences in localStorage, shared helpers |
  | `connection.js` | engine loading, BareMux, transport setup |
  | `browsing.js` | navigation, back/forward, recovery, error reporting, Xbox handoff |
  | `nav-history.js` | back/forward list (DOM-free, unit tested) |
  | `settings.js` | theme, background image, import/export |
  | `dashboard.js` | shortcuts, dialogs, sidebar, diagnostics, cloaking |
  | `bookmarks.js` | bookmarks bar and bookmarklets |

## Features

- Search-first home with shortcuts, bookmarks, `javascript:` bookmarklets and optional recent destinations (off by default). Includes a default "Ad cleanup" bookmarklet that hides common ad containers; it only hides them, it doesn't block ads.
- Themes, accent color, a background image (uploaded, or loaded from a link through the proxy), tab title and icon, and preference export/import.
- Console: Ctrl + backtick or the toolbar button. It supports Await mode, history, and log filters, keeps at most 500 output rows, and runs only in the main proxied page, not nested game frames.
- Connection panel: recent transport events, reconnect, switching transport, and a report that contains hostnames only.
- Cloaking: opens JSProx inside an `about:blank` tab. This changes what the address bar shows. It does not hide network traffic or browser history.
- Xbox Cloud Gaming: when you are signed in on an `xbox.com/play` page, JSProx moves the page into the whole tab, so keyboard lock and fullscreen work.

Sites with strong bot checks, Google sign-in inside frames, and some game hosts may still refuse to work. Anything beyond what the tests cover (below) needs testing on the actual site.

## Development

    cd ultraviolet
    npx playwright install chromium   # once
    npm test                          # unit tests + browser suite (needs internet)
    npm run test:unit                 # unit tests only
    npm run format                    # Prettier
    npm run check:scramjet            # do our bundle patches fit the newest Scramjet?

The browser suite starts its own server on port 8092 (override with `TEST_PORT`). It uses example.com and httpbin.org as live sites and writes screenshots to `tests/`. GitHub Actions run the tests on every push and run the Scramjet check weekly.

### Upgrading Scramjet

`src/scramjet-compat.js` edits the served bundle in eleven exact places. Each edit must match exactly one spot, so a changed bundle stops the server instead of getting a wrong edit. Before you upgrade, run `npm run check:scramjet -- <version>`. It lists each patch that no longer matches: either the upstream bug was fixed (delete the patch) or the code moved (update it). Scramjet 2.x no longer ships `scramjet.all.js`, so moving to it is a port, not a version bump.

## Repository layout

- `ultraviolet/`: the app. The folder name is kept for existing deployments.
- `cloudflare/`, `wrangler.jsonc`, `Dockerfile`: deployment.
- `legacy/`: the original node-unblocker version, kept for reference only (`cd legacy && npm install && npm start`).

## Upstream projects

- https://github.com/MercuryWorkshop/scramjet
- https://github.com/titaniumnetwork-dev/Ultraviolet
- https://github.com/MercuryWorkshop/libcurl-transport
- https://github.com/MercuryWorkshop/wisp-client-js

Package versions are kept compatible with bare-mux 2.
