'use strict';
// Deliberately avoids generic iframe/script/video removal, which destroys games.
const adCleanup = 'javascript:(function(){var id="jsprox-ad-cleanup";if(document.getElementById(id))return;var s=document.createElement("style");s.id=id;s.textContent="ins.adsbygoogle,amp-ad,[id^=google_ads_iframe],.ad-banner,.ad-slot,.advertisement,.taboola-recommended,.OUTBRAIN{display:none!important}";(document.head||document.documentElement).appendChild(s);})();';
if (!read('jsprox.bookmarkDefaultsAdded',false)) {
 bookmarks.push({name:'Ad cleanup',url:adCleanup});
 try {write('jsprox.bookmarks',bookmarks);write('jsprox.bookmarkDefaultsAdded',true);} catch {}
}
let bookmarkEditing = -1;
let bookmarkBarHidden = read('jsprox.bookmarkBarHidden',false) === true;
function saveBookmarks(){write('jsprox.bookmarks',bookmarks);renderBookmarkBar();renderBookmarkManager();}
function launchBookmark(item){
 $('bookmarks-dialog').close();
 if(!/^javascript:/i.test(item.url)){go(item.url);return;}
 if(!lastUrl || !document.body.classList.contains('loaded')){notify('Open a website before running a bookmarklet.');return;}
 try {
  // The target window's eval hook keeps execution in the active proxied page.
  const result=frame.contentWindow.eval(item.url.replace(/^javascript:/i,''));
  if(result && typeof result.then==='function')Promise.resolve(result).catch(err=>notify('Bookmarklet failed: '+err.message));
  notify('Ran '+item.name+'.');
 } catch(err){notify('Bookmarklet failed: '+err.message);}
}
function bookmarkButton(item){const button=document.createElement('button');button.textContent=(/^javascript:/i.test(item.url)?'⌘ ':'☆ ')+item.name;button.title=/^javascript:/i.test(item.url)?'Run bookmarklet: '+item.name:item.url;button.onclick=()=>launchBookmark(item);return button;}
function renderBookmarkBar(){
 $('bookmark-bar').classList.toggle('collapsed',bookmarkBarHidden);
 const toggle=$('bookmark-bar-toggle');toggle.textContent=bookmarkBarHidden?'▸':'▾';toggle.title=bookmarkBarHidden?'Show bookmarks bar':'Hide bookmarks bar';toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-expanded',String(!bookmarkBarHidden));
 $('bookmark-bar-items').replaceChildren();bookmarks.forEach((item,index)=>{const button=bookmarkButton(item);button.oncontextmenu=e=>{e.preventDefault();editBookmark(index);};$('bookmark-bar-items').append(button);});
}
function editBookmark(index=-1){bookmarkEditing=index;const form=$('bookmark-editor-form');form.elements.name.value=index<0?'':bookmarks[index].name;form.elements.url.value=index<0?(lastUrl?currentUrl():''):bookmarks[index].url;$('bookmark-error').textContent='';$('bookmark-editor').showModal();form.elements.name.focus();}
function renderBookmarkManager(){
 $('bookmarks-list').replaceChildren();bookmarks.forEach((item,index)=>{const row=document.createElement('div');row.className='bookmark-row';row.append(bookmarkButton(item));
 for(const [label,action] of [['Edit',()=>editBookmark(index)],['←',()=>moveBookmark(index,-1)],['→',()=>moveBookmark(index,1)],['Remove',()=>{bookmarks.splice(index,1);saveBookmarks();}]]){const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-label',label+' '+item.name);button.onclick=action;button.disabled=(label==='←'&&index===0)||(label==='→'&&index===bookmarks.length-1);row.append(button);}$('bookmarks-list').append(row);});
}
function moveBookmark(index,delta){[bookmarks[index],bookmarks[index+delta]]=[bookmarks[index+delta],bookmarks[index]];saveBookmarks();}
$('bookmark-bar-toggle').onclick=()=>{bookmarkBarHidden=!bookmarkBarHidden;try{write('jsprox.bookmarkBarHidden',bookmarkBarHidden);}catch{}renderBookmarkBar();};
$('bookmark-add').onclick=()=>editBookmark();$('bookmark-manager-add').onclick=()=>editBookmark();
$('bookmark-editor-form').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;try{let url=form.elements.url.value.trim();if(!/^javascript:/i.test(url))url=httpUrl(url);if(url.length>64000)throw Error('Bookmarklet is too large.');if(bookmarkEditing<0 && bookmarks.length>=100)throw Error('Limit reached: 100 bookmarks.');const item={name:form.elements.name.value.trim()||'Bookmark',url};if(bookmarkEditing<0)bookmarks.push(item);else bookmarks[bookmarkEditing]=item;saveBookmarks();$('bookmark-editor').close();}catch(err){$('bookmark-error').textContent=err.message;}};
renderBookmarkBar();
