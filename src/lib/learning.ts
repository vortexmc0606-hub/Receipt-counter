import type { ParsedReceipt } from './parser';
import type { Category, Receipt, ReceiptItem } from '../types';
import { recognizeStore, storeKind, type StoreKind } from './stores';
import { hasTaxLabel, rateFromAmounts, round2, taxFromRate } from './tax';

/**
 * A lightweight, on-device learning layer.
 *
 * The app cannot retrain Tesseract or a vision model from the browser, so
 * instead it learns from the corrections you make in the review screen and
 * replays them on future scans. Over a few receipts this removes the repetitive
 * fixes — a misread brand name, a store's junk header line, a price that is
 * always misread the same way.
 *
 * Three things are learned:
 *  - exact lines: the same OCR line always maps to the same item;
 *  - token fixes: recurring letter confusions inside item names;
 *  - junk lines: non-item lines (loyalty banners, footers) that keep being
 *    deleted.
 *
 * Everything lives in IndexedDB on this device and can be exported as JSON.
 */

export interface LearnedItem {
  /** Normalised OCR name that was corrected. */
  from: string;
  name: string;
  price?: number;
  category?: Category;
  /** Product/SKU code seen with this line, used to match across receipts. */
  code?: string;
  count: number;
  lastSeen: number;
}

export interface TokenFix {
  from: string;
  to: string;
  count: number;
}

export interface JunkLine {
  text: string;
  count: number;
}

/**
 * A store the app had not seen before. The printed header is remembered so the
 * same store is recognised (and grouped) on every later receipt, growing the
 * store list with use.
 */
export interface LearnedStore {
  /** Normalised printed header that was seen. */
  from: string;
  /** Canonical display name to use for it. */
  name: string;
  kind: StoreKind;
  count: number;
  lastSeen: number;
}

/**
 * The tax rate a store charges, learned from receipts that print one (or from
 * the amount and base). Later receipts from the same store can have their tax
 * calculated even when the rate is not printed.
 */
export interface LearnedTaxRate {
  /** Normalised store name this rate applies to. */
  store: string;
  /** Rate in percent (e.g. 8.25). */
  rate: number;
  count: number;
  lastSeen: number;
}

export interface LearningData {
  version: 1;
  items: LearnedItem[];
  tokenFixes: TokenFix[];
  junk: JunkLine[];
  stores: LearnedStore[];
  taxRates: LearnedTaxRate[];
  /** Number of receipts whose corrections have been folded in. */
  trainedOn: number;
}

export const EMPTY_LEARNING: LearningData = {
  version: 1,
  items: [],
  tokenFixes: [],
  junk: [],
  stores: [],
  taxRates: [],
  trainedOn: 0,
};

const MAX_ITEMS = 2000;
const MAX_FIXES = 1500;
const MAX_JUNK = 500;
const MAX_STORES = 1000;
const MAX_TAX_RATES = 500;

/** Lowercases and strips punctuation/spacing so near-identical lines match. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when a token is letters only — the safe kind to auto-correct. */
function isAlphaToken(t: string): boolean {
  return /^[a-z]{2,}$/i.test(t);
}

/** Applies learned per-token letter fixes to a single item name. */
export function applyTokenFixes(name: string, fixes: TokenFix[]): string {
  if (!fixes.length) return name;
  const map = new Map(fixes.map((f) => [f.from.toLowerCase(), f.to]));
  return name
    .split(/(\s+)/)
    .map((part) => {
      if (!isAlphaToken(part)) return part;
      const hit = map.get(part.toLowerCase());
      return hit ?? part;
    })
    .join('');
}

export interface AppliedLearning {
  result: ParsedReceipt;
  applied: string[];
}

/**
 * Replays safe corrections onto a freshly parsed receipt: renames/reclassifies
 * known lines, drops known junk lines, and applies token fixes. Historical item
 * prices are never replayed because the current transaction is authoritative.
 * Also fills in a tax amount when the receipt shows a tax line but no readable figure.
 */
