// Scramjet 1.x gives dynamic imports a ?type=module suffix while a
// dynamically-created module script can keep the unsuffixed URL. CrazyGames'
// Gameframe then loads two React runtimes and fails with useMemoCache=null.
// Re-export the same canonical module instead of executing a second copy.
function gameframeModuleFacade(request) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.searchParams.get("type") !== "module" ||
      url.searchParams.has("dest") || !url.pathname.startsWith("/service/")) return null;
  let remote;
  try { remote = new URL(decodeURIComponent(url.pathname.slice("/service/".length))); }
  catch { return null; }
  if (remote.hostname !== "builds.crazygames.com" ||
      !/^\/gameframe\/v[\d.]+\/.+\.js$/.test(remote.pathname)) return null;
  url.searchParams.delete("type");
  const target = JSON.stringify(url.href);
  return new Response(`export * from ${target};\nimport * as module from ${target};\nexport default module.default;`, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "no-store"
    }
  });
}
