import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {philippinesDay} from '../lib/rentals.ts';
import {ownerBillsReportQuery,ownerPaymentsReportQuery,ownerUnitsReportQuery} from '../lib/rental-report-queries.ts';
import {billReportCsv,csvCell,csvDocument,parseReportQuery,paymentReportCsv,reportTotals,unitReportCsv} from '../lib/rental-reports.ts';

const now=()=>new Date().toISOString(),day=()=>philippinesDay();
function database(){const db=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));return db;}
function unit(db,owner='owner',name='Room A'){
 const id=crypto.randomUUID();db.prepare('INSERT INTO rental_units (id,owner_id,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,'Demo Sampaguita',name,'Cebu City','Fictional report fixture',800025,30,'2026-01-01',now(),now());return id;
}
function connect(db,unitId,renter='renter'){
 const id=crypto.randomUUID();db.prepare("INSERT INTO rental_connections (id,unit_id,owner_id,owner_name,owner_email,invite_email,status,property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,created_at,created_day,expires_at) SELECT ?,id,owner_id,'Owner','owner@sites.test',?,'pending',property_name,unit_name,city,address,monthly_rent_cents,due_day,lease_start,?,?,? FROM rental_units WHERE id=?").run(id,renter+'@sites.test',now(),day(),new Date(Date.now()+86400000).toISOString(),unitId);
 db.prepare("UPDATE rental_connections SET status='accepted',renter_id=?,renter_name=?,renter_email=?,responded_at=? WHERE id=?").run(renter,renter,renter+'@sites.test',now(),id);return id;
}
function bill(db,connectionId,amount=800025,month='2026-11'){
 const id=crypto.randomUUID(),[year,m]=month.split('-').map(Number),last=new Date(Date.UTC(year,m,0)).toISOString().slice(0,10);
 db.prepare("INSERT INTO rental_bills (id,connection_id,owner_id,renter_id,month,period_start,period_end,due_date,amount_cents,status,created_at,created_day) SELECT ?,id,owner_id,renter_id,?,?,?,?,?,'issued',?,? FROM rental_connections WHERE id=?").run(id,month,month+'-01',last,last,amount,now(),day(),connectionId);return id;
}
function payment(db,billId,amount=10000,confirmed=false,paidAt='2026-10-31'){
 const id=crypto.randomUUID();db.prepare("INSERT INTO rental_payments (id,bill_id,owner_id,renter_id,submitted_by,amount_cents,method,paid_at,reference,reference_key,note,status,created_at,created_day,reviewed_at,reviewed_by) SELECT ?,id,owner_id,renter_id,CASE WHEN ? THEN owner_id ELSE renter_id END,?,'cash',?,'',NULL,'Fictional receipt',?,?,?,CASE WHEN ? THEN ? ELSE NULL END,CASE WHEN ? THEN owner_id ELSE NULL END FROM rental_bills WHERE id=?").run(id,Number(confirmed),amount,paidAt,confirmed?'confirmed':'pending',now(),day(),Number(confirmed),now(),Number(confirmed),billId);return id;
}
function decide(db,id,status,reason='Please correct the report'){
 db.prepare("UPDATE rental_payments SET status=?,reviewed_at=?,reviewed_by=CASE WHEN ?='cancelled' THEN submitted_by ELSE owner_id END,decision_reason=? WHERE id=?").run(status,now(),status,status==='confirmed'?null:reason,id);
}
function reverse(db,id){db.prepare("UPDATE rental_payments SET status='reversed',reversed_at=?,reversed_by=owner_id,reversal_reason='Correcting a duplicate entry' WHERE id=?").run(now(),id);}
function read(db,query){return db.prepare(query.sql).all(...query.params);}
function parseCsv(text){
 const records=[];let row=[],cell='',quoted=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&c===','){row.push(cell);cell='';}
  else if(!quoted&&c==='\r'&&text[i+1]==='\n'){row.push(cell);records.push(row);row=[];cell='';i++;}
  else cell+=c;
 }
 assert.equal(quoted,false);assert.equal(cell,'');return records;
}

