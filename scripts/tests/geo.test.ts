import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTax, locationFromText, locateFromCoords } from '../../src/lib/geo';

test('a receipt address gives a state and a plausible rate', () => {
  const loc = locationFromText('WHOLE FOODS\n123 MAIN ST\nSACRAMENTO, CA 95814\nTOTAL 42.10');
  assert.ok(loc);
  assert.equal(loc!.region, 'CA');
  assert.equal(loc!.country, 'US');
  const est = estimateTax(loc!);
  assert.ok(est);
  assert.ok(est!.rate >= 7 && est!.rate <= 11, `CA rate looked wrong: ${est!.rate}`);
});

test('a no-sales-tax state estimates zero', () => {
  const loc = locationFromText('PORTLAND, OR 97201');
  assert.equal(loc!.region, 'OR');
  const est = estimateTax(loc!);
  assert.equal(est!.rate, 0);
});

test('coords inside California resolve to CA', () => {
  const loc = locateFromCoords(38.58, -121.49);
  assert.equal(loc!.country, 'US');
  assert.equal(loc!.region, 'CA');
});

test('a UK receipt estimates 20% VAT', () => {
  const loc = locationFromText('TESCO STORES\nUNITED KINGDOM\nVAT 20%');
  assert.equal(loc!.country, 'GB');
  const est = estimateTax(loc!);
  assert.equal(est!.rate, 20);
});

test('unknown countries produce no estimate rather than a wrong one', () => {
  const est = estimateTax({ country: 'ZZ', source: 'gps' });
  assert.equal(est, null);
});
