const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const port=process.env.TEST_PORT || '8092';
const origin=`http://localhost:${port}`;
let server, browser;
async function start(){
 server=spawn(process.execPath,['src/index.js'],{cwd:root,env:{...process.env,PORT:port},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Test server exited: '+logs);try{if((await fetch(origin+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
 throw Error('Server did not start: '+logs);
}
async function stop(){if(server&&server.exitCode===null){const exited=once(server,'exit');server.kill();await exited;}}
async function visit(page,url){const loaded=await page.locator('body').evaluate(e=>e.classList.contains('loaded'));await page.fill(loaded?'#uv-address':'#home-address',url);await page.locator(loaded?'#uv-form':'#home-search').evaluate(f=>f.requestSubmit());}
async function example(page){await page.frameLocator('#uv-frame').getByRole('heading',{name:'Example Domain'}).waitFor({timeout:45000});await page.waitForFunction(()=>!busy);}
async function settings(page,changes){await page.click('#settings-open');for(const [key,value]of Object.entries(changes)){const field=page.locator(`#settings-form [name="${key}"]`);if(typeof value==='boolean')await field.setChecked(value);else if(await field.evaluate(e=>e.tagName==='SELECT'))await field.selectOption(value);else await field.fill(value);}await page.locator('#settings-form button[type=submit]').click();}
(async()=>{
 await start();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 const recoveryContext=await browser.newContext();const recoveryPage=await recoveryContext.newPage();const startupErrors=[];recoveryPage.on('pageerror',e=>startupErrors.push(e.message));
 let libraryStatus=404,libraryRequests=0;
 await recoveryPage.route('**/baremux/index.js',route=>{libraryRequests++;return route.fulfill({status:libraryStatus,contentType:'application/javascript',headers:{'cache-control':'no-store'},body:''});});
 await recoveryPage.goto(origin);assert.equal(await recoveryPage.locator('.shortcut-launch').count(),4);assert.equal(libraryRequests,0);
 await recoveryPage.click('#settings-open');await recoveryPage.click('[data-close=settings]');
 for(const status of [404,200]){
  libraryStatus=status;await visit(recoveryPage,'https://example.com');
  await recoveryPage.waitForFunction(()=>document.getElementById('uv-status').textContent.includes('Connection library unavailable'));
  assert.equal(await recoveryPage.locator('#go').isEnabled(),true);
 }
 await recoveryPage.unroute('**/baremux/index.js');await visit(recoveryPage,'https://example.com');await example(recoveryPage);
 assert.deepEqual(startupErrors,[]);await recoveryContext.close();console.log('PASS missing/invalid BareMux leaves dashboard working and navigation recovers on retry');
 await page.goto(origin);await page.locator('.search-home').waitFor();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.screenshot({path:path.join(__dirname,'home.png')});await page.click('#sidebar-toggle');assert.equal(await page.locator('#sidebar').isVisible(),false);await page.reload();assert.equal(await page.locator('#sidebar').isVisible(),false);await page.click('#sidebar-toggle');assert.equal(await page.locator('#sidebar').isVisible(),true);console.log('PASS dark default and persistent sidebar toggle');
 await visit(page,'javascript:alert(1)');assert.match(await page.locator('#uv-status').textContent(),/Only HTTP/);assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('loaded')),false);
 console.log('PASS unsafe URL is rejected before navigation');
 const arrows=await page.locator('#chrome-toggles button').evaluateAll(buttons=>buttons.map(b=>b.id));assert.deepEqual(arrows,['sidebar-toggle','panel-toggle']);await page.click('#panel-toggle');assert.equal(await page.locator('#sidebar-toggle').isVisible(),true);assert.equal(await page.locator('#panel-toggle').isVisible(),true);assert.ok((await page.locator('#chrome-toggles').boundingBox()).y<50);await page.click('#panel-toggle');console.log('PASS toggle order and both restore controls remain at top');
 await page.click('#diagnostics-open');assert.match(await page.locator('#connection-details').textContent(),/Preferred transport/);const reportDownload=page.waitForEvent('download');await page.click('#export-diagnostics');assert.equal((await reportDownload).suggestedFilename(),'jsprox-connection-report.json');assert.equal(await page.evaluate(()=>Object.hasOwn(connectionReport(),'cookies')),false);await page.click('[data-close=diagnostics-dialog]');console.log('PASS connection details and diagnostic export');
 await settings(page,{theme:'dark',tabTitle:'My workspace',rememberHistory:true});await page.reload();assert.equal(await page.title(),'My workspace');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 const wallpaper=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle='#ab3060';ctx.fillRect(0,0,400,300);ctx.fillStyle='#496eb5';ctx.fillRect(200,0,200,300);return c.toDataURL();});await page.click('#settings-open');await page.locator('#wallpaper-file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(wallpaper.split(',')[1],'base64')});await page.waitForFunction(()=>draftWallpaper.startsWith('data:image/'));await page.locator('#settings-form button[type=submit]').click();await page.reload();assert.match(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--wallpaper')),/data:image/);assert.match(await page.locator('#home-background').evaluate(e=>getComputedStyle(e).backgroundImage),/data:image/);assert.equal(await page.locator('#home-background').isVisible(),true);await page.screenshot({path:path.join(__dirname,'background.png')});
 await page.click('#settings-open');const downloadPromise=page.waitForEvent('download');await page.click('#export-settings');const download=await downloadPromise;assert.equal(download.suggestedFilename(),'jsprox-preferences.json');await page.click('[data-close=settings]');
 await page.click('#add-shortcut');await page.locator('#shortcut-form [name=name]').fill('Example');await page.locator('#shortcut-form [name=url]').fill('example.com');await page.locator('#shortcut-form button[type=submit]').click();assert.equal(await page.locator('.shortcut-text b').last().textContent(),'Example');
 console.log('PASS preferences, image upload persistence, export, shortcuts');
 await visit(page,'https://example.com');await example(page);console.log('PASS Scramjet + Libcurl navigation');
 await page.frames()[1].evaluate(()=>{window.gameKeys=[];window.addEventListener('keydown',e=>gameKeys.push(e.code));});
 await page.click('#game-view');
 await page.waitForFunction(()=>document.getElementById('uv-frame').contentDocument?.fullscreenElement || document.getElementById('notice').hidden===false,null,{timeout:5000});
 assert.equal(await page.frames()[1].evaluate(()=>document.fullscreenElement===document.documentElement),true);
 assert.equal(await page.evaluate(()=>document.fullscreenElement?.id),'uv-frame');
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'uv-frame');
 await page.keyboard.press('KeyW');
 assert.ok((await page.frames()[1].evaluate(()=>window.gameKeys)).includes('KeyW'));
 await page.evaluate(()=>document.exitFullscreen());
 await page.frames()[1].evaluate(()=>{const button=document.createElement('button');button.id='site-fullscreen';button.textContent='Site fullscreen';button.onclick=()=>document.documentElement.requestFullscreen();document.body.append(button);});
 await page.frameLocator('#uv-frame').locator('#site-fullscreen').click();
 await page.waitForFunction(()=>document.fullscreenElement?.id==='uv-frame');
 await page.waitForFunction(()=>document.getElementById('game-view').getAttribute('aria-label')==='Exit fullscreen',null,{timeout:3000});
 assert.equal(await page.locator('#game-view').getAttribute('aria-label'),'Exit fullscreen');
 await page.evaluate(()=>document.exitFullscreen());
 console.log('PASS game fullscreen belongs to proxied page and keyboard input reaches it');
 assert.equal(await page.evaluate(()=>localStorage.getItem('bare-mux-path')),origin+'/baremux/worker.js?v=jsprox2');
 assert.equal(await page.frames()[1].evaluate(()=>{try{const worker=new SharedWorker('/baremux/worker.js?v=jsprox2','bare-mux-worker');worker.port.start();worker.port.close();return true}catch(error){return error.message}}),true);
 console.log('PASS BareMux worker path stays absolute on proxy origin');
 const targetForm='<form target=_top action=https://example.com><button>Submit target top</button></form>';
 await visit(page,'https://httpbin.org/base64/'+Buffer.from(targetForm).toString('base64'));
 await page.frameLocator('#uv-frame').getByRole('button',{name:'Submit target top'}).waitFor();
 await page.frameLocator('#uv-frame').getByRole('button',{name:'Submit target top'}).click();
 await page.frameLocator('#uv-frame').getByRole('heading',{name:'Example Domain'}).waitFor();
 assert.equal(page.url(),origin+'/');
 console.log('PASS proxied _top form submission stays in the JSProx frame');
 const postForm='<form method=post target=_top action=https://httpbin.org/post><input name=code value=246810><button>Submit code</button></form>';
 await visit(page,'https://httpbin.org/base64/'+Buffer.from(postForm).toString('base64'));
 await page.frameLocator('#uv-frame').getByRole('button',{name:'Submit code'}).click();
 await page.frameLocator('#uv-frame').getByText('"246810"').waitFor();
 assert.equal(page.url(),origin+'/');
 console.log('PASS proxied _top POST preserves form data');
 await visit(page,'https://example.com');await page.waitForFunction(()=>currentUrl()==='https://example.com/');await example(page);
 await page.frames()[1].evaluate(()=>{const form=document.createElement('form');form.action='https://example.com/?dynamic-target=1';form.target='_top';document.body.append(form);form.submit();});
 await page.waitForFunction(()=>currentUrl().includes('dynamic-target=1'));
 assert.equal(page.url(),origin+'/');
 console.log('PASS programmatic _top form submission stays in the JSProx frame');
 await visit(page,'https://example.com');await page.waitForFunction(()=>currentUrl()==='https://example.com/');await example(page);
 await page.frames()[1].evaluate(()=>{history.replaceState(null,'',location.href);history.replaceState(null,'',location.href);});assert.equal(await page.evaluate(()=>currentUrl()),'https://example.com/');assert.equal(await page.frames()[1].evaluate(()=>!!window[Symbol.for('scramjet client global')].frame),true);console.log('PASS repeated history URL stays canonical and frame is registered');
 await page.frames()[1].evaluate(()=>{const f=document.createElement('iframe');f.id='nested-game-test';f.src='https://example.com/';document.body.append(f);});await page.frameLocator('#uv-frame').frameLocator('#nested-game-test').getByRole('heading',{name:'Example Domain'}).waitFor();assert.equal(await page.frameLocator('#uv-frame').frameLocator('#nested-game-test').locator('.btn').count(),0);assert.equal(await page.frameLocator('#uv-frame').locator('.btn').count(),1);const serialized=await page.frames()[1].evaluate(()=>{let calls=0;console.log({toJSON(){calls++;return 'noisy';}});return calls;});assert.equal(serialized,0);await page.frames()[1].evaluate(()=>document.getElementById('nested-game-test').remove());console.log('PASS one console across nested frames and no closed-console serialization');
 await page.click('#bookmark-add');await page.locator('#bookmark-editor-form [name=name]').fill('Test action');await page.locator('#bookmark-editor-form [name=url]').fill('javascript:document.body.dataset.bookmarkTest="ran"');await page.locator('#bookmark-editor-form button[type=submit]').click();await page.locator('#bookmark-bar-items').getByText('Test action',{exact:false}).click();assert.equal(await page.frames()[1].evaluate(()=>document.body.dataset.bookmarkTest),'ran');await page.click('#panel-toggle');assert.equal(await page.locator('#bookmark-bar-items').isVisible(),false);await page.reload();assert.equal(await page.locator('#panel-toggle').getAttribute('aria-expanded'),'false');await page.click('#panel-toggle');await visit(page,'https://example.com');await example(page);assert.ok(await page.locator('#bookmark-bar-items').getByText('Test action',{exact:false}).count());await page.locator('#bookmark-bar-items').getByText('Ad cleanup',{exact:false}).click();assert.equal(await page.frames()[1].evaluate(()=>!!document.getElementById('jsprox-ad-cleanup')),true);console.log('PASS bookmarklets execute in target page, persist, and bar hides');
 const proxy=page.frameLocator('#uv-frame');assert.equal(await proxy.locator('.btn').isVisible(),false);await page.click('#console-toggle');await proxy.locator('.btn').click();assert.equal(await proxy.locator('.btn').getAttribute('aria-expanded'),'true');await proxy.locator('.close').click();assert.equal(await proxy.locator('.btn').getAttribute('aria-expanded'),'false');await proxy.locator('.btn').click();
 async function run(code){await proxy.locator('textarea').fill(code);await proxy.locator('.run').click();}
 await run('var jsproxPersistent = 41; jsproxPersistent + 1');await proxy.locator('.out').getByText('42',{exact:true}).waitFor();
 await run('javascript:({then(resolve){resolve(99)}})');await proxy.locator('.out').getByText('99',{exact:true}).waitFor();
 await run('var circ={big:123n};circ.self=circ;circ');await proxy.locator('.out').getByText(/\[Circular\]/).last().waitFor();
 await run('window.runs=(window.runs||0)+1;throw Error("once")');assert.equal(await page.frames()[1].evaluate(()=>window.runs),1);
 await proxy.locator('.async').check();await run('await Promise.resolve();return 77');await proxy.locator('.out').getByText('77',{exact:true}).waitFor();await proxy.locator('.async').uncheck();
 await run('for(var i=0;i<650;i++)console.log(i)');assert.ok(await proxy.locator('.out .line').count()<=500);
 await run('console.warn("filter-warning");console.error("filter-error")');await proxy.locator('.filter').selectOption('error');assert.equal(await proxy.locator('.warn').last().isVisible(),false);assert.equal(await proxy.locator('.error').last().isVisible(),true);await proxy.locator('.filter').selectOption('');console.log('PASS console execution, log cap, launcher, close button and log filter');
 await page.click('#bookmark');await page.click('#home');await page.click('#bookmarks-nav');assert.match(await page.locator('#bookmarks-list').textContent(),/example.com/);await page.click('[data-close=bookmarks-dialog]');
 await visit(page,'https://example.com');await example(page);
 // Inject a deterministic dead connection through the real shared worker API.
 await page.evaluate(async()=>{window.failureReports=0;navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='jsprox:connection-error')window.failureReports++;});await connection.setManualTransport('return [class { ready=true; async request() { throw new Error("Wisp: MuxTaskEnded (Multiplexor task ended)"); } }, "broken-test"];',[]);});
 await visit(page,'https://example.com/?recovery=1');await page.waitForFunction(()=>window.failureReports>0,{},{timeout:15000});await example(page);assert.equal(await page.evaluate(()=>window.failureReports),1);assert.equal(await page.evaluate(()=>retryUsed),true);
 console.log('PASS dead transport triggers one GET recovery and successful reload');
 // Non-GET failures must stay visible and must not resubmit a form.
 await page.evaluate(()=>{retryUsed=false;navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'jsprox:connection-error',url:currentProxy,method:'GET',certificate:true}}));});assert.match(await page.locator('#uv-status').textContent(),/Certificate verification failed/);assert.equal(await page.evaluate(()=>retryUsed),false);console.log('PASS certificate failure stays visible without automatic retry');
 await page.evaluate(()=>{retryUsed=false;window.beforeTransport=transportKey;navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'jsprox:connection-error',url:currentProxy,method:'POST'}}));});
 assert.match(await page.locator('#uv-status').textContent(),/not retried automatically/);assert.equal(await page.evaluate(()=>recovering),false);console.log('PASS POST failure does not auto-retry');
 // Real server restart closes the WebSocket while the page/shared worker stay alive.
 await stop();await start();await page.click('#reconnect');await page.waitForFunction(()=>!recovering&&!busy);await example(page);console.log('PASS reconnect after actual server restart');
 await settings(page,{engine:'uv',transport:'epoxy'});await visit(page,'https://example.com');await example(page);console.log('PASS UV + Epoxy fallback');
 await page.locator('#bookmark-bar-items').getByText('Test action',{exact:false}).click();assert.equal(await page.frames()[1].evaluate(()=>document.body.dataset.bookmarkTest),'ran');console.log('PASS bookmarklet in UV engine');
 await page.click('#home');await settings(page,{theme:'light',engine:'scramjet',transport:'libcurl',tabTitle:'JSProx'});
 await page.click('#cloak-open');const popupPromise=context.waitForEvent('page');await page.click('#blank');const popup=await popupPromise;await popup.frameLocator('iframe').locator('#home-address').waitFor();assert.equal(popup.url(),'about:blank');const embedded=popup.frameLocator('iframe');await embedded.locator('#home-address').fill('https://example.com');await embedded.locator('#home-search button').click();await embedded.frameLocator('#uv-frame').getByRole('heading',{name:'Example Domain'}).waitFor({timeout:45000});await popup.close();console.log('PASS about:blank wrapper actually proxies a page');
 const original=await context.newPage();await original.goto(origin);await original.locator('#cloak-open').click();await original.click('#cloak-current',{noWaitAfter:true});await original.waitForURL('about:blank');await original.frameLocator('iframe').locator('#home-address').waitFor();assert.equal(context.pages().length,2);await original.close();console.log('PASS current-tab cloak replaces a manually opened tab and closes its helper');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(__dirname,'mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.click('#settings-open');await page.screenshot({path:path.join(__dirname,'settings-mobile.png')});await page.click('[data-close=settings]');console.log('PASS mobile layout and settings dialog');
 assert.deepEqual(pageErrors,[]);console.log('PASS no uncaught app errors');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await stop();});




