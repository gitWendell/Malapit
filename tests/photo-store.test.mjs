import assert from 'node:assert/strict';
import test from 'node:test';
import { photoStore, photosReady, PHOTO_BUCKET } from '../lib/photo-store.ts';
const config={AUTH_MODE:'supabase',SUPABASE_URL:'https://malapit-storage-test.supabase.co',SUPABASE_SECRET_KEY:'test-server-storage-key'};
const request=new Request('https://malapit.example.workers.dev/api/media');
test('private storage operations use only the server key and never a public object URL',async()=>{
  const calls=[];
  const store=photoStore(request,config,async(input,init)=>{const url=new URL(String(input));calls.push({url,method:init.method,headers:new Headers(init.headers)});return init.method==='GET'?new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}}):Response.json(init.method==='DELETE'?[]:{Key:'stored'})});
  const id='00000000-1111-4222-8333-000000000001';
  await store.put(id,new Uint8Array([255,216,255,217]),'image/jpeg');assert((await store.get(id)).body);await store.remove(id);
  assert.equal(calls.length,3);for(const call of calls){assert(call.url.pathname.includes(PHOTO_BUCKET));assert(!call.url.href.includes(config.SUPABASE_SECRET_KEY));assert(!call.url.pathname.includes('/public/'));assert.equal(call.headers.get('apikey'),config.SUPABASE_SECRET_KEY)}
});
test('upload and deletion failures are reported so callers retain storage reservations',async()=>{
  const store=photoStore(request,config,async()=>Response.json({statusCode:'503',message:'temporarily unavailable'},{status:503}));
  await assert.rejects(store.put('test-id',new Uint8Array([1]),'image/jpeg'));await assert.rejects(store.remove('test-id'));
});
test('local emulated storage cannot be selected by a deployed request',()=>{
  assert.equal(photosReady(request,{AUTH_MODE:'local',LOCAL_PHOTOS:{}}),false);
  assert.throws(()=>photoStore(request,{AUTH_MODE:'local',LOCAL_PHOTOS:{}}));
});
