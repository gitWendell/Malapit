import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {billScheduleAction,billingPreview,followingMonth,scheduledPeriod} from '../lib/rental-billing.ts';
import {monthBounds,billDefaults} from '../lib/rental-bills.ts';
import {philippinesDay} from '../lib/rentals.ts';
import {runScheduledRentBills} from '../lib/rental-billing-jobs.ts';

const first=followingMonth(philippinesDay().slice(0,7)),runAt=month=>new Date(month+'-01T00:05:00+08:00');
function database(){const db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));return db;}
function fixture(db,changes={}){
 const unit=crypto.randomUUID(),id=crypto.randomUUID(),now=new Date().toISOString(),values={leaseStart:philippinesDay().slice(0,4)+'-01-01',leaseEnd:null,dueDay:31,monthlyRentCents:800025,...changes};
 db.prepare('INSERT INTO rental_units (id,owner_id,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,lease_end,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(unit,'owner','Example rental','Room 2','Cebu','Fictional address',values.monthlyRentCents,values.dueDay,values.leaseStart,values.leaseEnd,now,now);
 db.prepare("INSERT INTO rental_connections (id,unit_id,owner_id,owner_name,owner_email,invite_email,status,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,lease_end,created_at,created_day,expires_at) SELECT ?,id,owner_id,'Owner','owner@sites.test','renter@sites.test','pending',property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,lease_end,?,?,? FROM rental_units WHERE id=?").run(id,now,philippinesDay(),new Date(Date.now()+86400000).toISOString(),unit);
 db.prepare("UPDATE rental_connections SET status='accepted',renter_id='renter',renter_name='Renter',renter_email='renter@sites.test',responded_at=? WHERE id=?").run(now,id);
 return{id,ownerId:'owner',renterId:'renter',status:'accepted',...values};
}
function enable(db,c,month=first){const now=new Date().toISOString();db.prepare("INSERT INTO rental_bill_schedules (connection_id,owner_id,status,first_month,next_month,created_at,updated_at,updated_by) VALUES (?,?,'enabled',?,?,?,?,'owner')").run(c.id,c.ownerId,month,month,now,now);}
function row(db,c){return db.prepare('SELECT * FROM rental_bill_schedules WHERE connection_id=?').get(c.id);}
function manual(db,c,month=first,changes={}){const b={id:crypto.randomUUID(),...monthBounds(month),...billDefaults(month,c),amountCents:800025,createdAt:runAt(first).toISOString(),createdDay:first+'-01',...changes};db.prepare("INSERT INTO rental_bills (id,connection_id,owner_id,renter_id,month,period_start,period_end,due_date,amount_cents,created_at,created_day) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(b.id,c.id,c.ownerId,c.renterId,month,b.periodStart,b.periodEnd,b.dueDate,b.amountCents,b.createdAt,b.createdDay);return b.id;}
function cancel(db,id){const created=db.prepare('SELECT created_at FROM rental_bills WHERE id=?').get(id).created_at;db.prepare("UPDATE rental_bills SET status='voided',void_reason='Correcting this bill',voided_at=? WHERE id=?").run(new Date(Math.max(Date.now(),Date.parse(created)+1)).toISOString(),id);}
function binding(db,beforeBatch){
 function prepare(sql){let values=[];return{bind(...args){values=args;return this;},async all(){return{results:db.prepare(sql).all(...values)};},async first(){return db.prepare(sql).get(...values)||null;},async run(){return this.execute();},execute(){const r=db.prepare(sql).run(...values);return{success:true,meta:{changes:Number(r.changes)}};}};}
 return{prepare,async batch(statements){if(beforeBatch)beforeBatch();db.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.execute());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
}
test('automatic preview starts in a future full month and keeps short-month due dates',()=>{
 const c={status:'accepted',leaseStart:'2026-01-01',leaseEnd:null,monthlyRentCents:800025,dueDay:31};
 assert.equal(billingPreview(c,new Date('2026-11-30T15:59:00Z')).month,'2026-12');
 assert.equal(billingPreview(c,new Date('2026-11-30T16:00:00Z')).month,'2027-01');
 assert.equal(billingPreview(c,new Date('2028-01-01')).dueDate,'2028-02-29');
 assert.equal(billingPreview({...c,leaseStart:'2027-02-12'},new Date('2026-11-17')).month,'2027-03');
 assert.equal(billingPreview({...c,leaseEnd:'2026-12-15'},new Date('2026-11-17')),null);
 assert.equal(billingPreview({...c,status:'ended'},new Date('2026-11-17')),null);
 assert.equal(followingMonth('2026-12'),'2027-01');
 assert(!billScheduleAction.safeParse({action:'enable',version:null,month:first,detailsConfirmed:false}).success);
 assert.equal(scheduledPeriod('2026-11',c,'2026-12-01').issue,'missed');
});
test('a scheduled invocation creates one exact bill and a truthful automatic history',async()=>{
 const db=database(),c=fixture(db);enable(db,c);const result=await runScheduledRentBills(binding(db),runAt(first));assert.equal(result.created,1);
 const bill=db.prepare('SELECT * FROM rental_bills').get();assert.equal(bill.amount_cents,800025);assert.equal(bill.period_start,first+'-01');assert.equal(bill.period_end,monthBounds(first).last);assert.equal(bill.source,'scheduled');
 assert.equal(row(db,c).next_month,followingMonth(first));assert.equal(row(db,c).last_bill_id,bill.id);
 const event=db.prepare('SELECT actor_id,actor_name,action FROM rental_bill_events WHERE bill_id=?').get(bill.id);assert.deepEqual({...event},{actor_id:'system',actor_name:'Malapit',action:'created_automatically'});
 assert.equal((await runScheduledRentBills(binding(db),runAt(first))).created,0);assert.equal(db.prepare('SELECT count(*) AS n FROM rental_bills').get().n,1);db.close();
});
test('concurrent scheduled invocations cannot duplicate a bill or its history',async()=>{
 const db=database(),c=fixture(db);enable(db,c);const results=await Promise.all([runScheduledRentBills(binding(db),runAt(first)),runScheduledRentBills(binding(db),runAt(first))]);assert.equal(results.reduce((n,r)=>n+r.created,0),1);assert.equal(db.prepare('SELECT count(*) AS n FROM rental_bill_events').get().n,1);db.close();
});
test('an existing manual bill is kept unchanged and the schedule advances',async()=>{
 const db=database(),c=fixture(db);enable(db,c);const id=manual(db,c,first,{amountCents:750000});const result=await runScheduledRentBills(binding(db),runAt(first));assert.equal(result.created,0);assert.equal(result.skipped,1);assert.equal(row(db,c).next_month,followingMonth(first));assert.equal(db.prepare('SELECT amount_cents,source FROM rental_bills WHERE id=?').get(id).amount_cents,750000);db.close();
});
test('a cancelled bill is never silently regenerated',async()=>{
 const db=database(),c=fixture(db);enable(db,c);cancel(db,manual(db,c));await runScheduledRentBills(binding(db),runAt(first));assert.equal(row(db,c).status,'attention');assert.equal(row(db,c).issue,'corrected');assert.equal(db.prepare("SELECT count(*) AS n FROM rental_bills WHERE status='issued'").get().n,0);db.close();
});
test('a partial final month is left for an agreed manual amount',async()=>{
 const db=database(),next=followingMonth(first),c=fixture(db,{leaseEnd:next+'-15'});enable(db,c);await runScheduledRentBills(binding(db),runAt(first));await runScheduledRentBills(binding(db),runAt(next));assert.equal(row(db,c).status,'attention');assert.equal(row(db,c).issue,'partial');assert.equal(db.prepare('SELECT count(*) AS n FROM rental_bills').get().n,1);db.close();
});
test('ended rental dates and closed connections stop automatic bills',async()=>{
 const db=database(),c=fixture(db,{leaseEnd:monthBounds(first).last});enable(db,c);await runScheduledRentBills(binding(db),runAt(first));await runScheduledRentBills(binding(db),runAt(followingMonth(first)));assert.equal(row(db,c).status,'finished');assert.equal(row(db,c).issue,'ended');
 const other=fixture(db);enable(db,other);db.prepare("UPDATE rental_connections SET status='ended',ended_at=?,ended_by='renter' WHERE id=?").run(new Date().toISOString(),other.id);assert.equal(row(db,other).status,'finished');await runScheduledRentBills(binding(db),runAt(first));assert.equal(db.prepare('SELECT count(*) AS n FROM rental_bills WHERE connection_id=?').get(other.id).n,0);db.close();
});
test('pausing while a job is preparing prevents that job from issuing a bill',async()=>{
 const db=database(),c=fixture(db);enable(db,c);await runScheduledRentBills(binding(db,()=>{db.prepare("UPDATE rental_bill_schedules SET status='paused',updated_by='owner',updated_at=?,version=version+1 WHERE connection_id=?").run(new Date().toISOString(),c.id);}),runAt(first));assert.equal(row(db,c).status,'paused');assert.equal(db.prepare('SELECT count(*) AS n FROM rental_bills').get().n,0);db.close();
});
test('overlap and daily limits pause the schedule instead of creating conflicting charges',async()=>{
 const db=database(),c=fixture(db);enable(db,c);const previous=philippinesDay().slice(0,7);manual(db,c,previous,{periodStart:previous+'-20',periodEnd:first+'-10'});await runScheduledRentBills(binding(db),runAt(first));assert.equal(row(db,c).issue,'overlap');
 const limited=fixture(db);enable(db,limited);for(let i=1;i<60;i++)cancel(db,manual(db,limited,previous));await runScheduledRentBills(binding(db),runAt(first));assert.equal(row(db,limited).issue,'limit');assert.equal(db.prepare("SELECT count(*) AS n FROM rental_bills WHERE source='scheduled'").get().n,0);db.close();
});
test('correcting an automatic bill pauses future automatic billing',async()=>{
 const db=database(),c=fixture(db);enable(db,c);await runScheduledRentBills(binding(db),runAt(first));cancel(db,row(db,c).last_bill_id);assert.equal(row(db,c).status,'attention');assert.equal(row(db,c).issue,'corrected');db.close();
});
test('the database rejects foreign owners and fabricated schedule transitions',()=>{
 const db=database(),c=fixture(db);assert.throws(()=>enable(db,{...c,ownerId:'stranger'}),/RENTAL_SCHEDULE/);enable(db,c);
 assert.throws(()=>db.prepare("UPDATE rental_bill_schedules SET owner_id='stranger',version=version+1 WHERE connection_id=?").run(c.id),/RENTAL_SCHEDULE/);
 assert.throws(()=>db.prepare("UPDATE rental_bill_schedules SET next_month='2026-01',updated_by='system',version=version+1 WHERE connection_id=?").run(c.id),/RENTAL_SCHEDULE/);
 const id=manual(db,c);assert.throws(()=>db.prepare("UPDATE rental_bills SET source='scheduled' WHERE id=?").run(id),/RENTAL_BILL_IMMUTABLE|RENTAL_BILL_STATE/);db.close();
});
test('a missed month and a failed atomic batch never leave unreviewed or half-created bills',async()=>{
 const db=database(),c=fixture(db);enable(db,c);await runScheduledRentBills(binding(db),runAt(followingMonth(first)));assert.equal(row(db,c).issue,'missed');assert.equal(db.prepare('SELECT count(*) AS n FROM rental_bills').get().n,0);
 const other=fixture(db);enable(db,other);await runScheduledRentBills(binding(db,()=>db.exec("CREATE TRIGGER fail_schedule_advance BEFORE UPDATE ON rental_bill_schedules WHEN NEW.status='enabled' AND NEW.updated_by='system' BEGIN SELECT RAISE(ABORT,'SIMULATED_CURSOR_FAILURE'); END;")),runAt(first));assert.equal(row(db,other).issue,'unavailable');assert.equal(db.prepare('SELECT count(*) AS n FROM rental_bills').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM rental_bill_events').get().n,0);db.close();
});
test('bounded jobs finish a backlog across invocations without duplicate bills',async()=>{
 const db=database();for(let i=0;i<13;i++)enable(db,fixture(db));const a=await runScheduledRentBills(binding(db),runAt(first)),b=await runScheduledRentBills(binding(db),runAt(first));assert.equal(a.checked,12);assert.equal(a.created,12);assert.equal(b.created,1);assert.equal(db.prepare('SELECT count(*) AS n FROM rental_bills').get().n,13);db.close();
});
