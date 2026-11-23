import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base='http://127.0.0.1:5188',run=crypto.randomUUID().slice(0,8);
const person=role=>({id:`qa-hitpay-${role}-${run}`,email:`qa-hitpay-${role}-${run}@sites.test`});
const owner=person('owner'),renter=person('renter'),other=person('other'),admin={id:'local_seedy',email:'local_seedy@sites.test'};
const unit=crypto.randomUUID(),connection=crypto.randomUUID(),bill=crypto.randomUUID(),checkout=crypto.randomUUID();
const quote=value=>"'"+String(value).replaceAll("'","''")+"'",now=new Date().toISOString(),day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
function sql(command){execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.local.json','--persist-to','.wrangler/state','--command',command],{stdio:'pipe'});}
async function request(path,user,method='GET',body,origin=base){const headers={};if(user){headers['oai-authenticated-user-id']=user.id;headers['oai-authenticated-user-email']=user.email;}if(method!=='GET')headers.origin=origin;if(body!==undefined)headers['Content-Type']='application/json';const response=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),headers:response.headers};}
let checks=0;const expect=(result,status,label)=>{assert.equal(result.status,status,label+': '+JSON.stringify(result.data));assert.match(result.headers.get('Cache-Control'),/no-store/);checks++;return result.data;};
try{
 sql(`INSERT INTO rental_units(id,owner_id,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,updated_at) VALUES(${quote(unit)},${quote(owner.id)},'QA HitPay','Fictional sandbox unit','Cebu City','Fictional local test street',800000,30,'2026-01-01',${quote(now)},${quote(now)});
 INSERT INTO rental_connections(id,unit_id,owner_id,owner_name,owner_email,invite_email,status,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,created_day,expires_at) SELECT ${quote(connection)},id,owner_id,'QA Owner',${quote(owner.email)},${quote(renter.email)},'pending',property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,${quote(now)},${quote(day)},'2027-01-01T00:00:00Z' FROM rental_units WHERE id=${quote(unit)};
 UPDATE rental_connections SET status='accepted',renter_id=${quote(renter.id)},renter_name='QA Renter',renter_email=${quote(renter.email)},responded_at=${quote(now)} WHERE id=${quote(connection)};
 INSERT INTO rental_bills(id,connection_id,owner_id,renter_id,month,period_start,period_end,due_date,amount_cents,status,created_at,created_day) VALUES(${quote(bill)},${quote(connection)},${quote(owner.id)},${quote(renter.id)},'2026-11','2026-11-01','2026-11-30','2026-11-30',800000,'issued',${quote(now)},${quote(day)});`);
 const setup='/api/rentals/hitpay-sandbox/setup',path=`/api/rentals/bills/${bill}/sandbox-checkout`,receipt=`/api/rentals/hitpay-sandbox/checkout/${checkout}`;
 expect(await request(setup,null),401,'Setup requires sign-in');
 const state=expect(await request(setup,admin),200,'Admin reads safe setup state');assert.equal(state.credentialsReady,false,'Local preview has no provider credentials');checks++;
 expect(await request(setup,owner,'POST',{}),403,'Only operator may bind a test business');expect(await request(setup,admin,'POST',{}),410,'Sandbox setup is retired');expect(await request(setup,admin,'POST',{},'https://untrusted.invalid'),403,'Setup rejects cross-site submission');
 expect(await request(path,null),401,'Bill checkout requires sign-in');expect(await request(path,other),404,'Other renter cannot inspect bill checkout');expect(await request(path,admin),404,'Reviewer cannot inspect another owner private bill');
 for(const user of [owner,renter])assert.deepEqual(expect(await request(path,user),200,'Original bill party reads availability'),{available:false,checkout:null});
 expect(await request(path,renter,'POST',{requestId:checkout,testOnlyConfirmed:false}),410,'Sandbox creation is retired');expect(await request(path,renter,'POST',{requestId:checkout,testOnlyConfirmed:true}),410,'Retired checkout cannot create a payment');expect(await request(path,renter,'POST',{requestId:checkout,testOnlyConfirmed:true},'https://untrusted.invalid'),403,'Checkout rejects cross-site submission');
 sql(`INSERT INTO hitpay_sandbox_checkouts(id,bill_id,owner_id,renter_id,actor_id,business_id,created_at,created_day,updated_at) VALUES(${quote(checkout)},${quote(bill)},${quote(owner.id)},${quote(renter.id)},${quote(renter.id)},${quote(crypto.randomUUID())},${quote(now)},${quote(day)},${quote(now)});`);
 expect(await request(receipt,null),401,'Test receipt is private');expect(await request(receipt,other),404,'Other renter cannot inspect test receipt');expect(await request(receipt,admin),404,'Reviewer cannot inspect test receipt');
 for(const user of [owner,renter])assert.equal(expect(await request(receipt,user),200,'Original party reads test receipt').status,'creating');
 expect(await request(receipt,renter,'POST',{},'https://untrusted.invalid'),403,'Receipt refresh rejects cross-site submission');
 expect(await request('/api/rentals/hitpay-sandbox/webhook',null,'POST',{id:checkout}),503,'Unconfigured callback fails closed');
 const balance=(await request('/api/rentals/bills/'+bill,renter)).data.bill;assert.equal(balance.remainingCents,800000);assert.equal(balance.confirmedCents,0);checks++;
 console.log(`PASS: ${checks} sandbox route, privacy, setup and unchanged-balance checks.`);
}finally{
 assert.match(owner.id,/^qa-hitpay-owner-[a-f0-9]{8}$/);
 sql(`DELETE FROM hitpay_sandbox_checkouts WHERE owner_id=${quote(owner.id)}; DELETE FROM rental_bill_events WHERE bill_id=${quote(bill)}; DELETE FROM rental_bills WHERE id=${quote(bill)} AND owner_id=${quote(owner.id)}; DELETE FROM rental_events WHERE connection_id=${quote(connection)}; DELETE FROM rental_connections WHERE id=${quote(connection)} AND owner_id=${quote(owner.id)}; DELETE FROM rental_units WHERE id=${quote(unit)} AND owner_id=${quote(owner.id)};`);
 console.log('Removed this run’s fictional local records. No real payment or account was changed.');
}
