import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { philippinesDay } from '../lib/rentals.ts';
import { billPaymentState, referenceKey, rentalPaymentInput } from '../lib/rental-payments.ts';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { eq } from 'drizzle-orm';
import { rentalBills, rentalPayments } from '../db/schema.ts';
import { billBalanceColumns, duplicateReferenceFlag } from '../lib/rental-payment-sql.ts';

function database(){const db=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));return db;}
function bill(db,owner='owner',renter='renter'){
  const unit=crypto.randomUUID(),connection=crypto.randomUUID(),id=crypto.randomUUID(),now=new Date().toISOString();
  db.prepare('INSERT INTO rental_units (id,owner_id,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(unit,owner,'Demo property','Room 2','Cebu City','Fictional test street',800000,30,'2026-01-01',now,now);
  db.prepare("INSERT INTO rental_connections (id,unit_id,owner_id,owner_name,owner_email,invite_email,status,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,created_day,expires_at) SELECT ?,id,owner_id,'Owner',?,?,'pending',property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,?,?,? FROM rental_units WHERE id=?").run(connection,owner+'@example.com',renter+'@example.com',now,philippinesDay(),new Date(Date.now()+86400000).toISOString(),unit);
  db.prepare("UPDATE rental_connections SET status='accepted',renter_id=?,renter_name='Renter',renter_email=?,responded_at=? WHERE id=?").run(renter,renter+'@example.com',now,connection);
  db.prepare("INSERT INTO rental_bills (id,connection_id,owner_id,renter_id,month,period_start,period_end,due_date,amount_cents,status,created_at,created_day) VALUES (?,?,?,?,'2026-11','2026-11-01','2026-11-30','2026-11-30',800000,'issued',?,?)").run(id,connection,owner,renter,now,philippinesDay());return id;
}
function payment(db,billId,changes={}){
  const b=db.prepare('SELECT * FROM rental_bills WHERE id=?').get(billId),now=new Date().toISOString();
  const p={id:crypto.randomUUID(),billId,ownerId:b.owner_id,renterId:b.renter_id,submittedBy:b.renter_id,amountCents:300000,method:'cash',paidAt:philippinesDay(),reference:'',referenceKey:null,note:'',status:'pending',reviewedAt:null,reviewedBy:null,duplicateReason:null,...changes};
  db.prepare('INSERT INTO rental_payments (id,bill_id,owner_id,renter_id,submitted_by,amount_cents,method,paid_at,reference,reference_key,note,status,created_at,created_day,reviewed_at,reviewed_by,duplicate_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,billId,p.ownerId,p.renterId,p.submittedBy,p.amountCents,p.method,p.paidAt,p.reference,p.referenceKey,p.note,p.status,now,philippinesDay(),p.reviewedAt,p.reviewedBy,p.duplicateReason);return p.id;
}
function received(db,billId,changes={}){const b=db.prepare('SELECT * FROM rental_bills WHERE id=?').get(billId);return payment(db,billId,{submittedBy:b.owner_id,status:'confirmed',reviewedAt:new Date().toISOString(),reviewedBy:b.owner_id,...changes});}
function review(db,id,status='confirmed',actor='owner',reason=null,duplicateReason=null){db.prepare('UPDATE rental_payments SET status=?,reviewed_at=?,reviewed_by=?,decision_reason=?,duplicate_reason=? WHERE id=?').run(status,new Date().toISOString(),actor,reason,duplicateReason,id);}
function reverse(db,id,actor='owner',reason='Correcting a recorded amount'){db.prepare("UPDATE rental_payments SET status='reversed',reversed_at=?,reversed_by=?,reversal_reason=? WHERE id=?").run(new Date().toISOString(),actor,reason,id);}
const total=(db,billId)=>db.prepare("SELECT coalesce(sum(amount_cents),0) AS n FROM rental_payments WHERE bill_id=? AND status='confirmed'").get(billId).n;

test('payment input uses exact cents, real dates and meaningful references',()=>{
  const input={requestId:crypto.randomUUID(),amountCents:300000,method:'gcash',paidAt:philippinesDay(),reference:'DEMO-01',note:'',detailsConfirmed:true,receiptConfirmed:false};
  assert(rentalPaymentInput.safeParse(input).success);
  const tomorrow=new Date(Date.parse(philippinesDay()+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  for(const changes of [{amountCents:0},{amountCents:300000.1},{paidAt:tomorrow},{paidAt:'2026-02-30'},{reference:''},{detailsConfirmed:false},{method:'other'}])assert(!rentalPaymentInput.safeParse({...input,...changes}).success);
  assert.equal(referenceKey(' ＡＢＣ 123 '),'abc123');assert.equal(referenceKey(''),null);
  assert.equal(billPaymentState(800000,0),'unpaid');assert.equal(billPaymentState(800000,300000),'partial');assert.equal(billPaymentState(800000,800000),'paid');
});
test('pending reports do not reduce the balance and only one can await review',()=>{
  const db=database(),b=bill(db),id=payment(db,b);assert.equal(total(db,b),0);
  assert.throws(()=>payment(db,b),/RENTAL_PAYMENT_PENDING|UNIQUE/);assert.throws(()=>received(db,b),/RENTAL_PAYMENT_PENDING/);
  assert.throws(()=>review(db,id,'confirmed','renter'),/RENTAL_PAYMENT_STATE/);assert.throws(()=>review(db,id,'confirmed',null),/RENTAL_PAYMENT_STATE/);
  review(db,id);assert.equal(total(db,b),300000);assert.equal(db.prepare('SELECT count(*) AS n FROM rental_payment_events WHERE payment_id=?').get(id).n,2);db.close();
});
test('actual ORM bill queries preserve outer-table correlation for pending and confirmed amounts',()=>{
  const db=database(),b=bill(db),orm=drizzle(async()=>({rows:[]}));
  const query=orm.select({id:rentalBills.id,...billBalanceColumns}).from(rentalBills).where(eq(rentalBills.id,b)).toSQL();
  const read=()=>db.prepare(query.sql).get(...query.params);
  const id=payment(db,b);assert.equal(read().pending_cents,300000);assert.equal(read().pending_count,1);assert.equal(read().confirmed_cents,0);assert.equal(read().remaining_cents,800000);
  review(db,id);assert.equal(read().pending_cents,0);assert.equal(read().confirmed_cents,300000);assert.equal(read().remaining_cents,500000);db.close();
});
test('actual ORM reference queries compare against a different payment rather than themselves',()=>{
  const db=database(),a=bill(db),b=bill(db),orm=drizzle(async()=>({rows:[]}));received(db,a,{method:'gcash',reference:'DEMO-01',referenceKey:'demo-01'});
  const id=payment(db,b,{method:'gcash',reference:'DEMO-01',referenceKey:'demo-01'});
  const query=orm.select({duplicate:duplicateReferenceFlag.as('duplicate_reference')}).from(rentalPayments).where(eq(rentalPayments.id,id)).toSQL();
  assert.equal(db.prepare(query.sql).get(...query.params).duplicate_reference,1);db.close();
});
test('confirmed totals cannot exceed the bill, including owner-entered receipts',()=>{
  const db=database(),b=bill(db);received(db,b);assert.throws(()=>received(db,b,{amountCents:500001}),/RENTAL_PAYMENT_OVERPAY/);
  received(db,b,{amountCents:500000});assert.equal(total(db,b),800000);assert.throws(()=>payment(db,b,{amountCents:1}),/RENTAL_PAYMENT_OVERPAY/);db.close();
});
test('bill parties and the creator determine valid initial payment state',()=>{
  const db=database(),b=bill(db);
  assert.throws(()=>payment(db,b,{ownerId:'other'}),/RENTAL_PAYMENT_BILL/);assert.throws(()=>payment(db,b,{renterId:'other'}),/RENTAL_PAYMENT_BILL/);
  assert.throws(()=>payment(db,b,{submittedBy:'other'}),/RENTAL_PAYMENT_STATE/);assert.throws(()=>payment(db,b,{status:'confirmed',reviewedBy:'owner',reviewedAt:new Date().toISOString()}),/RENTAL_PAYMENT_STATE/);
  assert.throws(()=>received(db,b,{reviewedBy:null}),/RENTAL_PAYMENT_STATE/);db.close();
});
test('rejection and renter cancellation preserve a reason and allow a new report',()=>{
  const db=database(),b=bill(db),first=payment(db,b);assert.throws(()=>review(db,first,'rejected','owner',''),/RENTAL_PAYMENT_STATE/);
  review(db,first,'rejected','owner','Please check the amount');assert.equal(total(db,b),0);
  const next=payment(db,b);assert.throws(()=>review(db,next,'cancelled','owner','Wrong reference'),/RENTAL_PAYMENT_STATE/);
  review(db,next,'cancelled','renter','Wrong reference');assert.equal(db.prepare("SELECT count(*) AS n FROM rental_payments WHERE bill_id=?").get(b).n,2);payment(db,b);db.close();
});
test('a reversal preserves original details and removes only the confirmed credit',()=>{
  const db=database(),b=bill(db),id=payment(db,b,{method:'gcash',reference:'DEMO-01',referenceKey:'demo-01'});review(db,id);
  assert.throws(()=>reverse(db,id,'renter'),/RENTAL_PAYMENT_STATE/);assert.throws(()=>reverse(db,id,'owner',null),/RENTAL_PAYMENT_STATE/);
  reverse(db,id);assert.equal(total(db,b),0);const old=db.prepare('SELECT amount_cents,reference,status FROM rental_payments WHERE id=?').get(id);assert.equal(old.amount_cents,300000);assert.equal(old.reference,'DEMO-01');assert.equal(old.status,'reversed');
  assert.deepEqual(db.prepare('SELECT action FROM rental_payment_events WHERE payment_id=? ORDER BY rowid').all(id).map(row=>row.action),['submitted','confirmed','reversed']);
  assert.throws(()=>review(db,id),/RENTAL_PAYMENT_STATE/);received(db,b,{method:'gcash',reference:'DEMO-01',referenceKey:'demo-01'});db.close();
});
test('a repeated confirmed reference needs explicit owner review rather than a fraud decision',()=>{
  const db=database(),a=bill(db),b=bill(db);received(db,a,{method:'gcash',reference:'DEMO-01',referenceKey:'demo-01'});
  const id=payment(db,b,{method:'gcash',reference:'DEMO-01',referenceKey:'demo-01'});assert.throws(()=>review(db,id),/RENTAL_PAYMENT_DUPLICATE/);
  review(db,id,'confirmed','owner',null,'This transfer was split between the two bills');assert.equal(total(db,b),300000);
  const other=bill(db,'another-owner','another-renter');received(db,other,{method:'gcash',reference:'DEMO-01',referenceKey:'demo-01'});db.close();
});
test('bills with pending or confirmed payments cannot be cancelled silently',()=>{
  const db=database(),b=bill(db),id=payment(db,b),cancel=()=>db.prepare("UPDATE rental_bills SET status='voided',voided_at=?,void_reason='Correction needed' WHERE id=?").run(new Date().toISOString(),b);
  assert.throws(cancel,/RENTAL_BILL_HAS_PAYMENTS/);review(db,id);assert.throws(cancel,/RENTAL_BILL_HAS_PAYMENTS/);reverse(db,id);cancel();assert.throws(()=>payment(db,b),/RENTAL_PAYMENT_BILL/);db.close();
});
test('valid state changes cannot overwrite amount, parties, references or creation data',()=>{
  const db=database(),b=bill(db),id=payment(db,b);
  assert.throws(()=>db.prepare("UPDATE rental_payments SET status='confirmed',reviewed_by='owner',reviewed_at=?,amount_cents=1 WHERE id=?").run(new Date().toISOString(),id),/RENTAL_PAYMENT_IMMUTABLE/);
  review(db,id);assert.throws(()=>db.prepare("UPDATE rental_payments SET status='reversed',reversed_by='owner',reversed_at=?,reversal_reason='Correction',renter_id='other' WHERE id=?").run(new Date().toISOString(),id),/RENTAL_PAYMENT_IMMUTABLE/);assert.equal(total(db,b),300000);db.close();
});
test('the database rejects future dates, fractional cents and daily-limit resets',()=>{
  const db=database(),b=bill(db);assert.throws(()=>payment(db,b,{paidAt:'2200-01-01'}),/RENTAL_PAYMENT_DATE/);assert.throws(()=>payment(db,b,{amountCents:1.5}),/RENTAL_PAYMENT_AMOUNT/);
  for(let i=0;i<30;i++)review(db,payment(db,b),'cancelled','renter','Correcting my report');
  assert.throws(()=>payment(db,b),/RENTAL_PAYMENTS_DAILY/);db.close();
});
