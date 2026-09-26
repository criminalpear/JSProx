importScripts("/scram/scramjet.all.js", "/console-response.js", "/game-compat.js", "/request-compat.js");
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const transportWaiters = new Map();
function waitForTopLevelTransport(clientId) {
  return transportWaiters.get(clientId)?.promise;
}
self.addEventListener('message', event => {
  if(event.data?.type !== 'jsprox:transport-ready')return;
  const clientId=event.source?.id;
  const waiter=transportWaiters.get(clientId);
  if(waiter){waiter.resolve();transportWaiters.delete(clientId);}
});
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if(event.request.destination==='document' && event.resultingClientId && new URL(event.request.url).pathname.startsWith('/service/')) {
    let resolve;
    const promise=new Promise(done=>{resolve=done;});
    const clientId=event.resultingClientId;
    transportWaiters.get(clientId)?.resolve();
    transportWaiters.set(clientId,{promise,resolve});
    setTimeout(()=>{if(transportWaiters.get(clientId)?.promise===promise){resolve();transportWaiters.delete(clientId);}},15000);
  }
  event.respondWith((async () => {
    const facade = gameframeModuleFacade(event.request);
    if (facade) return facade;
    await scramjet.loadConfig();
    if (scramjet.route(event)) {
      if(event.request.destination!=='document' && event.request.destination!=='iframe') await waitForTopLevelTransport(event.clientId);
      return withConsole(await scramjet.fetch(event), event.request);
    }
    return fetch(event.request);
  })());
});
