const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
(async()=>{
 const server=spawn(process.execPath,['src/index.js'],{env:{...process.env,PORT:'8098'},windowsHide:true,stdio:'ignore'});
 const browser=await chromium.launch();
 try{
  await new Promise(r=>setTimeout(r,1000));const context=await browser.newContext();const page=await context.newPage();
  await page.goto('http://localhost:8098');
  await page.evaluate(()=>{settings.tabTitle='My tab';write('jsprox.settings',settings)});
  await page.click('#cloak-open');await page.click('#cloak-current',{noWaitAfter:true});
  await page.waitForURL('about:blank');await page.frameLocator('iframe').locator('#home-address').waitFor();
  await page.waitForTimeout(200);assert.equal(context.pages().length,1);assert.equal(await page.title(),'My tab');
  assert.equal(await page.frameLocator('iframe').locator('html').evaluate(()=>crossOriginIsolated),true);
  console.log('PASS manually opened current tab is replaced; helper closes; title and cross-origin isolation retained');
  await page.goto('http://localhost:8098');await page.evaluate(()=>window.open=()=>null);await page.click('#cloak-open');await page.click('#cloak-current');assert.equal(page.url(),'http://localhost:8098/');assert.match(await page.locator('#uv-status').textContent(),/Allow popups/);console.log('PASS blocked popup preserves original');
 }finally{server.kill();await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
