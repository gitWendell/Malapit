import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { eq } from 'drizzle-orm';
import { rentalBills } from '../db/schema.ts';
import { billBalanceColumns } from '../lib/rental-payment-sql.ts';
import { philippinesDay } from '../lib/rentals.ts';
import { sandboxCheckoutUrl, findSandboxPayment, sandboxReference, sandboxRequestInput, validSandboxCredential, validateSandboxPayment, verifyHitpaySignature } from '../lib/hitpay-sandbox.ts';
function database(){const db=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));return db;}
function bill(db,owner='owner',renter='renter'){
  const unit=crypto.randomUUID(),connection=crypto.randomUUID(),id=crypto.randomUUID(),now=new Date().toISOString();
  db.prepare('INSERT INTO rental_units (id,owner_id,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(unit,owner,'Demo property','Room 2','Cebu City','Fictional test street',800000,30,'2026-01-01',now,now);
  db.prepare("INSERT INTO rental_connections (id,unit_id,owner_id,owner_name,owner_email,invite_email,status,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,created_day,expires_at) SELECT ?,id,owner_id,'Owner',?,?,'pending',property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,?,?,? FROM rental_units WHERE id=?").run(connection,owner+'@example.com',renter+'@example.com',now,philippinesDay(),new Date(Date.now()+86400000).toISOString(),unit);
  db.prepare("UPDATE rental_connections SET status='accepted',renter_id=?,renter_name='Renter',renter_email=?,responded_at=? WHERE id=?").run(renter,renter+'@example.com',now,connection);
  db.prepare("INSERT INTO rental_bills (id,connection_id,owner_id,renter_id,month,period_start,period_end,due_date,amount_cents,status,created_at,created_day) VALUES (?,?,?,?,'2026-11','2026-11-01','2026-11-30','2026-11-30',800000,'issued',?,?)").run(id,connection,owner,renter,now,philippinesDay());return id;
}

import {callSandboxProvider,ProviderFailure} from '../lib/hitpay-sandbox-provider.ts';
const id=crypto.randomUUID(),providerId=crypto.randomUUID();
const payment=(changes={})=>({id:providerId,reference_number:sandboxReference(id),amount:'1.00',currency:'SGD',status:'pending',url:`https://securecheckout.sandbox.hit-pay.com/payment-request/@malapit/${providerId}/checkout`,allow_repeated_payments:false,...changes});
function checkout(db,billId,changes={}){
 const b=db.prepare('SELECT * FROM rental_bills WHERE id=?').get(billId),now=new Date().toISOString();
 const row={id:crypto.randomUUID(),billId,ownerId:b.owner_id,renterId:b.renter_id,actorId:b.renter_id,businessId:crypto.randomUUID(),createdAt:now,createdDay:philippinesDay(),updatedAt:now,...changes};
 db.prepare('INSERT INTO hitpay_sandbox_checkouts(id,bill_id,owner_id,renter_id,actor_id,business_id,created_at,created_day,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(...Object.values(row));return row.id;
}
test('sandbox creation requires an explicit test acknowledgement and rejects protected placeholders',()=>{
 assert(sandboxRequestInput.safeParse({requestId:id,testOnlyConfirmed:true}).success);
 for(const data of [{requestId:id},{requestId:id,testOnlyConfirmed:false},{requestId:'other',testOnlyConfirmed:true}])assert(!sandboxRequestInput.safeParse(data).success);
 assert(!validSandboxCredential('<redacted>'));assert(!validSandboxCredential(''));assert(!validSandboxCredential('a'.repeat(40)+'\n'));
 assert(validSandboxCredential('testOnly_A9b7'.repeat(6)));
});
test('checkout destinations can only use the exact HTTPS sandbox host',()=>{
 assert.equal(sandboxCheckoutUrl(payment().url),payment().url);
 for(const url of ['https://securecheckout.hit-pay.com/payment-request/live/checkout','https://securecheckout.sandbox.hit-pay.com.evil.test/payment-request/x','https://evil.test/payment-request/x','http://securecheckout.sandbox.hit-pay.com/payment-request/x','https://u:p@securecheckout.sandbox.hit-pay.com/payment-request/x','https://securecheckout.sandbox.hit-pay.com:8443/payment-request/x','javascript:alert(1)','//securecheckout.sandbox.hit-pay.com/payment-request/x'])assert.throws(()=>sandboxCheckoutUrl(url));
});
test('authenticated provider results must match the exact fixed amount, currency, reference and provider request',()=>{
 assert.equal(validateSandboxPayment(payment(),id,providerId).status,'pending');
 for(const changes of [{amount:'15000'},{amount:'1.01'},{amount:'not-a-number'},{currency:'PHP'},{reference_number:sandboxReference(crypto.randomUUID())},{id:crypto.randomUUID()},{allow_repeated_payments:true},{allow_repeated_payments:undefined},{status:'succeeded'},{url:'https://evil.test/payment-request/x'},{url:`https://securecheckout.sandbox.hit-pay.com/payment-request/@malapit/${crypto.randomUUID()}/checkout`}])assert.throws(()=>validateSandboxPayment(payment(changes),id,providerId));
 assert.equal(validateSandboxPayment(payment({status:'completed',payments:[{status:'succeeded',refunded_amount:'0.00'}]}),id,providerId).status,'completed');
 for(const status of ['refunded','partially_refunded','succeeded_manually'])assert.throws(()=>validateSandboxPayment(payment({status:'completed',payments:[{status,refunded_amount:'0.00'}]}),id,providerId));
 assert.throws(()=>validateSandboxPayment(payment({status:'completed',payments:[{status:'succeeded',refunded_amount:'0.01'}]}),id,providerId));
});
test('callback HMAC verifies the original bytes and fails closed on changed payload, signature or secret',async()=>{
 const secret='fictional-test-only-secret',raw=new TextEncoder().encode(JSON.stringify({id:providerId,status:'completed'}));
 const sign=createHmac('sha256',secret).update(raw).digest('hex');
 assert(await verifyHitpaySignature(raw,sign,secret));assert(await verifyHitpaySignature(raw,sign.toUpperCase(),secret));
 for(const signature of [null,'',sign.slice(1),'z'.repeat(64),sign.slice(0,63)+(sign.endsWith('0')?'1':'0')])assert(!await verifyHitpaySignature(raw,signature,secret));
 assert(!await verifyHitpaySignature(new TextEncoder().encode(JSON.stringify({id:providerId,status:'failed'})),sign,secret));
 assert(!await verifyHitpaySignature(raw,sign,'different-secret'));assert(!await verifyHitpaySignature(raw,sign,''));
});
test('completed sandbox checkouts never credit rent, pending reports, owner totals or payment history',()=>{
 const db=database(),b=bill(db),c=checkout(db,b),orm=drizzle(async()=>({rows:[]}));
 const query=orm.select({id:rentalBills.id,...billBalanceColumns}).from(rentalBills).where(eq(rentalBills.id,b)).toSQL();
 const before=db.prepare(query.sql).get(...query.params);
 db.prepare("UPDATE hitpay_sandbox_checkouts SET status='completed',provider_id=?,verified_at=? WHERE id=?").run(providerId,new Date().toISOString(),c);
 const after=db.prepare(query.sql).get(...query.params);assert.deepEqual(after,before);assert.equal(after.remaining_cents,800000);assert.equal(after.confirmed_cents,0);assert.equal(after.pending_cents,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM rental_payments').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM rental_payment_events').get().n,0);
 assert.throws(()=>db.prepare("UPDATE hitpay_sandbox_checkouts SET status='pending' WHERE id=?").run(c),/HITPAY_SANDBOX_IMMUTABLE/);db.close();
});
test('sandbox scope, one-open-attempt rule and immutable original details hold at the database',()=>{
 const db=database(),b=bill(db);
 for(const changes of [{actorId:'other'},{ownerId:'other'},{renterId:'other'}])assert.throws(()=>checkout(db,b,changes),/HITPAY_SANDBOX_SCOPE/);
 const c=checkout(db,b);assert.throws(()=>checkout(db,b),/UNIQUE/);
 for(const field of ['bill_id','owner_id','renter_id','actor_id','business_id','created_day'])assert.throws(()=>db.prepare(`UPDATE hitpay_sandbox_checkouts SET ${field}='other' WHERE id=?`).run(c),/HITPAY_SANDBOX_IMMUTABLE/);
 db.prepare("UPDATE hitpay_sandbox_checkouts SET status='failed' WHERE id=?").run(c);checkout(db,b);db.close();
});
test('retries cannot erase the actor daily test limit',()=>{
 const db=database(),b=bill(db);
 for(let n=0;n<10;n++){const c=checkout(db,b);db.prepare("UPDATE hitpay_sandbox_checkouts SET status='failed' WHERE id=?").run(c);}
 assert.throws(()=>checkout(db,b),/HITPAY_SANDBOX_LIMIT/);db.close();
});

test('sandbox provider requests use Workers-compatible manual redirects and never forward a key',async()=>{
 const key='fictional-test-only-key';let calls=0;
 const fake=async(url,options)=>{calls++;assert.equal(url,'https://api.sandbox.hit-pay.com/v1/webhook-events');assert.equal(options.redirect,'manual');assert.equal(options.headers['X-BUSINESS-API-KEY'],key);return Response.json([]);};
 assert.deepEqual(await callSandboxProvider(key,'/v1/webhook-events',undefined,fake),[]);assert.equal(calls,1);
 const redirected=async(_url,options)=>{assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://evil.test'}});};
 await assert.rejects(()=>callSandboxProvider(key,'/v1/webhook-events',undefined,redirected),error=>error instanceof ProviderFailure&&error.status===302&&!error.rejected);
 await assert.rejects(()=>callSandboxProvider(key,'/v1/webhook-events',undefined,async()=>new Response('sensitive provider content',{status:401})),error=>error.status===401&&error.rejected&&!error.message.includes('sensitive'));
 await assert.rejects(()=>callSandboxProvider(key,'https://evil.test',undefined,fake));assert.equal(calls,1);
});

test('current and legacy HitPay sandbox hosts bind checkout paths to the same provider ID',()=>{
 assert.equal(validateSandboxPayment(payment({url:`https://checkout.sandbox.hit-pay.com/payment-request/@malapit/${providerId}`}),id,providerId).status,'pending');
 assert.throws(()=>validateSandboxPayment(payment({url:'https://checkout.sandbox.hit-pay.com/payment-request/@malapit'}),id,providerId));
});
test('uncertain requests recover by exact reference without creating another payment',()=>{
 const raw=payment();assert.equal(findSandboxPayment({data:[{id:crypto.randomUUID(),reference_number:'other'},raw]},id).id,providerId);
 assert.equal(findSandboxPayment([raw],id).id,providerId);assert.equal(findSandboxPayment({data:[]},id),null);
 assert.equal(findSandboxPayment({data:[{id:providerId,reference_number:sandboxReference(id)+'-other'}]},id),null);
 assert.throws(()=>findSandboxPayment({data:[raw,{...raw,id:crypto.randomUUID()}]},id));
});
