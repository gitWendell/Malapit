import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {inquiryMessageInput,inquiryMessageQuery,inquiryParticipantRole} from '../lib/inquiry-messages.ts';
import {inquiryActivitySql,inquiryLastMessageSql,inquiryReplySql} from '../lib/inquiry-message-sql.ts';

test('messages require text and a repeat-safe send ID',()=>{
 const input={requestId:crypto.randomUUID(),body:'  Can we arrange a viewing?  '};
 assert.equal(inquiryMessageInput.parse(input).body,'Can we arrange a viewing?');
 for(const changes of [{body:''},{body:' \n '},{body:'a'.repeat(2001)},{requestId:'bad-id'}])assert.equal(inquiryMessageInput.safeParse({...input,...changes}).success,false);
 assert(inquiryMessageInput.safeParse({...input,body:'a'.repeat(2000)}).success);
});
test('only the original parties or the existing reviewer can access a conversation',()=>{
 const inquiry={ownerId:'owner',renterId:'renter'};
 assert.equal(inquiryParticipantRole(inquiry,{userId:'owner',isAdmin:true}),'owner');
 assert.equal(inquiryParticipantRole(inquiry,{userId:'renter',isAdmin:false}),'renter');
 assert.equal(inquiryParticipantRole(inquiry,{userId:'operator',isAdmin:true}),'reviewer');
 assert.equal(inquiryParticipantRole(inquiry,{userId:'other',isAdmin:false}),null);
});
test('message cursors cannot mix directions or accept invalid sequence values',()=>{
 assert.deepEqual(inquiryMessageQuery.parse({after:'0'}),{after:0});
 assert.deepEqual(inquiryMessageQuery.parse({before:'12'}),{before:12});
 for(const input of [{before:'0'},{after:'-1'},{after:'1.5'},{before:'invalid'},{before:'2',after:'1'},{after:'9007199254740992'}])assert(!inquiryMessageQuery.safeParse(input).success);
});
test('migrated message storage preserves legacy replies and protects append-only history',()=>{
 const db=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const id=crypto.randomUUID(),now=new Date().toISOString();
 db.prepare("INSERT INTO inquiries (id,listing_id,listing_title,owner_id,renter_id,renter_name,renter_email,message,move_in,occupants,reply,is_demo,created_at) VALUES (?,'listing','Sample place','owner','renter','Renter','renter@sites.test','Original inquiry','2026-11-20',1,'Original owner reply',0,?)").run(id,now);
 const insert=db.prepare('INSERT INTO inquiry_messages (id,inquiry_id,sender_id,sender_name,role,body,created_at,created_day) VALUES (?,?,?,?,?,?,?,?)');
 const send=(sender='renter',role='renter',body='Follow-up question',messageId=crypto.randomUUID())=>{insert.run(messageId,id,sender,sender,role,body,now,'2026-11-20');return messageId;};
 const first=send();send('owner','owner','Owner response');
 assert.equal(db.prepare('SELECT reply FROM inquiries WHERE id=?').get(id).reply,'Original owner reply');
 assert.deepEqual(db.prepare('SELECT body FROM inquiry_messages WHERE inquiry_id=? ORDER BY seq').all(id).map(row=>row.body),['Follow-up question','Owner response']);
 assert.throws(()=>send('other','renter'),/INQUIRY_MESSAGE_PARTY/);
 assert.throws(()=>send('owner','renter'),/INQUIRY_MESSAGE_PARTY/);
 assert.throws(()=>send('renter','renter',''),/CHECK/);
 assert.throws(()=>send('renter','renter','Follow-up question',first),/UNIQUE/);
 assert.throws(()=>db.prepare('UPDATE inquiry_messages SET body=? WHERE id=?').run('Overwrite',first),/INQUIRY_MESSAGE_IMMUTABLE/);
 for(let i=1;i<100;i++)send();
 assert.throws(()=>send(),/INQUIRY_MESSAGES_DAILY/);
 db.prepare('DELETE FROM inquiries WHERE id=?').run(id);
 assert.equal(db.prepare('SELECT count(*) AS n FROM inquiry_messages').get().n,0);db.close();
});

test('conversation previews use only messages for the matching inquiry',()=>{
 const db=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const create=db.prepare("INSERT INTO inquiries(id,listing_id,listing_title,owner_id,renter_id,renter_name,renter_email,message,move_in,occupants,reply,is_demo,created_at) VALUES (?,'listing','Place',?,'renter','Renter','renter@sites.test','Question','2026-11-20',1,?,0,'2026-11-20T00:00:00.000Z')");
 create.run('first','owner-a','First legacy reply');create.run('second','owner-b','Second legacy reply');create.run('third','owner-c','Unchanged legacy reply');
 const insert=db.prepare('INSERT INTO inquiry_messages(id,inquiry_id,sender_id,sender_name,role,body,created_at,created_day) VALUES (?,?,?,?,?,?,?,?)');
 insert.run('first','first','owner-a','Owner A','owner','Private A reply','2026-11-20T01:00:00.000Z','2026-11-20');
 insert.run('reply-b','second','owner-b','Owner B','owner','Private B reply','2026-11-20T02:00:00.000Z','2026-11-20');
 insert.run('question-b','second','renter','Renter','renter','Private B follow-up','2026-11-20T03:00:00.000Z','2026-11-20');
 const query=db.prepare(`SELECT inquiries.id,${inquiryReplySql} AS reply,${inquiryLastMessageSql} AS latest,${inquiryActivitySql} AS activity FROM inquiries WHERE inquiries.owner_id=?`);
 const a=query.get('owner-a'),b=query.get('owner-b'),c=query.get('owner-c');
 assert.equal(a.reply,'Private A reply');assert.equal(JSON.parse(a.latest).body,'Private A reply');
 assert.equal(b.reply,'Private B reply');assert.equal(JSON.parse(b.latest).body,'Private B follow-up');assert.equal(b.activity,'2026-11-20T03:00:00.000Z');
 assert.equal(c.reply,'Unchanged legacy reply');assert.equal(c.latest,null);assert.equal(c.activity,'2026-11-20T00:00:00.000Z');db.close();
});
