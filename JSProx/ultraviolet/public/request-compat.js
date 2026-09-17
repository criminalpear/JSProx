// Navigation FetchEvents may have no clientId. Scramjet 1.x then leaves the
// proxy's Origin/Referer in POSTs, which can invalidate an upstream CSRF check.
function normalizeProxyHeaders(request, headers, proxyOrigin, client) {
  function decode(value) {
    try {
      const url = new URL(value);
      if (url.origin !== proxyOrigin || !url.pathname.startsWith('/service/')) return;
      const remote = new URL(decodeURIComponent(url.pathname.slice('/service/'.length)));
      if (['https:', 'http:'].includes(remote.protocol)) return remote;
    } catch {}
  }
  const referrer = decode(request.referrer);
  const source = referrer || decode(client && client.url);
  if (!source) return;
  // This is Scramjet's transport header map, not a browser Request: constructing
  // a new Request silently discards these forbidden headers in Chromium.
  if (headers.headers.origin === proxyOrigin) headers.set('Origin', source.origin);
  // Chromium exposes the browser-generated referrer on Request.referrer,
  // but does not include it in Request.headers. Do not require an existing
  // transport header: doing so loses Referer on login form submissions.
  if (referrer) headers.set('Referer', referrer.href);
  else if (request.referrer === proxyOrigin + '/') headers.set('Referer', source.origin + '/');
}
