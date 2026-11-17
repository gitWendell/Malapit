import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Fictional identities and cleanup are restricted to this local Worker.
// Never add a deployed-host override to this test.
const base='http://127.0.0.1:5188',run=crypto.randomUUID().slice(0,8);
const person=role=>({id:'qa-bills-'+role+'-'+run,email:'qa-bills-'+role+'-'+run+'@sites.test'});
const owner=person('owner'),renter=person('renter'),other=person('other'),replacement=person('replacement'),reviewer={id:'local_seedy',email:'local_seedy@sites.test'};
let checks=0;
async function request(path,user,method='GET',body,origin=base) {
  const headers={};if(user){headers['oai-authenticated-user-id']=user.id;headers['oai-authenticated-user-email']=user.email;}
  if(method!=='GET')headers.origin=origin;if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json(),headers:response.headers};
}
function expect(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result.data));checks++;return result.data;}
function verify(condition,label){assert.ok(condition,label);checks++;}
const detailPath=id=>'/api/rentals/bills/'+id;
const list=(user,role='owner',month='2026-11')=>request('/api/rentals/bills?month='+month+'&role='+role,user);
const newBill=(connectionId,changes={})=>({requestId:crypto.randomUUID(),connectionId,month:'2026-11',periodStart:'2026-11-01',periodEnd:'2026-11-30',dueDate:'2026-11-30',amountCents:800025,note:'Fictional rent-only bill '+run,detailsConfirmed:true,...changes});
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
function localSql(sql){return execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql],{cwd:new URL('..',import.meta.url),stdio:'pipe'});}
try {
  expect(await request('/api/rentals/bills',null),401,'Signed-out list blocked');
  expect(await request('/api/rentals/bills',null,'POST',{}),401,'Signed-out creation blocked');
  expect(await request('/api/rentals/bills',owner,'POST',{},'https://untrusted.invalid'),403,'Cross-site creation blocked');
  expect(await request('/api/rentals/bills?month=2026-13',owner),400,'Invalid month rejected');
  expect(await request('/api/rentals/bills?role=admin',owner),400,'Role cannot grant access');
  expect(await request('/api/rentals/bills?page=-1',owner),400,'Invalid pagination rejected');
  const unit=expect(await request('/api/rentals/units',owner,'POST',{propertyName:'QA bills home '+run,unitName:'Room 2',city:'Makati',address:'QA fictional private street',monthlyRentCents:800025,dueDay:31,leaseStart:'2026-01-01',leaseEnd:null}),201,'Unit created');
  const state=expect(await request('/api/rentals',owner),200,'Owner sees unit');
  const ownedUnit=state.units.find(item=>item.id===unit.id);
  const invitation=expect(await request('/api/rentals/invitations',owner,'POST',{unitId:unit.id,unitVersion:ownedUnit.updatedAt,email:renter.email,sharingConfirmed:true}),201,'Invitation created');
  expect(await request('/api/rentals/bills',owner,'POST',newBill(invitation.id)),409,'Pending connection cannot be billed');
  expect(await request('/api/rentals/connections/'+invitation.id,renter,'PATCH',{action:'accept',detailsConfirmed:true}),200,'Renter accepted');
  expect(await request('/api/rentals/bills',other,'POST',newBill(invitation.id)),404,'Other owner cannot bill connection');
  expect(await request('/api/rentals/bills',renter,'POST',newBill(invitation.id)),404,'Renter cannot create owner bill');
  for(const changes of [{amountCents:0},{amountCents:800025.1},{periodEnd:'2026-12-02'},{periodStart:'2026-11-31'},{detailsConfirmed:false},{month:'2025-12',periodStart:'2025-12-01',periodEnd:'2025-12-31'}])expect(await request('/api/rentals/bills',owner,'POST',newBill(invitation.id,changes)),400,'Invalid bill rejected');
  const input=newBill(invitation.id,{ownerId:other.id,renterId:other.id,status:'paid'});
  const repeated=await Promise.all([request('/api/rentals/bills',owner,'POST',input),request('/api/rentals/bills',owner,'POST',input)]);
  const saved=expect(repeated[0],201,'Bill saved');expect(repeated[1],201,'Same request is idempotent');
  verify(saved.id===repeated[1].data.id,'Concurrent repeat returns one bill');
  expect(await request('/api/rentals/bills',owner,'POST',{...input,amountCents:750000}),409,'A reused request cannot silently change a bill');
  const ownerDetail=expect(await request(detailPath(saved.id),owner),200,'Owner reads bill');
  const renterResponse=await request(detailPath(saved.id),renter),renterDetail=expect(renterResponse,200,'Renter reads same bill');
  verify(ownerDetail.bill.amountCents===800025&&renterDetail.bill.amountCents===800025,'Exact cents shared');
  verify(ownerDetail.bill.ownerId===owner.id&&ownerDetail.bill.renterId===renter.id&&ownerDetail.bill.status==='issued','Client cannot assign parties or mark paid');
  verify(ownerDetail.events.length===1&&ownerDetail.events[0].action==='created','One atomic creation event');
  assert.match(renterResponse.headers.get('cache-control')||'',/no-store/);checks++;
  expect(await request(detailPath(saved.id),other),404,'Unrelated account cannot read bill');
  expect(await request(detailPath(saved.id),reviewer),404,'Listing reviewer has no bill bypass');
  expect(await request(detailPath(saved.id),{id:other.id,email:renter.email}),404,'Reused email cannot inherit bill access');
  expect(await request(detailPath(saved.id),{id:renter.id,email:'changed-'+renter.email}),200,'Original account retains bill after email change');
  const ownerList=expect(await list(owner),200,'Owner bill list');
  verify(ownerList.bills.length===1&&ownerList.totals.amountCents===800025&&ownerList.totals.count===1,'Totals match issued bills');
  verify(expect(await list(renter,'renter'),200,'Renter bill list').bills.length===1,'Renter sees scoped bill');
  verify(expect(await list(other),200,'Other owner list').bills.length===0,'Other owner list has no bill');
  verify(expect(await list(reviewer),200,'Reviewer bill list').bills.every(bill=>bill.ownerId===reviewer.id&&bill.id!==saved.id),'Reviewer sees only own bills');
  expect(await request('/api/rentals/bills',owner,'POST',newBill(invitation.id,{periodEnd:'2026-11-10'})),409,'Second current bill in month blocked');
  expect(await request('/api/rentals/bills',owner,'POST',newBill(invitation.id,{month:'2026-10',periodStart:'2026-10-17',periodEnd:'2026-11-16'})),409,'Cross-month overlap blocked');
  const december=expect(await request('/api/rentals/bills',owner,'POST',newBill(invitation.id,{month:'2026-12',periodStart:'2026-12-01',periodEnd:'2026-12-31',dueDate:'2026-12-31'})),201,'Next month can be billed');
  expect(await request(detailPath(saved.id),renter,'PATCH',{action:'void',reason:'Wrong amount',confirmed:true}),403,'Renter cannot cancel owner bill');
  expect(await request(detailPath(saved.id),other,'PATCH',{action:'void',reason:'Wrong amount',confirmed:true}),404,'Other owner cannot cancel bill');
  expect(await request(detailPath(saved.id),reviewer,'PATCH',{action:'void',reason:'Wrong amount',confirmed:true}),404,'Reviewer cannot cancel bill');
  expect(await request(detailPath(saved.id),owner,'PATCH',{action:'paid',confirmed:true}),400,'Payment status cannot be faked');
  expect(await request(detailPath(saved.id),owner,'PATCH',{action:'void',reason:'',confirmed:true}),400,'Correction requires reason');
  const cancellation={action:'void',reason:'The agreed amount needs correction.',confirmed:true};
  for(const response of await Promise.all([request(detailPath(saved.id),owner,'PATCH',cancellation),request(detailPath(saved.id),owner,'PATCH',cancellation)]))expect(response,200,'Concurrent cancellation is idempotent');
  expect(await request(detailPath(saved.id),owner,'PATCH',{...cancellation,reason:'Changed historical reason'}),409,'Correction reason cannot be overwritten');
  const cancelled=expect(await request(detailPath(saved.id),renter),200,'Renter sees correction');
  verify(cancelled.bill.amountCents===800025&&cancelled.bill.status==='voided'&&cancelled.events.length===2,'Original amount and both events preserved');
  const emptyTotals=expect(await list(owner),200,'Totals refresh after correction');
  verify(emptyTotals.totals.amountCents===0&&emptyTotals.totals.count===0&&emptyTotals.bills.length===1,'Cancelled bills excluded from totals but retained');
  const corrected=expect(await request('/api/rentals/bills',owner,'POST',newBill(invitation.id,{amountCents:750000})),201,'Corrected bill can replace cancelled bill');
  verify(expect(await list(owner),200,'Corrected totals').totals.amountCents===750000,'Only corrected amount is current');
  verify(expect(await request(detailPath(saved.id),renter),200,'Cancelled original links to current bill').currentBillId===corrected.id,'Renter can follow the current replacement');
  const connection=expect(await request('/api/rentals/connections/'+invitation.id,renter),200,'Connection includes its bill history');
  verify(connection.bills.some(bill=>bill.id===saved.id)&&connection.bills.some(bill=>bill.id===corrected.id),'Original and replacement appear together');
  expect(await request('/api/rentals/connections/'+invitation.id,owner,'PATCH',{action:'end',confirmed:true}),200,'Connection closed');
  expect(await request('/api/rentals/bills',owner,'POST',newBill(invitation.id,{month:'2027-01',periodStart:'2027-01-01',periodEnd:'2027-01-31'})),409,'Closed connection stops new bills');
  expect(await request(detailPath(corrected.id),renter),200,'Past renter retains own history');
  const next=expect(await request('/api/rentals/invitations',owner,'POST',{unitId:unit.id,unitVersion:ownedUnit.updatedAt,email:replacement.email,sharingConfirmed:true}),201,'Replacement invitation prepared');
  expect(await request('/api/rentals/connections/'+next.id,replacement,'PATCH',{action:'accept',detailsConfirmed:true}),200,'Replacement renter connected');
  expect(await request(detailPath(corrected.id),replacement),404,'New renter cannot see former renter bill');
  expect(await request(detailPath(december.id),replacement),404,'New renter cannot see former future bill');
  verify(expect(await list(replacement,'renter'),200,'Replacement renter bill list').bills.length===0,'No inherited bill history');
  console.log('PASS: '+checks+' checks covering private bills, amounts, dates, duplicate requests, totals, corrections, races and past renter privacy.');
} finally {
  const owned=quote(owner.id);
  localSql('DELETE FROM rental_bill_events WHERE bill_id IN (SELECT id FROM rental_bills WHERE owner_id='+owned+'); DELETE FROM rental_bills WHERE owner_id='+owned+'; DELETE FROM rental_events WHERE connection_id IN (SELECT id FROM rental_connections WHERE owner_id='+owned+'); DELETE FROM rental_connections WHERE owner_id='+owned+'; DELETE FROM rental_units WHERE owner_id='+owned+';');
  console.log('Removed this run’s isolated local billing records.');
}
