import type { ParsedReceipt } from './parser';
import type { Category, Receipt, ReceiptItem } from '../types';

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

export interface LearningData {
  version: 1;
  items: LearnedItem[];
  tokenFixes: TokenFix[];
  junk: JunkLine[];
  /** Number of receipts whose corrections have been folded in. */
  trainedOn: number;
}

export const EMPTY_LEARNING: LearningData = {
  version: 1,
  items: [],
  tokenFixes: [],
  junk: [],
  trainedOn: 0,
};

const MAX_ITEMS = 2000;
const MAX_FIXES = 1500;
const MAX_JUNK = 500;

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
 * Replays everything learned onto a freshly parsed receipt: renames/reclassifies
 * known lines, drops known junk lines, and applies token fixes.
 */
export function applyLearning(parsed: ParsedReceipt, data: LearningData): AppliedLearning {
  const applied: string[] = [];
  const junkSet = new Set(data.junk.map((j) => j.text));
  const exact = new Map(data.items.map((i) => [i.from, i]));

  const items: ReceiptItem[] = [];
  for (const item of parsed.items) {
    const key = normalizeName(item.name);

    if (junkSet.has(key)) {
      applied.push(`Dropped known junk line "${item.name}"`);
      continue;
    }

    // Prefer an exact remembered line: it carries the correct full name and
    // casing. Only fall back to per-token fixes when there is no exact match.
    const learned = exact.get(key);
    if (learned) {
      let next: ReceiptItem = { ...item };
      if (learned.name && learned.name !== next.name) {
        applied.push(`Remembered "${next.name}" → "${learned.name}"`);
        next = { ...next, name: learned.name };
      }
      if (learned.price !== undefined && Math.abs(learned.price - next.price) > 0.001) {
        applied.push(`Remembered price ${next.price} → ${learned.price} for "${next.name}"`);
        next = { ...next, price: learned.price };
      }
      if (learned.category && learned.category !== next.category) {
        next = { ...next, category: learned.category };
      }
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

  return {
    result: { ...parsed, items },
    applied,
  };
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
): LearningData {
  const next: LearningData = {
    version: 1,
    items: data.items.map((i) => ({ ...i })),
    tokenFixes: data.tokenFixes.map((t) => ({ ...t })),
    junk: data.junk.map((j) => ({ ...j })),
    trainedOn: data.trainedOn,
  };
  const finalByKey = new Map(final.items.map((i) => [normalizeName(i.name), i]));
  let learnedSomething = false;

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
    if (tk !== pk) {
      rememberLine(next, pk, target, priceChanged);
      learnTokenFixes(pk, target.name, next);
      learnedSomething = true;
    } else if (priceChanged) {
      rememberLine(next, pk, target, true);
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
export function learningSummary(data: LearningData): { lines: number; fixes: number; junk: number; trainedOn: number } {
  return {
    lines: data.items.length,
    fixes: data.tokenFixes.length,
    junk: data.junk.length,
    trainedOn: data.trainedOn,
  };
}
