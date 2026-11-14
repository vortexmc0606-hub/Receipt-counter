import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_LEARNING, seedTrainingStoreCatalog } from '../../src/lib/learning';

test('training catalog seeds canonical stores and aliases into learning data', () => {
  const seeded = seedTrainingStoreCatalog(EMPTY_LEARNING);
  assert.ok(seeded.stores.length >= 250);
  assert.ok(seeded.stores.some((store) => store.from === 'walmart' && store.name === 'Walmart'));
  assert.ok(seeded.stores.some((store) => store.from === 'mcdonalds' && store.name === "McDonald's"));
  assert.ok(seeded.stores.every((store) => store.count === 0 && store.lastSeen === 0));
  assert.equal(seeded.trainedOn, 0);
});

test('training catalog seeding is idempotent and preserves user corrections', () => {
  const custom = {
    ...EMPTY_LEARNING,
    stores: [{
      from: 'walmart',
      name: 'My Custom Walmart',
      kind: 'Superstore' as const,
      count: 4,
      lastSeen: 123,
    }],
  };
  const once = seedTrainingStoreCatalog(custom);
  const twice = seedTrainingStoreCatalog(once);
  assert.equal(once.stores.find((store) => store.from === 'walmart')?.name, 'My Custom Walmart');
  assert.equal(twice.stores.length, once.stores.length);
  assert.equal(twice.stores.find((store) => store.from === 'walmart')?.count, 4);
});
