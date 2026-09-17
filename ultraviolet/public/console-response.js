// Keep at most 8 KiB while locating the opening head tag. YouTube's capture
// handlers must register before its own scripts, not at the end of the page.
function injectPageScripts(body, early, tail) {
  const encoder=new TextEncoder();
  const earlyBytes=encoder.encode(early), tailBytes=encoder.encode(tail);
  let pending=new Uint8Array(0), searching=Boolean(early), inserted=false;
  return body.pipeThrough(new TransformStream({
    transform(chunk,controller) {
      if(!searching){controller.enqueue(chunk);return;}
      const length=Math.min(chunk.length,8192-pending.length);
      const next=new Uint8Array(pending.length+length);
      next.set(pending);next.set(chunk.subarray(0,length),pending.length);pending=next;
      // One character per byte keeps offsets exact even for non-ASCII bytes.
      const match=/<head(?:\s[^>]*?)?>/i.exec(String.fromCharCode(...pending));
      if(match){
        const at=match.index+match[0].length;
        controller.enqueue(pending.subarray(0,at));controller.enqueue(earlyBytes);controller.enqueue(pending.subarray(at));
        inserted=true;searching=false;pending=new Uint8Array(0);
      }else if(pending.length===8192){controller.enqueue(pending);pending=new Uint8Array(0);searching=false;}
      if(length<chunk.length)controller.enqueue(chunk.subarray(length));
    },
    flush(controller) {
      if(pending.length)controller.enqueue(pending);
      if(early && !inserted)controller.enqueue(earlyBytes);
      controller.enqueue(tailBytes);
    }
  }));
}

async function withConsole(response, request) {
  if (["document", "iframe"].includes(request.destination) && [401,403].includes(response.status)) {
    for (const client of await self.clients.matchAll({type:"window",includeUncontrolled:true})) {
      const url=new URL(client.url);
      if(url.origin===self.location.origin && ['/', '/index.html'].includes(url.pathname)) client.postMessage({type:'jsprox:access-error',url:request.url,status:response.status});
    }
  }
  if (["document", "iframe"].includes(request.destination) && response.status >= 500) {
    const text = await response.clone().text();
    if (/MuxTaskEnded|Multiplexor task ended|client error|Failed to fetch|connection closed|connection refused|SSL connect error|SSL peer certificate|certificate verification|Both JSProx transports failed/i.test(text)) {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && (url.pathname === "/" || url.pathname === "/index.html")) {
          client.postMessage({ type: "jsprox:connection-error", url: request.url, method: request.method, certificate: /SSL peer certificate|certificate verification|error code 60/i.test(text), tls: /SSL connect error|error code 35/i.test(text), exhausted: /Both JSProx transports failed/i.test(text) });
        }
      }
    }
    return response;
  }
  if (!["document", "iframe"].includes(request.destination) || !response.body ||
      !response.headers.get("content-type")?.includes("text/html") || response.status !== 200) return response;
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag"]) headers.delete(name);
  let compatibility='';
  try {
    const url=new URL(request.url);
    const uv=self.__uv$config;
    const isUV=uv && url.pathname.startsWith(uv.prefix);
    const prefix=isUV?uv.prefix:'/service/';
    if(url.pathname.startsWith(prefix)) {
      const remote=new URL(isUV?uv.decodeUrl(url.pathname.slice(prefix.length)):decodeURIComponent(url.pathname.slice(prefix.length)));
      if(['youtube.com','www.youtube.com','m.youtube.com'].includes(remote.hostname) && !remote.pathname.startsWith('/embed/')) {
        compatibility='<script src="'+self.location.origin+'/youtube-compat.js" data-proxy-origin="'+self.location.origin+'" data-proxy-prefix="'+prefix+'" data-codec="'+(isUV?'xor':'uri')+'" data-remote-url="'+encodeURIComponent(remote.href)+'"></script>';
      }
    }
  } catch {}
  const body = injectPageScripts(response.body,compatibility,'<script src="' + self.location.origin + '/inject.js" data-injected-console></script>');
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