test('report queries require a valid month, unit ID and bounded page',()=>{
 const parse=query=>parseReportQuery(new URL('https://malapit.example/api/rentals/reports?'+query));
 assert.equal(parse('').month,day().slice(0,7));
 assert.deepEqual(parse('month=2026-11'),{month:'2026-11',unitId:null,page:0});
 for(const query of ['month=','month=2026-13','month=2026-1','month=1899-12','unitId=owner','page=-1','page=0.5','page=999999'])assert.throws(()=>parse(query));
});

test('monthly unit totals use integer cents and pending reports never reduce a balance',()=>{
 const db=database(),a=unit(db),b=unit(db,'owner','Room B');unit(db,'owner','Vacant room');
 const first=bill(db,connect(db,a)),second=bill(db,connect(db,b),500000);
 payment(db,first,300010,true);payment(db,first,100015);payment(db,second,500000,true);
 const rows=read(db,ownerUnitsReportQuery('owner','2026-11'));
 assert.equal(rows.length,3);assert.equal(rows.find(r=>r.unitId===a).remainingCents,500015);
 assert.deepEqual(reportTotals(rows),{billCount:2,cancelledBillCount:0,billedCents:1300025,confirmedCents:800010,remainingCents:500015,pendingCents:100015,pendingCount:1});
 assert.equal(rows.find(r=>r.unitName==='Vacant room').billedCents,0);db.close();
});

test('all three report queries enforce the original owner, month and unit filter',()=>{
 const db=database(),a=unit(db),outside=unit(db,'other-owner','Secret unit');
 const c=connect(db,a),own=bill(db,c),other=bill(db,connect(db,outside,'other-renter'));
 payment(db,own,10000,true);payment(db,other,20000,true);
 bill(db,c,700000,'2026-10');
 for(const query of [ownerUnitsReportQuery,ownerBillsReportQuery,ownerPaymentsReportQuery]){
  const rows=read(db,query('owner','2026-11',a));assert.equal(rows.length,1);assert.equal(rows[0].unitId,a);
  assert.equal(read(db,query('owner','2026-11',outside)).length,0);
  assert.equal(read(db,query('renter','2026-11')).length,0);
  assert.equal(read(db,query('reviewer','2026-11')).length,0);
 }
 assert.equal(read(db,ownerBillsReportQuery('owner','2026-10')).length,1);db.close();
});

test('cancelled bills and reversed receipts keep their history without duplicating replacement totals',()=>{
 const db=database(),u=unit(db),c=connect(db,u),original=bill(db,c),p=payment(db,original,300010,true);
 reverse(db,p);db.prepare("UPDATE rental_bills SET status='voided',voided_at=?,void_reason='Correcting the rent amount' WHERE id=?").run(now(),original);
 const replacement=bill(db,c,750001);payment(db,replacement,250001,true);
 const total=reportTotals(read(db,ownerUnitsReportQuery('owner','2026-11')));
 assert.equal(total.billedCents,750001);assert.equal(total.confirmedCents,250001);assert.equal(total.remainingCents,500000);assert.equal(total.cancelledBillCount,1);
 const bills=read(db,ownerBillsReportQuery('owner','2026-11'));
 assert.equal(bills.length,2);assert.equal(bills.find(r=>r.billId===original).amountCents,800025);assert.equal(bills.find(r=>r.billId===original).billedCents,0);
 const history=read(db,ownerPaymentsReportQuery('owner','2026-11'));
 const reversed=history.find(r=>r.paymentId===p);assert.equal(reversed.status,'reversed');assert.equal(reversed.amountCents,300010);assert.equal(reversed.confirmedCents,0);assert.equal(reversed.reversalReason,'Correcting a duplicate entry');db.close();
});

test('payment history includes every status and follows bill month rather than date paid',()=>{
 const db=database(),u=unit(db),b=bill(db,connect(db,u));
 const cancelled=payment(db,b);decide(db,cancelled,'cancelled');
 const rejected=payment(db,b);decide(db,rejected,'rejected');
 const reversed=payment(db,b,10000,true);reverse(db,reversed);
 payment(db,b,10010,true);payment(db,b,20000);
 const rows=read(db,ownerPaymentsReportQuery('owner','2026-11'));
 assert.deepEqual(rows.map(r=>r.status).sort(),['cancelled','confirmed','pending','rejected','reversed']);
 assert(rows.every(r=>r.paidAt==='2026-10-31'));assert.equal(rows.reduce((n,r)=>n+r.confirmedCents,0),10010);
 const csv=parseCsv(paymentReportCsv(rows,now()));assert.equal(csv.length,6);assert.equal(csv[0].indexOf('Current confirmed credit PHP'),14);db.close();
});

