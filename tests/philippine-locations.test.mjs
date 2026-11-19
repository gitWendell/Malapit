import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findLocationCity,findLocationBarangay,barangayLabel,cityMapView,isMetroManilaCity} from '../lib/philippine-locations.ts';
const root=new URL('../public/locations/',import.meta.url);
const index=JSON.parse(readFileSync(new URL('index.json',root),'utf8'));
const area=code=>JSON.parse(readFileSync(new URL('areas/'+code+'.json',root),'utf8'));

test('bundled nationwide lists have consistent city, province and barangay relationships',()=>{
  assert.equal(index.cities.length,1642);
  const provinces=new Set(index.provinces.map(p=>p.code)),seen=new Set(),areas=new Map();
  let count=0;
  for(const city of index.cities){
    assert.match(city.code,/^\d{10}$/);
    assert.ok(!seen.has(city.code));seen.add(city.code);
    assert.ok(provinces.has(city.provinceCode));
    assert.ok(city.label.length<=80);
    if(!areas.has(city.areaCode))areas.set(city.areaCode,area(city.areaCode));
    const barangays=areas.get(city.areaCode).cities[city.code];assert.ok(barangays.length);
    for(const barangay of barangays){assert.ok(barangayLabel(barangay).length<=100);if(barangay.point){assert.ok(barangay.point[0]>=4.5&&barangay.point[0]<=21.5);assert.ok(barangay.point[1]>=116&&barangay.point[1]<=127);}}
    count+=barangays.length;
  }
  assert.equal(count,42010);
});

test('Cebu defaults resolve to the correct city and its 80 barangays',()=>{
  const city=findLocationCity(index.cities,'Cebu City');
  assert.equal(city.code,'0730600000');assert.equal(city.provinceName,'Cebu');
  const barangays=area(city.areaCode).cities[city.code];assert.equal(barangays.length,80);
  for(const name of ['Lahug','Mabolo','Banilad'])assert.equal(findLocationBarangay(barangays,name)?.name,name);
  assert.deepEqual(cityMapView(city,index.cities),{center:[10.3157,123.8854],zoom:13});
});

test('the same barangay name remains scoped to its selected city',()=>{
  const cebu=findLocationCity(index.cities,'Cebu City'),mandaue=findLocationCity(index.cities,'Mandaue City');
  const a=findLocationBarangay(area(cebu.areaCode).cities[cebu.code],'Banilad');
  const b=findLocationBarangay(area(mandaue.areaCode).cities[mandaue.code],'Banilad');
  assert.ok(a&&b);assert.notEqual(a.code,b.code);
});

test('ambiguous municipalities require a province rather than silently picking the first match',()=>{
  assert.equal(findLocationCity(index.cities,'San Jose'),undefined);
  const city=findLocationCity(index.cities,'San Jose, Batangas');assert.ok(city);assert.equal(city.provinceName,'Batangas');
  assert.equal(findLocationCity(index.cities,'City of Makati')?.name,'Makati');
});

test('current jurisdiction changes and the Q3 spelling correction are preserved',()=>{
  const makati=findLocationCity(index.cities,'Makati'),taguig=findLocationCity(index.cities,'Taguig');
  assert.equal(findLocationBarangay(area(makati.areaCode).cities[makati.code],'Cembo'),undefined);
  assert.ok(findLocationBarangay(area(taguig.areaCode).cities[taguig.code],'Cembo'));
  const city=findLocationCity(index.cities,'Cabanglasan');
  assert.ok(findLocationBarangay(area(city.areaCode).cities[city.code],'Lambagan'));
  assert.equal(findLocationBarangay(area(city.areaCode).cities[city.code],'Lambangan'),undefined);
});

test('qualified city labels continue to work in Metro Manila searches',()=>{
  for(const name of ['Makati','Makati, Metro Manila','Quezon City, Metro Manila','Pateros, Metro Manila'])assert.equal(isMetroManilaCity(name),true,name);
  for(const name of ['San Juan, Batangas','Cebu City, Cebu'])assert.equal(isMetroManilaCity(name),false,name);
});

test('places without old map points get a province overview rather than a wrong property pin',()=>{
  const city=findLocationCity(index.cities,'Kalayaan, Palawan');
  const view=cityMapView(city,index.cities);assert.equal(view.zoom,10);
  assert.ok(view.center[0]>7&&view.center[0]<13);assert.ok(view.center[1]>116&&view.center[1]<121);
});
