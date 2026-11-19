import test from 'node:test';
import assert from 'node:assert/strict';
import { initialListingNumbers, listingNumbers, normalizeNumberText } from '../lib/listing-draft.ts';

test('a new listing starts with an empty price and optional costs', () => {
  const draft=initialListingNumbers();
  assert.equal(draft.price,'');
  assert.equal(draft.deposit,'');
  assert.equal(draft.monthlyFees,'');
  assert.equal(listingNumbers({...draft,price:'1000',area:'25'}).price,1000);
});

test('clearing a required amount stays empty and is not silently accepted as zero', () => {
  const draft=initialListingNumbers({price:1000,bedrooms:1});
  draft.price='';draft.bedrooms='';
  assert.equal(draft.price,'');
  assert.ok(Number.isNaN(listingNumbers(draft).price));
  assert.ok(Number.isNaN(listingNumbers(draft).bedrooms));
});

test('blank optional costs mean zero while an explicit studio count remains zero', () => {
  const values=listingNumbers({...initialListingNumbers(),price:'1000',area:'12.5',bedrooms:'0'});
  assert.equal(values.bedrooms,0);
  assert.equal(values.area,12.5);
  assert.equal(values.deposit,0);
  assert.equal(values.advance,0);
  assert.equal(values.monthlyFees,0);
});

test('unnecessary leading zeros are removed without changing decimals or empty entries', () => {
  assert.equal(normalizeNumberText('01000'),'1000');
  assert.equal(normalizeNumberText('0000'),'0');
  assert.equal(normalizeNumberText('000.25'),'0.25');
  assert.equal(normalizeNumberText('0.25'),'0.25');
  assert.equal(normalizeNumberText(''),'');
});

test('editing preserves saved amounts including zero and fractional floor area', () => {
  const initial={price:15000,bedrooms:0,bathrooms:1,area:28.5,deposit:0,advance:15000,monthlyFees:500,minLease:6};
  assert.deepEqual(listingNumbers(initialListingNumbers(initial)),initial);
});
