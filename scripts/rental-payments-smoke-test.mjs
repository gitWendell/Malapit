import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
// These fictional identities and cleanup must stay on this local Worker.
const base='http://127.0.0.1:5188',run=crypto.randomUUID().slice(0,8);
const person=role=>({id:'qa-pay-'+role+'-'+run,email:'qa-pay-'+role+'-'+run+'@sites.test'});
const owner=person('owner'),renter=person('renter'),other=person('other'),replacement=person('replacement'),reviewer={id:'local_seedy',email:'local_seedy@sites.test'};
let checks=0;
const day=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
async function request(path,user,method='GET',body,origin=base){const headers={};if(user){headers['oai-authenticated-user-id']=user.id;headers['oai-authenticated-user-email']=user.email;}if(method!=='GET')headers.origin=origin;if(body!==undefined)headers['Content-Type']='application/json';const response=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,data:await response.json(),headers:response.headers};}
function expect(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result.data));checks++;return result.data;}
function verify(condition,label){assert.ok(condition,label);checks++;}
const billPath=id=>'/api/rentals/bills/'+id,payPath=id=>'/api/rentals/payments/'+id;
const input=(changes={})=>({requestId:crypto.randomUUID(),amountCents:300000,method:'gcash',paidAt:day(),reference:'DEMO-'+run,note:'Fictional payment test only',detailsConfirmed:true,receiptConfirmed:false,...changes});
const report=(id,user=renter,changes={})=>request(billPath(id)+'/payments',user,'POST',input(changes));
const detail=(id,user=owner)=>request(billPath(id),user);
async function createBill(connectionId,month='2026-11'){const [year,m]=month.split('-').map(Number),last=new Date(Date.UTC(year,m,0)).getUTCDate();return expect(await request('/api/rentals/bills',owner,'POST',{requestId:crypto.randomUUID(),connectionId,month,periodStart:month+'-01',periodEnd:month+'-'+last,dueDate:month+'-15',amountCents:800000,note:'QA payment bill '+run,detailsConfirmed:true}),201,'Bill created');}
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
function localSql(sql){return execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql],{cwd:new URL('..',import.meta.url),stdio:'pipe'});}
try{
  expect(await report(crypto.randomUUID(),null),401,'Signed-out reporting blocked');
  expect(await request(payPath(crypto.randomUUID()),null,'PATCH',{action:'confirm',receiptConfirmed:true}),401,'Signed-out confirmation blocked');
  expect(await request(billPath(crypto.randomUUID())+'/payments',renter,'POST',input(),'https://untrusted.invalid'),403,'Cross-site reporting blocked');
  const unit=expect(await request('/api/rentals/units',owner,'POST',{propertyName:'QA payments '+run,unitName:'Room 2',city:'Cebu City',address:'Fictional test street only',monthlyRentCents:800000,dueDay:15,leaseStart:'2026-01-01',leaseEnd:null}),201,'Unit created');
  const u=expect(await request('/api/rentals',owner),200,'Owner reads unit').units.find(row=>row.id===unit.id);
  const connection=expect(await request('/api/rentals/invitations',owner,'POST',{unitId:u.id,unitVersion:u.updatedAt,email:renter.email,sharingConfirmed:true}),201,'Invitation prepared');
  expect(await request('/api/rentals/connections/'+connection.id,renter,'PATCH',{action:'accept',detailsConfirmed:true}),200,'Renter connected');
  const bill=await createBill(connection.id);
  for(const changes of [{amountCents:0},{amountCents:1.5},{paidAt:'2200-01-01'},{reference:''},{detailsConfirmed:false},{receiptConfirmed:true},{duplicateReason:'Renter cannot approve this'}])expect(await report(bill.id,renter,changes),400,'Invalid report rejected');
  expect(await report(bill.id,other),404,'Other account cannot report on bill');expect(await report(bill.id,reviewer),404,'Listing review grants no payment access');
  expect(await report(bill.id,owner),400,'Owner must check receipt');
  const data=input({ownerId:other.id,renterId:other.id,status:'confirmed'});
  const responses=await Promise.all([request(billPath(bill.id)+'/payments',renter,'POST',data),request(billPath(bill.id)+'/payments',renter,'POST',data)]);
  const first=expect(responses[0],201,'Report saved');expect(responses[1],201,'Repeated report is idempotent');verify(first.id===responses[1].data.id,'One record for repeated request');
  expect(await request(billPath(bill.id)+'/payments',renter,'POST',{...data,amountCents:200000}),409,'Reused request cannot change amount');
  expect(await request(billPath(bill.id)+'/payments',renter,'POST',{...data,receiptConfirmed:true}),400,'A replay cannot claim owner receipt');
  let current=expect(await detail(bill.id,renter),200,'Renter reads pending report');verify(current.bill.confirmedCents===0&&current.bill.remainingCents===800000&&current.bill.pendingCents===300000,'Pending report leaves confirmed balance unchanged');verify(current.payments[0].status==='pending'&&current.payments[0].ownerId===owner.id,'Client cannot assign owner or status');
  expect(await report(bill.id),409,'Second pending report blocked');expect(await report(bill.id,owner,{receiptConfirmed:true}),409,'Owner must review pending report first');
  expect(await request(billPath(bill.id),owner,'PATCH',{action:'void',reason:'Billing correction',confirmed:true}),409,'Pending payment protects bill');
  expect(await request(payPath(first.id),renter,'PATCH',{action:'confirm',receiptConfirmed:true}),403,'Renter cannot confirm own report');
  expect(await request(payPath(first.id),other,'PATCH',{action:'reject',reason:'Not my bill',confirmed:true}),404,'Other account cannot review report');
  expect(await request(payPath(first.id),reviewer,'PATCH',{action:'confirm',receiptConfirmed:true}),404,'Reviewer has no confirmation bypass');
  expect(await request(payPath(first.id),owner,'PATCH',{action:'cancel',reason:'Owner cannot cancel renter report',confirmed:true}),403,'Owner uses review rather than renter cancellation');
  expect(await request(payPath(first.id),owner,'PATCH',{action:'confirm',receiptConfirmed:false}),400,'Receipt check required');
  for(const response of await Promise.all([request(payPath(first.id),owner,'PATCH',{action:'confirm',receiptConfirmed:true}),request(payPath(first.id),owner,'PATCH',{action:'confirm',receiptConfirmed:true})]))expect(response,200,'Concurrent confirmation is idempotent');
  current=expect(await detail(bill.id),200,'Confirmed bill read');verify(current.bill.confirmedCents===300000&&current.bill.remainingCents===500000&&!current.bill.pendingCount,'Partial confirmation updates balance once');verify(current.payments[0].events.length===2,'Creation and confirmation history recorded once');
  const monthly=expect(await request('/api/rentals/bills?month=2026-11&role=owner',owner),200,'Owner totals read');verify(monthly.totals.confirmedCents===300000&&monthly.totals.remainingCents===500000&&monthly.totals.pendingCents===0,'Owner totals distinguish confirmed, pending and remaining');
  expect(await report(bill.id,owner,{amountCents:500001,method:'cash',reference:'',receiptConfirmed:true}),409,'Overpayment rejected');
  const cashInput=input({amountCents:500000,method:'cash',reference:'',receiptConfirmed:true});
  const cash=expect(await request(billPath(bill.id)+'/payments',owner,'POST',cashInput),201,'Owner records checked cash receipt');
  expect(await request(billPath(bill.id)+'/payments',owner,'POST',cashInput),201,'Owner record replay is idempotent');
  current=expect(await detail(bill.id,renter),200,'Paid bill visible to renter');verify(current.bill.confirmedCents===800000&&current.bill.remainingCents===0,'Full confirmation marks recorded balance paid');
  expect(await report(bill.id,renter,{amountCents:1}),409,'Paid bill rejects extra report');
  expect(await request(billPath(bill.id),owner,'PATCH',{action:'void',reason:'Billing correction',confirmed:true}),409,'Confirmed payments protect bill');
  expect(await request(payPath(first.id),renter,'PATCH',{action:'reverse',reason:'Not allowed',confirmed:true}),403,'Renter cannot reverse receipt');
  expect(await request(payPath(first.id),owner,'PATCH',{action:'reverse',reason:'',confirmed:true}),400,'Reversal requires reason');
  const reversal={action:'reverse',reason:'Correcting the recorded transaction',confirmed:true};
  for(const response of await Promise.all([request(payPath(first.id),owner,'PATCH',reversal),request(payPath(first.id),owner,'PATCH',reversal)]))expect(response,200,'Concurrent reversal is idempotent');
  current=expect(await detail(bill.id,renter),200,'Reversal visible to renter');const old=current.payments.find(row=>row.id===first.id);verify(current.bill.confirmedCents===500000&&current.bill.remainingCents===300000&&old.amountCents===300000&&old.status==='reversed'&&old.events.length===3,'Original preserved and only reversed credit removed');
  expect(await request(payPath(first.id),owner,'PATCH',{...reversal,reason:'Cannot replace historical reason'}),409,'Reversal reason immutable');
  const retry=expect(await report(bill.id),201,'Corrected report submitted');
  expect(await request(payPath(retry.id),owner,'PATCH',{action:'reject',reason:'Please check the reference',confirmed:true}),200,'Owner requests correction');
  current=expect(await detail(bill.id,renter),200,'Correction visible');verify(current.bill.remainingCents===300000&&current.payments.some(row=>row.id===retry.id&&row.decisionReason==='Please check the reference'),'Correction leaves balance and history intact');
  const corrected=expect(await report(bill.id),201,'Renter resubmits corrected report');expect(await request(payPath(corrected.id),owner,'PATCH',{action:'confirm',receiptConfirmed:true}),200,'Corrected report confirmed');
  const december=await createBill(connection.id,'2026-12'),duplicate=expect(await report(december.id,renter,{amountCents:100000}),201,'Repeated reference remains a report to check');
  verify(expect(await detail(december.id),200,'Owner sees reference review flag').payments[0].duplicateReference===true,'Owner sees duplicate flag');verify(expect(await detail(december.id,renter),200,'Renter view').payments[0].duplicateReference===false,'No cross-bill reference information disclosed to renter');
  expect(await request(payPath(duplicate.id),owner,'PATCH',{action:'confirm',receiptConfirmed:true}),409,'Repeated reference needs explicit review');
  expect(await request(payPath(duplicate.id),owner,'PATCH',{action:'confirm',receiptConfirmed:true,duplicateReason:'The transfer was allocated across two bills'}),200,'Owner explains valid shared reference');
  const january=await createBill(connection.id,'2027-01');
  const race=await Promise.all([report(january.id,owner,{amountCents:800000,method:'cash',reference:'',receiptConfirmed:true}),report(january.id,owner,{amountCents:800000,method:'cash',reference:'',receiptConfirmed:true})]);verify(race.filter(row=>row.status===201).length===1&&race.filter(row=>row.status===409).length===1,'Concurrent receipts cannot overpay');verify(expect(await detail(january.id),200,'Race result').bill.confirmedCents===800000,'Only one full receipt counted');
  const february=await createBill(connection.id,'2027-02'),pending=expect(await report(february.id,renter,{amountCents:100000,method:'cash',reference:''}),201,'Race report created');
  const decisionRace=await Promise.all([request(payPath(pending.id),owner,'PATCH',{action:'confirm',receiptConfirmed:true}),request(payPath(pending.id),renter,'PATCH',{action:'cancel',reason:'Correcting my report',confirmed:true})]);verify(decisionRace.filter(row=>row.status===200).length===1&&decisionRace.filter(row=>row.status===409).length===1,'Confirmation and cancellation cannot both win');
  current=expect(await detail(february.id),200,'Decision race result');verify(current.payments[0].events.length===2&&current.bill.confirmedCents===(current.payments[0].status==='confirmed'?100000:0),'One decision and correct balance retained');
  const march=await createBill(connection.id,'2027-03');
  const voidRace=await Promise.all([request(billPath(march.id),owner,'PATCH',{action:'void',reason:'Correcting the billing period',confirmed:true}),report(march.id,owner,{amountCents:800000,method:'cash',reference:'',receiptConfirmed:true})]);verify(voidRace.filter(row=>[200,201].includes(row.status)).length===1&&voidRace.filter(row=>row.status===409).length===1,'Bill cancellation cannot hide a concurrent receipt');
  expect(await request('/api/rentals/connections/'+connection.id,owner,'PATCH',{action:'end',confirmed:true}),200,'Connection closed');
  const late=expect(await report(december.id,renter,{amountCents:100000,method:'cash',reference:''}),201,'Original renter can settle a past bill after closing');
  const next=expect(await request('/api/rentals/invitations',owner,'POST',{unitId:u.id,unitVersion:u.updatedAt,email:replacement.email,sharingConfirmed:true}),201,'New renter invited');expect(await request('/api/rentals/connections/'+next.id,replacement,'PATCH',{action:'accept',detailsConfirmed:true}),200,'New renter connected');
  expect(await detail(december.id,replacement),404,'New renter cannot read old payments');expect(await request(payPath(late.id),replacement,'PATCH',{action:'cancel',reason:'Not my report',confirmed:true}),404,'New renter cannot change old payments');
  expect(await request(payPath(late.id),renter,'PATCH',{action:'cancel',reason:'Correcting my past report',confirmed:true}),200,'Original renter retains own report controls');
  expect(await detail(bill.id,{id:other.id,email:renter.email}),404,'Same email cannot inherit recorded payments');expect(await detail(bill.id,{id:renter.id,email:'changed-'+renter.email}),200,'Original account retains history after email change');
  console.log('PASS: '+checks+' checks covering payment reports, role access, partial balances, receipt confirmation, corrections, references and concurrent actions.');
}finally{
  const id=quote(owner.id);localSql('DELETE FROM rental_payment_events WHERE payment_id IN (SELECT id FROM rental_payments WHERE owner_id='+id+'); DELETE FROM rental_payments WHERE owner_id='+id+'; DELETE FROM rental_bill_events WHERE bill_id IN (SELECT id FROM rental_bills WHERE owner_id='+id+'); DELETE FROM rental_bills WHERE owner_id='+id+'; DELETE FROM rental_events WHERE connection_id IN (SELECT id FROM rental_connections WHERE owner_id='+id+'); DELETE FROM rental_connections WHERE owner_id='+id+'; DELETE FROM rental_units WHERE owner_id='+id+';');console.log('Removed this run’s isolated local payment records.');
}