export function applyLearning(
  parsed: ParsedReceipt,
  data: LearningData,
  options: { defaultTaxRate?: number } = {},
): AppliedLearning {
  const applied: string[] = [];
  const junkSet = new Set(data.junk.map((j) => j.text));
  const exact = new Map(data.items.map((i) => [i.from, i]));
  // A product code is the most reliable key: the same SKU is the same product
  // even when the printed name is read differently each time.
  const byCode = new Map<string, LearnedItem>();
  for (const i of data.items) {
    if (i.code && !byCode.has(i.code)) byCode.set(i.code, i);
  }

  const items: ReceiptItem[] = [];
  for (const item of parsed.items) {
    const key = normalizeName(item.name);

    if (junkSet.has(key)) {
      applied.push(`Dropped known junk line "${item.name}"`);
      continue;
    }

    // Prefer a code match, then an exact remembered line; both carry the
    // correct full name and casing. Fall back to per-token fixes otherwise.
    const learned = (item.code ? byCode.get(item.code) : undefined) ?? exact.get(key);
    if (learned) {
      let next: ReceiptItem = { ...item };
      if (learned.name && learned.name !== next.name) {
        applied.push(`Remembered "${next.name}" → "${learned.name}"`);
        next = { ...next, name: learned.name };
      }
      // A learned price is historical evidence, not the price on this receipt.
      // Promotions, package sizes, regional pricing and inflation can all change
      // it, so always preserve the amount OCR read from the current transaction.
      if (learned.category && learned.category !== next.category) {
        next = { ...next, category: learned.category };
      }
      if (!next.code && learned.code) next = { ...next, code: learned.code };
      items.push(next);
      continue;
    }

    let next: ReceiptItem = { ...item };
    const fixedName = applyTokenFixes(next.name, data.tokenFixes);
    if (fixedName !== next.name) {
      applied.push(`Fixed name "${next.name}" → "${fixedName}"`);
      next = { ...next, name: fixedName };
    }
    items.push(next);
  }

  const withTax = applyLearnedTax({ ...parsed, items }, data, applied);
  return {
    result: applyDefaultTax(withTax, options.defaultTaxRate ?? 0, applied),
    applied,
  };
}

/**
 * Fills in a tax amount from the user's default rate, but only when the receipt
 * shows a tax line whose amount could not be read. This never invents tax for a
 * receipt that appears to have none.
 */
function applyDefaultTax(parsed: ParsedReceipt, rate: number, applied: string[]): ParsedReceipt {
  if (!(rate > 0) || parsed.tax !== undefined) return parsed;
  if (!hasTaxLabel(parsed.rawText)) return parsed;
  const itemsSum = round2(parsed.items.reduce((s, i) => s + i.price, 0));
  const base = parsed.subtotal ?? itemsSum;
  if (!(base > 0)) return parsed;
  const tax = taxFromRate(base, rate);
  if (!(tax > 0)) return parsed;
  applied.push(`Applied your default tax rate ${rate}%: tax ${tax.toFixed(2)} added.`);
  const total = parsed.total > base + 0.005 ? parsed.total : round2(base + tax);
  return { ...parsed, tax, taxRate: rate, total };
}

/**
 * Applies a location-based tax estimate when the receipt shows a tax line but no
 * readable amount, and the store has no learned rate. The estimate is the lowest
 * priority source of tax, so it only fills a genuine gap — it never overrides a
 * printed amount, a printed rate, or a rate learned for the store.
 */
export function applySmartTax(
  parsed: ParsedReceipt,
  rate: number,
  label: string,
  applied: string[],
): ParsedReceipt {
  if (!(rate > 0) || parsed.tax !== undefined) return parsed;
  if (!hasTaxLabel(parsed.rawText)) return parsed;
  const itemsSum = round2(parsed.items.reduce((s, i) => s + i.price, 0));
  const base = parsed.subtotal ?? itemsSum;
  if (!(base > 0)) return parsed;
  const tax = taxFromRate(base, rate);
  if (!(tax > 0)) return parsed;
  applied.push(`Estimated tax from your location — ${label}: tax ${tax.toFixed(2)} added.`);
  const total = parsed.total > base + 0.005 ? parsed.total : round2(base + tax);
  return { ...parsed, tax, taxRate: rate, total };
}

/**
 * Applies a store's learned tax rate when the receipt shows a tax line but no
 * usable amount. Requiring the tax line keeps a genuinely tax-free receipt from
 * being given tax it never had. A note explains where the amount came from.
 */
