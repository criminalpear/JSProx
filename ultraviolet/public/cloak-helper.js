// This temporary window survives the original tab's navigation to about:blank.
// It closes itself; the user's original tab is never closed.
(() => {
 const target=window.opener, config=window.__jsproxCloak;
 if(!target || !config){window.close();return;}
 const started=Date.now();
 const timer=setInterval(()=>{
  try{
   if(target.closed) {clearInterval(timer);window.close();return;}
   if(target.location.href==='about:blank'){
    clearInterval(timer);
    const doc=target.document;
    doc.title=config.title;
    doc.body.replaceChildren();
    doc.body.style.cssText='margin:0;height:100vh;overflow:hidden;background:#101714';
    const icon=doc.createElement('link');icon.rel='icon';icon.href=config.iconUrl;doc.head.append(icon);
    const frame=doc.createElement('iframe');frame.src=config.src;frame.title='JSProx';
    frame.allow='cross-origin-isolated; fullscreen; autoplay; gamepad; encrypted-media';
    frame.style.cssText='width:100%;height:100%;border:0';doc.body.append(frame);
    target.focus();window.close();return;
   }
  }catch { /* Navigation can temporarily make the target inaccessible. */ }
  if(Date.now()-started>5000){clearInterval(timer);document.body.textContent='This browser could not finish cloaking. You can close this helper and return to JSProx.';}
 },25);
 try{target.location.replace('about:blank');}
 catch{clearInterval(timer);document.body.textContent='This browser prevented current-tab cloaking. Your original tab was kept.';}
})();
