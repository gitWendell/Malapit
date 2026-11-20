import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

// Fictional records, identity headers and cleanup belong only to this loopback Worker.
const base='http://127.0.0.1:5188',run=crypto.randomUUID().slice(0,8),id=crypto.randomUUID();
const person=role=>({id:'qa-conversation-'+role+'-'+run,name:'QA '+role});
const owner=person('owner'),renter=person('renter'),other=person('other'),reviewer={id:'local_seedy',name:'QA reviewer'};
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
function localSql(sql){return execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql],{cwd:new URL('..',import.meta.url),stdio:'pipe'});}
let checks=0;
async function request(path,user,method='GET',body,origin=base){const headers={};if(user){headers['oai-authenticated-user-id']=user.id;headers['oai-authenticated-user-email']=user.id+'@sites.test';headers['oai-authenticated-user-full-name']=user.name;}
 if(method!=='GET')headers.origin=origin;if(body!==undefined)headers['content-type']='application/json';
 const response=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),headers:response.headers};}
function expect(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result.data));checks++;return result.data;}
function verify(value,label){assert.ok(value,label);checks++;}
const path='/api/inquiries/'+id+'/messages';
const send=(user,body,requestId=crypto.randomUUID())=>request(path,user,'POST',{requestId,body});
try{
 localSql(`INSERT INTO inquiries(id,listing_id,listing_title,owner_id,renter_id,renter_name,renter_email,message,move_in,occupants,reply,is_demo,created_at) VALUES (${quote(id)},'qa-conversation-listing','QA conversation ${run}',${quote(owner.id)},${quote(renter.id)},'QA renter',${quote(renter.id+'@sites.test')},'Original inquiry retained','2026-11-20',1,'Original lister reply retained',0,${quote(new Date().toISOString())});`);
 expect(await request(path,null),401,'Anonymous history blocked');
 expect(await send(null,'Anonymous message'),401,'Anonymous send blocked');
 expect(await request(path,other),404,'Other account cannot read');
 expect(await send(other,'Unrelated user message'),404,'Other account cannot send');
 expect(await request(path,owner,'POST',{requestId:crypto.randomUUID(),body:'Cross-site message'},'https://untrusted.invalid'),403,'Cross-site send blocked');
 const initial=await request(path,renter);expect(initial,200,'Renter opens original conversation');verify(initial.data.legacyReply==='Original lister reply retained','Legacy reply retained');verify(initial.data.messages.length===0,'No history rewritten');verify(initial.headers.get('cache-control').includes('no-store'),'Private history not cached');
 for(const body of ['', ' \n ', 'x'.repeat(2001)])expect(await send(renter,body),400,'Invalid message rejected');
 const firstId=crypto.randomUUID(),first=expect(await send(renter,'Can I view it on Saturday?',firstId),201,'Renter can follow up');verify(first.message.role==='renter'&&first.message.senderId===renter.id,'Sender comes from authenticated account');
 const repeated=expect(await send(renter,'Can I view it on Saturday?',firstId),201,'Retry succeeds');verify(repeated.message.seq===first.message.seq,'Retry does not duplicate message');
 expect(await send(renter,'Changed retry text',firstId),409,'Conflicting retry rejected');
 const racedId=crypto.randomUUID(),raced=await Promise.all([send(owner,'Saturday is available.',racedId),send(owner,'Saturday is available.',racedId)]);raced.forEach(result=>expect(result,201,'Concurrent duplicate send succeeds once'));verify(raced[0].data.message.seq===raced[1].data.message.seq,'Concurrent retry shares one record');
 const review=expect(await send(reviewer,'QA reviewer note.'),201,'Existing reviewer access preserved');verify(review.message.role==='reviewer','Reviewer is labeled honestly');
 expect(await request('/api/inquiries',renter,'PATCH',{id,reply:'Pretend to be the owner'}),403,'Legacy route cannot impersonate owner');
 expect(await request('/api/inquiries',owner,'PATCH',{id,reply:'New owner reply through the earlier interface.'}),200,'Legacy interface appends a reply');
 let page=expect(await request(path,renter),200,'Both parties read all messages');verify(page.legacyReply==='Original lister reply retained','Original reply is never overwritten');verify(page.messages.length===4,'All new messages retained');
 const ownList=expect(await request('/api/data',owner),200,'Owner previews conversations').inquiries.find(row=>row.id===id);verify(ownList.reply==='New owner reply through the earlier interface.','Old preview shows latest lister response');verify(ownList.lastMessage.body===ownList.reply,'Latest preview available');
 verify(!expect(await request('/api/data',other),200,'Other account data stays scoped').inquiries.some(row=>row.id===id),'Conversation is private in account data');
 for(let index=0;index<34;index++)expect(await send(index%2?owner:renter,'Pagination message '+index),201,'Follow-up stored');
 page=expect(await request(path,owner),200,'Recent history paginated');verify(page.messages.length===30&&page.hasMore,'Latest page is bounded');verify(page.messages.every((row,index,array)=>!index||row.seq>array[index-1].seq),'History ordered by sequence');
 const older=expect(await request(path+'?before='+page.messages[0].seq,renter),200,'Older messages loaded');verify(older.messages.length===8&&!older.hasMore,'Earlier history complete');
 const forward=expect(await request(path+'?after='+older.messages.at(-1).seq,renter),200,'New-message cursor works');verify(forward.messages[0].id===page.messages[0].id,'No gap at cursor boundary');
 expect(await request(path+'?before=1&after=0',owner),400,'Conflicting cursors rejected');
 expect(await request(path+'?after=-1',owner),400,'Negative cursor rejected');
 const injected=expect(await request(path,owner,'POST',{requestId:crypto.randomUUID(),body:'Actual owner identity.',senderId:other.id,role:'renter'}),201,'Untrusted sender fields ignored');verify(injected.message.role==='owner'&&injected.message.senderId===owner.id,'Cannot override sender identity');
 console.log(`PASS: ${checks} conversation checks covering renter follow-ups, owner replies, history, privacy, retries, pagination and legacy compatibility.`);
}finally{localSql(`DELETE FROM inquiries WHERE id=${quote(id)} AND owner_id=${quote(owner.id)};`);console.log('Removed this run’s fictional local conversation and messages.');}
