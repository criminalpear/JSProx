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
- Collapsible toolbar/bookmarks and a Cloaking menu that carries your current site into an about:blank wrapper.

The about:blank wrapper can keep about:blank in its tab's address bar. It cannot substitute an arbitrary website URL, hide network traffic, or guarantee that no history is recorded. Some browser configurations block popups or embedded pages.

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

The test command includes twenty focused compatibility/transport tests alongside the browser regression suite.

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

## Compact controls and access errors

The sidebar arrow is the first control at the upper left, followed by the toolbar/bookmarks arrow. Both remain together at the top when the toolbar is hidden; there is no bottom restore button. The console launcher is hidden by default on each new page; use the toolbar console toggle or Ctrl+backtick. Settings offers additional tab icons. Cloak in new tab creates an about:blank wrapper. Cloak current tab navigates the original tab to about:blank. A temporary helper popup builds its wrapper after navigation and closes itself. The original tab is never closed, so manually opened tabs work too. Popups must be allowed; a blocked popup leaves the original page intact.

Main-page HTTP 401/403 failures are reported without retrying credentials. Connection tools offer Open original site (no proxy). Google embedded sign-in restrictions and site anti-bot decisions are not resolved by these UI changes; additional game compatibility fixes require a reproducible game URL.

## URL compatibility check

The main iframe is registered through ScramjetController.createFrame. The server applies a checked, version-specific patch to the served Scramjet 1.1.0 bundle to avoid wrapping already-proxied URLs again. This fixes GitHub history changes corrupting the apparent upstream URL. The dependency is pinned; a changed bundle fails the patch check rather than silently applying an incompatible edit. Vendor files remain untouched.

Live checks: GitHub login-page URL remains canonical (successful authentication still needs user verification). YouTube “Me at the zoo” played without login, with no ad showing and its video clock advancing from 6.94 to 9.95 seconds. This does not guarantee every network/session or Google sign-in works. Smash Karts and 2048 game-file hosts returned security-block 403 pages; Smash Karts also returned 403 in direct Chromium and both proxy transports. JSProx now surfaces CrazyGames game-frame access errors separately from ordinary advertising failures.

## Navigation reliability update

Scramjet's outgoing transport headers now decode the source page in Origin/Referer without constructing a new browser Request (which would silently strip those headers). Null and already-external origins stay unchanged; POST bodies are neither reconstructed nor replayed. This addresses a login-header defect, but successful GitHub authentication remains unverified.

The stored referrer-chain traversal now detects cycles and stops after at most 64 entries. Previously a self-reference or longer cycle could run indefinitely during iframe navigation. Regression tests exercise both cycle types. Normal browsing also disables Scramjet source-map capture to reduce debug overhead.

Live Chrome testing reproduced a stall after clicking a YouTube search result. Browser automation then stopped responding, including attempts to close its test tab. The earlier direct-video playback success does not establish that search-to-video navigation is fixed. The cycle fix passes regression tests but still needs a fresh live Chrome verification after restarting the server. Some tested CrazyGames game-file URLs returned security 403 responses; broad game compatibility is not established.

Certificate verification errors are explicitly reported and never automatically retried. During Chrome testing, Epoxy loaded YouTube where Libcurl reported certificate error 60; Epoxy was left selected in that local browser profile, with certificate verification enabled.

Restart the Node server and reload JSProx after this update: the compatibility bundle is patched once at server startup.
## Session cookies and same-tab cloaking

Scramjet's bundled cookie parser now preserves percent escapes in opaque cookie values. Previously signed session cookies could change before being sent back to the site. Its cookie store also restores persisted object snapshots, rather than ignoring them. Request normalization forwards the browser-generated Request.referrer even when Request.headers omits Referer, while retaining no-referrer and origin-only restrictions.

A fresh live GitHub test reproduced “Your browser did something unexpected” with an empty login submission before the cookie fix. After the fix the same submission reached the ordinary “Incorrect username or password” response. No account credentials were used; successful authentication and two-factor flows remain unverified.

