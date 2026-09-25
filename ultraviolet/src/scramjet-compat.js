// Scramjet 1.1.0 rewrites already-proxied URLs a second time. History updates
// on sites such as GitHub then make localhost the apparent upstream origin.
// Keep the vendor package untouched; patch its served bundle in one checked spot.
export function patchScramjetBundle(source) {
  // The upstream baseURI getter returns only the origin, dropping the game
  // directory. Loaders then request /assets/... instead of /game/version/assets/...
  const baseURI='n=r.ownerDocument?.querySelector("base");return(r instanceof Document&&(n=r.querySelector("base")),n)?new URL(n.href,e.url.origin).href:e.url.origin';
  const metaBase='const e=t.natives.call("Document.prototype.querySelector",t.global.document,"base");';
  const relativeBase='return new URL(r,t.url.origin)}}return t.url';
  for(const part of [baseURI,metaBase,relativeBase]) {
    if(source.split(part).length!==2) throw new Error('Scramjet base URL compatibility patch needs review for this bundle version.');
  }
  source=source.replace(baseURI,'n=r.ownerDocument?.querySelector("base[href]");return(r instanceof Document&&(n=r.querySelector("base[href]")),n)?new URL(n.getAttribute("href"),e.url.href).href:e.url.href');
  source=source.replace(metaBase,'const e=t.natives.call("Document.prototype.querySelector",t.global.document,"base[href]");');
  source=source.replace(relativeBase,'return new URL(r,t.url.href)}}return t.url');
  // Cookie values are opaque. Decoding % escapes corrupts signed session
  // cookies (including GitHub's), since getCookies sends the value verbatim.
  const cookieParser='setCookies(e,t){for(let r of e){let e=i()(r),';
  const cookieLoader='load(e){if("object"==typeof e)return e;this.cookies=JSON.parse(e)}';
  for(const part of [cookieParser,cookieLoader]) {
    if(source.split(part).length!==2) throw new Error('Scramjet cookie compatibility patch needs review for this bundle version.');
  }
  source=source.replace(cookieParser,'setCookies(e,t){for(let r of e){let e=i()(r,{decodeValues:false}),');
  source=source.replace(cookieLoader,'load(e){this.cookies="object"==typeof e?e:JSON.parse(e)}');
  // MSAL enumerates Storage.key(index) to discover cached accounts and tokens.
  // Scramjet 1.1.0 returns the stored value here instead of the key, and its
  // clear() loop iterates array indexes rather than the origin's storage keys.
  const storageKey='return t.getItem(n[r])};case"length"';
  const storageClear='for(let r in Object.keys(t))r.startsWith(e.url.host)&&t.removeItem(r)';
  for(const part of [storageKey,storageClear]) {
    if(source.split(part).length!==2) throw new Error('Scramjet storage compatibility patch needs review for this bundle version.');
  }
  source=source.replace(storageKey,'return n[r]?.substring(e.url.host.length+1)??null};case"length"');
  source=source.replace(storageClear,'for(let r of Object.keys(t))r.startsWith(e.url.host+"@")&&t.removeItem(r)');
  const needle='function l(e,t){if(e instanceof URL&&(e=e.toString()),e.startsWith("javascript:"))';
  if(source.split(needle).length!==2) throw new Error('Scramjet URL compatibility patch needs review for this bundle version.');
  source=source.replace(needle,'function l(e,t){if(e instanceof URL)e=e.toString();if(typeof e==="string"&&e.startsWith(location.origin+n.$W.prefix))return e;if(e.startsWith("javascript:"))');
  const headers='if(t&&new URL(t.url).pathname.startsWith(c.$W.prefix)){let e=new URL((0,s.v2)(t.url));e.toString().includes("youtube.com")||(m.set("Referer",e.href),m.set("Origin",e.origin))}';
  const chain='let t=e.referrer,r=await self.clients.matchAll({type:"window"});for(;t;){';
  for(const part of [headers,chain]) {
    if(source.split(part).length!==2) throw new Error('Scramjet request compatibility patch needs review for this bundle version.');
  }
  source=source.replace(headers,'self.normalizeProxyHeaders?.(e,m,location.origin,t);');
  // BareMux's connection worker belongs to the proxy origin. Scramjet must
  // leave this internal SharedWorker URL alone when a proxied page responds
  // to a service worker getPort request during a sign-in POST.
  const sharedWorker='e.Proxy("SharedWorker",{construct(t){t.args[0]=(0,i.Oy)(t.args[0],e.meta)+"?dest=sharedworker"';
  if(source.split(sharedWorker).length!==2) throw new Error('Scramjet SharedWorker compatibility patch needs review for this bundle version.');
  source=source.replace(sharedWorker,'e.Proxy("SharedWorker",{construct(t){if(/^\\/baremux\\/worker\\.js(?:\\?|$)/.test(t.args[0]))return t.return(t.call());t.args[0]=(0,i.Oy)(t.args[0],e.meta)+"?dest=sharedworker"');
  // Stored referrers can point back to the same page or form a longer cycle.
  return source.replace(chain,'let t=e.referrer,r=await self.clients.matchAll({type:"window"}),jsproxSeen=new Set;for(;t&&!jsproxSeen.has(t)&&jsproxSeen.size<64;){jsproxSeen.add(t);');
}
