const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context=vm.createContext({URL,URLSearchParams});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../public/request-compat.js'),'utf8'),context);
const origin='http://localhost:8080';
function headers(values){return {headers:{...values},set(k,v){this.headers[k.toLowerCase()]=v}};}
test('outgoing navigation headers use the real source without reconstructing the request',async()=>{
 const referrer=origin+'/service/'+encodeURIComponent('https://github.com/login');
 const input={method:'POST',referrer,body:{fixture:'unchanged'}};
 const outgoing=headers({origin,referer:referrer});
 const body=input.body;
 await context.normalizeProxyHeaders(input,outgoing,origin);
 assert.equal(outgoing.headers.origin,'https://github.com');
 assert.equal(outgoing.headers.referer,'https://github.com/login');
 assert.equal(input.body,body);assert.equal(input.method,'POST');
});
test('null/cross-site origins remain unchanged while browser referrer is forwarded',async()=>{
 for(const value of ['null','https://elsewhere.example']){
  const outgoing=headers({origin:value});
  await context.normalizeProxyHeaders({referrer:origin+'/service/'+encodeURIComponent('https://github.com/login')},outgoing,origin);
  assert.equal(outgoing.headers.origin,value);assert.equal(outgoing.headers.referer,'https://github.com/login');
 }
 const outgoing=headers({origin});
 await context.normalizeProxyHeaders({referrer:origin+'/'},outgoing,origin);
 assert.equal(outgoing.headers.origin,origin);
});
test('browser-generated referrer is forwarded even when Request.headers omits it',async()=>{
 const outgoing=headers({origin});
 await context.normalizeProxyHeaders({referrer:origin+'/service/'+encodeURIComponent('https://github.com/login')},outgoing,origin);
 assert.equal(outgoing.headers.referer,'https://github.com/login');
 assert.equal(outgoing.headers.origin,'https://github.com');
});
test('missing browser Origin is restored from the virtual referrer for SPA token exchange',async()=>{
 const referrer=origin+'/service/'+encodeURIComponent('https://www.xbox.com/en-US/auth/msa?action=loggedIn');
 const outgoing=headers({});
 await context.normalizeProxyHeaders({method:'POST',referrer},outgoing,origin);
 assert.equal(outgoing.headers.origin,'https://www.xbox.com');
 assert.equal(outgoing.headers.referer,'https://www.xbox.com/en-US/auth/msa?action=loggedIn');
});
test('client fallback respects withheld and origin-only referrers',async()=>{
 const client={url:origin+'/service/'+encodeURIComponent('https://github.com/private/path')};
 for(const referrer of ['', 'no-referrer']){
  const outgoing=headers({origin});
  await context.normalizeProxyHeaders({referrer},outgoing,origin,client);
  assert.equal(outgoing.headers.origin,'https://github.com');
  assert.equal(outgoing.headers.referer,undefined);
 }
 const outgoing=headers({origin});
 await context.normalizeProxyHeaders({referrer:origin+'/'},outgoing,origin,client);
 assert.equal(outgoing.headers.referer,'https://github.com/');
});
test('OAuth token exchange recovers missing SPA Origin from redirect_uri',async()=>{
 const tokenUrl=origin+'/service/'+encodeURIComponent('https://login.microsoftonline.com/consumers/oauth2/v2.0/token');
 const body=new URLSearchParams({grant_type:'authorization_code',redirect_uri:'https://www.xbox.com/auth/msa?action=loggedIn'}).toString();
 const outgoing=headers({});
 await context.normalizeProxyHeaders({method:'POST',url:tokenUrl,referrer:'',clone(){return {text:async()=>body}}},outgoing,origin);
 assert.equal(outgoing.headers.origin,'https://www.xbox.com');
});
test('navigation GET without browser Origin stays without Origin',async()=>{
 const referrer=origin+'/service/'+encodeURIComponent('https://www.xbox.com/en-US/play');
 const outgoing=headers({});
 await context.normalizeProxyHeaders({method:'GET',referrer},outgoing,origin);
 assert.equal(outgoing.headers.origin,undefined);
});
