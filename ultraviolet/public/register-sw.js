"use strict";
async function registerSW(engine = "scramjet") {
  if (!navigator.serviceWorker) throw new Error("JSProx requires HTTPS (or localhost) and service worker support.");
  const script = engine === "uv" ? "/uv/sw.js" : "/sw.js?v=oauth-origin-1";
  const scope = engine === "uv" ? "/uv/" : "/service/";
  const registration = await navigator.serviceWorker.register(script, { scope, updateViaCache: "none" });
  const worker = registration.installing || registration.waiting || registration.active;
  if (worker.state === "activated") return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Service worker activation timed out. Reload and retry.")); }, 20000);
    function cleanup() { clearTimeout(timeout); worker.removeEventListener("statechange", changed); }
    function changed() {
      if (worker.state === "activated") { cleanup(); resolve(); }
      if (worker.state === "redundant") { cleanup(); reject(new Error("Service worker installation failed.")); }
    }
    worker.addEventListener("statechange", changed);
    changed();
  });
}
