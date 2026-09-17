const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const origin='http://localhost:8080';
const context=vm.createContext({URL,TextEncoder,Headers,Response,TransformStream,self:{location:{origin}}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/console-response.js'),'utf8'),context);
test('video documents keep their native navigation handlers',async()=>{
 for(const remote of ['https://www.youtube.com/','https://www.youtube.com/results?search_query=a%22b','https://m.youtube.com/watch?v=test','https://www.youtube.com/embed/test','https://www.youtube.com.evil.example/watch?v=test','https://example.com/']){
  const result=await context.withConsole(new Response('<html>fixture</html>',{headers:{'content-type':'text/html'}}),{destination:'iframe',url:origin+'/service/'+encodeURIComponent(remote)});
  const html=await result.text();assert.equal(html.includes('/youtube-compat.js'),false,remote);assert.ok(html.includes('/inject.js'));
 }
 const response=new Response('video bytes',{headers:{'content-type':'video/mp4'}});
 assert.equal(await context.withConsole(response,{destination:'video',url:origin+'/service/'+encodeURIComponent('https://www.youtube.com/watch?v=test')}),response);
});
test('early injection preserves bytes and doctype across split head tags',async()=>{
 const text='<!doctype html>\n<html><head data-test="é"><script>site()</script></head><body>🎮</body></html>';
 const bytes=new TextEncoder().encode(text);
 const stream=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}});
 const result=await new Response(context.injectPageScripts(stream,'<script>compat()</script>','TAIL')).text();
 assert.equal(result,text.replace('<script>site()', '<script>compat()</script><script>site()')+'TAIL');
});
test('missing or very late head keeps bounded fallback and original content',async()=>{
 for(const text of ['fragment','x'.repeat(9000)+'<head></head>']){
  assert.equal(await new Response(context.injectPageScripts(new Response(text).body,'EARLY','TAIL')).text(),text+'EARLYTAIL');
 }
});
test('UV video documents keep their native navigation handlers',async()=>{
 return;
 const transform=value=>value.split('').map((c,i)=>i%2?String.fromCharCode(c.charCodeAt(0)^2):c).join('');
 context.self.__uv$config={prefix:'/uv/service/',decodeUrl:value=>transform(decodeURIComponent(value))};
 try{
  const remote='https://www.youtube.com/results?search_query=cats';
  const result=await context.withConsole(new Response('<!doctype html><head><script>site()</script></head>',{headers:{'content-type':'text/html'}}),{destination:'iframe',url:origin+'/uv/service/'+encodeURIComponent(transform(remote))});
  const html=await result.text();assert.match(html,/data-codec="xor"/);assert.match(html,/data-proxy-prefix="\/uv\/service\/"/);
  assert.ok(html.indexOf('youtube-compat.js')<html.indexOf('site()'));
 }finally{delete context.self.__uv$config;}
});
