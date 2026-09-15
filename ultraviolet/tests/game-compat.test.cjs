const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context=vm.createContext({URL,Response});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../public/game-compat.js'),'utf8'),context);
const remote='https://builds.crazygames.com/gameframe/v2.10/bundle.js?version=1';
const canonical='http://localhost:8080/service/'+encodeURIComponent(remote);
test('module facade shares canonical runtime and preserves upstream query',async()=>{
 const response=context.gameframeModuleFacade({url:canonical+'?type=module',method:'GET'});
 assert.match(response.headers.get('content-type'),/javascript/);
 const source=await response.text();
 assert.ok(source.includes(JSON.stringify(canonical)));
 assert.match(source,/export \* from/);
 assert.match(source,/export default module.default/);
});
test('compatibility is limited to gameframe modules',()=>{
 for(const [url,method] of [[canonical,'GET'],[canonical+'?type=module','POST'],[canonical+'?type=module&dest=worker','GET'],['http://localhost:8080/service/'+encodeURIComponent('https://example.com/gameframe/v2.10/a.js')+'?type=module','GET']]) assert.equal(context.gameframeModuleFacade({url,method}),null);
});
