import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTax,
  explainPositionError,
  geoStatusFrom,
  locationFromText,
  locateFromCoords,
} from '../../src/lib/geo';

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

test('location status says No with a reason when the browser is unsupported', () => {
  const s = geoStatusFrom(false, true, 'unsupported');
  assert.equal(s.granted, false);
  assert.match(s.reason, /browser/i);
});

test('location status says No when the page is not secure', () => {
  const s = geoStatusFrom(true, false, 'prompt');
  assert.equal(s.granted, false);
  assert.match(s.reason, /secure/i);
});

test('location status explains a denied permission', () => {
  const s = geoStatusFrom(true, true, 'denied');
  assert.equal(s.granted, false);
  assert.match(s.reason, /blocked|allow/i);
});

test('location status is Yes when everything is available', () => {
  const s = geoStatusFrom(true, true, 'granted');
  assert.equal(s.granted, true);
});

test('position errors get a plain-English reason per code', () => {
  assert.match(explainPositionError(1), /permission/i);
  assert.match(explainPositionError(2), /fix|location services/i);
  assert.match(explainPositionError(3), /too long/i);
  assert.ok(explainPositionError(99).length > 0);
});


test('unknown permission is not reported as granted', () => {
  const s = geoStatusFrom(true, true, 'unknown');
  assert.equal(s.granted, false);
  assert.match(s.reason, /tap|enable location/i);
});