test('archived units stay in months with history and active units without bills show zero',()=>{
 const db=database(),u=unit(db),c=connect(db,u);bill(db,c);
 db.prepare("UPDATE rental_connections SET status='ended',ended_at=?,ended_by='owner' WHERE id=?").run(now(),c);
 db.prepare('UPDATE rental_units SET archived_at=?,updated_at=? WHERE id=?').run(now(),now(),u);
 const vacant=unit(db,'owner','No bill yet');
 const rows=read(db,ownerUnitsReportQuery('owner','2026-11'));assert.equal(rows.length,2);assert(rows.find(r=>r.unitId===u).archivedAt);
 assert.equal(read(db,ownerUnitsReportQuery('owner','2026-10')).length,1);
 const single=read(db,ownerUnitsReportQuery('owner','2026-10',u));assert.equal(single.length,1);assert.equal(single[0].billedCents,0);
 assert.equal(rows.find(r=>r.unitId===vacant).billCount,0);db.close();
});

test('old rental records stay with their original owner when a new renter connects',()=>{
 const db=database(),u=unit(db),c=connect(db,u,'former-renter'),old=bill(db,c);payment(db,old,10000,true);
 db.prepare("UPDATE rental_connections SET status='ended',ended_at=?,ended_by='owner' WHERE id=?").run(now(),c);
 const next=connect(db,u,'new-renter');bill(db,next,500000);
 const summary=read(db,ownerUnitsReportQuery('owner','2026-11'));assert.equal(summary.length,1);assert.equal(summary[0].billCount,2);assert.equal(summary[0].billedCents,1300025);
 const rows=read(db,ownerBillsReportQuery('owner','2026-11'));assert.deepEqual(rows.map(r=>r.renterName).sort(),['former-renter','new-renter']);
 assert.equal(read(db,ownerPaymentsReportQuery('new-renter','2026-11')).length,0);db.close();
});

test('CSV quoting preserves Filipino text, quotes, separators and multiline reasons',()=>{
 const input=[['Property','Reason','Amount'],['Peña, "Room 2"','Line one\r\nLine two','8000.25']];
 const csv=csvDocument(input);assert(csv.startsWith('\uFEFF'));assert.deepEqual(parseCsv(csv),input);
 const risky=['=1+1','+1+1','-1+1','@SUM(1)',' \t=HYPERLINK("https://example.invalid")','\r\n=1','＝1','＋1','－1','＠SUM(1)','\u0000=1'];
 for(const text of risky){const value=parseCsv(csvDocument([[text]]))[0][0];assert(value.startsWith('\t'));assert.equal(value.slice(1),text.replaceAll('\u0000',''));}
 assert.equal(csvCell('8000.25'),'"8000.25"');assert.equal(csvCell(null),'""');
});

test('CSV downloads contain complete records beyond a visible page and no duplicate total row',()=>{
 const db=database(),u=unit(db),b=bill(db,connect(db,u));for(let i=0;i<26;i++)payment(db,b,100,true);
 const rows=read(db,ownerPaymentsReportQuery('owner','2026-11'));assert.equal(rows.length,26);
 const csv=parseCsv(paymentReportCsv(rows,now()));assert.equal(csv.length,27);assert.equal(new Set(csv.slice(1).map(r=>r[3])).size,26);
 const unitRows=read(db,ownerUnitsReportQuery('owner','2026-11'));
 assert.equal(parseCsv(unitReportCsv(unitRows,'2026-11',now())).length,2);
 const billRows=parseCsv(billReportCsv(read(db,ownerBillsReportQuery('owner','2026-11')),now()));
 assert.equal(billRows[1][16],'26.00');assert.equal(billRows[1][17],'7974.25');db.close();
});
