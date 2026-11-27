import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { viewingInput, viewingTimes, viewingTimeError, canChangeViewing } from '../lib/inquiry-viewings.ts';
import { inquiryNextStep } from '../lib/inquiry-next-step.ts';

const uuid=()=>crypto.randomUUID(),now=()=>new Date().toISOString();
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const photo=uuid();db.prepare("INSERT INTO media(id,owner_id,content_type,created_at,byte_size) VALUES(?,'owner','image/jpeg',?,100)").run(photo,now());
 function inquiry(owner='owner',renter='renter',demo=0){
  const listing=uuid(),id=uuid(),ownedPhoto=uuid();db.prepare("INSERT INTO media(id,owner_id,content_type,created_at,byte_size) VALUES(?,?,'image/jpeg',?,100)").run(ownedPhoto,owner,now());db.prepare("INSERT INTO listings(id,owner_id,owner_name,title,city,status,data,created_at,confirmed_at) VALUES(?,?,'Owner','Home','Cebu City','published',?,?,?)").run(listing,owner,JSON.stringify({photos:['/api/media/'+ownedPhoto]}),now(),now());
  db.prepare("INSERT INTO inquiries(id,listing_id,listing_title,owner_id,renter_id,renter_name,renter_email,message,move_in,occupants,created_at,is_demo) VALUES(?,?,'Home',?,?,'Renter','renter@example.test','Test inquiry','2026-11-20',1,?,?)").run(id,listing,owner,renter,now(),demo);return{id,listing,owner,renter};
 }
 function propose(thread,actor=thread.renter,start=new Date(Date.now()+86400000).toISOString(),overrides={}){
  const row={id:uuid(),inquiry_id:thread.id,owner_id:thread.owner,renter_id:thread.renter,proposed_by:actor,starts_at:start,ends_at:new Date(Date.parse(start)+1800000).toISOString(),note:'Private meeting note',updated_by:actor,created_at:now(),created_day:new Date(Date.now()+8*3600000).toISOString().slice(0,10),updated_at:now(),...overrides};row.updated_at=row.created_at;
  const keys=Object.keys(row);db.prepare(`INSERT INTO inquiry_viewings(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));return row;
 }
 function change(row,status,actor=row.owner_id,version=1,note=''){return db.prepare('UPDATE inquiry_viewings SET status=?,updated_by=?,version=?,updated_at=?,decision_note=? WHERE id=?').run(status,actor,version+1,now(),note,row.id);}
 return{db,inquiry,propose,change};
}
test('viewing dates use Philippine time and reject invalid dates, unsupported durations and incomplete replacements',()=>{
 const value={requestId:uuid(),date:'2028-02-29',time:'00:30',duration:60,note:' meet at lobby '};
 const parsed=viewingInput.parse(value);assert.equal(parsed.note,'meet at lobby');assert.deepEqual(viewingTimes(parsed),{startsAt:'2028-02-28T16:30:00.000Z',endsAt:'2028-02-28T17:30:00.000Z'});
 for(const bad of [{date:'2027-02-29'},{date:'2028-04-31'},{time:'24:00'},{time:'09:60'},{duration:45},{replaceId:uuid()},{replaceVersion:1},{note:'x'.repeat(501)}])assert(!viewingInput.safeParse({...value,...bad}).success);
 const clock=new Date('2026-11-27T00:00:00.000Z');assert(viewingTimeError(clock.toISOString(),clock));assert.equal(viewingTimeError(new Date(+clock+90*86400000).toISOString(),clock),null);assert(viewingTimeError(new Date(+clock+90*86400000+1).toISOString(),clock));
});
test('only the recipient confirms; only the owner completes after the appointment starts',()=>{
 const row={ownerId:'owner',renterId:'renter',proposedBy:'renter',status:'proposed',startsAt:'2026-11-28T02:00:00.000Z'},clock=new Date('2026-11-27T00:00:00.000Z');
 assert(canChangeViewing(row,'owner','confirm',clock));assert(!canChangeViewing(row,'renter','confirm',clock));assert(!canChangeViewing(row,'reviewer','cancel',clock));
 assert(!canChangeViewing({...row,status:'confirmed'},'owner','complete',clock));assert(!canChangeViewing({...row,status:'confirmed'},'renter','complete',new Date('2026-11-29')));assert(canChangeViewing({...row,status:'confirmed'},'owner','complete',new Date('2026-11-29')));
});
test('database enforces real parties, initial state, private history, one active request and notifications',()=>{
 const {db,inquiry,propose,change}=fixture(),thread=inquiry();
 assert.throws(()=>propose(thread,'intruder'),/VIEWING_PARTIES/);assert.throws(()=>propose(inquiry('owner','renter',1)),/VIEWING_PARTIES/);assert.throws(()=>propose(thread,'renter',undefined,{status:'confirmed'}),/VIEWING_DETAILS/);
 const row=propose(thread);assert.throws(()=>propose(thread),/UNIQUE/);assert.throws(()=>change(row,'confirmed','renter'),/VIEWING_STATE/);
 assert.equal(db.prepare('SELECT user_id,kind,target_id FROM app_notifications').get().user_id,'owner');assert.equal(db.prepare('SELECT target_id FROM app_notifications').get().target_id,thread.id);
 change(row,'confirmed');assert.throws(()=>change(row,'completed','owner',2),/VIEWING_STATE/);assert.throws(()=>db.prepare('UPDATE inquiry_viewings SET note=? WHERE id=?').run('Changed behind someone’s back',row.id),/VIEWING_IMMUTABLE/);
 assert.throws(()=>db.prepare('UPDATE inquiry_viewing_events SET note=?').run('edited'),/VIEWING_IMMUTABLE/);assert.equal(db.prepare('SELECT count(*) n FROM inquiry_viewing_events').get().n,2);
 assert.equal(db.prepare("SELECT count(*) n FROM app_notifications WHERE user_id='renter' AND kind='viewing'").get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM rental_connections').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM rental_bills').get().n,0);db.close();
});
test('confirmed appointments reject owner and renter overlaps across either role, but allow adjacent times',()=>{
 const {db,inquiry,propose,change}=fixture(),start=new Date(Date.now()+86400000).toISOString(),first=propose(inquiry(),'renter',start);change(first,'confirmed');
 for(const [owner,renter] of [['owner','different-renter'],['different-owner','renter'],['renter','third-person']]){const row=propose(inquiry(owner,renter),renter,start);assert.throws(()=>change(row,'confirmed',owner),/VIEWING_OVERLAP/);change(row,'cancelled',renter);}
 const adjacent=propose(inquiry('owner','other-renter'),'other-renter',first.ends_at);change(adjacent,'confirmed','owner');assert.equal(db.prepare("SELECT count(*) n FROM inquiry_viewings WHERE status='confirmed'").get().n,2);db.close();
});
test('rescheduling is atomic when the replacement fails and preserves the original appointment',()=>{
 const {db,inquiry,propose,change}=fixture(),thread=inquiry(),row=propose(thread);change(row,'confirmed');const before=db.prepare('SELECT count(*) n FROM app_notifications').get().n;
 db.exec('BEGIN');try{change(row,'cancelled','renter',2,'Rescheduled');propose(thread,'renter',new Date(Date.now()-86400000).toISOString(),{replaces_id:row.id});assert.fail('Bad replacement should fail');}catch(error){db.exec('ROLLBACK');assert.match(error.message,/VIEWING_DETAILS/);}
 assert.equal(db.prepare('SELECT status,version FROM inquiry_viewings').get().status,'confirmed');assert.equal(db.prepare('SELECT count(*) n FROM app_notifications').get().n,before);
 db.exec('BEGIN');change(row,'cancelled','renter',2,'Rescheduled');const replacement=propose(thread,'renter',undefined,{replaces_id:row.id});db.exec('COMMIT');assert.equal(db.prepare('SELECT count(*) n FROM inquiry_viewings').get().n,2);assert.equal(db.prepare('SELECT status FROM inquiry_viewings WHERE id=?').get(replacement.id).status,'proposed');db.close();
});
test('rented or withdrawn listings cancel active viewings and notify renters',()=>{
 for(const status of ['rented','withdrawn']){const {db,inquiry,propose,change}=fixture(),thread=inquiry(),row=propose(thread);change(row,'confirmed');db.prepare('UPDATE listings SET status=? WHERE id=?').run(status,thread.listing);
  const saved=db.prepare('SELECT * FROM inquiry_viewings WHERE id=?').get(row.id);assert.equal(saved.status,'cancelled');assert.equal(saved.decision_note,'Listing marked '+status);assert.equal(saved.version,3);assert.equal(db.prepare("SELECT count(*) n FROM app_notifications WHERE user_id='renter' AND id=?").get('viewing:'+row.id+':cancelled').n,1);assert.throws(()=>propose(thread),/VIEWING_PARTIES/);db.close();}
});
test('expired or past appointments cannot be confirmed, and completion records only an owner action',()=>{
 const {db,inquiry,propose,change}=fixture(),row=propose(inquiry()),late=propose(inquiry('second-owner','second-renter'));change(row,'confirmed');
 // Advance SQLite's clock without weakening any production rule or mutating the appointment.
 db.function('julianday',{varargs:true},(...args)=>{if(args[0]==='now')return Date.parse(row.starts_at)/86400000+2440587.5+1;return Date.parse(args[0])/86400000+2440587.5;});
 assert.throws(()=>change(late,'confirmed','second-owner'),/VIEWING_STATE/);assert.throws(()=>change(row,'completed','renter',2),/VIEWING_STATE/);change(row,'completed','owner',2);assert.equal(db.prepare('SELECT status FROM inquiry_viewings').get().status,'completed');db.close();
});
test('per-person daily request cap prevents repeated cancellations bypassing the free test limit',()=>{
 const {db,inquiry,propose,change}=fixture(),thread=inquiry();for(let i=0;i<20;i++){const row=propose(thread);change(row,'cancelled','renter');}assert.throws(()=>propose(thread),/VIEWING_LIMIT/);assert.equal(db.prepare('SELECT count(*) n FROM inquiry_viewings').get().n,20);db.close();
});
test('next steps cover both roles, optional viewings, acceptance, pending reports, paid and new bills',()=>{
 const item={ownerId:'owner',renterId:'renter',isDemo:false};assert.equal(inquiryNextStep(item,'reviewer'),null);assert.equal(inquiryNextStep({...item,isDemo:true},'renter'),null);
 assert.equal(inquiryNextStep(item,'renter').title,'Arrange a viewing');assert.equal(inquiryNextStep({...item,viewing:{status:'completed'}},'owner').stage,2);
 const pending={...item,rental:{status:'pending',connectionId:uuid()}};assert.equal(inquiryNextStep(pending,'renter').rentalAction,'Review and accept rental');assert.equal(inquiryNextStep(pending,'owner').title,'Waiting for the renter to review');
 const accepted={...item,rental:{status:'accepted',billStatus:'issued',remainingCents:800000,pendingPayment:1}};assert.equal(inquiryNextStep(accepted,'owner').rentalAction,'Review payment report');assert.equal(inquiryNextStep(accepted,'renter').title,'Waiting for payment confirmation');
 const paid={...accepted,rental:{...accepted.rental,pendingPayment:0,remainingCents:0}};assert.equal(inquiryNextStep(paid,'renter').stage,4);assert.equal(inquiryNextStep({...paid,rental:{...paid.rental,remainingCents:800000}},'renter').rentalAction,'Open rent bill');assert.equal(inquiryNextStep({...paid,rental:{...paid.rental,status:'ended'}},'renter').rentalAction,'View rental records');
});
