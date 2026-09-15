# JSProx

A self-hosted web proxy with a customizable home dashboard and an in-page JavaScript console. Scramjet is the default engine; Ultraviolet is available as a fallback.

## Run or update

Use Node.js 22 or newer:

    cd ultraviolet
    npm ci
    npm start

Open http://localhost:8080. Remote hosting needs HTTPS for service workers. After updating, reload the JSProx home page so the new app code can initialize a fresh transport. The original ultraviolet folder name is preserved for deployment compatibility. The root npm start command still runs the older node-unblocker fallback.

## Connection recovery

Wisp MuxTaskEnded means the underlying multiplexed connection has ended. The previous app checked only which transport module was selected, so it could keep using a dead worker across server restarts.

JSProx now initializes a fresh transport on the first navigation in each app session. Libcurl 1.5.0 is the default compatible transport; Epoxy 2.1.28 remains selectable in Settings. Reconnect explicitly replaces the transport without clearing cookies. This connection is shared by JSProx tabs, so other tabs may need reloading after a reset.

A navigation response reporting a connection error can trigger one automatic retry, only for GET requests. Forms, login POSTs and background requests are never automatically replayed. A server outage, network restriction or site-specific failure may still require intervention. Reconnect reports unavailable servers and setup timeouts.

## Home and settings

- Dark mode by default, with light/system themes and a contrast-adjusted accent color. The first launch of this redesign moves older preferences to dark mode; later theme choices are remembered.
- Home background from a direct HTTP/HTTPS image link or an uploaded PNG, JPEG, WebP or GIF up to 12 MB. Images are validated, resized to at most 1920 pixels, and saved locally as a WebP still image. Linked images load through the proxy to avoid cross-origin isolation blocks. Settings includes a preview, error messages, and brightness control.
- Editable shortcuts, bookmarks, and optional local recent destinations (off by default).
- Scramjet/UV engine, Libcurl/Epoxy transport, and DuckDuckGo/Google/Bing/Brave search selection.
- Optional start-page URL, custom tab title, and built-in tab icons.
- Preference export/import and reset. Exports include preferences, shortcuts and bookmarks, not site cookies or browsing history.
- A simple search-first home, JSP monogram logo, persistent sidebar show/hide arrow, quick theme toggle, Copy original URL, and a short Help dialog.
- Full-page proxied browsing and a clearly labeled Cloaking menu. Choose Open cloaked tab to carry your current site into an about:blank wrapper.

The about:blank wrapper can keep about:blank in its tab's address bar. It cannot substitute an arbitrary website URL, hide network traffic, or guarantee that no history is recorded. Some browser configurations block popups or embedded pages; Full page remains available.

## Console

The hideable bookmarks bar supports website links and `javascript:` bookmarklets, with add/edit/remove and left/right ordering in Bookmarks. Right-click a bar item to edit it. Visibility and items persist locally and items are included in preference exports. Bookmarklets execute on the active proxied page only when clicked. The default Ad cleanup hides common ad containers without deleting game frames, scripts, or videos; reload to undo it. It is cosmetic cleanup, not a network ad blocker.

Ctrl + backtick or the labeled Console pill opens the console. The panel has a close button, accessible expanded state, and All logs / Errors / Warnings filters. Enter executes; Shift+Enter inserts a line; arrow keys recall the current session's command history.

Only the main proxied document gets a console; nested game frames do not add extra buttons or logging hooks. Page-log capture runs only while the panel is open, avoiding hidden formatting and DOM work during games. Open-panel scrolling is batched per animation frame and filtering processes only new rows. Native browser logs still work. These changes reduce console overhead; they do not guarantee a particular game frame rate.

Normal mode uses global eval. The optional Await mode allows asynchronous snippets; its function scope differs from normal mode. Use an explicit return to display a result in Await mode. Bookmarklet javascript: prefixes are accepted. Import loads a local JS file into the editor without executing it; Export downloads the visible output. Output is capped at 500 rows and history at 100 commands.

Scripts still depend on the page, the proxy engine and browser APIs. Browser-extension and userscript-manager APIs such as chrome.* and GM_* are not supplied. No console can guarantee compatibility with every script.

## Game compatibility and connection tools

The supplied Icon.png is now the application logo and default tab icon. The sidebar Connection panel shows connection details, recent recovery events, reconnect and alternate-transport controls, and a downloadable report containing hostnames rather than full browsing URLs. The fullscreen game-view button uses the browser's fullscreen mode; press Escape to leave.

A scoped Scramjet compatibility fix makes CrazyGames Gameframe module imports share one runtime. Previously, differently suffixed module URLs created duplicate React instances and left games blank. Kick the Buddy was checked live and reached its rendered game screen with the character and controls. This is not a guarantee for every game or advertising SDK. Scramjet's noisy caught-exception debug logging is disabled; ordinary page errors remain available.

Connection error 35 (SSL handshake) and MuxTaskEnded can trigger one alternate Libcurl/Epoxy attempt for bodyless GET/HEAD requests. A successful alternate is remembered per origin for ten minutes. POST requests and certificate verification failures are not retried. Xbox's public page loaded in testing, but the intermittent handshake error was tested with controlled failures; account login and cloud streaming remain unverified.

The test command includes eleven focused module/transport tests alongside the browser regression suite.

## Loading performance

The home dashboard loads proxy-engine bundles on demand. A small Libcurl adapter waits for its WASM initialization before the first request, fixing cold-start image fetch failures without replaying requests. The server compresses eligible assets, the console caps retained output, and injection does not add a second whole-document buffer. Site speed still depends on the upstream host, the proxy host and the page itself; no universal speedup is claimed.

## Validation

Install development dependencies and a Playwright browser:

    npm ci
    npx playwright install chromium
    npm test

The browser suite starts its own server on port 8092 (override TEST_PORT), uses example.com for live proxy checks, and tests settings persistence, wallpaper upload, shortcuts, console behavior, forced connection failure, non-GET retry protection, reconnect after a real server restart, UV/Epoxy fallback, about:blank navigation and mobile layout. Tests need internet access. Screenshots are written into tests/.

Account login, CAPTCHA acceptance, video playback and individual game compatibility need testing with those services. They are not guaranteed by these checks.

## Project copies

The outer project and the existing nested JSProx directory contain matching application sources and lockfiles. Install dependencies in whichever copy you run. Do not run both on the same port.

## Upstream projects

- https://github.com/MercuryWorkshop/scramjet
- https://github.com/titaniumnetwork-dev/Ultraviolet
- https://github.com/MercuryWorkshop/libcurl-transport
- https://github.com/MercuryWorkshop/wisp-client-js

Published package generations are deliberately kept compatible with bare-mux 2. Upstream development APIs and newer transport major versions may differ.
