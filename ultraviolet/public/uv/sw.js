importScripts("/uv/uv.bundle.js");
importScripts("/uv/uv.config.js");
importScripts("/uv/uv.sw.js");

const sw = new UVServiceWorker();

// Cache the console source so we only fetch it once.
let injectCode = null;
async function getInject() {
  if (injectCode === null) {
    try {
      injectCode = await (await fetch("/inject.js")).text();
    } catch (e) {
      injectCode = "";
    }
  }
  return injectCode;
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handle(event));
});

async function handle(event) {
  const res = await sw.fetch(event);

  const ct = (res.headers && res.headers.get("content-type")) || "";
  if (!ct.includes("text/html")) return res;

  // Splice the floating console in before </body>.
  let text;
  try {
    text = await res.text();
  } catch (e) {
    return res;
  }
  const code = await getInject();
  if (code) {
    const tag = "\n<script data-injected-console>\n" + code + "\n</script>\n";
    const i = text.toLowerCase().lastIndexOf("</body>");
    text = i !== -1 ? text.slice(0, i) + tag + text.slice(i) : text + tag;
  }

  // Body was decoded when we called .text(); drop headers that describe the old encoding/length.
  const headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");

  return new Response(text, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
