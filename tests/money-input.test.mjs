import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyInputDigits, formatMoneyInput, moneyInputCaret } from '../lib/money-input.ts';

test('peso inputs format thousands while keeping the stored amount numeric', () => {
  for (const [typed, digits, display] of [['1000','1000','1,000'],['10,000','10000','10,000'],['0012345','12345','12,345'],['1000000','1000000','1,000,000'],['0','0','0'],['','','']]) {
    assert.equal(moneyInputDigits(typed), digits);
    assert.equal(formatMoneyInput(digits), display);
  }
});

test('peso inputs reject decimals and other characters without changing their meaning', () => {
  for (const typed of ['100.50','1e4','-1000','₱1,000','abc']) assert.equal(moneyInputDigits(typed),null);
});

test('editing keeps the caret next to the same digits after adding separators', () => {
  assert.equal(moneyInputCaret('12,345',0),6);
  assert.equal(moneyInputCaret('12,345',3),3);
  assert.equal(moneyInputCaret('123,456',4),2);
  assert.equal(moneyInputCaret('1,000',4),0);
  assert.equal(moneyInputCaret('',0),0);
});
