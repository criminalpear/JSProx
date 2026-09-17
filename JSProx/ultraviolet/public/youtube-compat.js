// Use document navigation for YouTube search and watch links. Its in-place
// navigation can leave the intercepted page stalled or crash its renderer.
(() => {
 const script=document.currentScript;
 const proxyOrigin=script?.dataset.proxyOrigin;
 const prefix=script?.dataset.proxyPrefix || '/service/';
 const xor=script?.dataset.codec==='xor';
 const transform=value=>value.split('').map((char,index)=>index%2?String.fromCharCode(char.charCodeAt(0)^2):char).join('');
 const encode=value=>encodeURIComponent(xor?transform(value):value);
 const decode=value=>{const decoded=decodeURIComponent(value);return xor?transform(decoded):decoded;};
 let source;
 try { source=new URL(decodeURIComponent(script.dataset.remoteUrl)); } catch { return; }
 const hosts=new Set(['youtube.com','www.youtube.com','m.youtube.com']);
 if(!hosts.has(source.hostname) || !proxyOrigin || source.pathname.startsWith('/embed/')) return;
 function destination(value) {
  try {
   let url=new URL(value,source);
   if(url.origin===proxyOrigin && url.pathname.startsWith(prefix)) url=new URL(decode(url.pathname.slice(prefix.length)));
   if(!['https:','http:'].includes(url.protocol) || !hosts.has(url.hostname)) return;
   if(url.pathname==='/results' || (url.pathname==='/watch' && url.searchParams.has('v'))) return url;
  } catch {}
 }
 function navigate(event,url) {
  if(!url) return;
  event.preventDefault();event.stopImmediatePropagation();
  window.location.assign(proxyOrigin+prefix+encode(url.href));
 }
 function search(event,input) {
  if(!input?.value.trim()) return;
  const url=new URL('/results',source);url.searchParams.set('search_query',input.value.trim());
  navigate(event,url);
 }
 function modified(event) { return event.ctrlKey || event.metaKey || event.shiftKey || event.altKey; }
 window.addEventListener('click',event=>{
  if(event.button!==0 || modified(event)) return;
  const elements=event.composedPath().filter(node=>node instanceof Element);
  const anchor=elements.find(node=>node.matches('a[href]'));
  if(anchor && !anchor.hasAttribute('download') && (!anchor.target || anchor.target==='_self')) {
   navigate(event,destination(anchor.href));return;
  }
  if(elements.some(node=>node.matches('#search-icon-legacy,.ytSearchboxComponentSearchButton'))) search(event,document.querySelector('input[name="search_query"]'));
 },true);
 window.addEventListener('keydown',event=>{
  if(event.key==='Enter' && !event.isComposing && !modified(event) && event.target.matches?.('input[name="search_query"]')) search(event,event.target);
 },true);
 window.addEventListener('submit',event=>{
  search(event,event.target.querySelector?.('input[name="search_query"]'));
 },true);
})();
