// A proxied page opened in the top-level tab must own its BareMux connection.
// The dashboard's SharedWorker can stop when that tab navigates away.
(() => {
  const script = document.currentScript;
  const wisp = script?.getAttribute("data-wisp");
  const primary = script?.getAttribute("data-transport") === "epoxy" ? "epoxy" : "libcurl";
  if (!wisp || !window.BareMux?.BareMuxConnection) return;
  // Scramjet virtualizes location to the upstream site. The script source is
  // served by JSProx and retains the actual browser origin.
  const proxyOrigin = new URL(script.src).origin;
  window.__jsproxProxyOrigin = proxyOrigin;
  // Scramjet deletes navigator.serviceWorker once its client starts, so keep
  // the real container. The worker asks this page for a BareMux port while
  // parser-blocking scripts wait on it; the browser holds those messages until
  // parsing ends unless they are started now, which deadlocks the page.
  const container = navigator.serviceWorker;
  const connection = new BareMux.BareMuxConnection(proxyOrigin + "/baremux/worker.js?v=jsprox2");
  container?.startMessages();
  window.__jsproxTransportReady = connection
    .getTransport()
    .then((name) => {
      if (name) return;
      return connection.setTransport("/resilient-transport.mjs", [{ primary, wisp }]);
    })
    .catch((error) => console.error("JSProx transport startup failed:", error))
    .finally(() => {
      container?.controller?.postMessage({ type: "jsprox:transport-ready" });
    });
})();
