import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const root=new URL('../public/',import.meta.url);
const source=await readFile(new URL('sw.js',root),'utf8');
const offline=await readFile(new URL('offline.html',root),'utf8');
const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root),'utf8'));
function worker(network=async()=>new Response(offline,{headers:{'Content-Type':'text/html'}})){
  const handlers=new Map(),stores=new Map();let claimed=false;
  const caches={async open(key){if(!stores.has(key))stores.set(key,new Map());const store=stores.get(key);return{async put(path,response){store.set(path,response.clone())},async match(path){return store.get(path)?.clone()}}},async keys(){return [...stores.keys()]},async delete(key){return stores.delete(key)}};
  const self={location:{origin:'https://malapit.test'},addEventListener:(type,handler)=>handlers.set(type,handler),async skipWaiting(){},clients:{async claim(){claimed=true}}};
  vm.runInNewContext(source,{self,caches,fetch:(...args)=>network(...args),URL,Response});
  return {stores,caches,get claimed(){return claimed},async lifecycle(type){let done;handlers.get(type)({waitUntil(value){done=value}});await done},async request(path,{method='GET',mode='navigate'}={}){let result;handlers.get('fetch')({request:{url:new URL(path,self.location.origin).href,method,mode},respondWith(value){result=value}});return result?await result:null}};
}
test('Android manifest has stable identity, standalone launch, scoped shortcuts, and real launcher assets',async()=>{
  assert.equal(manifest.id,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');assert.match(manifest.start_url,/^\/\?/);assert.equal(manifest.prefer_related_applications,false);
  for(const size of [192,512]){const entry=manifest.icons.find(icon=>icon.sizes===`${size}x${size}`&&icon.purpose==='any');assert(entry);const png=await readFile(new URL(entry.src.slice(1),root));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size)}
  assert(manifest.icons.some(icon=>icon.purpose==='maskable'));
  for(const shortcut of manifest.shortcuts)assert(shortcut.url.startsWith('/'));
});
test('only generic offline help is stored during service-worker installation',async()=>{
  const app=worker();await app.lifecycle('install');assert.equal(app.stores.size,1);assert.deepEqual([...app.stores.values()][0].keys().toArray(),['/offline.html']);
});
test('a sign-in redirect or unrelated HTML is never cached as offline help',async()=>{
  for(const response of [new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}}),Response.redirect('https://login.test/',302)]){const app=worker(async()=>response);await assert.rejects(app.lifecycle('install'));assert.equal(app.stores.size,0)}
});
test('private API traffic, auth routes, writes, and external pages bypass the worker',async()=>{
  const app=worker();for(const path of ['/api/data','/api/inquiries','/auth/signin','/auth/signout','/cdn-cgi/access/logout','https://other.test/'])assert.equal(await app.request(path),null);
  assert.equal(await app.request('/',{method:'POST'}),null);assert.equal(await app.request('/',{mode:'cors'}),null);
});
test('online account HTML and access errors are returned directly and never cached',async()=>{
  for(const status of [200,401,403]){const app=worker(async()=>new Response('private response',{status}));const response=await app.request('/?view=inbox');assert.equal(response.status,status);assert.equal(await response.text(),'private response');assert.equal(app.stores.size,0)}
});
test('offline navigation falls back to account-free help without storing the requested page',async()=>{
  let offlineNow=false;const app=worker(async()=>{if(offlineNow)throw Error('offline');return new Response(offline,{headers:{'Content-Type':'text/html'}})});await app.lifecycle('install');offlineNow=true;
  const response=await app.request('/?view=saved');assert.equal(response.status,200);assert.match(await response.text(),/data-malapit-offline/);assert.deepEqual([...app.stores.values()][0].keys().toArray(),['/offline.html']);
});
test('activation removes only obsolete Malapit offline caches',async()=>{
  const app=worker();await app.caches.open('unrelated-cache');await app.caches.open('malapit-offline-old');await app.lifecycle('install');await app.lifecycle('activate');assert(app.stores.has('unrelated-cache'));assert(!app.stores.has('malapit-offline-old'));assert.equal(app.claimed,true);
});
