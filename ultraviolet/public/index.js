"use strict";
const $ = id => document.getElementById(id);
const tabIcons={leaf:'🌿',notebook:'📓',book:'📚',pencil:'✏️',school:'🎓',calculator:'🧮',calendar:'📅',folder:'📁',document:'📄',mail:'✉️',cloud:'☁️',globe:'🌐',star:'⭐',moon:'🌙',sun:'☀️',music:'🎵',game:'🎮',code:'💻',rocket:'🚀',coffee:'☕',cat:'🐱',flower:'🌸'};
const defaults = { uiVersion: 3, theme: 'dark', accent: '#6ee7b7', wallpaper: '', wallpaperSource: '', wallpaperOpacity: .7, engine: 'scramjet', transport: 'libcurl', search: 'duckduckgo', homepage: '', autoReconnect: true, tabTitle: 'JSProx', tabIcon: 'default', rememberHistory: false };
const engines = { duckduckgo: 'https://duckduckgo.com/?q=%s', google: 'https://www.google.com/search?q=%s', bing: 'https://www.bing.com/search?q=%s', brave: 'https://search.brave.com/search?q=%s' };
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function httpUrl(value) { const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : 'https://' + value); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS website.'); return url.href; }
function validSettings(value) {
 const s = { ...defaults };
 if (!value || typeof value !== 'object') return s;
 for (const [key, choices] of Object.entries({ theme: ['light','dark','system'], engine: ['scramjet','uv'], transport: ['libcurl','epoxy'], search: Object.keys(engines), tabIcon: ['default','none',...Object.keys(tabIcons)] })) if (choices.includes(value[key])) s[key] = value[key];
 if (/^#[0-9a-f]{6}$/i.test(value.accent)) s.accent = value.accent;
 if (typeof value.tabTitle === 'string') s.tabTitle = value.tabTitle.slice(0,80) || 'JSProx';
 if (typeof value.wallpaper === 'string' && (/^https?:\/\//i.test(value.wallpaper) || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(value.wallpaper))) s.wallpaper = value.wallpaper;
 if (typeof value.wallpaperSource === 'string' && /^https?:\/\//i.test(value.wallpaperSource)) s.wallpaperSource = value.wallpaperSource;
 if (typeof value.homepage === 'string' && value.homepage.trim()) { try { s.homepage = httpUrl(value.homepage.trim()); } catch {} }
 if (Number.isFinite(Number(value.wallpaperOpacity))) s.wallpaperOpacity = Math.min(1, Math.max(.1, Number(value.wallpaperOpacity)));
 for (const key of ['autoReconnect','rememberHistory']) if (typeof value[key] === 'boolean') s[key] = value[key];
 return s;
}
const savedSettings = read('jsprox.settings', defaults);
let settings = validSettings(savedSettings);
if (savedSettings?.uiVersion !== 3) {
 settings.theme='dark'; settings.accent=defaults.accent; settings.wallpaperOpacity=.7;
 try { write('jsprox.settings',settings); } catch {}
}
let shortcuts = read('jsprox.shortcuts', [ {name:'YouTube',url:'https://www.youtube.com/'}, {name:'CrazyGames',url:'https://www.crazygames.com/'}, {name:'GitHub',url:'https://github.com/'}, {name:'Wikipedia',url:'https://en.wikipedia.org/'} ]);
let bookmarks = read('jsprox.bookmarks', []);
let recent = settings.rememberHistory ? read('jsprox.history', []) : [];
function validBookmarks(list) { return Array.isArray(list) ? list.filter(x=>x && typeof x.name==='string' && typeof x.url==='string' && (/^javascript:/i.test(x.url) || /^https?:\/\//i.test(x.url))).map(x=>({name:x.name.slice(0,80),url:x.url.slice(0,64000)})).slice(0,100) : []; }
function validLinks(list) { return Array.isArray(list) ? list.filter(x => { try { return x && typeof x.name === 'string' && typeof x.url === 'string' && ['http:', 'https:'].includes(new URL(x.url).protocol); } catch { return false; } }).map(x => ({name:x.name.slice(0,80),url:x.url})).slice(0,40) : []; }
shortcuts = validLinks(shortcuts); bookmarks = validBookmarks(bookmarks); recent = validLinks(recent);
const frame = $('uv-frame');
let connection;
let scramjet, scramjetFrame;
const scripts = new Map();
function loadScript(src, label = 'proxy engine') {
 if (!scripts.has(src)) scripts.set(src, new Promise((resolve,reject) => {
  const script=document.createElement('script');script.src=src;
  script.onload=resolve;script.onerror=()=>{scripts.delete(src);script.remove();reject(new Error('Could not load '+label+'. Check your connection and retry.'));};
  document.head.append(script);
 }));
 return scripts.get(src);
}
async function getConnection() {
 if(connection)return connection;
 const src='/baremux/index.js';
 try {
  if(!window.BareMux?.BareMuxConnection)await loadScript(src,'connection library (BareMux)');
  if(!window.BareMux?.BareMuxConnection){scripts.delete(src);throw new Error('BareMux did not initialize.');}
  // BareMux shares this path with proxied pages through localStorage. An
  // absolute proxy URL keeps its internal worker on our origin even when a
  // Microsoft page changes the document base URL during sign-in.
  connection=new window.BareMux.BareMuxConnection(location.origin+'/baremux/worker.js?v=jsprox2');
  return connection;
 }catch(error){throw new Error('Connection library unavailable. Restore dependencies with npm ci in the ultraviolet folder while the server is stopped, then restart it and retry. '+error.message);}
}
async function initializeEngine(engine) {
 if(engine==='uv'){await loadScript('/uv/uv.bundle.js');await loadScript('/uv/uv.config.js');return;}
 await loadScript('/scram/scramjet.all.js');
 if(!scramjet){const {ScramjetController}=$scramjetLoadController();scramjet=new ScramjetController({prefix:'/service/',flags:{captureErrors:false,sourcemaps:false},files:{wasm:'/scram/scramjet.wasm.wasm',all:'/scram/scramjet.all.js',sync:'/scram/scramjet.sync.js'}});}
 await (initPromise ||= scramjet.init().catch(e=>{initPromise=null;throw e;}));
 if(!scramjetFrame) scramjetFrame=scramjet.createFrame(frame);
}
let initPromise, transportPromise, transportKey = '', activeEngine = settings.engine, lastUrl = '', currentProxy = '', busy = false, retryUsed = false, recovering = false, loadTimer, navigation = 0;
const connectionEvents=[];
function recordConnectionEvent(event){connectionEvents.unshift({time:new Date().toISOString(),...event});connectionEvents.splice(20);if($('diagnostics-dialog').open)renderConnectionDetails();}
const transportStatus=new BroadcastChannel('jsprox:transport-status');
transportStatus.onmessage=({data})=>{
 if(data?.type!=='fallback'||!['libcurl','epoxy'].includes(data.from)||!['libcurl','epoxy'].includes(data.to)||typeof data.host!=='string')return;
 recordConnectionEvent({host:data.host.slice(0,255),from:data.from,to:data.to,reason:data.reason==='tls-handshake'?'TLS handshake fallback':'Connection restarted with alternate transport'});
 onlineLabel('Recovered · '+data.to);
};
const navHistory = []; let navIndex = -1;
function notify(message) { $('uv-status').textContent = message; $('notice').hidden = !message; }
function onlineLabel(text, offline = false) { $('connection-label').textContent = text; $('connection-dot').classList.toggle('offline', offline); }
function deadline(promise, milliseconds, label) { let timer; return Promise.race([promise,new Promise((_,reject) => { timer=setTimeout(()=>reject(new Error(label)),milliseconds); })]).finally(()=>clearTimeout(timer)); }
async function ensureTransport(force = false) {
 if (transportPromise) return transportPromise;
 const key = settings.transport;
 if (!force && transportKey === key) return;
 transportPromise = (async () => {
  const health = await fetch('/health', {cache:'no-store', signal:AbortSignal.timeout(8000)});
  if (!health.ok) throw new Error('The JSProx server is unavailable. Restart the server, then reconnect.');
  const endpoint = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/`;
  const activeConnection=await getConnection();
  await activeConnection.setTransport('/resilient-transport.mjs', [{primary:key,wisp:endpoint}]);
  transportKey = key;
 })().finally(()=> { transportPromise = null; });
 // A timeout is reported to the user; the shared worker operation is not retried concurrently.
 return deadline(transportPromise,20000,'Connection setup timed out. Reload JSProx and try again.');
}
function proxyUrl(url) { return activeEngine === 'uv' ? __uv$config.prefix + __uv$config.encodeUrl(url) : scramjet.encodeUrl(url); }
function isXboxCloudUrl(value) {
 try { const url=new URL(value); return url.hostname==='www.xbox.com' && /^\/(?:[a-z]{2}-[a-z]{2}\/)?play(?:\/|$)/i.test(url.pathname); }
 catch { return false; }
}
let openingXboxCloud=false;
function openXboxCloud(href) {
 if(openingXboxCloud)return;
 openingXboxCloud=true;
 location.assign(href);
}
function currentUrl() {
 try {
  const href=frame.contentWindow.location.href;
  if(href.startsWith(location.origin+'/uv/service/')) return __uv$config.decodeUrl(href.slice((location.origin+'/uv/service/').length));
  if(href.startsWith(location.origin+'/service/')) return scramjet.decodeUrl(href);
 } catch {}
 return lastUrl;
}
function syncNav() { $('nav-back').disabled = navIndex < 1; $('nav-forward').disabled = navIndex >= navHistory.length-1; }
function remember(url) {
 if (navHistory[navIndex] !== url) { navHistory.splice(navIndex+1); navHistory.push(url); navIndex = navHistory.length-1; }
 syncNav();
 if (settings.rememberHistory && /^https?:\/\//.test(url)) {
  recent = [{name:new URL(url).hostname, url},...recent.filter(x=>x.url!==url)].slice(0,8);
  try { write('jsprox.history',recent); } catch {}
  renderRecent();
 }
}
function loading() { clearTimeout(loadTimer); onlineLabel('Connecting...'); notify('Loading your page...'); loadTimer=setTimeout(()=>notify('Still loading? Try Reconnect or a different engine in Settings.'),25000); }
async function go(value, options = {}) {
 if (busy) return;
 busy=true; $('go').disabled=true;
 const ticket=++navigation;
 notify('Preparing your connection...');
 try {
  const url=search(value, engines[settings.search]);
  activeEngine=settings.engine;
  await deadline(initializeEngine(activeEngine),30000,'Proxy engine setup timed out. Reload JSProx and try again.');
  await registerSW(activeEngine);
  await ensureTransport(Boolean(options.reconnect));
  if(ticket!==navigation)return;
  if(!options.retry)retryUsed=false;
  lastUrl=url; currentProxy=location.origin+proxyUrl(url); $('uv-address').value=url;
  // Xbox's Keyboard Lock request is denied inside an iframe. Give its cloud
  // gaming page the top-level tab while keeping it behind the same proxy.
  if(isXboxCloudUrl(url)){openXboxCloud(currentProxy);return;}
  document.body.classList.add('loaded'); loading(); frame.src=currentProxy;
 } catch(e) { notify(e.message || String(e)); onlineLabel('Connection needs attention',true); }
 finally { busy=false; $('go').disabled=false; }
}
async function reconnect(auto=false) {
 if(busy || recovering)return;
 recovering=true;
 try {
  notify(auto?'Connection dropped. Reconnecting once...':'Creating a fresh connection...');
  await ensureTransport(true);
  if(lastUrl) await go(currentUrl(),{retry:auto});
  else {notify('Fresh connection ready.');onlineLabel('Ready to explore');}
 }catch(e){notify('Could not reconnect: '+e.message);onlineLabel('Connection unavailable',true);}
 finally{recovering=false;}
}
// Service workers report navigation failures with the actual request method.
// Never replay forms, login POSTs, or background API requests.
navigator.serviceWorker?.addEventListener('message', event => {
 const data=event.data;
 if(!data || data.type!=='jsprox:connection-error' || !document.body.classList.contains('loaded'))return;
 let href; try{href=frame.contentWindow.location.href;}catch{}
 if(data.url!==currentProxy && data.url!==href)return;
 let failedHost='Current page';try{failedHost=new URL(currentUrl()).hostname;}catch{}
 recordConnectionEvent({host:failedHost,reason:data.certificate?'Certificate verification failed':data.tls?'TLS handshake failed':data.exhausted?'Both transports failed':'Connection interrupted'});
 clearTimeout(loadTimer);
 onlineLabel('Connection interrupted',true);
 if(settings.autoReconnect && !retryUsed && data.method==='GET' && !data.tls && !data.exhausted && !data.certificate) {
  retryUsed=true;
  if(data.url===href)lastUrl=currentUrl();
  setTimeout(()=>reconnect(true),100);
 }else notify(data.certificate?'Certificate verification failed. The connection was stopped; see Connection for details.':data.tls||data.exhausted?'Could not establish a connection. Open Connection in the sidebar for details.':'The proxy connection ended. Use Reconnect or switch transport in Settings. Form submissions are not retried automatically.');
});
frame.addEventListener('load',()=>{
 if(!document.body.classList.contains('loaded'))return;
 clearTimeout(loadTimer);
 try { if (/MuxTaskEnded|Multiplexor task ended|Failed to fetch|client error \(Wisp|SSL connect error|SSL peer certificate|certificate verification|Both JSProx transports failed/i.test(frame.contentDocument.body?.innerText || '')) {onlineLabel('Connection interrupted',true);notify('Connection interrupted. Open Connection in the sidebar for recovery options.');return;} } catch {}
 const url=currentUrl();lastUrl=url;$('uv-address').value=url;remember(url);onlineLabel('Connected · '+settings.transport);notify('');
 if(isXboxCloudUrl(url))openXboxCloud(frame.contentWindow.location.href);
});
// Xbox navigates between catalog and game routes without a frame load.
setInterval(()=>{
 if(openingXboxCloud||!document.body.classList.contains('loaded'))return;
 if(isXboxCloudUrl(currentUrl()))openXboxCloud(frame.contentWindow.location.href);
},750);
function home(){navigation++;clearTimeout(loadTimer);document.body.classList.remove('loaded');frame.src='about:blank';notify('');onlineLabel('Ready to explore');$('home-address').focus();}
$('home').onclick=home;
$('uv-form').onsubmit=e=>{e.preventDefault();if($('uv-address').value.trim())go($('uv-address').value.trim());};
$('home-search').onsubmit=e=>{e.preventDefault();if($('home-address').value.trim())go($('home-address').value.trim());};
$('reload').onclick=()=>{if(lastUrl)go(currentUrl());};
$('reconnect').onclick=()=>reconnect();
$('nav-back').onclick=()=>{if(navIndex>0){navIndex--;go(navHistory[navIndex]);syncNav();}};
$('nav-forward').onclick=()=>{if(navIndex<navHistory.length-1){navIndex++;go(navHistory[navIndex]);syncNav();}};
$('game-view').onclick=async()=>{
 try {
  if(document.fullscreenElement){await document.exitFullscreen();return;}
  // Fullscreen the proxied document, not the dashboard. Streaming sites use
  // their own fullscreen state to enable keyboard and mouse controls.
  const child=frame.contentDocument;
  const target=document.body.classList.contains('loaded')&&child?.documentElement || $('stage');
  await target.requestFullscreen();
  if(target!==$('stage')){
   frame.focus();
   frame.contentWindow.focus();
  }
 }catch{notify('Fullscreen is unavailable in this browser. Use the top-controls toggle instead.');}
};
document.addEventListener('fullscreenchange',()=>{
 $('game-view').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Fullscreen game view');
});
$('notice-close').onclick=()=>notify('');
window.addEventListener('offline',()=>{onlineLabel('You are offline',true);notify('Your device is offline. Reconnect when your network returns.');});
window.addEventListener('online',()=>{onlineLabel('Network is back');notify('Network is back. Press Reconnect to resume your page.');});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='l'){e.preventDefault();$('uv-address').focus();$('uv-address').select();}});
function readableAccent(hex,dark) {
 let rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16));
 const luminance=values=>values.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
 const background=luminance(dark?[25,35,31]:[255,255,255]);
 for(let i=0;i<30;i++){const l=luminance(rgb);if((Math.max(l,background)+.05)/(Math.min(l,background)+.05)>=4.5)break;rgb=rgb.map(x=>Math.round(x*.85+(dark?255:0)*.15));}
 return '#'+rgb.map(x=>x.toString(16).padStart(2,'0')).join('');
}
function showWallpaperPreview(){
 const image=$('wallpaper-preview-image');const local=draftWallpaper.startsWith('data:image/');
 image.hidden=!local;$('wallpaper-preview-empty').hidden=local;
 if(local)image.src=draftWallpaper;else image.removeAttribute('src');
 $('wallpaper-status').textContent=local?'Image ready. Save changes to apply it.':'Upload an image or load a direct image link. Images up to 12 MB are resized to fit.';
}
async function prepareWallpaper(blob){
 if(blob.size>12*1024*1024)throw new Error('Choose an image smaller than 12 MB.');
 if(!/^image\/(png|jpeg|webp|gif)(;|$)/i.test(blob.type))throw new Error('Use a direct PNG, JPEG, WebP or GIF image, not a web page.');
 const objectUrl=URL.createObjectURL(blob);const image=new Image();
 try {
  image.src=objectUrl;await deadline(image.decode(),15000,'The image could not be decoded. Try a different image.');
  const scale=Math.min(1,1920/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL('image/webp',.85);
  if(data.length>2800000)throw new Error('This image is too detailed to save. Try a smaller image.');
  return data;
 }catch(error){throw new Error(error.name==='EncodingError'?'This image is damaged or unsupported. Try another file.':error.message);}
 finally{URL.revokeObjectURL(objectUrl);}
}
async function fetchWallpaper(url){
 await ensureTransport();
 const client=new BareMux.BareClient('/baremux/worker.js?v=jsprox2');
 const response=await deadline(client.fetch(url),15000,'Image download timed out. Try uploading the file instead.');
 if(!response.ok)throw new Error('The image server returned '+response.status+'. Try another link or upload the image.');
 const limit=12*1024*1024;
 if(Number(response.headers.get('content-length'))>limit){response.body?.cancel();throw new Error('Image is larger than 12 MB.');}
 const reader=response.body.getReader();let total=0;const chunks=[];
 const readImage=(async()=>{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit)throw new Error('Image is larger than 12 MB.');chunks.push(value);}return new Blob(chunks,{type:response.headers.get('content-type')||''});})();
 let blob;try{blob=await deadline(readImage,15000,'Image download timed out.');}finally{await reader.cancel().catch(()=>{});}
 return prepareWallpaper(blob);
}
function runWallpaperTask(work){
 if(wallpaperTask)return wallpaperTask;
 const controls=[$('load-wallpaper'),$('wallpaper-file'),$('remove-wallpaper'),$('settings-form').querySelector('[type=submit]')];
 controls.forEach(x=>x.disabled=true);$('wallpaper-status').textContent='Loading and preparing your image...';
 wallpaperTask=(async()=>{try{await work();showWallpaperPreview();$('settings-message').textContent='Image ready. Save changes to apply.';}catch(e){$('wallpaper-status').textContent=e.message;$('settings-message').textContent='Image was not changed.';throw e;}finally{controls.forEach(x=>x.disabled=false);wallpaperTask=null;}})();
 return wallpaperTask;
}
function loadWallpaperLink(){
 const url=$('settings-form').elements.wallpaper.value.trim();
 return runWallpaperTask(async()=>{if(!/^https?:\/\//i.test(url))throw new Error('Enter a direct image link starting with https:// or http://.');const image=await fetchWallpaper(new URL(url).href);draftWallpaper=image;draftWallpaperSource=url;});
}
function applySettings(){
 const dark=settings.theme==='dark'||settings.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;
 document.documentElement.dataset.theme=dark?'dark':'light';
 const accent=readableAccent(settings.accent,dark);
 document.documentElement.style.setProperty('--accent',accent);
 document.documentElement.style.setProperty('--accent-ink',dark?'#10251b':'#ffffff');
 document.documentElement.style.setProperty('--wallpaper',settings.wallpaper.startsWith('data:image/')?`url(${JSON.stringify(settings.wallpaper)})`:'none');
 document.documentElement.style.setProperty('--wallpaper-opacity',settings.wallpaperOpacity);
 document.body.classList.toggle('has-wallpaper',Boolean(settings.wallpaper));
 $('theme-toggle').textContent=dark?'☀':'☾';
 $('theme-toggle').title=dark?'Switch to light mode':'Switch to dark mode';
 $('theme-toggle').setAttribute('aria-label',$('theme-toggle').title);
 document.title=settings.tabTitle;
 const favicon=document.querySelector('link[rel=icon]');
 favicon.type=settings.tabIcon==='default'?'image/png':'image/svg+xml';
 if(settings.tabIcon==='default')favicon.href='/icon.png';
 else if(settings.tabIcon==='none')favicon.href='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
 else favicon.href='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text y="50" font-size="50">${tabIcons[settings.tabIcon]||'📓'}</text></svg>`);
 renderRecent();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(settings.theme==='system')applySettings();});
function makeLinkButton(item, cls){const button=document.createElement('button');button.className=cls;button.textContent=item.name;button.onclick=()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());go(item.url);};return button;}
function renderShortcuts(){
 $('shortcuts').replaceChildren();
 shortcuts.forEach((item,index)=>{
  const card=document.createElement('div');card.className='shortcut';const button=makeLinkButton(item,'shortcut-launch');button.replaceChildren();
  const icon=document.createElement('span');icon.className='shortcut-icon';icon.textContent=item.name.slice(0,1).toUpperCase();
  const text=document.createElement('span');text.className='shortcut-text';const name=document.createElement('b');name.textContent=item.name;const host=document.createElement('small');try{host.textContent=new URL(item.url).hostname.replace(/^www\./,'');}catch{host.textContent=item.url;}
  text.append(name,host);button.append(icon,text);
  const remove=document.createElement('button');remove.className='shortcut-remove';remove.textContent='×';remove.setAttribute('aria-label','Remove '+item.name);remove.onclick=()=>{shortcuts.splice(index,1);try{write('jsprox.shortcuts',shortcuts);}catch{notify('Could not save shortcuts. Browser storage is full.');}renderShortcuts();};card.append(button,remove);$('shortcuts').append(card);
 });
}
function renderRecent(){
 $('recent-section').hidden=!settings.rememberHistory;
 $('recent-list').replaceChildren();
 if(!settings.rememberHistory||!recent.length){const p=document.createElement('p');p.className='recent-empty';p.textContent=settings.rememberHistory?'Your next discovery starts above. Recently visited pages will appear here.':'A little space for your next discovery. Turn on recent destinations in Settings to keep them here.';$('recent-list').append(p);return;}
 recent.slice(0,3).forEach(item=>{const b=makeLinkButton(item,'recent-row');const arrow=document.createElement('small');arrow.textContent='↗';b.append(arrow);$('recent-list').append(b);});
}
$('clear-history').onclick=()=>{recent=[];try{localStorage.removeItem('jsprox.history');}catch{}renderRecent();notify('Recent destinations cleared.');};
$('add-shortcut').onclick=()=>{$('shortcut-form').reset();$('shortcut-dialog').showModal();};
$('shortcut-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;try{const url=httpUrl(f.elements.url.value.trim());shortcuts.push({name:f.elements.name.value.trim()||new URL(url).hostname,url});shortcuts=shortcuts.slice(-40);write('jsprox.shortcuts',shortcuts);renderShortcuts();$('shortcut-dialog').close();}catch(err){f.elements.url.setCustomValidity(err.message);f.elements.url.reportValidity();}};
$('shortcut-form').elements.url.oninput=e=>e.target.setCustomValidity('');
$('bookmark').onclick=()=>{if(!lastUrl){notify('Open a website to bookmark it.');return;}const url=currentUrl();if(!bookmarks.some(x=>x.url===url)){bookmarks.push({name:new URL(url).hostname,url});try{write('jsprox.bookmarks',bookmarks);}catch{notify('Could not save bookmark. Browser storage is full.');return;}}renderBookmarkBar();notify('Saved to bookmarks.');};
function renderBookmarks(){ renderBookmarkManager(); }
$('bookmarks-nav').onclick=()=>{renderBookmarks();$('bookmarks-dialog').showModal();};
let draftWallpaper='', draftWallpaperSource='', wallpaperTask=null;
function openSettings(){const form=$('settings-form');for(const [key,value]of Object.entries(settings)){const input=form.elements.namedItem(key);if(!input)continue;if(input.type==='checkbox')input.checked=value;else input.value=key==='wallpaper'?(settings.wallpaperSource||(/^https?:/.test(value)?value:'')):value;}draftWallpaper=settings.wallpaper;draftWallpaperSource=settings.wallpaperSource;showWallpaperPreview();$('settings-message').textContent='Changes apply when saved.';$('settings').showModal();document.querySelector('.settings-scroll').scrollTop=0;}
$('settings-open').onclick=openSettings;$('customize').onclick=openSettings;
$('cloak-settings').onclick=()=>{$('cloak-dialog').close();openSettings();$('settings-form').elements.tabTitle.scrollIntoView({block:'center'});$('settings-form').elements.tabTitle.focus();};
function openCloaking(){$('cloak-title').textContent=settings.tabTitle;$('cloak-dialog').showModal();}
$('cloak-open').onclick=openCloaking;$('home-cloak').onclick=openCloaking;
$('help-open').onclick=()=>$('help-dialog').showModal();
function connectionReport(){let host='No page open';try{if(lastUrl)host=new URL(currentUrl()).hostname;}catch{}return {app:'JSProx',engine:activeEngine,preferredTransport:settings.transport,host,online:navigator.onLine,secureContext:window.isSecureContext,crossOriginIsolated:window.crossOriginIsolated,events:connectionEvents};}
function renderConnectionDetails(){const report=connectionReport();$('connection-details').replaceChildren();for(const [name,value]of [['Website',report.host],['Engine',report.engine],['Preferred transport',report.preferredTransport],['Network',report.online?'Online':'Offline'],['Cross-origin isolation',report.crossOriginIsolated?'Available':'Unavailable']]){const term=document.createElement('dt');term.textContent=name;const description=document.createElement('dd');description.textContent=value;$('connection-details').append(term,description);}$('connection-events').replaceChildren();if(!connectionEvents.length)$('connection-events').textContent='No transport failures recorded in this tab.';for(const event of connectionEvents){const item=document.createElement('p');item.textContent=event.host+' — '+event.reason+(event.to?' ('+event.to+')':'');$('connection-events').append(item);}}
$('diagnostics-open').onclick=()=>{renderConnectionDetails();$('diagnostics-dialog').showModal();};
$('try-transport').onclick=async()=>{settings.transport=settings.transport==='libcurl'?'epoxy':'libcurl';try{write('jsprox.settings',settings);}catch{}$('diagnostics-dialog').close();await reconnect();};
$('connection-retry').onclick=()=>{$('diagnostics-dialog').close();reconnect();};
$('export-diagnostics').onclick=()=>download(connectionReport(),'jsprox-connection-report.json');
let sidebarHidden=read('jsprox.sidebarHidden',matchMedia('(max-width:700px)').matches)===true;
function applySidebar(){document.body.classList.toggle('sidebar-hidden',sidebarHidden);$('sidebar-toggle').title=sidebarHidden?'Show sidebar':'Hide sidebar';$('sidebar-toggle').setAttribute('aria-label',$('sidebar-toggle').title);$('sidebar-toggle').setAttribute('aria-expanded',String(!sidebarHidden));}
$('sidebar-toggle').onclick=()=>{sidebarHidden=!sidebarHidden;applySidebar();try{write('jsprox.sidebarHidden',sidebarHidden);}catch{}};
$('theme-toggle').onclick=()=>{settings.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{write('jsprox.settings',settings);}catch{}applySettings();};
$('copy-url').onclick=async()=>{try{await navigator.clipboard.writeText(currentUrl());notify('Original website address copied.');}catch{notify('Copy the website address from the address bar. Clipboard access is unavailable.');}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('settings-form').elements.wallpaper.oninput=()=>{$('wallpaper-status').textContent='Press Load image from link or Save changes to load this image.';};
$('load-wallpaper').onclick=()=>loadWallpaperLink().catch(()=>{});
$('wallpaper-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{await runWallpaperTask(async()=>{const image=await prepareWallpaper(file);draftWallpaper=image;draftWallpaperSource='';$('settings-form').elements.wallpaper.value='';});}catch{}e.target.value='';};
$('remove-wallpaper').onclick=()=>{draftWallpaper='';draftWallpaperSource='';$('settings-form').elements.wallpaper.value='';showWallpaperPreview();$('settings-message').textContent='Background removed when you save.';};
$('settings-form').onsubmit=async e=>{
 e.preventDefault();const form=e.currentTarget;
 try { if(wallpaperTask)await wallpaperTask;const link=form.elements.wallpaper.value.trim();if(link && (link!==draftWallpaperSource || !draftWallpaper.startsWith('data:')))await loadWallpaperLink(); } catch { return; }
 const data=Object.fromEntries(new FormData(form));for(const key of ['autoReconnect','rememberHistory'])data[key]=form.elements[key].checked;data.wallpaper=draftWallpaper;data.wallpaperSource=draftWallpaperSource;
 const next=validSettings(data);try{write('jsprox.settings',next);}catch{$('settings-message').textContent='Not enough browser storage. Try a smaller background image.';return;}
 const transportChanged=next.transport!==settings.transport;settings=next;if(!settings.rememberHistory){recent=[];try{localStorage.removeItem('jsprox.history');}catch{}}
 applySettings();$('settings').close();notify(transportChanged?'Settings saved. Reconnect or open a page to use the selected transport.':'Your space, updated.');
};
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-settings').onclick=()=>download({version:1,settings,shortcuts,bookmarks},'jsprox-preferences.json');
$('import-settings').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>3*1024*1024)throw new Error('Preference file is too large.');const data=JSON.parse(await file.text());if(data.version!==1||!data.settings)throw new Error('This is not a JSProx preference export.');const next=validSettings(data.settings);write('jsprox.settings',next);settings=next;shortcuts=validLinks(data.shortcuts);bookmarks=validBookmarks(data.bookmarks);write('jsprox.shortcuts',shortcuts);write('jsprox.bookmarks',bookmarks);applySettings();renderShortcuts();renderBookmarkBar();$('settings').close();notify('Preferences imported.');}catch(err){$('settings-message').textContent=err.message;}e.target.value='';};
$('reset-settings').onclick=()=>{try{write('jsprox.settings',defaults);settings={...defaults};recent=[];localStorage.removeItem('jsprox.history');applySettings();$('settings').close();notify('Preferences reset. Bookmarks and shortcuts were kept.');}catch{$('settings-message').textContent='Browser storage is unavailable.';}};
function cloak(newTab){
 const src=location.origin+'/'+(document.body.classList.contains('loaded')?'#open='+encodeURIComponent(currentUrl()):'');
 const title=settings.tabTitle, iconUrl=document.querySelector('link[rel=icon]').href;
 // A same-window about:blank navigation destroys this script. Let a temporary
 // helper populate the original window after that navigation completes.
 if(!newTab){
  if(window.top!==window){notify('This tab is already inside a cloaked wrapper.');return null;}
  const helper=window.open('about:blank','_blank','popup,width=320,height=160');
  if(!helper){notify('Allow popups to cloak this tab. Your current page was kept.');return null;}
  helper.document.title='Preparing current-tab cloak';
  helper.document.body.textContent='Preparing your current tab… This helper closes automatically.';
  helper.__jsproxCloak={src,title,iconUrl};
  const script=helper.document.createElement('script');script.src=location.origin+'/cloak-helper.js';
  script.onerror=()=>{helper.close();notify('Could not load the cloak helper. Your current page was kept.');};
  helper.document.head.append(script);
  return helper;
 }
 const target=window.open('about:blank','_blank');
 if(!target){notify('Popup blocked. Allow popups for JSProx and try again.');return null;}
 try{const doc=target.document;doc.open();doc.write('<!doctype html><html><head></head><body></body></html>');doc.close();doc.title=title;doc.body.style.cssText='margin:0;height:100vh;overflow:hidden;background:#101714';const icon=doc.createElement('link');icon.rel='icon';icon.href=iconUrl;doc.head.append(icon);const embedded=doc.createElement('iframe');embedded.src=src;embedded.title='JSProx';embedded.allow='cross-origin-isolated; fullscreen; autoplay; gamepad; encrypted-media';embedded.style.cssText='width:100%;height:100%;border:0';doc.body.append(embedded);if(newTab){$('cloak-dialog').close();notify('Opened cloaked tab.');}return target;}catch{if(newTab)target.close();notify('This browser could not create the wrapper.');}
}
$('blank').onclick=()=>cloak(true);
$('cloak-current').onclick=()=>cloak(false);
for(const [value,emoji] of Object.entries(tabIcons)){const select=$('settings-form').elements.tabIcon;if(![...select.options].some(o=>o.value===value)){const option=new Option(emoji+' '+value[0].toUpperCase()+value.slice(1),value);select.add(option);}}
let panelHidden=read('jsprox.panelHidden',false)===true;
function applyPanel(){document.body.classList.toggle('panel-hidden',panelHidden);(panelHidden?document.querySelector('main'):$('topbar')).prepend($('chrome-toggles'));$('panel-toggle').setAttribute('aria-expanded',String(!panelHidden));$('panel-toggle').setAttribute('aria-label',panelHidden?'Show top controls':'Hide top controls');$('panel-toggle').title=panelHidden?'Show top controls':'Hide top controls';}
$('panel-toggle').onclick=()=>{panelHidden=!panelHidden;try{write('jsprox.panelHidden',panelHidden);}catch{}applyPanel();};applyPanel();
let consoleVisible=false;
$('console-toggle').onclick=()=>{consoleVisible=!consoleVisible;$('console-toggle').setAttribute('aria-pressed',String(consoleVisible));$('console-toggle').title=consoleVisible?'Hide console button':'Show console button';$('console-toggle').setAttribute('aria-label',$('console-toggle').title);try{frame.contentWindow.__jsproxConsoleVisibility(consoleVisible);}catch{notify('Open a page first. Ctrl+` also opens its console.');}};
frame.addEventListener('load',()=>{consoleVisible=false;$('console-toggle').setAttribute('aria-pressed','false');$('console-toggle').title='Show console button';$('console-toggle').setAttribute('aria-label','Show console button');});
applySettings();renderShortcuts();syncNav();applySidebar();
const initialUrl=new URLSearchParams(location.hash.slice(1)).get('open');
if(initialUrl && /^https?:\/\//i.test(initialUrl))go(initialUrl);else if(settings.homepage)go(settings.homepage);
if(/^https?:\/\//i.test(settings.wallpaper)){
 const previous=settings.wallpaper;
 fetchWallpaper(previous).then(image=>{
  if(settings.wallpaper!==previous)return;
  const updated={...settings,wallpaper:image,wallpaperSource:previous};write('jsprox.settings',updated);settings=updated;applySettings();
 }).catch(()=>notify('Your saved background could not load. Open Settings to upload it or try another direct image link.'));
}
navigator.serviceWorker.addEventListener('message',({data})=>{
 if(data?.type!=='jsprox:access-error'||![401,403].includes(data.status))return;
 let href='';try{href=frame.contentWindow.location.href;}catch{}
 let host;try{host=new URL(currentUrl()).hostname;}catch{return;}
 let gameFile=false;
 if(data.url!==currentProxy && data.url!==href){
  try{const remote=new URL(activeEngine==='scramjet'?scramjet.decodeUrl(data.url):__uv$config.decodeUrl(new URL(data.url).pathname.slice(__uv$config.prefix.length)));
   gameFile=/(^|\.)crazygames\.com$/.test(host)&&remote.hostname.endsWith('.game-files.crazygames.com');if(!gameFile)return;host=remote.hostname;
  }catch{return;}
 }
 recordConnectionEvent({host,reason:'Website returned HTTP '+data.status});
 notify(gameFile?'The game-file server returned '+data.status+'. The game itself was blocked. See Connection for the affected host.':'Website returned '+data.status+'. Sign-in or access was rejected. Connection tools can open the original site outside the proxy.');
});
const direct=document.createElement('button');direct.className='secondary-button';direct.textContent='Open original site (no proxy)';direct.onclick=()=>{if(!lastUrl){notify('Open a website first.');return;}window.open(currentUrl(),'_blank','noopener,noreferrer');};$('diagnostics-dialog').append(direct);
