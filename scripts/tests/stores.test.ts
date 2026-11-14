import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeStore, storeKind } from '../../src/lib/stores';

// Canonical kind for chains the app ships with. The generator derives kinds from
// the training JSON; these assertions keep a regenerated catalog from silently
// changing a well-known store's category.
const EXPECTED: [string, string][] = [
  ['Walmart', 'Superstore'],
  ['Walmart Supercenter', 'Superstore'],
  ['Target', 'Department'],
  ['Costco', 'Wholesale'],
  ['Kroger', 'Grocery'],
  ['Speedway', 'Fuel'],
  ['Shell', 'Fuel'],
  ["McDonald's", 'Fast Food'],
  ['Starbucks', 'Coffee'],
  ['India Bazaar', 'Grocery'],
  ['Nordstrom', 'Department'],
  ['JCPenney', 'Department'],
];

test('known chains map to their canonical store kind', () => {
  for (const [name, kind] of EXPECTED) {
    assert.equal(storeKind(name), kind, `${name} should be ${kind}`);
  }
});

test('recognizeStore finds known chains inside a noisy header', () => {
  const hit = recognizeStore('WALMART #4521 SUPERCENTER');
  assert.equal(hit.known, true);
  assert.equal(hit.kind, 'Superstore');
});

test('a plain unknown name is not forced into a known chain', () => {
  const hit = recognizeStore('CORNER MART 123');
  assert.equal(hit.known, false);
});
