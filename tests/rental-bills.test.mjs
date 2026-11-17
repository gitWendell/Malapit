import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { billDateStatus, billDefaults, billPeriodError, initialBillMonth, isBillingMonth, monthBounds, rentalBillInput } from '../lib/rental-bills.ts';
import { philippinesDay } from '../lib/rentals.ts';

function database() {
  const db=new DatabaseSync(':memory:');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  return db;
}
function connection(db,accepted=true) {
  const unit=crypto.randomUUID(),id=crypto.randomUUID(),now=new Date().toISOString();
  db.prepare('INSERT INTO rental_units (id,owner_id,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,lease_end,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(unit,'owner','Private home','Room 2','Makati','Private address',800025,31,'2026-01-01','2028-12-31',now,now);
  db.prepare("INSERT INTO rental_connections (id,unit_id,owner_id,owner_name,owner_email,invite_email,status,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,lease_end,created_at,created_day,expires_at) SELECT ?,id,owner_id,'Owner','owner@example.com','renter@example.com','pending',property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,lease_end,?,?,? FROM rental_units WHERE id=?").run(id,now,philippinesDay(),new Date(Date.now()+86400000).toISOString(),unit);
  if(accepted)db.prepare("UPDATE rental_connections SET status='accepted',renter_id='renter',renter_name='Renter',renter_email='renter@example.com',responded_at=? WHERE id=?").run(now,id);
  return id;
}
const terms={month:'2026-11',periodStart:'2026-11-01',periodEnd:'2026-11-30',dueDate:'2026-11-30',amountCents:800025,note:'Rent only'};
function bill(db,connectionId,changes={}) {
  const row={id:crypto.randomUUID(),ownerId:'owner',renterId:'renter',...terms,...changes};
  db.prepare("INSERT INTO rental_bills (id,connection_id,owner_id,renter_id,month,period_start,period_end,due_date,amount_cents,note,status,created_at,created_day) VALUES (?,?,?,?,?,?,?,?,?,?,'issued',?,?)").run(row.id,connectionId,row.ownerId,row.renterId,row.month,row.periodStart,row.periodEnd,row.dueDate,row.amountCents,row.note,new Date().toISOString(),philippinesDay());
  return row.id;
}
function cancel(db,id,reason='Amount corrected') { db.prepare("UPDATE rental_bills SET status='voided',voided_at=?,void_reason=? WHERE id=?").run(new Date().toISOString(),reason,id); }

test('monthly defaults clamp short months and leave partial-month amounts for the owner',()=>{
  const rental={leaseStart:'2026-01-01',leaseEnd:null,monthlyRentCents:800025,dueDay:31};
  assert.equal(monthBounds('2028-02').last,'2028-02-29');
  assert.equal(billDefaults('2026-02',rental).dueDate,'2026-02-28');
  assert.equal(billDefaults('2028-02',rental).dueDate,'2028-02-29');
  assert.equal(billDefaults('2026-04',rental).dueDate,'2026-04-30');
  assert.equal(billDefaults('2026-11',rental).amount,'8000.25');
  assert.equal(billDefaults('2026-11',{...rental,leaseStart:'2026-11-17'}).amount,'');
  assert.equal(billDefaults('2026-11',{...rental,leaseEnd:'2026-11-20'}).periodEnd,'2026-11-20');
  assert.equal(billDefaults('2026-11',{...rental,leaseEnd:'2026-11-20'}).amount,'');
  assert.equal(initialBillMonth({...rental,leaseStart:'2027-01-17'},'2026-11-17'),'2027-01');
  assert.equal(initialBillMonth({...rental,leaseEnd:'2026-10-31'},'2026-11-17'),'2026-10');
  for(const month of ['2026-13','2026-00','2026-1','1899-12','2026-11-extra'])assert(!isBillingMonth(month));
});
test('bill dates use Philippine midnight and never imply that a bill is paid',()=>{
  const day=philippinesDay(new Date('2026-11-16T16:05:00Z'));
  assert.equal(billDateStatus({status:'issued',dueDate:'2026-11-16'},day),'past');
  assert.equal(billDateStatus({status:'issued',dueDate:'2026-11-17'},day),'today');
  assert.equal(billDateStatus({status:'issued',dueDate:'2026-11-18'},day),'upcoming');
  assert.equal(billDateStatus({status:'voided',dueDate:'2026-11-16'},day),'voided');
});
test('bill validation rejects duplicate-period tricks, impossible dates and fractional cents',()=>{
  const input={...terms,connectionId:crypto.randomUUID(),requestId:crypto.randomUUID(),detailsConfirmed:true};
  assert(rentalBillInput.safeParse(input).success);
  assert(rentalBillInput.safeParse({...input,periodStart:'2026-11-17',periodEnd:'2026-12-16'}).success);
  for(const changes of [{periodStart:'2026-10-31'},{periodEnd:'2026-12-02'},{periodEnd:'2026-11-31'},{dueDate:'2026-02-29'},{amountCents:0},{amountCents:800025.1},{detailsConfirmed:false},{periodEnd:'2026-10-31'}])assert(!rentalBillInput.safeParse({...input,...changes}).success);
  assert.equal(billPeriodError(input,{leaseStart:'2026-11-17',leaseEnd:null}),'Keep the covered period within the rental dates shared with your renter.');
  assert(billPeriodError(input,{leaseStart:'2026-01-01',leaseEnd:'2026-11-20'}));
});
test('the database allows one current bill per month and blocks cross-month overlap',()=>{
  const db=database(),id=connection(db);
  bill(db,id,{periodStart:'2026-11-17',periodEnd:'2026-12-16'});
  assert.throws(()=>bill(db,id,{periodStart:'2026-11-01',periodEnd:'2026-11-16'}),/RENTAL_BILL_MONTH|UNIQUE/);
  assert.throws(()=>bill(db,id,{month:'2026-12',periodStart:'2026-12-01',periodEnd:'2026-12-31'}),/RENTAL_BILL_OVERLAP/);
  bill(db,id,{month:'2026-12',periodStart:'2026-12-17',periodEnd:'2027-01-16'});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rental_bills').get().n,2);db.close();
});
test('bill insertion requires the accepted parties and the agreed rental date range',()=>{
  const db=database(),pending=connection(db,false),id=connection(db);
  assert.throws(()=>bill(db,pending),/RENTAL_BILL_CONNECTION/);
  assert.throws(()=>bill(db,id,{ownerId:'stranger'}),/RENTAL_BILL_CONNECTION/);
  assert.throws(()=>bill(db,id,{renterId:'new-renter'}),/RENTAL_BILL_CONNECTION/);
  for(const changes of [{month:'2025-12',periodStart:'2025-12-01',periodEnd:'2025-12-31'},{month:'2029-01',periodStart:'2029-01-01',periodEnd:'2029-01-31'},{periodEnd:'2026-12-02'},{periodEnd:'2026-11-31'},{dueDate:'not-a-date'}])assert.throws(()=>bill(db,id,changes),/RENTAL_BILL_PERIOD/);
  db.prepare("UPDATE rental_connections SET status='ended',ended_at=?,ended_by='owner' WHERE id=?").run(new Date().toISOString(),id);
  assert.throws(()=>bill(db,id),/RENTAL_BILL_CONNECTION/);db.close();
});
test('a correction keeps immutable amounts and both history events, allowing a replacement',()=>{
  const db=database(),id=connection(db),original=bill(db,id);
  assert.throws(()=>db.prepare('UPDATE rental_bills SET amount_cents=1 WHERE id=?').run(original),/RENTAL_BILL_IMMUTABLE|RENTAL_BILL_STATE/);
  assert.throws(()=>db.prepare("UPDATE rental_bills SET status='voided',voided_at=?,void_reason='Correction',amount_cents=1 WHERE id=?").run(new Date().toISOString(),original),/RENTAL_BILL_IMMUTABLE/);
  assert.throws(()=>cancel(db,original,''),/RENTAL_BILL_STATE/);
  assert.throws(()=>cancel(db,original,null),/RENTAL_BILL_STATE/);
  cancel(db,original);bill(db,id,{amountCents:750000});
  const saved=db.prepare('SELECT amount_cents,status FROM rental_bills WHERE id=?').get(original);
  assert.equal(saved.amount_cents,800025);assert.equal(saved.status,'voided');
  assert.deepEqual(db.prepare('SELECT action FROM rental_bill_events WHERE bill_id=? ORDER BY rowid').all(original).map(row=>row.action),['created','voided']);
  assert.equal(db.prepare("SELECT SUM(amount_cents) AS total FROM rental_bills WHERE status='issued'").get().total,750000);
  assert.throws(()=>cancel(db,original),/RENTAL_BILL_STATE/);db.close();
});
test('cancelling a bill does not reset the daily creation allowance',()=>{
  const db=database(),id=connection(db);
  for(let index=0;index<60;index++)cancel(db,bill(db,id));
  assert.throws(()=>bill(db,id),/RENTAL_BILLS_DAILY/);db.close();
});
