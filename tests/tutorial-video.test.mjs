import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {serveTutorialVideo,TUTORIAL_VIDEO_PATH} from '../lib/tutorial-video.ts';

const source='0123456789';
function setup(){
  let cancelled=false,pulls=0;
  const requests=[];
  const assets={async fetch(request){
    requests.push(request);
    const body=new ReadableStream({pull(controller){
      const part=source.slice(pulls*2,++pulls*2);
      if(part)controller.enqueue(new TextEncoder().encode(part));else controller.close();
    },cancel(){cancelled=true;}});
    return new Response(body,{headers:{'Content-Type':'video/mp4','Content-Length':'10',ETag:'"edition-3"','Last-Modified':'Wed, 18 Nov 2026 00:00:00 GMT'}});
  }};
  return {assets,requests,get cancelled(){return cancelled;},get pulls(){return pulls;}};
}
const request=(headers={},method='GET')=>new Request('https://malapit.example'+TUTORIAL_VIDEO_PATH,{method,headers});

test('video requests return exact middle bytes across stream chunks and release the source',async()=>{
  const fixture=setup(),response=await serveTutorialVideo(request({Range:'bytes=3-6'}),fixture.assets);
  assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 3-6/10');
  assert.equal(response.headers.get('Content-Length'),'4');assert.equal(response.headers.get('Accept-Ranges'),'bytes');
  assert.equal(await response.text(),'3456');assert.equal(fixture.cancelled,true);
  assert.equal(fixture.requests[0].headers.get('Range'),null);
});

test('open-ended and suffix video requests reach the correct end of the file',async()=>{
  for(const [range,expected] of [['bytes=7-','789'],['bytes=-3','789'],['bytes=-99',source],['bytes=7-99','789']]){
    const response=await serveTutorialVideo(request({Range:range}),setup().assets);
    assert.equal(response.status,206);assert.equal(await response.text(),expected);
  }
});

test('unavailable video ranges return 416 without sending the full video',async()=>{
  for(const range of ['bytes=10-','bytes=8-2','bytes=-0']){
    const fixture=setup(),response=await serveTutorialVideo(request({Range:range}),fixture.assets);
    assert.equal(response.status,416);assert.equal(response.headers.get('Content-Range'),'bytes */10');
    assert.equal(await response.text(),'');assert.equal(fixture.cancelled,true);
  }
});

test('full playback and unsupported range formats return the original bytes',async()=>{
  for(const range of [undefined,'bytes=0-1,4-5','items=2-4','bytes=-','bytes=oops','bytes=9007199254740992-']){
    const response=await serveTutorialVideo(request(range?{Range:range}:{}),setup().assets);
    assert.equal(response.status,200);assert.equal(response.headers.get('Content-Length'),'10');
    assert.equal(await response.text(),source);
  }
});

test('If-Range protects against combining different video editions',async()=>{
  for(const [validator,status] of [['"edition-3"',206],['"edition-2"',200],['W/"edition-3"',200],['Wed, 18 Nov 2026 00:00:00 GMT',206],['Tue, 17 Nov 2026 00:00:00 GMT',200]]){
    const response=await serveTutorialVideo(request({Range:'bytes=0-1','If-Range':validator}),setup().assets);
    assert.equal(response.status,status);assert.equal(await response.text(),status===206?'01':source);
  }
});

test('video HEAD and disallowed methods do not stream a body',async()=>{
  const fixture=setup(),head=await serveTutorialVideo(request({Range:'bytes=0-1'},'HEAD'),fixture.assets);
  assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),'10');assert.equal(await head.text(),'');
  assert.equal(fixture.cancelled,true);assert.equal(fixture.requests[0].method,'GET');
  const post=await serveTutorialVideo(request({},'POST'),fixture.assets);
  assert.equal(post.status,405);assert.equal(post.headers.get('Allow'),'GET, HEAD');assert.equal(fixture.requests.length,1);
});

test('stopping playback cancels the underlying asset stream',async()=>{
  const fixture=setup(),response=await serveTutorialVideo(request({Range:'bytes=0-9'}),fixture.assets);
  const reader=response.body.getReader();await reader.read();await reader.cancel();
  assert.equal(fixture.cancelled,true);assert(fixture.pulls<5);
});

test('asset errors are preserved instead of being labelled as playable video',async()=>{
  const response=await serveTutorialVideo(request({Range:'bytes=0-1'}),{async fetch(){return new Response('missing',{status:404});}});
  assert.equal(response.status,404);assert.equal(await response.text(),'missing');assert.equal(response.headers.has('Content-Range'),false);
});

test('deployment media size supports asset bindings without a Content-Length header',async()=>{
  const assets={async fetch(){return new Response(source,{headers:{'Content-Type':'video/mp4'}});}};
  const response=await serveTutorialVideo(request({Range:'bytes=3-6'}),assets,source.length);
  assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 3-6/10');
  assert.equal(await response.text(),'3456');
});

test('published video metadata and chapter times match the shipped edition',()=>{
  const file=suffix=>new URL('../public/tutorial/malapit-how-to'+suffix,import.meta.url);
  const video=readFileSync(file('.mp4')),media=JSON.parse(readFileSync(file('-media.json'),'utf8'));
  const chapters=JSON.parse(readFileSync(file('-index.json'),'utf8'));
  assert.equal(video.length,media.bytes);assert(video.length<20*1024*1024);
  assert.equal(createHash('sha256').update(video).digest('hex'),media.sha256);
  assert.equal(chapters[0].start,0);
  for(let i=0;i<chapters.length;i++){assert(chapters[i].end>chapters[i].start);if(i)assert.equal(chapters[i].start,chapters[i-1].end);}
  assert(Math.abs(chapters.at(-1).end-media.seconds)<0.01);
});
