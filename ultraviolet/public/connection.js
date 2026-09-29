"use strict";
// Proxy engines (Scramjet/Ultraviolet), BareMux and the Wisp transport.
const frame = $("uv-frame");
let connection;
let scramjet, scramjetFrame;
const scripts = new Map();
function loadScript(src, label = "proxy engine") {
  if (!scripts.has(src))
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => {
          scripts.delete(src);
          script.remove();
          reject(new Error("Could not load " + label + ". Check your connection and retry."));
        };
        document.head.append(script);
      }),
    );
  return scripts.get(src);
}
async function getConnection() {
  if (connection) return connection;
  const src = "/baremux/index.js";
  try {
    if (!window.BareMux?.BareMuxConnection) await loadScript(src, "connection library (BareMux)");
    if (!window.BareMux?.BareMuxConnection) {
      scripts.delete(src);
      throw new Error("BareMux did not initialize.");
    }
    // BareMux shares this path with proxied pages through localStorage. An
    // absolute proxy URL keeps its internal worker on our origin even when a
    // Microsoft page changes the document base URL during sign-in.
    connection = new window.BareMux.BareMuxConnection(location.origin + "/baremux/worker.js?v=jsprox2");
    return connection;
  } catch (error) {
    throw new Error(
      "Connection library unavailable. Restore dependencies with npm ci in the ultraviolet folder while the server is stopped, then restart it and retry. " +
        error.message,
    );
  }
}
async function initializeEngine(engine) {
  if (engine === "uv") {
    await loadScript("/uv/uv.bundle.js");
    await loadScript("/uv/uv.config.js");
    return;
  }
  await loadScript("/scram/scramjet.all.js");
  if (!scramjet) {
    const { ScramjetController } = $scramjetLoadController();
    scramjet = new ScramjetController({
      prefix: "/service/",
      flags: { captureErrors: false, sourcemaps: false },
      files: {
        wasm: "/scram/scramjet.wasm.wasm",
        all: "/scram/scramjet.all.js",
        sync: "/scram/scramjet.sync.js",
      },
    });
  }
  await (initPromise ||= scramjet.init().catch((e) => {
    initPromise = null;
    throw e;
  }));
  if (!scramjetFrame) scramjetFrame = scramjet.createFrame(frame);
}
let initPromise,
  transportPromise,
  transportKey = "",
  activeEngine = settings.engine,
  lastUrl = "",
  currentProxy = "",
  busy = false,
  retryUsed = false,
  recovering = false,
  loadTimer,
  navigation = 0;
const connectionEvents = [];
function recordConnectionEvent(event) {
  connectionEvents.unshift({ time: new Date().toISOString(), ...event });
  connectionEvents.splice(20);
  if ($("diagnostics-dialog").open) renderConnectionDetails();
}
const transportStatus = new BroadcastChannel("jsprox:transport-status");
transportStatus.onmessage = ({ data }) => {
  if (
    data?.type !== "fallback" ||
    !["libcurl", "epoxy"].includes(data.from) ||
    !["libcurl", "epoxy"].includes(data.to) ||
    typeof data.host !== "string"
  )
    return;
  recordConnectionEvent({
    host: data.host.slice(0, 255),
    from: data.from,
    to: data.to,
    reason:
      data.reason === "tls-handshake"
        ? "TLS handshake fallback"
        : "Connection restarted with alternate transport",
  });
  onlineLabel("Recovered · " + data.to);
};
async function ensureTransport(force = false) {
  if (transportPromise) return transportPromise;
  const key = settings.transport;
  if (!force && transportKey === key) return;
  transportPromise = (async () => {
    const health = await fetch("/health", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!health.ok) throw new Error("The JSProx server is unavailable. Restart the server, then reconnect.");
    const endpoint = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/wisp/`;
    const activeConnection = await getConnection();
    await activeConnection.setTransport("/resilient-transport.mjs", [{ primary: key, wisp: endpoint }]);
    transportKey = key;
    await savePreferredTransport(key);
  })().finally(() => {
    transportPromise = null;
  });
  // A timeout is reported to the user; the shared worker operation is not retried concurrently.
  return deadline(transportPromise, 20000, "Connection setup timed out. Reload JSProx and try again.");
}
// Proxied pages opened in the whole tab start their own connection with
// transport-bootstrap.js. The service worker reads this to pick the same transport.
async function savePreferredTransport(transport) {
  try {
    await (
      await caches.open("jsprox-prefs")
    ).put(
      "/__jsprox/prefs",
      new Response(JSON.stringify({ transport }), { headers: { "content-type": "application/json" } }),
    );
  } catch {}
}
function proxyUrl(url) {
  return activeEngine === "uv" ? __uv$config.prefix + __uv$config.encodeUrl(url) : scramjet.encodeUrl(url);
}
