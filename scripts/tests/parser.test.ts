import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText, extractCode } from '../../src/lib/parser';
import { applySmartTax } from '../../src/lib/learning';

// A realistic thermal receipt. The parser must find the merchant, the date, the
// line items, and reconcile the printed total.
const RECEIPT = `
WALMART SUPERCENTER #4521
1100 COMMERCE WAY
SACRAMENTO, CA 95814
11/06/2026 14:32

BANANAS 1.23
BREAD 2.49
MILK 2 GAL 4.18
SUBTOTAL 7.90
SALES TAX 0.66
TOTAL 8.56
MASTERCARD 8.56
`;

test('a clean receipt parses merchant, date, items and total', () => {
  const p = parseReceiptText(RECEIPT);
  assert.match(p.merchant, /Walmart/i);
  assert.equal(p.date, '2026-11-06');
  assert.equal(p.items.length, 3);
  assert.equal(p.total, 8.56);
  assert.equal(p.tax, 0.66);
});

test('summary and payment lines are not captured as items', () => {
  const p = parseReceiptText(RECEIPT);
  const names = p.items.map((i) => i.name.toLowerCase());
  assert.ok(!names.some((n) => /subtotal|total|mastercard|tax/.test(n)), names.join(', '));
});

test('an item whose name and price sit on separate lines is captured', () => {
  const p = parseReceiptText('STORE\nCOFFEE MAKER\n1 @ 24.99   24.99\nSUBTOTAL 24.99\nTOTAL 24.99');
  const item = p.items.find((i) => /coffee/i.test(i.name));
  assert.ok(item, 'coffee maker should be an item');
  assert.equal(item!.price, 24.99);
});

test('extractCode keeps a SKU but rejects a price or pack size', () => {
  assert.equal(extractCode('LAMP 0073373104514 19.99'), '0073373104514');
  assert.equal(extractCode('MILK 2 GAL 4.18'), undefined);
  assert.equal(extractCode('BREAD 2.49'), undefined);
});

test('a badly misread printed total is repaired from the line items', () => {
  // 41.41 is a single-digit misread of 81.41; the items prove the real figure.
  const p = parseReceiptText(
    'STORE\nBIKE 81.41\nSUBTOTAL 81.41\nTOTAL 41.41',
  );
  assert.equal(p.total, 81.41);
  assert.ok(p.warnings.some((w) => /81\.41/.test(w)));
});

test('smart tax only fills a gap and never overrides a printed amount', () => {
  const withTax = parseReceiptText('STORE\nAPPLE 1.00\nTAX 0.10\nTOTAL 1.10');
  const applied: string[] = [];
  const out = applySmartTax(withTax, 8.85, 'California', applied);
  assert.equal(out.tax, 0.1);
  assert.equal(applied.length, 0);

  const noAmount = parseReceiptText('STORE\nAPPLE 10.00\nSALES TAX\nTOTAL 10.00');
  const applied2: string[] = [];
  const out2 = applySmartTax(noAmount, 8.85, 'California (approx. 8.85% combined)', applied2);
  assert.equal(out2.tax, 0.89);
  assert.equal(applied2.length, 1);
});
