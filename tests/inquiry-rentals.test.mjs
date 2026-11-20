import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { inquiryRentalInput, firstRentPeriod } from '../lib/inquiry-rentals.ts';
const now = () => new Date().toISOString();
const terms={propertyName:'Test home',unitName:'Room 1',city:'Cebu City',address:'Fictional address, Cebu City',monthlyRentCents:800000,dueDay:1,leaseStart:'2026-11-20',leaseEnd:null};
const input=()=>({requestId:crypto.randomUUID(),terms,firstBill:{month:'2026-11',periodStart:'2026-11-20',periodEnd:'2026-11-30',dueDate:'2026-11-20',amountCents:300000,note:''},sharingConfirmed:true});
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
 const photo=crypto.randomUUID();
 db.prepare("INSERT INTO media(id,owner_id,content_type,created_at,byte_size) VALUES(?,'owner','image/jpeg',?,100)").run(photo,now());
 const listing=crypto.randomUUID(),inquiry=crypto.randomUUID(),unit=crypto.randomUUID(),connection=crypto.randomUUID(),bill=crypto.randomUUID();
 db.prepare("INSERT INTO listings(id,owner_id,owner_name,title,city,status,data,created_at,confirmed_at) VALUES(?,'owner','Owner','Home','Cebu City','published',?,?,?)").run(listing,JSON.stringify({photos:['/api/media/'+photo]}),now(),now());
 db.prepare("INSERT INTO inquiries(id,listing_id,listing_title,owner_id,renter_id,renter_name,renter_email,message,move_in,occupants,created_at) VALUES(?,?,'Home','owner','renter','Renter','renter@example.com','Test inquiry','2026-11-20',1,?)").run(inquiry,listing,now());
 db.prepare("INSERT INTO rental_units(id,owner_id,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,updated_at) VALUES(?,'owner','Home','Room','Cebu City','Private address',800000,1,'2026-11-20',?,?)").run(unit,now(),now());
 db.prepare('INSERT INTO rental_listing_units VALUES(?,?)').run(listing,unit);
 db.prepare("INSERT INTO rental_connections(id,unit_id,owner_id,owner_name,owner_email,invite_email,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,created_day,expires_at) SELECT ?,id,owner_id,'Owner','owner@example.com','renter@example.com',property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,?,'2026-11-20',? FROM rental_units WHERE id=?").run(connection,now(),new Date(Date.now()+86400000).toISOString(),unit);
 db.prepare("INSERT INTO inquiry_rental_offers(connection_id,inquiry_id,target_renter_id,first_bill_id,amount_cents,period_start,period_end,due_date) VALUES(?,?,'renter',?,300000,'2026-11-20','2026-11-30','2026-11-20')").run(connection,inquiry,bill);
 const respond=(id='renter',status='accepted')=>db.prepare("UPDATE rental_connections SET status=?,renter_id=?,renter_name='Renter',renter_email='renter@example.com',responded_at=? WHERE id=?").run(status,id,now(),connection);
 return {db,listing,inquiry,unit,connection,bill,respond};
}
test('offer validates first bill, dates and explicit sharing',()=>{
 assert(inquiryRentalInput.safeParse(input()).success);
 for(const value of [{...input(),sharingConfirmed:false},{...input(),firstBill:{...input().firstBill,periodStart:'2026-11-19'}},{...input(),firstBill:{...input().firstBill,periodEnd:'2026-12-30'}},{...input(),firstBill:{...input().firstBill,amountCents:0}},{...input(),terms:{...terms,leaseEnd:'2026-11-25'}}])assert(!inquiryRentalInput.safeParse(value).success);
 assert.deepEqual(firstRentPeriod('2028-02-20',null),{periodStart:'2028-02-20',periodEnd:'2028-02-29'});
 assert.equal(firstRentPeriod('2026-11-20','2026-11-25').periodEnd,'2026-11-25');
});
test('acceptance creates the exact first bill and changes map availability atomically',()=>{
 const {db,listing,connection,bill,respond}=fixture();
 assert.equal(db.prepare('SELECT count(*) n FROM rental_bills').get().n,0);
 respond();const saved=db.prepare('SELECT * FROM rental_bills WHERE id=?').get(bill);
 assert.equal(saved.connection_id,connection);assert.equal(saved.renter_id,'renter');assert.equal(saved.amount_cents,300000);assert.equal(saved.period_end,'2026-11-30');assert.equal(saved.status,'issued');
 assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(listing).status,'rented');
 assert.throws(()=>respond(),/RENTAL_CONNECTION_STATE/);assert.equal(db.prepare('SELECT count(*) n FROM rental_bills').get().n,1);db.close();
});
test('a failed first bill rolls back acceptance and leaves the public listing available',()=>{
 const {db,listing,connection,respond}=fixture();db.exec("CREATE TRIGGER block_bill BEFORE INSERT ON rental_bills BEGIN SELECT RAISE(ABORT,'TEST_BILL_FAILURE'); END");
 assert.throws(()=>respond(),/TEST_BILL_FAILURE/);assert.equal(db.prepare('SELECT status FROM rental_connections WHERE id=?').get(connection).status,'pending');assert.equal(db.prepare('SELECT status FROM listings WHERE id=?').get(listing).status,'published');assert.equal(db.prepare("SELECT count(*) n FROM rental_events WHERE action='accepted'").get().n,0);
 db.exec('DROP TRIGGER block_bill');respond();assert.equal(db.prepare('SELECT count(*) n FROM rental_bills').get().n,1);db.close();
});
test('the source renter ID is required even when another account has the same email',()=>{
 const {db,respond}=fixture();assert.throws(()=>respond('other'),/RENTAL_OFFER_TARGET/);assert.equal(db.prepare('SELECT count(*) n FROM rental_bills').get().n,0);respond('renter','declined');assert.equal(db.prepare('SELECT count(*) n FROM rental_bills').get().n,0);assert.equal(db.prepare('SELECT status FROM listings').get().status,'published');db.close();
});
test('offer terms are immutable and one public listing cannot create duplicate private units',()=>{
 const {db,listing,unit,connection}=fixture();assert.throws(()=>db.prepare('UPDATE inquiry_rental_offers SET amount_cents=1 WHERE connection_id=?').run(connection),/RENTAL_TERMS_IMMUTABLE/);assert.throws(()=>db.prepare('INSERT INTO rental_listing_units VALUES(?,?)').run(listing,unit),/UNIQUE/);db.close();
});