function applyLearnedTax(parsed: ParsedReceipt, data: LearningData, applied: string[]): ParsedReceipt {
  if (parsed.tax !== undefined && parsed.tax > 0) return parsed;
  if (!hasTaxLabel(parsed.rawText)) return parsed;
  const rate = taxRateFor(parsed.merchant, data);
  if (rate === undefined) return parsed;
  const itemsSum = round2(parsed.items.reduce((s, i) => s + i.price, 0));
  const base = parsed.subtotal ?? itemsSum;
  if (!(base > 0)) return parsed;
  const tax = taxFromRate(base, rate);
  if (!(tax > 0)) return parsed;
  applied.push(
    `Applied the tax rate learned for ${parsed.merchant} (${rate}%): tax ${tax.toFixed(2)} added.`,
  );
  const total = parsed.total > base + 0.005 ? parsed.total : round2(base + tax);
  return { ...parsed, tax, taxRate: rate, total };
}

function bump<T extends { count: number }>(arr: T[], match: (x: T) => boolean, make: () => T, cap: number): void {
  const found = arr.find(match);
  if (found) {
    found.count += 1;
    return;
  }
  if (arr.length >= cap) arr.shift();
  arr.push(make());
}

/** Records (or refreshes) an exact-line mapping. */
function rememberLine(data: LearningData, from: string, target: ReceiptItem, priceMatters: boolean): void {
  const existing = data.items.find((i) => i.from === from);
  if (existing) {
    existing.name = target.name;
    existing.category = target.category;
    if (priceMatters) existing.price = target.price;
    if (target.code) existing.code = target.code;
    existing.count += 1;
    existing.lastSeen = Date.now();
    return;
  }
  if (data.items.length >= MAX_ITEMS) data.items.shift();
  data.items.push({
    from,
    name: target.name,
    price: priceMatters ? target.price : undefined,
    category: target.category,
    code: target.code,
    count: 1,
    lastSeen: Date.now(),
  });
}

/**
 * Learns from a save by diffing what the reader produced against what the user
 * finally saved. Called automatically after every reviewed scan.
 */
export function learnFromSave(
  original: ParsedReceipt,
  final: Receipt,
  data: LearningData,
  defaultTaxRate = 0,
): LearningData {
  const next: LearningData = {
    version: 1,
    items: data.items.map((i) => ({ ...i })),
    tokenFixes: data.tokenFixes.map((t) => ({ ...t })),
    junk: data.junk.map((j) => ({ ...j })),
    stores: (data.stores ?? []).map((s) => ({ ...s })),
    taxRates: (data.taxRates ?? []).map((t) => ({ ...t })),
    trainedOn: data.trainedOn,
  };
  const finalByKey = new Map(final.items.map((i) => [normalizeName(i.name), i]));
  let learnedSomething = false;

  // Remember the tax rate this store charges, so tax can be calculated on later
  // receipts even when the rate is not printed. Prefer the printed rate; fall
  // back to the rate implied by the tax amount and its base, or to the user's
  // default rate when the receipt carries none.
  const taxStore = normalizeName(final.merchant || original.merchant || '');
  if (taxStore.length >= 3) {
    const base = final.subtotal ?? round2(final.items.reduce((s, i) => s + i.price, 0));
    const rate =
      final.taxRate ??
      rateFromAmounts(final.tax ?? 0, base) ??
      original.taxRate ??
      (hasTaxLabel(original.rawText) ? defaultTaxRate || undefined : undefined);
    if (rate !== undefined) bumpTaxRate(next, taxStore, rate);
  }

  // Remember the store. If the header the reader produced was mapped to a
  // different canonical name than what the user saved, teach that mapping.
  const rawStore = (original.merchant || '').trim();
  if (rawStore && final.merchant) {
    const from = normalizeName(rawStore);
    if (from.length >= 3) {
      const match = recognizeStore(rawStore, final.items, next.stores);
      if (!match.known || match.name !== final.merchant) {
        const kind = match.kind !== 'Other' ? match.kind : storeKind(final.merchant);
        bumpStore(next, from, final.merchant, kind);
        learnedSomething = true;
      } else if (match.known && !next.stores.some((s) => s.from === from)) {
        // First sighting of a known chain: record it so it groups consistently.
        bumpStore(next, from, match.name, match.kind);
      }
    }
  }

  for (const pred of original.items) {
    const pk = normalizeName(pred.name);
    let target = finalByKey.get(pk);

    // If the exact name was renamed, look for a saved item with a close name.
    if (!target) {
      target = final.items.find((i) => {
        const ik = normalizeName(i.name);
        return ik.length > 2 && (ik.includes(pk) || pk.includes(ik) || sameTokens(pk, ik));
      });
    }

    if (!target) {
      // The predicted line is gone: the user judged it not to be an item.
      bump(next.junk, (j) => j.text === pk, () => ({ text: pk, count: 1 }), MAX_JUNK);
      learnedSomething = true;
      continue;
    }

    const tk = normalizeName(target.name);
    const priceChanged = Math.abs(target.price - pred.price) > 0.001;
    const categoryChanged = target.category !== pred.category;
    // Remember the line when anything about it was corrected, and also when a
    // product code is present — the code→name mapping teaches future scans even
    // when this particular read happened to be correct.
    if (tk !== pk || priceChanged || categoryChanged || target.code) {
      rememberLine(next, pk, target, priceChanged);
      if (tk !== pk) learnTokenFixes(pk, target.name, next);
      learnedSomething = true;
    }
  }

  if (learnedSomething) next.trainedOn += 1;
  return next;
}

