importScripts("/scram/scramjet.all.js", "/console-response.js", "/game-compat.js");
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  event.respondWith((async () => {
    const facade = gameframeModuleFacade(event.request);
    if (facade) return facade;
    await scramjet.loadConfig();
    if (scramjet.route(event)) return withConsole(await scramjet.fetch(event), event.request);
    return fetch(event.request);
  })());
});
