import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import './sites-env.mjs';
import {unstable_dev} from 'wrangler';
const philippinesDay=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const followingMonth=value=>{const[y,m]=value.split('-').map(Number);return new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);};
const monthBounds=value=>{const[y,m]=value.split('-').map(Number);return{first:value+'-01',last:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)};};
// Deliberately fixed to the local Worker. Never point these fixtures at production.
const base='http://127.0.0.1:5188',run=crypto.randomUUID().slice(0,8),month=philippinesDay().slice(0,7),future=followingMonth(month),after=followingMonth(future);
const person=role=>({id:'qa-work-'+role+'-'+run,email:'qa-work-'+role+'-'+run+'@sites.test'});
const owner=person('owner'),renter=person('renter'),other=person('other-owner'),renter2=person('second-renter'),renter3=person('other-renter'),replacement=person('replacement'),reviewer={id:'local_seedy',email:'local_seedy@sites.test'};
let checks=0;
// Wrangler 4.92 cannot dispatch local Cron to a Worker with static assets
// (workers-sdk#9882). Run the SAME built entry without assets on a temporary
// loopback port, sharing only the local D1 emulator. Never deploy this config.
const built=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
const cronConfig=path.resolve('.sites-runtime/workload-cron-'+run+'.json');
writeFileSync(cronConfig,JSON.stringify({name:'malapit-workload-cron-local',main:path.resolve('dist/server/index.js'),no_bundle:true,rules:built.rules,compatibility_date:built.compatibility_date,compatibility_flags:built.compatibility_flags,d1_databases:built.d1_databases},null,2));
let cronWorker;
async function request(path,user,method='GET',body,origin=base){const headers=user?{'oai-authenticated-user-id':user.id,'oai-authenticated-user-email':user.email}:{};if(method!=='GET')headers.origin=origin;if(body!==undefined)headers['content-type']='application/json';const r=await fetch(base+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json(),headers:r.headers};}
function expect(r,status,label){assert.equal(r.status,status,label+': '+JSON.stringify(r.data));checks++;return r.data;}
function verify(value,label){assert.ok(value,label);checks++;}
const connectPath=id=>'/api/rentals/connections/'+id,schedulePath=id=>connectPath(id)+'/billing',billPath=id=>'/api/rentals/bills/'+id,paymentPath=id=>'/api/rentals/payments/'+id;
async function detail(id,user=owner){return expect(await request(connectPath(id),user),200,'Read own connection');}
async function tasks(user=owner,role='owner'){return expect(await request('/api/rentals/tasks?role='+role,user),200,'Read own quick actions');}
async function setup(lister,tenant,label,leaseEnd=null,rent=800000){
 const unit=expect(await request('/api/rentals/units',lister,'POST',{requestId:crypto.randomUUID(),propertyName:'QA workload '+run,unitName:label,city:'Cebu City',address:'Fictional test building',monthlyRentCents:rent,dueDay:30,leaseStart:month.slice(0,4)+'-01-01',leaseEnd}),201,'Unit created');
 const data=expect(await request('/api/rentals',lister),200,'Owner reads unit'),saved=data.units.find(u=>u.id===unit.id);
 const c=expect(await request('/api/rentals/invitations',lister,'POST',{unitId:unit.id,unitVersion:saved.updatedAt,email:tenant.email,sharingConfirmed:true}),201,'Invitation created');
 expect(await request(connectPath(c.id),tenant,'PATCH',{action:'accept',detailsConfirmed:true}),200,'Invitation accepted');return{...c,unitId:unit.id,unitVersion:saved.updatedAt};
}
async function bill(c,lister=owner,rent=800000){const dates=monthBounds(month);return expect(await request('/api/rentals/bills',lister,'POST',{requestId:crypto.randomUUID(),connectionId:c.id,month,periodStart:dates.first,periodEnd:dates.last,dueDate:month+'-'+Math.min(30,Number(dates.last.slice(-2))),amountCents:rent,note:'Fictional workload test',detailsConfirmed:true}),201,'Manual bill created');}
async function report(id,tenant,amount,method='gcash',reference='QA-'+run){return expect(await request(billPath(id)+'/payments',tenant,'POST',{requestId:crypto.randomUUID(),amountCents:amount,method,paidAt:philippinesDay(),reference,note:'Fictional workflow check',detailsConfirmed:true,receiptConfirmed:false}),201,'Payment reported');}
async function cron(at){const r=await cronWorker.fetch('/cdn-cgi/handler/scheduled?cron='+encodeURIComponent('*/5 * * * *')+'&time='+new Date(at+'-01T00:05:00+08:00').getTime());assert.equal(r.status,200,'Local scheduled handler: '+await r.text());checks++;}
const quote=s=>"'"+s.replaceAll("'","''")+"'";
function localSql(sql){return execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',sql],{stdio:['ignore','pipe','pipe']});}
try{
 cronWorker=await unstable_dev(path.resolve('dist/server/index.js'),{config:cronConfig,ip:'127.0.0.1',port:0,inspectorPort:0,local:true,persist:true,persistTo:path.resolve('.wrangler/state'),logLevel:'error',experimental:{disableExperimentalWarning:true,disableDevRegistry:true,watch:false}});
 expect(await request('/api/rentals/tasks',null),401,'Signed-out tasks blocked');
 expect(await request(schedulePath(crypto.randomUUID()),null,'PATCH',{action:'pause',version:1,confirmed:true}),401,'Signed-out schedule changes blocked');
 expect(await request(schedulePath(crypto.randomUUID()),owner,'PATCH',{action:'pause',version:1,confirmed:true},'https://untrusted.invalid'),403,'Cross-site schedule changes blocked');
 const a=await setup(owner,renter,'Room A',after+'-15'),b=await setup(owner,renter2,'Room B'),outside=await setup(other,renter3,'Other owner');
 const initial=await detail(a.id);verify(initial.billing.schedule===null&&initial.billing.preview.month===future,'Scheduling is off by default with a future full-month preview');
 const enable={action:'enable',version:null,month:future,detailsConfirmed:true};
 for(const user of [renter,other,reviewer])expect(await request(schedulePath(a.id),user,'PATCH',enable),404,'Only original owner can enable monthly bills');
 expect(await request(schedulePath(a.id),owner,'PATCH',{...enable,detailsConfirmed:false}),400,'Enable requires explicit review');
 expect(await request(schedulePath(a.id),owner,'PATCH',{...enable,month}),409,'Cannot silently start with the current month');
 expect(await request(schedulePath(a.id),owner,'PATCH',enable),200,'Owner enables future bills');
 expect(await request(schedulePath(a.id),owner,'PATCH',enable),200,'Repeated enable is idempotent');
 let current=await detail(a.id);verify(current.billing.schedule.version===1&&current.events.filter(x=>x.action==='billing_enabled').length===1,'One schedule and one consent event');
 verify((await detail(a.id,renter)).billing.schedule.status==='enabled','Original renter sees schedule');
 expect(await request(schedulePath(a.id),owner,'PATCH',{action:'pause',version:99,confirmed:true}),409,'Stale schedule rejected');
 expect(await request(schedulePath(a.id),owner,'PATCH',{action:'pause',version:1,confirmed:false}),400,'Pause needs an intentional action');
 expect(await request(schedulePath(a.id),owner,'PATCH',{action:'pause',version:1,confirmed:true}),200,'Owner pauses');
 await cron(future);verify((await detail(a.id)).bills.length===0,'Paused schedule creates no bill');
 current=await detail(a.id);expect(await request(schedulePath(a.id),owner,'PATCH',{...enable,version:current.billing.schedule.version}),200,'Owner resumes after preview');
 expect(await request(schedulePath(b.id),owner,'PATCH',enable),200,'Second unit enabled');
 await Promise.all([cron(future),cron(future)]);
 const automatic=expect(await request('/api/rentals/bills?role=owner&month='+future,owner),200,'Read generated monthly bills');
 const aBill=automatic.bills.find(x=>x.connectionId===a.id),bBill=automatic.bills.find(x=>x.connectionId===b.id);
 verify(automatic.bills.length===2&&aBill.source==='scheduled'&&aBill.amountCents===800000,'One automatic bill per opted-in connection');
 const autoDetail=expect(await request(billPath(aBill.id),renter),200,'Renter reads automatic bill');verify(autoDetail.events[0].action==='created_automatically'&&autoDetail.events[0].actorName==='Malapit','Automatic history has the actual actor');
 verify((await detail(a.id)).billing.schedule.nextMonth===after,'Schedule advances once');
 const ownBill=await bill(a),secondBill=await bill(b),otherBill=await bill(outside,other);
 const one=await report(ownBill.id,renter,300000),two=await report(secondBill.id,renter2,100000,'bank','BANK-'+run),hidden=await report(otherBill.id,renter3,100000,'cash','');
 const queue=await tasks();verify(queue.pendingTotal===2&&queue.pendingPayments.some(x=>x.id===one.id)&&queue.pendingPayments.some(x=>x.id===two.id),'Owner reviews both units in one queue');
 verify(!queue.pendingPayments.some(x=>x.id===hidden.id),'Other owner’s report stays private');
 verify((await tasks(other)).pendingTotal===1&&(await tasks(reviewer)).pendingTotal===0,'Review role grants no private task access');
 verify((await tasks(renter)).pendingTotal===0,'Renter cannot see owner queue');
 const renterTasks=await tasks(renter,'renter'),pending=renterTasks.dueBills.find(x=>x.id===ownBill.id);verify(pending.pendingCount===1&&pending.remainingCents===800000,'Renter quick action shows waiting report without reducing balance');
 verify(!renterTasks.dueBills.some(x=>x.id===secondBill.id),'Renter due list is account-scoped');
 expect(await request('/api/rentals/tasks?role=invalid',owner),400,'Invalid task role rejected');
 expect(await request('/api/rentals/tasks?page=-1',owner),400,'Invalid task page rejected');
 for(const user of [other,reviewer])expect(await request(paymentPath(one.id),user,'PATCH',{action:'confirm',receiptConfirmed:true}),404,'Queue confirmation cannot bypass bill access');
 expect(await request(paymentPath(one.id),renter,'PATCH',{action:'confirm',receiptConfirmed:true}),403,'Renter cannot confirm their own report');
 expect(await request(paymentPath(one.id),owner,'PATCH',{action:'confirm',receiptConfirmed:true}),200,'Owner confirms from queue');
 verify((await tasks()).pendingTotal===1,'Confirmed report leaves queue');
 let updated=expect(await request(billPath(ownBill.id),renter),200,'Renter reads updated balance');verify(updated.bill.remainingCents===500000&&updated.defaultPaymentMethod==='gcash','Confirmed balance and previous method are available for the quick form');
 expect(await request(billPath(ownBill.id)+'/payments',owner,'POST',{requestId:crypto.randomUUID(),amountCents:100000,method:'cash',paidAt:philippinesDay(),reference:'',note:'Fictional cash receipt',detailsConfirmed:true,receiptConfirmed:true}),201,'Owner records already-received cash');
 updated=expect(await request(billPath(ownBill.id),renter),200,'Renter reads defaults');verify(updated.defaultPaymentMethod==='cash'&&!('defaultPaymentReference' in updated),'Only the method is reused; transaction references are never copied');
 expect(await request(paymentPath(two.id),owner,'PATCH',{action:'reject',confirmed:true,reason:'Please check the amount received'}),200,'Owner requests correction from queue');verify((await tasks()).pendingTotal===0,'Correction leaves the review queue');
 expect(await request(billPath(bBill.id),owner,'PATCH',{action:'void',confirmed:true,reason:'Reviewing the rent for this period'}),200,'Owner cancels an automatic bill for correction');verify((await detail(b.id)).billing.schedule.issue==='corrected','Correction pauses future automatic bills');
 await cron(after);verify((await detail(a.id)).billing.schedule.issue==='partial','Partial final month needs manual review');
 const attention=await tasks();verify(attention.scheduleIssues.length===2,'Owner sees both billing issues in the same action area');verify((await tasks(other)).scheduleIssues.length===0,'Billing issues stay private to their owner');
 expect(await request(connectPath(a.id),owner,'PATCH',{action:'end',confirmed:true}),200,'Owner closes original connection');verify((await detail(a.id)).billing.schedule.status==='finished','Closing a connection stops its schedule');
 const next=expect(await request('/api/rentals/invitations',owner,'POST',{unitId:a.unitId,unitVersion:a.unitVersion,email:replacement.email,sharingConfirmed:true}),201,'Replacement renter invited');expect(await request(connectPath(next.id),replacement,'PATCH',{action:'accept',detailsConfirmed:true}),200,'Replacement accepts');
 expect(await request(billPath(ownBill.id),replacement),404,'Replacement cannot open an old bill link');verify((await tasks(replacement,'renter')).dueTotal===0,'Replacement does not inherit earlier due bills');verify((await detail(next.id)).billing.schedule===null,'A new connection requires new billing consent');
 verify((await tasks(renter,'renter')).dueBills.some(x=>x.id===ownBill.id),'Original renter keeps access for settlement');
 console.log('PASS: '+checks+' checks for automatic schedules, local Cron, quick actions, private queues, defaults, corrections and replacement-renter privacy.');
}finally{
 await cronWorker?.stop();
 unlinkSync(cronConfig);
 const owners=[owner.id,other.id].map(quote).join(','),connections=`SELECT id FROM rental_connections WHERE owner_id IN (${owners})`,bills=`SELECT id FROM rental_bills WHERE connection_id IN (${connections})`,payments=`SELECT id FROM rental_payments WHERE bill_id IN (${bills})`;
 localSql(`DELETE FROM rental_bill_schedules WHERE owner_id IN (${owners}); DELETE FROM rental_payment_events WHERE payment_id IN (${payments}); DELETE FROM rental_payments WHERE bill_id IN (${bills}); DELETE FROM rental_bill_events WHERE bill_id IN (${bills}); DELETE FROM rental_bills WHERE connection_id IN (${connections}); DELETE FROM rental_events WHERE connection_id IN (${connections}); DELETE FROM rental_connections WHERE owner_id IN (${owners}); DELETE FROM rental_units WHERE owner_id IN (${owners});`);
 console.log('Removed only this run’s fictional local workload records.');
}
