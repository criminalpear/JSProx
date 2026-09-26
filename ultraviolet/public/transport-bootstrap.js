// A proxied page opened in the top-level tab must own its BareMux connection.
// The dashboard's SharedWorker can stop when that tab navigates away.
(() => {
  const script=document.currentScript;
  const wisp=script?.getAttribute('data-wisp');
  if(!wisp || !window.BareMux?.BareMuxConnection)return;
  // Scramjet virtualizes location to the upstream site. The script source is
  // served by JSProx and retains the actual browser origin.
  const proxyOrigin=new URL(script.src).origin;
  window.__jsproxProxyOrigin=proxyOrigin;
  const connection=new BareMux.BareMuxConnection(proxyOrigin+'/baremux/worker.js?v=jsprox2');
  window.__jsproxTransportReady=connection.getTransport().then(name=>{
    if(name)return;
    return connection.setTransport('/resilient-transport.mjs', [{primary:'libcurl',wisp}]);
  }).catch(error=>console.error('JSProx transport startup failed:',error)).finally(()=>{
    navigator.serviceWorker?.controller?.postMessage({type:'jsprox:transport-ready'});
  });
})();
