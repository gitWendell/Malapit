import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {drizzle} from 'drizzle-orm/sqlite-proxy';
import {and,eq} from 'drizzle-orm';
import {ownerPaymentQrs} from '../db/schema.ts';
import {philippinesDay} from '../lib/rentals.ts';
import {receivingCreate,receivingDetails,destinationSnapshot,qrPngError,reportedMethod} from '../lib/owner-payment-methods.ts';
import {qrAccessScope} from '../lib/owner-payment-queries.ts';
function database(){const db=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));return db;}
function bill(db,owner='owner',renter='renter'){
  const unit=crypto.randomUUID(),connection=crypto.randomUUID(),id=crypto.randomUUID(),now=new Date().toISOString();
  db.prepare('INSERT INTO rental_units (id,owner_id,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(unit,owner,'Demo property','Room 2','Cebu City','Fictional test street',800000,30,'2026-01-01',now,now);
  db.prepare("INSERT INTO rental_connections (id,unit_id,owner_id,owner_name,owner_email,invite_email,status,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,created_day,expires_at) SELECT ?,id,owner_id,'Owner',?,?,'pending',property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,?,?,? FROM rental_units WHERE id=?").run(connection,owner+'@example.com',renter+'@example.com',now,philippinesDay(),new Date(Date.now()+86400000).toISOString(),unit);
  db.prepare("UPDATE rental_connections SET status='accepted',renter_id=?,renter_name='Renter',renter_email=?,responded_at=? WHERE id=?").run(renter,renter+'@example.com',now,connection);
  db.prepare("INSERT INTO rental_bills (id,connection_id,owner_id,renter_id,month,period_start,period_end,due_date,amount_cents,status,created_at,created_day) VALUES (?,?,?,?,'2026-11','2026-11-01','2026-11-30','2026-11-30',800000,'issued',?,?)").run(id,connection,owner,renter,now,philippinesDay());return id;
}

const png=readFileSync(new URL('../public/icons/icon-192.png',import.meta.url));
function qr(db,owner='owner',changes={}){const data={id:crypto.randomUUID(),ownerId:owner,data:png.toString('base64'),byteSize:png.length,checksum:'fictional-checksum',createdAt:new Date().toISOString(),createdDay:philippinesDay(),...changes};db.prepare('INSERT INTO owner_payment_qrs(id,owner_id,data,byte_size,checksum,created_at,created_day) VALUES(?,?,?,?,?,?,?)').run(...Object.values(data));return data.id;}
function method(db,owner='owner',changes={}){const now=new Date().toISOString(),data={id:crypto.randomUUID(),ownerId:owner,kind:'bank',label:'DEMO BANK',accountName:'DEMO RECEIVER - DO NOT PAY',accountNumber:'DEMO-ACCOUNT-001',instructions:'Fictional test only',qrImageId:null,createdAt:now,updatedAt:now,archivedAt:null,...changes};db.prepare('INSERT INTO owner_payment_methods(id,owner_id,kind,label,account_name,account_number,instructions,qr_image_id,created_at,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(data));return data;}
function report(db,billId,destination,changes={}){const b=db.prepare('SELECT * FROM rental_bills WHERE id=?').get(billId),now=new Date().toISOString(),id=crypto.randomUUID();const row={id,billId,ownerId:b.owner_id,renterId:b.renter_id,submittedBy:b.renter_id,amountCents:800000,method:reportedMethod(destination.kind),paidAt:philippinesDay(),reference:'DEMO-REFERENCE',referenceKey:'demo-reference',note:'Fictional payment test',status:'pending',createdAt:now,createdDay:philippinesDay(),destinationId:destination.id,destinationSnapshot:JSON.stringify(destinationSnapshot(destination)),...changes};db.prepare('INSERT INTO rental_payments(id,bill_id,owner_id,renter_id,submitted_by,amount_cents,method,paid_at,reference,reference_key,note,status,created_at,created_day,destination_id,destination_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row));return id;}
const readQr=(db,id,user)=>{const orm=drizzle(async()=>({rows:[]})),query=orm.select({id:ownerPaymentQrs.id}).from(ownerPaymentQrs).where(and(eq(ownerPaymentQrs.id,id),qrAccessScope(user))).toSQL();return db.prepare(query.sql).get(...query.params);};
test('receiving setup requires checked details and valid wallet numbers, bank labels or a QR',()=>{
 const details={kind:'gcash',accountName:'DEMO RECEIVER',accountNumber:'09000000000'};assert(receivingCreate.safeParse({requestId:crypto.randomUUID(),details,detailsConfirmed:true}).success);
 for(const changes of [{accountName:''},{accountNumber:'123'},{kind:'qr'},{kind:'bank',label:''},{kind:'other',label:'Demo',accountNumber:'',instructions:''}])assert(!receivingDetails.safeParse({...details,...changes}).success);
 assert(!receivingCreate.safeParse({requestId:crypto.randomUUID(),details,detailsConfirmed:false}).success);
 assert(receivingDetails.safeParse({...details,accountNumber:'+63 900 000 0000'}).success);
 assert(receivingDetails.safeParse({kind:'qr',accountName:'DEMO RECEIVER',qrImageId:crypto.randomUUID()}).success);
 assert(receivingDetails.safeParse({kind:'cash',instructions:'Agree where to hand over cash'}).success);
});
test('QR upload validation rejects oversized, malformed and extreme-dimension images',()=>{
 assert.equal(qrPngError(png),null);assert(qrPngError(new Uint8Array(204801)));assert(qrPngError(new TextEncoder().encode('<svg>not a receiving QR</svg>')));
 const tiny=Buffer.from(png);tiny.writeUInt32BE(1,16);assert(qrPngError(tiny));const huge=Buffer.from(png);huge.writeUInt32BE(80000,20);assert(qrPngError(huge));
});
test('receiving options can only attach an immutable QR owned by the same account',()=>{
 const db=database(),a=qr(db),b=qr(db,'other-owner');method(db,'owner',{qrImageId:a});assert.throws(()=>method(db,'owner',{qrImageId:b}),/OWNER_QR_SCOPE/);
 assert.throws(()=>db.prepare("UPDATE owner_payment_qrs SET owner_id='other' WHERE id=?").run(a),/OWNER_QR_IMMUTABLE/);db.close();
});
test('QR reads correlate the exact image and bill parties, including after payment and account edits',()=>{
 const db=database(),b=bill(db),a=qr(db),orphan=qr(db),other=qr(db,'other-owner'),m=method(db,'owner',{qrImageId:a});method(db,'other-owner',{qrImageId:other});
 assert(readQr(db,a,'owner'));assert(readQr(db,a,'renter'));assert(!readQr(db,orphan,'renter'));assert(!readQr(db,other,'renter'));assert(!readQr(db,a,'local_seedy'));assert(!readQr(db,a,'another-renter'));
 const p=report(db,b,m);db.prepare("UPDATE owner_payment_methods SET archived_at=?,updated_at=? WHERE id=?").run(new Date().toISOString(),new Date().toISOString(),m.id);assert(readQr(db,a,'renter'));
 const newer=qr(db),m2=method(db,'owner',{qrImageId:newer});assert(readQr(db,newer,'renter'));
 db.prepare("UPDATE rental_payments SET status='confirmed',reviewed_at=?,reviewed_by='owner' WHERE id=?").run(new Date().toISOString(),p);
 assert(readQr(db,a,'renter'));assert(!readQr(db,newer,'renter'));assert(!readQr(db,orphan,'renter'));assert(readQr(db,newer,'owner'));db.close();
});
test('payment snapshots reject another owner, changed accounts and mismatched payment methods',()=>{
 const db=database(),b=bill(db),m=method(db),other=method(db,'other-owner');
 assert.throws(()=>report(db,b,other),/RENTAL_DESTINATION_CHANGED/);
 assert.throws(()=>report(db,b,m,{method:'cash'}),/RENTAL_DESTINATION_CHANGED/);
 assert.throws(()=>report(db,b,m,{destinationSnapshot:JSON.stringify({...destinationSnapshot(m),accountNumber:'different'})}),/RENTAL_DESTINATION_CHANGED/);
 db.prepare("UPDATE owner_payment_methods SET account_number='DEMO-NEW',updated_at=? WHERE id=?").run(new Date(Date.now()+1000).toISOString(),m.id);assert.throws(()=>report(db,b,m),/RENTAL_DESTINATION_CHANGED/);db.close();
});
test('later receiving edits and removal preserve the report snapshot and pending balance',()=>{
 const db=database(),b=bill(db),m=method(db),p=report(db,b,m),saved=db.prepare('SELECT destination_snapshot FROM rental_payments WHERE id=?').get(p).destination_snapshot;
 db.prepare("UPDATE owner_payment_methods SET account_number='DEMO-NEW',updated_at=? WHERE id=?").run(new Date(Date.now()+1000).toISOString(),m.id);
 db.prepare('UPDATE owner_payment_methods SET archived_at=? WHERE id=?').run(new Date().toISOString(),m.id);
 assert.equal(db.prepare('SELECT destination_snapshot FROM rental_payments WHERE id=?').get(p).destination_snapshot,saved);
 assert.equal(db.prepare("SELECT count(*) AS n FROM rental_payments WHERE status='confirmed'").get().n,0);
 assert.throws(()=>db.prepare("UPDATE rental_payments SET destination_snapshot='{}' WHERE id=?").run(p),/RENTAL_PAYMENT_IMMUTABLE/);db.close();
});
test('receiving and QR storage limits cannot be avoided by repeatedly saving or editing',()=>{
 const db=database();for(let i=0;i<10;i++)method(db);assert.throws(()=>method(db),/OWNER_METHOD_LIMIT/);
 for(let i=0;i<5;i++)qr(db);assert.throws(()=>qr(db),/OWNER_QR_DAILY/);
 const id=db.prepare('SELECT id FROM owner_payment_methods LIMIT 1').get().id;assert.throws(()=>db.prepare("UPDATE owner_payment_methods SET owner_id='other' WHERE id=?").run(id),/OWNER_METHOD_IMMUTABLE/);db.close();
});
