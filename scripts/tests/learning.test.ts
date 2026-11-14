import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLearning, EMPTY_LEARNING, type LearningData } from '../../src/lib/learning';
import type { ParsedReceipt } from '../../src/lib/parser';

test('learned item-name corrections never replace the current receipt price', () => {
  const parsed = {
    merchant: 'Example Market',
    date: '2026-11-09',
    currency: '$',
    items: [{
      id: 'current-1',
      name: 'M1LK',
      price: 3.99,
      qty: 1,
      category: 'Groceries',
    }],
    total: 3.99,
    rawText: 'Example Market\\nM1LK\\n3.99\\nTOTAL 3.99',
    warnings: [],
    quality: 1,
  } as ParsedReceipt;

  const learning: LearningData = {
    ...EMPTY_LEARNING,
    items: [{
      from: 'm1lk',
      name: 'Whole Milk',
      price: 2.49,
      category: 'Groceries',
      count: 3,
      lastSeen: Date.now(),
    }],
  };

  const { result, applied } = applyLearning(parsed, learning);
  assert.equal(result.items[0].name, 'Whole Milk');
  assert.equal(result.items[0].price, 3.99);
  assert.equal(applied.some((message) => message.includes('Remembered price')), false);
});

test('SKU-based learning preserves a changed price on the next purchase', () => {
  const parsed = {
    merchant: 'Example Market',
    date: '2026-11-09',
    currency: '$',
    items: [{
      id: 'current-2',
      name: 'OCR GARBLED',
      price: 4.25,
      qty: 1,
      category: 'Other',
      code: '0123456789012',
    }],
    total: 4.25,
    rawText: 'Example Market\\nTOTAL 4.25',
    warnings: [],
    quality: 1,
  } as ParsedReceipt;

  const learning: LearningData = {
    ...EMPTY_LEARNING,
    items: [{
      from: 'old product name',
      name: 'Whole Milk',
      price: 2.49,
      category: 'Groceries',
      code: '0123456789012',
      count: 5,
      lastSeen: Date.now(),
    }],
  };

  const { result } = applyLearning(parsed, learning);
  assert.equal(result.items[0].name, 'Whole Milk');
  assert.equal(result.items[0].price, 4.25);
  assert.equal(result.items[0].category, 'Groceries');
});
