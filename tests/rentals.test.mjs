import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { isCivilDate, pesoInputToCents, normalizeRentalEmail, philippinesDay, rentalUnitInput, effectiveRentalStatus } from '../lib/rentals.ts';

function database() {
  const db=new DatabaseSync(':memory:');
  for(const name of ['0000_amused_prowler.sql','0001_uneven_captain_midlands.sql','0002_supreme_scarlet_spider.sql'])db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  return db;
}
function unit(db,id=crypto.randomUUID(),owner='owner') {
  const now=new Date().toISOString();
  db.prepare('INSERT INTO rental_units (id,owner_id,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,'Private property',id,'Makati','Private street address',1000000,15,'2026-01-01',now,now);
  return id;
}
function invite(db,unitId,id=crypto.randomUUID(),{email='renter@example.com',expires=new Date(Date.now()+86400000).toISOString()}={}) {
  db.prepare("INSERT INTO rental_connections (id,unit_id,owner_id,owner_name,owner_email,invite_email,status,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,created_day,expires_at) SELECT ?,id,owner_id,'Owner','owner@example.com',?,'pending',property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,?,?,? FROM rental_units WHERE id=?").run(id,email,new Date().toISOString(),philippinesDay(),expires,unitId);
  return id;
}
function respond(db,id,status='accepted',renter='renter',email='renter@example.com') {
  db.prepare('UPDATE rental_connections SET status=?, renter_id=?, renter_name=?, renter_email=?, responded_at=? WHERE id=?').run(status,renter,'Renter',email,new Date().toISOString(),id);
}

test('dates reject impossible days and use Philippine calendar boundaries',()=>{
  assert(isCivilDate('2028-02-29')); for(const value of ['2026-02-29','2026-11-31','2026-1-01','invalid','1899-01-01'])assert(!isCivilDate(value));
  assert.equal(philippinesDay(new Date('2026-11-16T16:05:00Z')),'2026-11-17');
  const terms={propertyName:'Home',unitName:'1',city:'Makati',address:'Private address',monthlyRentCents:1000000,dueDay:31,leaseStart:'2026-11-16',leaseEnd:'2026-11-15'};
  assert(!rentalUnitInput.safeParse(terms).success);assert(rentalUnitInput.safeParse({...terms,leaseEnd:null}).success);
});
test('money stays in integer cents and email matching does not merge aliases',()=>{
  assert.equal(pesoInputToCents('8000.05'),800005);assert.equal(pesoInputToCents('0.10'),10);
  for(const value of ['-1','12.345','NaN','Infinity','8,000','999999999999999999999'])assert.equal(pesoInputToCents(value),null);
  assert.equal(normalizeRentalEmail('  A.B+rent@Gmail.com '),'a.b+rent@gmail.com');
  assert.notEqual(normalizeRentalEmail('a.b@gmail.com'),normalizeRentalEmail('ab@gmail.com'));
});
test('expired invitations are displayed as expired without a read mutating their history',()=>{
  assert.equal(effectiveRentalStatus({status:'pending',expiresAt:'2026-11-15T00:00:00.000Z'},'2026-11-16T00:00:00.000Z'),'expired');
  assert.equal(effectiveRentalStatus({status:'accepted',expiresAt:'2026-11-15T00:00:00.000Z'},'2026-11-16T00:00:00.000Z'),'accepted');
});
test('one live connection per unit, immutable terms, and no edits while an invitation is open',()=>{
  const db=database(),u=unit(db),id=invite(db,u);
  assert.throws(()=>invite(db,u),/UNIQUE/);
  assert.throws(()=>db.prepare('UPDATE rental_units SET monthly_rent_cents=1 WHERE id=?').run(u),/RENTAL_UNIT_LOCKED|CHECK/);
  assert.throws(()=>db.prepare("UPDATE rental_units SET archived_at='now' WHERE id=?").run(u),/RENTAL_UNIT_LOCKED/);
  assert.throws(()=>db.prepare("UPDATE rental_connections SET monthly_rent_cents=1200000 WHERE id=?").run(id),/RENTAL_TERMS_IMMUTABLE|RENTAL_CONNECTION_STATE/);
  assert.throws(()=>db.prepare("UPDATE rental_connections SET status='accepted',renter_id='renter',renter_name='Renter',renter_email='renter@example.com',responded_at=?,monthly_rent_cents=1200000 WHERE id=?").run(new Date().toISOString(),id),/RENTAL_TERMS_IMMUTABLE/);
  assert.equal(db.prepare('SELECT monthly_rent_cents FROM rental_connections WHERE id=?').get(id).monthly_rent_cents,1000000);
  assert.throws(()=>respond(db,id,'accepted','stranger','other@example.com'),/RENTAL_CONNECTION_STATE/);
  assert.throws(()=>respond(db,id,'accepted','renter',null),/RENTAL_CONNECTION_STATE/);
  respond(db,id);
  assert.throws(()=>respond(db,id),/RENTAL_CONNECTION_STATE/);
  const before=db.prepare('SELECT COUNT(*) AS n FROM rental_events WHERE connection_id=?').get(id).n;
  assert.equal(before,2);
  db.prepare("UPDATE rental_connections SET status='ended',ended_at=?,ended_by='renter' WHERE id=?").run(new Date().toISOString(),id);
  invite(db,u);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rental_events WHERE connection_id=?').get(id).n,3);
  assert.throws(()=>db.prepare("UPDATE rental_connections SET status='accepted' WHERE id=?").run(id),/RENTAL_CONNECTION_STATE/);
  db.close();
});
test('unit ownership and accepted renter identity cannot be reassigned',()=>{
  const db=database(),u=unit(db),id=invite(db,u);respond(db,id);
  assert.throws(()=>db.prepare("UPDATE rental_units SET owner_id='stranger' WHERE id=?").run(u),/RENTAL_UNIT_LOCKED|RENTAL_UNIT_IDENTITY/);
  assert.throws(()=>db.prepare("UPDATE rental_connections SET status='ended',renter_id='stranger',ended_at=?,ended_by='owner' WHERE id=?").run(new Date().toISOString(),id),/RENTAL_CONNECTION_STATE/);
  db.close();
});
test('expiry releases a place only after recording the expired transition',()=>{
  const db=database(),u=unit(db),id=invite(db,u,crypto.randomUUID(),{expires:new Date(Date.now()-1000).toISOString()});
  assert.throws(()=>respond(db,id),/RENTAL_CONNECTION_STATE/);
  assert.throws(()=>invite(db,u),/UNIQUE/);
  db.prepare("UPDATE rental_connections SET status='expired',responded_at=? WHERE id=?").run(new Date().toISOString(),id);
  invite(db,u);assert.equal(db.prepare("SELECT action FROM rental_events WHERE connection_id=? ORDER BY rowid DESC LIMIT 1").get(id).action,'expired');db.close();
});
test('active-unit limits apply atomically on insertion and restore',()=>{
  const db=database();const ids=Array.from({length:30},()=>unit(db));assert.throws(()=>unit(db),/RENTAL_OWNER_LIMIT/);
  db.prepare('UPDATE rental_units SET archived_at=? WHERE id=?').run(new Date().toISOString(),ids[0]);unit(db);
  assert.throws(()=>db.prepare('UPDATE rental_units SET archived_at=NULL WHERE id=?').run(ids[0]),/RENTAL_OWNER_LIMIT/);db.close();
  const global=database();for(let i=0;i<100;i++)unit(global,crypto.randomUUID(),'owner-'+i);assert.throws(()=>unit(global,crypto.randomUUID(),'new-owner'),/RENTAL_UNITS_FULL/);global.close();
});
test('revoking invitations does not reset the owner’s daily invitation count',()=>{
  const db=database(),u=unit(db);for(let i=0;i<30;i++){const id=invite(db,u);db.prepare("UPDATE rental_connections SET status='revoked',responded_at=? WHERE id=?").run(new Date().toISOString(),id)}
  assert.throws(()=>invite(db,u),/RENTAL_INVITES_DAILY/);db.close();
});
