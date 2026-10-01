// Compatibility fixes for the served Scramjet 1.1.0 bundle. The vendor package
// stays untouched; the server patches the bundle text once at startup. Each
// patch must match exactly one spot, so a changed bundle fails loudly instead
// of receiving an edit written for a different version.
//
// `npm run check:scramjet` reports which patches still apply to the newest
// published Scramjet release.
const PATCHES = [
  {
    group: "base URL",
    // The upstream baseURI getter returns only the origin, dropping the game
    // directory. Loaders then request /assets/... instead of /game/version/assets/...
    name: "document.baseURI getter",
    find: 'n=r.ownerDocument?.querySelector("base");return(r instanceof Document&&(n=r.querySelector("base")),n)?new URL(n.href,e.url.origin).href:e.url.origin',
    replace:
      'n=r.ownerDocument?.querySelector("base[href]");return(r instanceof Document&&(n=r.querySelector("base[href]")),n)?new URL(n.getAttribute("href"),e.url.href).href:e.url.href',
  },
  {
    group: "base URL",
    name: "rewriter <base> lookup",
    find: 'const e=t.natives.call("Document.prototype.querySelector",t.global.document,"base");',
    replace: 'const e=t.natives.call("Document.prototype.querySelector",t.global.document,"base[href]");',
  },
  {
    group: "base URL",
    name: "relative <base href> resolution",
    find: "return new URL(r,t.url.origin)}}return t.url",
    replace: "return new URL(r,t.url.href)}}return t.url",
  },
  {
    group: "cookie",
    // Cookie values are opaque. Decoding % escapes corrupts signed session
    // cookies (including GitHub's), since getCookies sends the value verbatim.
    name: "Set-Cookie value decoding",
    find: "setCookies(e,t){for(let r of e){let e=i()(r),",
    replace: "setCookies(e,t){for(let r of e){let e=i()(r,{decodeValues:false}),",
  },
  {
    group: "cookie",
    name: "persisted cookie store loading",
    find: 'load(e){if("object"==typeof e)return e;this.cookies=JSON.parse(e)}',
    replace: 'load(e){this.cookies="object"==typeof e?e:JSON.parse(e)}',
  },
  {
    group: "cookie",
    // Honour Max-Age like a browser (it takes precedence over Expires). Scramjet
    // ignored it, so YouTube's seconds-long ST-* navigation cookies never expired.
    name: "Max-Age expiry",
    find: "n.expires&&(n.expires=n.expires.toString());let a=",
    replace:
      "n.maxAge!==void 0&&Number.isFinite(Number(n.maxAge))&&(n.expires=new Date(Number(n.maxAge)>0?Date.now()+1e3*Number(n.maxAge):0)),n.expires&&(n.expires=n.expires.toString());let a=",
  },
  {
    group: "cookie",
    // Browsers ignore a cookie whose name plus value exceeds 4096 bytes. YouTube
    // writes a ~110 KB ST-* cookie when a video is opened; storing it made every
    // later youtube.com request carry a header Google rejects by closing the
    // connection (libcurl error 55), so YouTube reported "You're offline".
    name: "cookie size limit on store",
    find: "this.cookies[a]=n}}getCookies",
    replace:
      'if(String(n.name??"").length+String(n.value??"").length>4096)continue;this.cookies[a]=n}}getCookies',
  },
  {
    group: "cookie",
    // The same limit when sending, which also clears oversized cookies already
    // saved in a visitor's cookie store by earlier versions.
    name: "cookie size limit on send",
    find: "for(let a of n){if(a.expires&&new Date(a.expires)<r){",
    replace:
      'for(let a of n){if(String(a.name??"").length+String(a.value??"").length>4096){delete this.cookies[`${a.domain}@${a.path}@${a.name}`];continue}if(a.expires&&new Date(a.expires)<r){',
  },
  {
    group: "storage",
    // MSAL enumerates Storage.key(index) to discover cached accounts and tokens.
    // Scramjet 1.1.0 returns the stored value here instead of the key, and its
    // clear() loop iterates array indexes rather than the origin's storage keys.
    name: "Storage.key()",
    find: 'return t.getItem(n[r])};case"length"',
    replace: 'return n[r]?.substring(e.url.host.length+1)??null};case"length"',
  },
  {
    group: "storage",
    name: "Storage.clear()",
    find: "for(let r in Object.keys(t))r.startsWith(e.url.host)&&t.removeItem(r)",
    replace: 'for(let r of Object.keys(t))r.startsWith(e.url.host+"@")&&t.removeItem(r)',
  },
  {
    group: "URL",
    // Scramjet 1.1.0 rewrites already-proxied URLs a second time. History updates
    // on sites such as GitHub then make localhost the apparent upstream origin.
    name: "already-proxied URL rewriting",
    find: 'function l(e,t){if(e instanceof URL&&(e=e.toString()),e.startsWith("javascript:"))',
    replace:
      'function l(e,t){if(e instanceof URL)e=e.toString();if(typeof e==="string"&&e.startsWith(location.origin+n.$W.prefix))return e;if(e.startsWith("javascript:"))',
  },
  {
    group: "request",
    // Origin/Referer come from public/request-compat.js.
    name: "outgoing Origin/Referer headers",
    find: 'if(t&&new URL(t.url).pathname.startsWith(c.$W.prefix)){let e=new URL((0,s.v2)(t.url));e.toString().includes("youtube.com")||(m.set("Referer",e.href),m.set("Origin",e.origin))}',
    replace: "await self.normalizeProxyHeaders?.(e,m,location.origin,t);",
  },
  {
    group: "SharedWorker",
    // BareMux's connection worker belongs to the proxy origin. Scramjet must
    // leave this internal SharedWorker URL alone when a proxied page responds
    // to a service worker getPort request during a sign-in POST.
    name: "BareMux SharedWorker URL",
    find: 'e.Proxy("SharedWorker",{construct(t){t.args[0]=(0,i.Oy)(t.args[0],e.meta)+"?dest=sharedworker"',
    replace:
      'e.Proxy("SharedWorker",{construct(t){if(/\\/baremux\\/worker\\.js(?:\\?|$)/.test(String(t.args[0]))){let o=e.global.__jsproxProxyOrigin;if(o&&/^https?:\\/\\//.test(o))t.args[0]=o+"/baremux/worker.js?v=jsprox2";return t.return(t.call())}t.args[0]=(0,i.Oy)(t.args[0],e.meta)+"?dest=sharedworker"',
  },
  {
    group: "request",
    // Stored referrers can point back to the same page or form a longer cycle.
    name: "referrer chain cycle guard",
    find: 'let t=e.referrer,r=await self.clients.matchAll({type:"window"});for(;t;){',
    replace:
      'let t=e.referrer,r=await self.clients.matchAll({type:"window"}),jsproxSeen=new Set;for(;t&&!jsproxSeen.has(t)&&jsproxSeen.size<64;){jsproxSeen.add(t);',
  },
];

function occurrences(source, text) {
  return source.split(text).length - 1;
}

// Every patch that does not match exactly one spot in source.
export function findScramjetPatchProblems(source) {
  return PATCHES.filter((patch) => occurrences(source, patch.find) !== 1).map((patch) => ({
    group: patch.group,
    name: patch.name,
    matches: occurrences(source, patch.find),
  }));
}

export function patchScramjetBundle(source) {
  const [problem] = findScramjetPatchProblems(source);
  if (problem)
    throw new Error(`Scramjet ${problem.group} compatibility patch needs review for this bundle version.`);
  // A replacer function keeps "$" sequences in the replacement literal.
  for (const patch of PATCHES) source = source.replace(patch.find, () => patch.replace);
  return source;
}
