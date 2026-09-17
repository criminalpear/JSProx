import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {scramjetPath} from '@mercuryworkshop/scramjet/path';
import {patchScramjetBundle} from '../src/scramjet-compat.js';
test('served URL rewriter preserves canonical proxy URLs and rewrites external URLs',()=>{
 const source=patchScramjetBundle(readFileSync(join(scramjetPath,'scramjet.all.js'),'utf8'));
 const start=source.indexOf('function l(e,t){if(e instanceof URL)e=e.toString();');
 const fn=source.slice(start,source.indexOf('function c(e)',start));
 const context=vm.createContext({URL,location:{origin:'http://localhost:8080'},n:{$W:{prefix:'/service/'},hD:encodeURIComponent},a:(u,b)=>new URL(u,b)});
 vm.runInContext(fn,context);
 const meta={base:new URL('https://github.com/login')};
 const canonical='http://localhost:8080/service/'+encodeURIComponent('https://github.com/login');
 assert.equal(context.l(canonical,meta),canonical);
 assert.equal(context.l(context.l(canonical,meta),meta),canonical);
 assert.equal(context.l('https://github.com/login',meta),canonical);
 assert.equal(context.l('/session',meta),'http://localhost:8080/service/'+encodeURIComponent('https://github.com/session'));
 assert.equal(context.l('https://other.example/service/x',meta),'http://localhost:8080/service/'+encodeURIComponent('https://other.example/service/x'));
});
test('unknown bundles require explicit compatibility review',()=>assert.throws(()=>patchScramjetBundle('changed bundle'),/needs review/));
test('document and loader base URLs preserve game paths and resolve relative base tags',()=>{
 const source=patchScramjetBundle(readFileSync(join(scramjetPath,'scramjet.all.js'),'utf8'));
 const start=source.indexOf('e.Trap("Node.prototype.baseURI",{get')+'e.Trap("Node.prototype.baseURI",{get'.length;
 const getter='(function'+source.slice(start,source.indexOf(',set:',start))+')';
 const metaStart=source.indexOf('get base(){')+'get base'.length;
 const metaGetter='(function'+source.slice(metaStart,source.indexOf(',get topFrameName',metaStart))+')';
 const url=new URL('https://game.example/title/26/index.html');
 for(const [href,expected] of [[null,url.href],['',url.href],['assets/','https://game.example/title/26/assets/'],['/shared/','https://game.example/shared/'],['https://cdn.example/game/','https://cdn.example/game/']]){
  const base=href===null?null:{getAttribute:()=>href};
  class Document {querySelector(selector){assert.equal(selector,'base[href]');return base;}}
  const doc=new Document();
  const context=vm.createContext({URL,Document,e:{url},d:{iswindow:true},t:{url,global:{document:doc},natives:{call:(name,target,selector)=>target.querySelector(selector)}}});
  const getBase=vm.runInContext(getter,context), getMetaBase=vm.runInContext(metaGetter,context);
  assert.equal(getBase({this:doc}),expected);
  assert.equal(getBase({this:{ownerDocument:doc}}),expected);
  assert.equal(getMetaBase().href,expected);
 }
});
test('signed cookie values survive parsing and persisted cookies survive reload',()=>{
 const source=patchScramjetBundle(readFileSync(join(scramjetPath,'scramjet.all.js'),'utf8'));
 // Exercise the actual bundled parser and cookie store, not a parser mock.
 const parserStart=source.indexOf('4322:function(e){')+'4322:'.length;
 const parserText=source.slice(parserStart);
 const parserEnd=parserText.search(/},\d+:function/);
 const context=vm.createContext({URL,console,module:{exports:{}}});
 vm.runInContext('('+parserText.slice(0,parserEnd)+'})(module);const i=()=>module.exports;',context);
 const start=source.indexOf('class a{cookies={};setCookies');
 const end=source.indexOf('},1427:',start);
 vm.runInContext(source.slice(start,end)+';globalThis.store=new a;',context);
 const url=new URL('https://github.com/login');
 context.store.setCookies(['session=abc%2Bdef%2Fghi%3D; Path=/; Secure; HttpOnly'],url);
 assert.equal(context.store.getCookies(url,false),'session=abc%2Bdef%2Fghi%3D');
 assert.equal(context.store.getCookies(url,true),'');
 const dump=context.store.dump();
 context.store.cookies={};context.store.load(JSON.parse(dump));
 assert.equal(context.store.getCookies(url,false),'session=abc%2Bdef%2Fghi%3D');
 context.store.cookies={};context.store.load(dump);
 assert.equal(context.store.getCookies(url,false),'session=abc%2Bdef%2Fghi%3D');
});
test('referrer traversal terminates on self references and longer cycles',async()=>{
 const source=patchScramjetBundle(readFileSync(join(scramjetPath,'scramjet.all.js'),'utf8'));
 const start=source.indexOf('let t=e.referrer,r=await self.clients.matchAll');
 const loop=source.slice(start,source.indexOf('}v?',start));
 for(const chain of [{a:'a'},{a:'b',b:'a'},{a:'b',b:null}]){
  let reads=0;
  const context=vm.createContext({Set,e:{referrer:'/service/a'},self:{clients:{matchAll:async()=>Object.keys(chain).map(k=>({url:'/service/'+k,frameType:'nested'}))}},c:{$W:{prefix:'/service/'}},a:{Yq:async url=>{assert.ok(++reads<=3,'lookup must terminate');const next=chain[url.split('/').pop()];return next?{referrer:'/service/'+next}:null;}},location:{origin:'http://localhost'},v:false});
  await vm.runInContext('(async()=>{'+loop+'})()',context);
  assert.ok(reads<=2);
 }
});
