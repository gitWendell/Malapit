import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {PILOT_LIMITS} from '../lib/pilot-limits.ts';
import {photoValidationError,jpegDimensions} from '../lib/photo-validation.ts';

const now=()=>new Date().toISOString();
function database(){const db=new DatabaseSync(':memory:');for(const name of ['0000_amused_prowler.sql','0001_uneven_captain_midlands.sql'])db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));return db}
function photo(db,{id=crypto.randomUUID(),owner='owner',bytes=100,state='ready'}={}){db.prepare('INSERT INTO media(id,owner_id,content_type,created_at,byte_size,state) VALUES(?,?,?,?,?,?)').run(id,owner,'image/jpeg',now(),bytes,state);return id}
function listing(db,id,image,{owner='owner',status='pending',photos=[`/api/media/${image}`]}={}){db.prepare('INSERT INTO listings(id,owner_id,owner_name,title,city,status,data,created_at,confirmed_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,owner,'Test Owner','Test property','Makati',status,JSON.stringify({photos}),now(),now())}
test('the 31st property is rejected atomically and changing existing rows does not consume another place',()=>{
  const db=database(),image=photo(db);for(let i=0;i<30;i++)listing(db,String(i),image);
  assert.throws(()=>listing(db,'overflow',image),/PILOT_PROPERTIES_FULL/);
  db.prepare("UPDATE listings SET status='published' WHERE id='0'").run();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM listings').get().n,30);
  db.prepare("UPDATE listings SET status='withdrawn' WHERE id='0'").run();listing(db,'replacement',image);
  assert.throws(()=>db.prepare("UPDATE listings SET status='pending' WHERE id='0'").run(),/PILOT_PROPERTIES_FULL/);db.close();
});
test('pending and failed uploads count against the global byte budget',()=>{
  const db=database(),image=photo(db,{state:'failed'});db.prepare('UPDATE media SET byte_size=? WHERE id=?').run(PILOT_LIMITS.storageBytes,image);
  assert.throws(()=>photo(db,{owner:'another'}),/PILOT_STORAGE_FULL/);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM media').get().n,1);db.close();
});
test('photo reservations stop at the global photo count',()=>{
  const db=database();for(let i=0;i<PILOT_LIMITS.storedPhotos;i++)photo(db,{owner:'owner-'+i});assert.throws(()=>photo(db,{owner:'new-owner'}),/PILOT_STORAGE_FULL/);db.close();
});
test('deleting uploads does not reset the per-owner daily attempt limit',()=>{
  const db=database();for(let i=0;i<10;i++){const id=photo(db);db.prepare('DELETE FROM media WHERE id=?').run(id)}assert.throws(()=>photo(db),/PILOT_UPLOAD_LIMIT/);assert.equal(db.prepare('SELECT attempts FROM upload_usage').get().attempts,10);db.close();
});
test('the database rejects unready photos, another owner’s photo, and more than five photos',()=>{
  const db=database(),image=photo(db),pending=photo(db,{state:'pending'}),other=photo(db,{owner:'other'});
  for(const item of [pending,other,'missing'])assert.throws(()=>listing(db,crypto.randomUUID(),item),/PILOT_PHOTO_REFERENCE/);
  assert.throws(()=>listing(db,'too-many',image,{photos:Array(6).fill(`/api/media/${image}`)}),/PILOT_PHOTO_REFERENCE/);
  listing(db,'valid',image);db.prepare("UPDATE media SET state='deleting' WHERE id=?").run(image);
  assert.throws(()=>db.prepare("UPDATE listings SET data=? WHERE id='valid'").run(JSON.stringify({photos:[`/api/media/${image}`]})),/PILOT_PHOTO_REFERENCE/);db.close();
});
test('valid stock photos pass size checks while oversized and disguised inputs are rejected',()=>{
  const image=new Uint8Array(readFileSync(new URL('../public/homes/home-1.jpg',import.meta.url)));assert(jpegDimensions(image));assert.equal(photoValidationError(image,'image/jpeg'),null);
  assert(photoValidationError(new Uint8Array(PILOT_LIMITS.photoBytes+1),'image/jpeg'));assert(photoValidationError(new TextEncoder().encode('not an image'),'image/jpeg'));assert(photoValidationError(image,'image/png'));
  const huge=image.slice();let patched=false;for(let offset=2;offset<huge.length-8;offset++){if(huge[offset]===255&&[192,194].includes(huge[offset+1])){huge[offset+5]=255;huge[offset+6]=255;patched=true;break}}assert(patched);assert(photoValidationError(huge,'image/jpeg'));
});
