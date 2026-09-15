// Append without buffering or decoding the page, preserving its original charset.
async function withConsole(response, request) {
  if (["document", "iframe"].includes(request.destination) && response.status >= 500) {
    const text = await response.clone().text();
    if (/MuxTaskEnded|Multiplexor task ended|client error|Failed to fetch|connection closed|connection refused|SSL connect error|Both JSProx transports failed/i.test(text)) {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && (url.pathname === "/" || url.pathname === "/index.html")) {
          client.postMessage({ type: "jsprox:connection-error", url: request.url, method: request.method, tls: /SSL connect error|error code 35/i.test(text), exhausted: /Both JSProx transports failed/i.test(text) });
        }
      }
    }
    return response;
  }
  if (!["document", "iframe"].includes(request.destination) || !response.body ||
      !response.headers.get("content-type")?.includes("text/html") || response.status !== 200) return response;
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag"]) headers.delete(name);
  const tag = new TextEncoder().encode('<script src="' + self.location.origin + '/inject.js" data-injected-console></script>');
  const body = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) { controller.enqueue(chunk); },
    flush(controller) { controller.enqueue(tag); }
  }));
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
