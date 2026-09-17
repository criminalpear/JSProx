const {chromium}=require('playwright');
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../public/youtube-compat.js'));
const remote='https://www.youtube.com/';
const fixture=`<!doctype html><form><input name="search_query"><button class="ytSearchboxComponentSearchButton" type="submit">Search</button></form><a id="watch" href="https://www.youtube.com/watch?v=fixture&amp;list=playlist">Video</a><a id="other" href="https://example.com/watch?v=fixture">Other site</a><script>window.spaClicks=0;document.addEventListener('click',e=>{if(e.target.closest('a')){e.preventDefault();window.spaClicks++}})</script>`;
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/youtube-compat.js'?'text/javascript':'text/html');res.end(req.url==='/youtube-compat.js'?source:fixture)}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const origin='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  for(const codec of ['uri','xor']){
  const prefix=codec==='xor'?'/uv/service/':'/service/';
  const transform=value=>value.split('').map((c,i)=>i%2?String.fromCharCode(c.charCodeAt(0)^2):c).join('');
  const encode=value=>encodeURIComponent(codec==='xor'?transform(value):value);
  async function visit(){await page.goto(origin);await page.evaluate(({origin,remote,prefix,codec})=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.dataset.proxyOrigin=origin;s.dataset.remoteUrl=encodeURIComponent(remote);s.dataset.proxyPrefix=prefix;s.dataset.codec=codec;s.src='/youtube-compat.js';s.onload=resolve;s.onerror=reject;document.head.append(s)}),{origin,remote,prefix,codec})}
  function decoded(){const value=decodeURIComponent(new URL(page.url()).pathname.slice(prefix.length));return codec==='xor'?transform(value):value;}
  await visit();await page.fill('input','cats & dogs');await page.press('input','Enter');await page.waitForURL('**/service/**');assert.equal(decoded(),'https://www.youtube.com/results?search_query=cats+%26+dogs');
  await visit();await page.fill('input','minecraft');await page.click('button');await page.waitForURL('**/service/**');assert.equal(decoded(),'https://www.youtube.com/results?search_query=minecraft');
  await visit();await page.click('#watch');await page.waitForURL('**/service/**');assert.equal(decoded(),'https://www.youtube.com/watch?v=fixture&list=playlist');
  await visit();await page.locator('#watch').evaluate((a,url)=>a.href=url,origin+prefix+encode('https://www.youtube.com/watch?v=fixture&list=playlist'));await page.click('#watch');await page.waitForURL('**/service/**');assert.equal(decoded(),'https://www.youtube.com/watch?v=fixture&list=playlist');
  await visit();await page.click('#watch',{modifiers:['Control']});assert.equal(page.url(),origin+'/');assert.equal(await page.evaluate(()=>spaClicks),1);
  await page.click('#other');assert.equal(page.url(),origin+'/');assert.equal(await page.evaluate(()=>spaClicks),2);
  await page.locator('#watch').evaluate(a=>a.target='_blank');await page.click('#watch');assert.equal(page.url(),origin+'/');assert.equal(await page.evaluate(()=>spaClicks),3);
  console.log('PASS '+codec+' YouTube search Enter/button, video document navigation, encoded links, modifiers, external links and new-tab behavior');
  }
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
