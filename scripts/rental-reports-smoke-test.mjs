import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
// Fixed loopback target and run-specific fictional owners. Never use production.
const base='http://127.0.0.1:5188',run=crypto.randomUUID().slice(0,8);
const person=role=>({id:'qa-reports-'+role+'-'+run,email:'qa-reports-'+role+'-'+run+'@sites.test'});
const owner=person('owner'),renter=person('renter'),secondRenter=person('second-renter'),other=person('other'),otherRenter=person('other-renter');
const day=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10),month=day().slice(0,7),[year,m]=month.split('-').map(Number);
const last=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10),previousLast=new Date(Date.UTC(year,m-1,0)).toISOString().slice(0,10);
let checks=0;
async function request(path,user,method='GET',body){
 const headers=user?{'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email}:{};
 if(method!=='GET')headers.origin=base;
 if(body!==undefined)headers['content-type']='application/json';
 const response=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return{status:response.status,data,headers:response.headers};
}
function expect(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result.data));checks++;return result.data;}
function verify(condition,label){assert.ok(condition,label);checks++;}
async function addUnit(lister,label,property='QA reports '+run){return expect(await request('/api/rentals/units',lister,'POST',{requestId:crypto.randomUUID(),propertyName:property,unitName:label,city:'Cebu City',address:'Fictional report test building',monthlyRentCents:800025,dueDay:30,leaseStart:(year-1)+'-01-01',leaseEnd:null}),201,'Unit created');}
async function connect(unit,lister,tenant){
 const data=expect(await request('/api/rentals',lister),200,'Owner reads unit'),saved=data.units.find(u=>u.id===unit.id);
 const c=expect(await request('/api/rentals/invitations',lister,'POST',{unitId:unit.id,unitVersion:saved.updatedAt,email:tenant.email,sharingConfirmed:true}),201,'Renter invited');
 expect(await request('/api/rentals/connections/'+c.id,tenant,'PATCH',{action:'accept',detailsConfirmed:true}),200,'Renter accepted');return c;
}
async function bill(c,lister,amount){return expect(await request('/api/rentals/bills',lister,'POST',{requestId:crypto.randomUUID(),connectionId:c.id,month,periodStart:month+'-01',periodEnd:last,dueDate:last,amountCents:amount,note:'Fictional report only',detailsConfirmed:true}),201,'Rent bill created');}
async function pay(b,user,amount,received=false){return expect(await request('/api/rentals/bills/'+b.id+'/payments',user,'POST',{requestId:crypto.randomUUID(),amountCents:amount,method:'cash',paidAt:previousLast,reference:'',note:'Fictional report test',detailsConfirmed:true,receiptConfirmed:received}),201,'Payment recorded');}
const report=(user,extra='')=>request('/api/rentals/reports?month='+month+extra,user);
const exportFile=(user,kind,extra='')=>request('/api/rentals/reports/export?kind='+kind+'&month='+month+extra,user);
function csvRows(text){
 const rows=[];let row=[],cell='',quoted=false;text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&c===','){row.push(cell);cell='';}else if(!quoted&&c==='\r'&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}else cell+=c;}
 assert(!quoted);return rows;
}
const quote=value=>"'"+value.replaceAll("'","''")+"'";
function cleanup(){
 const owners=[owner,other].map(p=>quote(p.id)).join(','),connections=`SELECT id FROM rental_connections WHERE owner_id IN (${owners})`,bills=`SELECT id FROM rental_bills WHERE owner_id IN (${owners})`,payments=`SELECT id FROM rental_payments WHERE owner_id IN (${owners})`;
 const sql=`DELETE FROM rental_bill_schedules WHERE owner_id IN (${owners}); DELETE FROM rental_payment_events WHERE payment_id IN (${payments}); DELETE FROM rental_payments WHERE owner_id IN (${owners}); DELETE FROM rental_bill_events WHERE bill_id IN (${bills}); DELETE FROM rental_bills WHERE owner_id IN (${owners}); DELETE FROM rental_events WHERE connection_id IN (${connections}); DELETE FROM rental_connections WHERE owner_id IN (${owners}); DELETE FROM rental_units WHERE owner_id IN (${owners});`;
 execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql],{stdio:['ignore','pipe','pipe']});
}
try{
 expect(await request('/api/rentals/reports',null),401,'Signed-out report blocked');
 for(const kind of ['units','bills','payments'])expect(await exportFile(null,kind),401,'Signed-out export blocked');
 expect(await request('/api/rentals/reports?month=2026-13',owner),400,'Invalid month rejected');
 expect(await report(owner,'&page=-1'),400,'Invalid page rejected');
 expect(await exportFile(owner,'all'),400,'Unknown export rejected');
 const empty=expect(await report(owner),200,'Empty owner report');verify(empty.unitCount===0&&empty.totals.billedCents===0,'Empty records do not invent rent');
 const a=await addUnit(owner,'Room A','=1+1'),b=await addUnit(owner,'Room B'),outside=await addUnit(other,'Secret unit');
 const ca=await connect(a,owner,renter),cb=await connect(b,owner,secondRenter),co=await connect(outside,other,otherRenter);
 const ba=await bill(ca,owner,800025),bb=await bill(cb,owner,500000),bo=await bill(co,other,990000);
 const confirmed=await pay(ba,owner,300010,true),pending=await pay(ba,renter,100015);await pay(bb,owner,500000,true);await pay(bo,other,990000,true);
 for(let i=0;i<24;i++)await addUnit(owner,'Vacant '+String(i+1).padStart(2,'0'));
 const result=await report(owner),data=expect(result,200,'Owner report loaded');
 assert.deepEqual(data.totals,{billCount:2,cancelledBillCount:0,billedCents:1300025,confirmedCents:800010,remainingCents:500015,pendingCents:100015,pendingCount:1});checks++;
 verify(data.unitCount===26&&data.units.length===25&&data.hasMore,'Units are paged at 25');
 verify(result.headers.get('cache-control')?.includes('no-store'),'Report is not cached');
 const second=expect(await report(owner,'&page=1'),200,'Second page loaded');verify(second.units.length===1&&!second.hasMore,'Last page is complete');assert.deepEqual(second.totals,data.totals);checks++;
 const filtered=expect(await report(owner,'&unitId='+a.id),200,'Own unit filter');verify(filtered.unitCount===1&&filtered.totals.billedCents===800025&&filtered.totals.pendingCents===100015,'Filter scopes totals');
 expect(await report(owner,'&unitId='+outside.id),404,'Other owner unit blocked');
 expect(await report(renter,'&unitId='+a.id),404,'Renter cannot retrieve owner report');
 const foreign=expect(await report(renter),200,'Renter can request only own portfolio');verify(foreign.unitCount===0,'Renter sees no owner units');
 const reviewer=expect(await report({id:'local_seedy',email:'local_seedy@sites.test'}),200,'Reviewer has normal own scope');verify(!reviewer.units.some(u=>[a.id,b.id,outside.id].includes(u.unitId)),'Listing reviewer cannot read private report fixtures');
 const sameEmail=expect(await report({id:'qa-reports-impostor-'+run,email:owner.email}),200,'Email alone does not grant ownership');verify(sameEmail.unitCount===0,'Account ID controls report access');
 const attempted=expect(await report(owner,'&ownerId='+other.id),200,'URL cannot select another owner');verify(attempted.totals.billedCents===1300025,'Server chooses owner identity');
 for(const kind of ['units','bills','payments']){
  expect(await exportFile(owner,kind,'&unitId='+outside.id),404,'Foreign unit export blocked');
  expect(await exportFile(renter,kind,'&unitId='+a.id),404,'Renter export of owner unit blocked');
  const r=await exportFile(owner,kind),csv=expect(r,200,'Own CSV downloaded'),rows=csvRows(csv);
  verify(r.headers.get('content-type')?.startsWith('text/csv')&&r.headers.get('content-disposition')?.includes('attachment;'),'CSV download headers');
  verify(r.headers.get('cache-control')?.includes('no-store')&&r.headers.get('x-content-type-options')==='nosniff','CSV stays private');
  verify(!csv.includes('Secret unit')&&!csv.includes(other.email),'Export omits another account');
  if(kind==='units'){verify(rows.length===27,'Unit export includes both pages');verify(rows.some(row=>row[4]==='\t=1+1'),'Formula-looking property is protected');}
  if(kind==='bills')verify(rows.length===3,'Both monthly bills exported');
  if(kind==='payments')verify(rows.length===4&&rows.some(row=>row.includes('Awaiting confirmation')),'All payment statuses exported');
  const single=csvRows(expect(await exportFile(owner,kind,'&unitId='+a.id),200,'Filtered CSV downloaded'));verify(single.length===(kind==='payments'?3:2),'Export filter matches selected unit');
 }
 expect(await request('/api/rentals/payments/'+confirmed.id,owner,'PATCH',{action:'reverse',reason:'Correcting the recorded receipt',confirmed:true}),200,'Receipt reversed');
 expect(await request('/api/rentals/payments/'+pending.id,owner,'PATCH',{action:'reject',reason:'Please correct this report',confirmed:true}),200,'Correction requested');
 expect(await request('/api/rentals/bills/'+ba.id,owner,'PATCH',{action:'void',reason:'Correcting agreed rent amount',confirmed:true}),200,'Original bill cancelled');
 await bill(ca,owner,750001);
 const corrected=expect(await report(owner),200,'Corrected report');verify(corrected.totals.billedCents===1250001&&corrected.totals.confirmedCents===500000&&corrected.totals.remainingCents===750001&&corrected.totals.cancelledBillCount===1,'Replacement is counted once and reversed credit is removed');
 const billHistory=csvRows(expect(await exportFile(owner,'bills'),200,'Bill correction history downloaded'));verify(billHistory.length===4&&billHistory.some(row=>row.includes('Cancelled')&&row.includes('Correcting agreed rent amount')),'Cancelled bill and reason preserved');
 const paymentHistory=csvRows(expect(await exportFile(owner,'payments'),200,'Payment correction history downloaded'));verify(paymentHistory.some(row=>row.includes('Record reversed')&&row.includes('Correcting the recorded receipt')),'Reversal reason preserved');
 console.log('PASS: '+checks+' report checks covering owner access, pagination, full CSV exports, unit filters, exact balances and corrections.');
}finally{cleanup();console.log('Removed only this run’s fictional local report records.');}