function sameTokens(a: string, b: string): boolean {
  const at = a.split(' ').filter((t) => t.length > 2);
  const bt = new Set(b.split(' ').filter((t) => t.length > 2));
  if (!at.length || !bt.size) return false;
  return at.some((t) => bt.has(t));
}

/** Records (or refreshes) a learned store mapping. */
function bumpStore(data: LearningData, from: string, name: string, kind: StoreKind): void {
  const existing = data.stores.find((s) => s.from === from);
  if (existing) {
    existing.name = name;
    existing.kind = kind;
    existing.count += 1;
    existing.lastSeen = Date.now();
    return;
  }
  if (data.stores.length >= MAX_STORES) data.stores.shift();
  data.stores.push({ from, name, kind, count: 1, lastSeen: Date.now() });
}

/**
 * Records (or refreshes) the tax rate a store charges. The rate is rounded to a
 * sensible precision so tiny rounding differences between receipts do not create
 * duplicate entries.
 */
function bumpTaxRate(data: LearningData, store: string, rate: number): void {
  const r = round2(rate);
  const existing = data.taxRates.find((t) => t.store === store);
  if (existing) {
    existing.rate = r;
    existing.count += 1;
    existing.lastSeen = Date.now();
    return;
  }
  if (data.taxRates.length >= MAX_TAX_RATES) data.taxRates.shift();
  data.taxRates.push({ store, rate: r, count: 1, lastSeen: Date.now() });
}

/** The learned tax rate (percent) for a store, if one has been learned. */
export function taxRateFor(store: string, data: LearningData): number | undefined {
  const key = normalizeName(store);
  if (!key) return undefined;
  const hit = (data.taxRates ?? []).find((t) => t.store === key);
  return hit?.rate;
}

/**
 * Resolves a receipt's merchant to a canonical store, using everything learned
 * so far. Used when grouping spending by store.
 */
export function storeFor(merchant: string, items: { name: string }[], data: LearningData) {
  return recognizeStore(merchant, items, data.stores ?? []);
}

/** Learns per-token letter fixes from a misread name and its correction. */
function learnTokenFixes(fromNorm: string, toName: string, data: LearningData): void {
  const fromTokens = fromNorm.split(' ').filter(Boolean);
  const toRaw = toName.trim().split(/\s+/).filter(Boolean);
  const toTokens = toRaw.map((t) => normalizeName(t));
  if (fromTokens.length !== toTokens.length) return;
  for (let i = 0; i < fromTokens.length; i++) {
    const a = fromTokens[i];
    const b = toTokens[i];
    if (!a || !b || a === b || !isAlphaToken(a) || !isAlphaToken(b)) continue;
    const target = toRaw[i];
    bump(data.tokenFixes, (t) => t.from === a, () => ({ from: a, to: target, count: 1 }), MAX_FIXES);
  }
}

/** Compact summary for the Learning tab. */
export function learningSummary(data: LearningData): {
  lines: number;
  fixes: number;
  junk: number;
  stores: number;
  taxRates: number;
  trainedOn: number;
} {
  return {
    lines: data.items.length,
    fixes: data.tokenFixes.length,
    junk: data.junk.length,
    stores: (data.stores ?? []).length,
    taxRates: (data.taxRates ?? []).length,
    trainedOn: data.trainedOn,
  };
}
