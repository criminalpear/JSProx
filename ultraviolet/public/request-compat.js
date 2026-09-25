// Navigation FetchEvents may have no clientId. Scramjet 1.x then leaves the
// proxy's Origin/Referer in POSTs, which can invalidate an upstream CSRF check.
async function normalizeProxyHeaders(request, headers, proxyOrigin, client) {
  function decode(value) {
    try {
      const url = new URL(value);
      if (url.origin !== proxyOrigin || !url.pathname.startsWith('/service/')) return;
      const remote = new URL(decodeURIComponent(url.pathname.slice('/service/'.length)));
      if (['https:', 'http:'].includes(remote.protocol)) return remote;
    } catch {}
  }
  const referrer = decode(request.referrer);
  let source = referrer || decode(client && client.url);
  // OAuth authorization-code POSTs can arrive without a browser referrer or
  // client mapping. The body includes the registered redirect URI, whose
  // origin is the SPA origin Microsoft requires on token redemption.
  if (!source && !headers.headers.origin && request.method === 'POST' &&
      /\/oauth2\/v2\.0\/token(?:$|[?#])/i.test(decodeURIComponent(request.url || ''))) {
    try {
      const body = await request.clone().text();
      const redirect = new URL(new URLSearchParams(body).get('redirect_uri'));
      if (redirect.protocol === 'https:') source = redirect;
    } catch {}
  }
  if (!source) return;
  // This is Scramjet's transport header map, not a browser Request: constructing
  // a new Request silently discards these forbidden headers in Chromium.
  // Browsers can omit Origin on a same-origin request to the proxy even when
  // the virtual page made a cross-origin request. OAuth SPA token redemption
  // requires the virtual page's Origin, including when it was absent here.
  if (headers.headers.origin === proxyOrigin ||
      (!headers.headers.origin && !['GET', 'HEAD'].includes(request.method))) headers.set('Origin', source.origin);
  // Chromium exposes the browser-generated referrer on Request.referrer,
  // but does not include it in Request.headers. Do not require an existing
  // transport header: doing so loses Referer on login form submissions.
  if (referrer) headers.set('Referer', referrer.href);
  else if (request.referrer === proxyOrigin + '/') headers.set('Referer', source.origin + '/');
}
