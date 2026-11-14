#!/usr/bin/env node
/**
 * Regenerates src/lib/store-catalog.generated.ts from the training spec
 * (universal_crinkly_receipt_ai_training_v3.json).
 *
 * The spec lists the chains the reader should recognise, grouped by store
 * category. This script turns that grouping into StoreDef entries so the
 * catalog grows by editing the JSON and re-running `npm run gen:stores`,
 * instead of hand-editing a long list.
 *
 * Run: node scripts/generate-store-catalog.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = join(root, 'universal_crinkly_receipt_ai_training_v3.json');
const OUT = join(root, 'src/lib/store-catalog.generated.ts');

/** Store category in the spec -> StoreKind in the app. */
const KIND_BY_CATEGORY = {
  grocery: 'Grocery',
  fast_food: 'Fast Food',
  restaurants: 'Restaurant',
  coffee_and_bakeries: 'Coffee',
  clothing: 'Clothing',
  electronics: 'Electronics',
  home_and_hardware: 'Home Improvement',
  pharmacies: 'Pharmacy',
  gas_and_convenience: 'Convenience',
  discount_and_department: 'Department',
  automotive: 'Automotive',
  entertainment: 'Entertainment',
  pet_stores: 'Pet',
  indian_stores_and_restaurants: 'Market',
  online_and_delivery: 'Online',
};

/** A few Indian chains in the spec are restaurants, not markets. */
const RESTAURANT_WORDS =
  /\b(bhavan|chaat|bawarchi|barbeque|barbecue|chowpatty|dosa|biryani|dhaba|curry|tandoor|kebab|grill|restaurant|kitchen|cafe|coffee|pizza|burger|domino|kfc|subway|noodle|thali)\b/;

/**
 * The spec's coarse categories do not always line up with the app's kinds, and
 * some stores sit in a group that reads wrong on a receipt (a petrol station is
 * not a convenience store; a dollar store is not a department store). These
 * overrides fix the mismatches so the generated catalog matches the app.
 */
const FUEL_BRANDS = new Set([
  'shell',
  'chevron',
  'exxon',
  'mobil',
  'bp',
  'texaco',
  'sunoco',
  'valero',
  'phillips 66',
  'marathon',
  'speedway',
]);

/** Exact-name overrides, keyed by the normalised store name. */
const KIND_OVERRIDES = {
  'dollar general': 'Convenience',
  'dollar tree': 'Convenience',
  'family dollar': 'Convenience',
  "sam's club": 'Wholesale',
  "bj's wholesale club": 'Wholesale',
  'whole foods market': 'Grocery',
  'h mart': 'Market',
  'patel brothers': 'Grocery',
  'india bazaar': 'Grocery',
  'subzi mandi': 'Grocery',
  'apna bazaar': 'Grocery',
  swadeshi: 'Grocery',
  gamestop: 'Entertainment',
  newegg: 'Online',
  'cvs pharmacy': 'Pharmacy',
  'walmart pharmacy': 'Pharmacy',
  'costco pharmacy': 'Pharmacy',
  'kroger pharmacy': 'Pharmacy',
  'krispy kreme': 'Bakery',
  cinnabon: 'Bakery',
  walmart: 'Superstore',
  target: 'Department',
  costco: 'Wholesale',
  speedway: 'Fuel',
  nordstrom: 'Department',
  jcpenney: 'Department',
  uber: 'Other',
  lyft: 'Other',
};

/** The spec's group plus the store name decide the app kind. */
function kindFor(category, key) {
  if (category === 'gas_and_convenience') {
    return FUEL_BRANDS.has(key) ? 'Fuel' : 'Convenience';
  }
  if (category === 'indian_stores_and_restaurants' && RESTAURANT_WORDS.test(key)) {
    return 'Restaurant';
  }
  return KIND_OVERRIDES[key] ?? KIND_BY_CATEGORY[category];
}

/** The apostrophe/dot-stripped spelling, so "McDonald's" also matches "MCDONALDS". */
function compactAlias(name) {
  return name
    .toLowerCase()
    .replace(/['\u2019.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normKey(name) {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const spec = JSON.parse(readFileSync(SPEC, 'utf8'));
const groups = spec.store_categories ?? {};

const seen = new Set();
const entries = [];

for (const [category, names] of Object.entries(groups)) {
  const kind = KIND_BY_CATEGORY[category];
  if (!kind) {
    console.warn(`No StoreKind for category "${category}" — skipping.`);
    continue;
  }
  for (const raw of names) {
    const name = String(raw).trim();
    const key = normKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const thisKind = kindFor(category, key);
    const aliases = [];
    const compact = compactAlias(name);
    if (compact && compact !== key) aliases.push(compact);
    entries.push({ name, kind: thisKind, aliases });
  }
}

const literal = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const body = entries
  .map((e) => {
    const aliases = e.aliases.length ? `, aliases: [${e.aliases.map(literal).join(', ')}]` : '';
    return `  { name: ${literal(e.name)}, kind: ${literal(e.kind)}${aliases} },`;
  })
  .join('\n');

const out = `/**
 * Store catalog generated from universal_crinkly_receipt_ai_training_v3.json.
 * Do not edit by hand — edit the JSON and run \`npm run gen:stores\`.
 */
import type { StoreDef } from './stores';

export const TRAINING_STORE_CATALOG: StoreDef[] = [
${body}
];
`;

writeFileSync(OUT, out);
console.log(`Wrote ${entries.length} stores to ${OUT}`);
