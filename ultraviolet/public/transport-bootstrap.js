// A proxied page opened in the top-level tab must own its BareMux connection.
// The dashboard's SharedWorker can stop when that tab navigates away.
(() => {
  const script=document.currentScript;
  const wisp=script?.getAttribute('data-wisp');
  if(!wisp || !window.BareMux?.BareMuxConnection)return;
  const connection=new BareMux.BareMuxConnection('/baremux/worker.js?v=jsprox2');
  window.__jsproxTransportReady=connection.setTransport('/resilient-transport.mjs', [
    {primary:'libcurl',wisp}
  ]).catch(error=>console.error('JSProx transport startup failed:',error));
})();