Current-tab cloaking preserves the original tab and uses a short-lived helper popup, because navigating to about:blank destroys the original document's scripts. Chromium tests cover manually opened tabs, automatic helper closure, title retention, cross-origin isolation, and popup-block handling. An already cloaked page does not create another wrapper.

Fresh Epoxy and Libcurl checks played YouTube's “Me at the zoo” to completion, including navigation from a search result. This does not establish a fix for the reported renderer crash on other videos or browser profiles. Site security blocks and individual games still need their exact failing URLs.

Restart the Node server and reload JSProx to load the updated served Scramjet bundle and service worker. Both project copies contain these changes.
## YouTube search navigation and matching controls

YouTube search submissions and ordinary search/watch link clicks now perform a full document navigation through Scramjet. This avoids reusing YouTube's intercepted application state between the home page, results, and video playback. It applies only to YouTube documents; embedded players, modifier clicks, new-tab links, and links to other sites retain their existing behavior. The compatibility script runs independently of console settings.

Before this change, a fresh Chrome session could update its YouTube URL after a typed search while leaving the home page displayed. With the change, typing “minecraft” into YouTube, submitting with Enter, and clicking the first video result loaded a playing video whose clock advanced from 2.08 to 22.19 seconds without a captured page error. This is a targeted navigation workaround, not proof that every renderer crash or video is fixed.

The sidebar and top-controls arrows share one centered SVG chevron, stroke width, icon size, and button size. Their direction reflects the controls' expanded state; both remain at the upper left when the top bar is hidden.

Validation includes twenty focused tests, a local browser test for YouTube search/video navigation and modifier/new-tab behavior, current-tab cloaking checks, and the existing full browser suite. Restart the server and reload JSProx before testing the updated worker and scripts.
## Game asset paths and early YouTube navigation handling

Scramjet 1.1.0 returned only the origin from `document.baseURI` and resolved relative base tags against the origin. The served bundle now preserves the complete document URL, selects `base[href]`, and resolves relative base tags against the document path. This prevents loaders from requesting `/assets/...` when a game lives under `/game/version/`. Focused regressions exercise both the DOM getter and the rewriter's base getter.

Hexa Stack was reproduced stuck on its Softgames spinner. Before the patch, its font and texture metadata requests went to the host root and returned 404. After the patch, it reached the rendered tutorial/game board. A subsequent Train Miner test also reached its rendered “HOLD TO MOVE” tutorial and controls after roughly a minute. Startup remains slower than direct browsing, and font/rendering differences remain; extended gameplay was not tested.

YouTube's search/video compatibility listener now loads at the beginning of the head, before site handlers, and supports both Scramjet's URI encoding and Ultraviolet's XOR encoding. Previously it was appended after site scripts and only covered Scramjet. Early insertion buffers at most 8 KiB and preserves response bytes and the doctype; responses without a usable early head retain tail insertion. Tests cover streaming boundaries, encoding, modifiers and new-tab links. Fresh Chrome search-to-thumbnail-to-playback checks passed on both engines. The reported STATUS_BREAKPOINT crash was not reproduced in these fresh profiles, so validation on the affected Chrome session remains necessary.

The full suite now passes 24 focused tests plus YouTube, cloak, and general browser checks. Refresh the JSProx home page after restarting the server so both the patched bundle and worker update.
## Missing connection library recovery

The dashboard now loads BareMux on demand instead of constructing its connection during startup. A missing or invalid library no longer prevents shortcuts, settings, or form handlers from initializing. Navigation reports the failure and can be retried after the library is restored. Browser regressions cover a 404, a script with missing exports, and successful navigation after retry.

Stop the Node server before running `npm ci`, especially on Windows: loaded native modules can be locked, leaving an interrupted reinstall incomplete. Start the server again after installation finishes.
