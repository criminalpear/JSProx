const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context=vm.createContext({URL});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../public/request-compat.js'),'utf8'),context);
const origin='http://localhost:8080';
function headers(values){return {headers:{...values},set(k,v){this.headers[k.toLowerCase()]=v}};}
test('outgoing navigation headers use the real source without reconstructing the request',()=>{
 const referrer=origin+'/service/'+encodeURIComponent('https://github.com/login');
 const input={method:'POST',referrer,body:{fixture:'unchanged'}};
 const outgoing=headers({origin,referer:referrer});
 const body=input.body;
 context.normalizeProxyHeaders(input,outgoing,origin);
 assert.equal(outgoing.headers.origin,'https://github.com');
 assert.equal(outgoing.headers.referer,'https://github.com/login');
 assert.equal(input.body,body);assert.equal(input.method,'POST');
});
test('null/cross-site origins remain unchanged while browser referrer is forwarded',()=>{
 for(const value of ['null','https://elsewhere.example']){
  const outgoing=headers({origin:value});
  context.normalizeProxyHeaders({referrer:origin+'/service/'+encodeURIComponent('https://github.com/login')},outgoing,origin);
  assert.equal(outgoing.headers.origin,value);assert.equal(outgoing.headers.referer,'https://github.com/login');
 }
 const outgoing=headers({origin});
 context.normalizeProxyHeaders({referrer:origin+'/'},outgoing,origin);
 assert.equal(outgoing.headers.origin,origin);
});
test('browser-generated referrer is forwarded even when Request.headers omits it',()=>{
 const outgoing=headers({origin});
 context.normalizeProxyHeaders({referrer:origin+'/service/'+encodeURIComponent('https://github.com/login')},outgoing,origin);
 assert.equal(outgoing.headers.referer,'https://github.com/login');
 assert.equal(outgoing.headers.origin,'https://github.com');
});
test('client fallback respects withheld and origin-only referrers',()=>{
 const client={url:origin+'/service/'+encodeURIComponent('https://github.com/private/path')};
 for(const referrer of ['', 'no-referrer']){
  const outgoing=headers({origin});
  context.normalizeProxyHeaders({referrer},outgoing,origin,client);
  assert.equal(outgoing.headers.origin,'https://github.com');
  assert.equal(outgoing.headers.referer,undefined);
 }
 const outgoing=headers({origin});
 context.normalizeProxyHeaders({referrer:origin+'/'},outgoing,origin,client);
 assert.equal(outgoing.headers.referer,'https://github.com/');
});
