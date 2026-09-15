importScripts("/uv/uv.bundle.js", "/uv/uv.config.js", "/uv/uv.sw.js", "/console-response.js");
const sw = new UVServiceWorker();
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (sw.route(event)) event.respondWith(sw.fetch(event).then(res => withConsole(res, event.request)));
});
