import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptDate, isValidISODate, addDays, endOfMonth } from '../../src/lib/dates';

test('a labelled date is preferred and normalised', () => {
  const d = parseReceiptDate('STORE\nDATE/TIME: 26/10/24 17:31:52\nTotal 1.89', '2026-11-08');
  assert.equal(d!.iso, '2024-10-26');
});

test('a stray old number does not beat the real date', () => {
  // "320" and an old invoice number look date-like; the real date is labelled.
  const d = parseReceiptDate(
    'REF 9333\nDATE 11/06/26\n(972) 812-0114\nTotal 247.65',
    '2026-11-08',
  );
  assert.equal(d!.iso, '2026-11-06');
});

test('a future date is rejected in favour of a recent one', () => {
  const d = parseReceiptDate('Exp 12/2029\nSold 11/06/26', '2026-11-08');
  assert.equal(d!.iso, '2026-11-06');
});

test('an implausibly old date loses to a plausible one', () => {
  const d = parseReceiptDate('Order 2003-04-05\nPurchased 11/06/2026', '2026-11-08');
  assert.equal(d!.iso, '2026-11-06');
});

test('no date at all returns null', () => {
  assert.equal(parseReceiptDate('STORE\nTOTAL 5.00', '2026-11-08'), null);
});

test('calendar helpers stay in local calendar days', () => {
  assert.ok(isValidISODate('2026-02-28'));
  assert.ok(!isValidISODate('2026-02-30'));
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(endOfMonth('2026-02-10'), '2026-02-28');
});
