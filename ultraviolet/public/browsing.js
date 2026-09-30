"use strict";
// The proxied frame: navigation, back/forward, recovery, error reporting and Xbox handoff.
const navHistory = createNavHistory();
function isXboxCloudUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === "www.xbox.com" && /^\/(?:[a-z]{2}-[a-z]{2}\/)?play(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}
function isXboxLaunchUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === "www.xbox.com" && /^\/(?:[a-z]{2}-[a-z]{2}\/)?play\/launch\//i.test(url.pathname);
  } catch {
    return false;
  }
}
let openingXboxCloud = false;
function openXboxCloud(href) {
  if (openingXboxCloud) return;
  openingXboxCloud = true;
  location.assign(href);
}
function maybeOpenXboxCloud() {
  // Inside a cloaked about:blank wrapper, the "whole tab" is still an iframe:
  // keyboard lock stays unavailable, and replacing this dashboard would drop
  // the connection it owns (transport-bootstrap.js only runs in real top-level
  // documents), so every request from the Xbox page would hang.
  if (window.top !== window) return;
  if (openingXboxCloud || !isXboxCloudUrl(currentUrl())) return;
  try {
    const child = frame.contentDocument;
    if (child?.readyState !== "complete") return;
    // A stream started quickly can hide the header before the profile check
    // runs, leaving the game in the frame where keyboard lock is denied.
    // Launch routes already require a signed-in account.
    if (isXboxLaunchUrl(currentUrl())) {
      openXboxCloud(frame.contentWindow.location.href);
      return;
    }
    const profile = child.querySelector('button[aria-label^="Profile, settings, and"]');
    if (!profile || /sign in/i.test(profile.getAttribute("aria-label") || "")) return;
    openXboxCloud(frame.contentWindow.location.href);
  } catch {}
}
function currentUrl() {
  try {
    const href = frame.contentWindow.location.href;
    if (href.startsWith(location.origin + "/uv/service/"))
      return __uv$config.decodeUrl(href.slice((location.origin + "/uv/service/").length));
    if (href.startsWith(location.origin + "/service/")) return scramjet.decodeUrl(href);
  } catch {}
  return lastUrl;
}
function syncNav() {
  $("nav-back").disabled = !navHistory.canGoBack();
  $("nav-forward").disabled = !navHistory.canGoForward();
}
function remember(url) {
  navHistory.record(url);
  syncNav();
  if (settings.rememberHistory && /^https?:\/\//.test(url)) {
    recent = [{ name: new URL(url).hostname, url }, ...recent.filter((x) => x.url !== url)].slice(0, 8);
    try {
      write("jsprox.history", recent);
    } catch {}
    renderRecent();
  }
}
function loading() {
  clearTimeout(loadTimer);
  onlineLabel("Connecting...");
  notify("Loading your page...");
  loadTimer = setTimeout(
    () => notify("Still loading? Try Reconnect or a different engine in Settings."),
    25000,
  );
}
async function go(value, options = {}) {
  if (busy) return;
  busy = true;
  $("go").disabled = true;
  const ticket = ++navigation;
  notify("Preparing your connection...");
  try {
    const url = search(value, engines[settings.search]);
    activeEngine = settings.engine;
    await deadline(
      initializeEngine(activeEngine),
      30000,
      "Proxy engine setup timed out. Reload JSProx and try again.",
    );
    await registerSW(activeEngine);
    await ensureTransport(Boolean(options.reconnect));
    if (ticket !== navigation) return;
    if (!options.retry) retryUsed = false;
    // A reconnect retry keeps whatever back/forward step was already in progress.
    if (!options.retry) {
      if (options.historyIndex !== undefined) navHistory.expect(options.historyIndex);
      else navHistory.cancel();
    }
    lastUrl = url;
    currentProxy = location.origin + proxyUrl(url);
    $("uv-address").value = url;
    document.body.classList.add("loaded");
    loading();
    frame.src = currentProxy;
  } catch (e) {
    notify(e.message || String(e));
    onlineLabel("Connection needs attention", true);
  } finally {
    busy = false;
    $("go").disabled = false;
  }
}
async function reconnect(auto = false) {
  if (busy || recovering) return;
  recovering = true;
  try {
    notify(auto ? "Connection dropped. Reconnecting once..." : "Creating a fresh connection...");
    await ensureTransport(true);
    if (lastUrl) await go(currentUrl(), { retry: auto });
    else {
      notify("Fresh connection ready.");
      onlineLabel("Ready to explore");
    }
  } catch (e) {
    notify("Could not reconnect: " + e.message);
    onlineLabel("Connection unavailable", true);
  } finally {
    recovering = false;
  }
}
// Service workers report navigation failures with the actual request method.
// Never replay forms, login POSTs, or background API requests.
navigator.serviceWorker?.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "jsprox:connection-error" || !document.body.classList.contains("loaded")) return;
  let href;
  try {
    href = frame.contentWindow.location.href;
  } catch {}
  if (data.url !== currentProxy && data.url !== href) return;
  reportedErrorPage = data.url;
  let failedHost = "Current page";
  try {
    failedHost = new URL(currentUrl()).hostname;
  } catch {}
  recordConnectionEvent({
    host: failedHost,
    reason: data.certificate
      ? "Certificate verification failed"
      : data.tls
        ? "TLS handshake failed"
        : data.exhausted
          ? "Both transports failed"
          : "Connection interrupted",
  });
  clearTimeout(loadTimer);
  onlineLabel("Connection interrupted", true);
  if (
    settings.autoReconnect &&
    !retryUsed &&
    data.method === "GET" &&
    !data.tls &&
    !data.exhausted &&
    !data.certificate
  ) {
    retryUsed = true;
    if (data.url === href) lastUrl = currentUrl();
    setTimeout(() => reconnect(true), 100);
  } else
    notify(
      data.certificate
        ? "Certificate verification failed. The connection was stopped; see Connection for details."
        : data.tls || data.exhausted
          ? "Could not establish a connection. Open Connection in the sidebar for details."
          : "The proxy connection ended. Use Reconnect or switch transport in Settings. Form submissions are not retried automatically.",
    );
});
// Both proxy engines serve their connection-error page with HTTP 500. Only such
// pages are checked for error wording, so an ordinary article that mentions
// "Failed to fetch" still counts as a normal page load.
const proxyErrorText =
  /MuxTaskEnded|Multiplexor task ended|Failed to fetch|client error \(Wisp|SSL connect error|SSL peer certificate|certificate verification|Both JSProx transports failed/i;
let reportedErrorPage = "";
function isProxyErrorPage() {
  try {
    const status = frame.contentWindow.performance.getEntriesByType("navigation")[0]?.responseStatus;
    if (status) {
      if (status < 500) return false;
    } else if (reportedErrorPage !== frame.contentWindow.location.href) return false;
    return proxyErrorText.test(frame.contentDocument.body?.innerText || "");
  } catch {
    return false;
  }
}
frame.addEventListener("load", () => {
  if (!document.body.classList.contains("loaded")) return;
  clearTimeout(loadTimer);
  if (isProxyErrorPage()) {
    onlineLabel("Connection interrupted", true);
    notify("Connection interrupted. Open Connection in the sidebar for recovery options.");
    return;
  }
  const url = currentUrl();
  lastUrl = url;
  $("uv-address").value = url;
  remember(url);
  onlineLabel("Connected · " + settings.transport);
  notify("");
  maybeOpenXboxCloud();
});
// Xbox navigates between catalog and game routes without a frame load.
setInterval(() => {
  if (openingXboxCloud || !document.body.classList.contains("loaded")) return;
  maybeOpenXboxCloud();
}, 750);
function home() {
  navigation++;
  navHistory.cancel();
  clearTimeout(loadTimer);
  document.body.classList.remove("loaded");
  frame.src = "about:blank";
  notify("");
  onlineLabel("Ready to explore");
  $("home-address").focus();
}
$("home").onclick = home;
$("uv-form").onsubmit = (e) => {
  e.preventDefault();
  if ($("uv-address").value.trim()) go($("uv-address").value.trim());
};
$("home-search").onsubmit = (e) => {
  e.preventDefault();
  if ($("home-address").value.trim()) go($("home-address").value.trim());
};
$("reload").onclick = () => {
  if (lastUrl) go(currentUrl());
};
$("reconnect").onclick = () => reconnect();
// The index only moves once the frame loads, so a click while a page is still
// preparing cannot leave the list pointing at a page that was never opened.
function stepHistory(delta) {
  const target = navHistory.target(delta);
  if (target && !busy) go(target.url, { historyIndex: target.index });
}
$("nav-back").onclick = () => stepHistory(-1);
$("nav-forward").onclick = () => stepHistory(1);
$("game-view").onclick = async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    // Fullscreen the proxied document, not the dashboard. Streaming sites use
    // their own fullscreen state to enable keyboard and mouse controls.
    const child = frame.contentDocument;
    const target = (document.body.classList.contains("loaded") && child?.documentElement) || $("stage");
    await target.requestFullscreen();
    if (target !== $("stage")) {
      frame.focus();
      frame.contentWindow.focus();
    }
  } catch {
    notify("Fullscreen is unavailable in this browser. Use the top-controls toggle instead.");
  }
};
document.addEventListener("fullscreenchange", () => {
  $("game-view").setAttribute(
    "aria-label",
    document.fullscreenElement ? "Exit fullscreen" : "Fullscreen game view",
  );
});
$("notice-close").onclick = () => notify("");
window.addEventListener("offline", () => {
  onlineLabel("You are offline", true);
  notify("Your device is offline. Reconnect when your network returns.");
});
window.addEventListener("online", () => {
  onlineLabel("Network is back");
  notify("Network is back. Press Reconnect to resume your page.");
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
    e.preventDefault();
    $("uv-address").focus();
    $("uv-address").select();
  }
});
navigator.serviceWorker?.addEventListener("message", ({ data }) => {
  if (data?.type !== "jsprox:access-error" || ![401, 403].includes(data.status)) return;
  let href = "";
  try {
    href = frame.contentWindow.location.href;
  } catch {}
  let host;
  try {
    host = new URL(currentUrl()).hostname;
  } catch {
    return;
  }
  let gameFile = false;
  if (data.url !== currentProxy && data.url !== href) {
    try {
      const remote = new URL(
        activeEngine === "scramjet"
          ? scramjet.decodeUrl(data.url)
          : __uv$config.decodeUrl(new URL(data.url).pathname.slice(__uv$config.prefix.length)),
      );
      gameFile =
        /(^|\.)crazygames\.com$/.test(host) && remote.hostname.endsWith(".game-files.crazygames.com");
      if (!gameFile) return;
      host = remote.hostname;
    } catch {
      return;
    }
  }
  recordConnectionEvent({ host, reason: "Website returned HTTP " + data.status });
  notify(
    gameFile
      ? "The game-file server returned " +
          data.status +
          ". The game itself was blocked. See Connection for the affected host."
      : "Website returned " +
          data.status +
          ". Sign-in or access was rejected. Connection tools can open the original site outside the proxy.",
  );
});
const direct = document.createElement("button");
direct.className = "secondary-button";
direct.textContent = "Open original site (no proxy)";
direct.onclick = () => {
  if (!lastUrl) {
    notify("Open a website first.");
    return;
  }
  window.open(currentUrl(), "_blank", "noopener,noreferrer");
};
$("diagnostics-dialog").append(direct);
