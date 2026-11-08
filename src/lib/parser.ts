import type { Category, Receipt, ReceiptItem } from '../types';
import { categorize } from './category';
import { recognizeStore } from './stores';
import { extractTaxRate, hasTaxLabel, resolveTax } from './tax';
import { parseReceiptDate, todayISO } from './dates';

export function guessCategory(name: string): Category {
  return categorize(name);
}

/**
 * Extracts the product/SKU code printed beside an item, e.g. a UPC/EAN barcode
 * number ("0073373104514") or an alphanumeric SKU ("MHK-4471"). Codes are a
 * strong signal for recognising the same product across receipts even when the
 * printed name is garbled, so they are kept with each item.
 *
 * Only a token that is clearly not a price or a pack size is accepted: it must
 * contain no decimal point, be at least five characters long, and either be
 * all digits or mix letters with digits. This keeps "92OZ" and "12.99" out.
 */
export function extractCode(line: string): string | undefined {
  const tokens = line.split(/[\s|]+/);
  for (const raw of tokens) {
    const t = raw.replace(/^[#*.\-•]+/, '').replace(/[.,;:]+$/, '');
    if (t.length < 5 || t.length > 20) continue;
    if (/\./.test(t)) continue; // prices carry a decimal point
    if (!/^[A-Za-z0-9-]+$/.test(t)) continue;
    const digits = (t.match(/\d/g) || []).length;
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    if (digits < 5 && !(digits >= 2 && letters >= 2)) continue;
    // Reject plain words and pack sizes like "100ML" or "500G".
    if (letters === 0 && digits < 8) continue;
    if (/^\d+(ml|g|kg|oz|l|lb|ct|pk|ea|pc|pcs)$/i.test(t)) continue;
    return t.toUpperCase();
  }
  return undefined;
}

/** Keywords that indicate a summary line rather than a purchasable item. */
const NON_ITEM =
  /^(sub\s*-?\s*total|subtotal|total|amount\s*due|balance|change|cash|credit|debit|visa|mastercard|amex|card|payment|tax|vat|gst|hst|tip|gratuity|discount|coupon|savings|tendered|auth|approval|invoice|receipt|order|table|server|cashier|thank|welcome|store|tel|phone|www\.|http|date|time|item\s+qty|qty\s+price|transaction|terminal|ref\b|#\d+)/i;

/**
 * Savings/discount summaries. These carry an amount that looks exactly like a
 * price, so they are the most common thing wrongly captured as a line item
 * ("YOU SAVED 12.35", "TOTAL SAVINGS 12.35", "MEMBER SAVINGS"). The amount is
 * already reflected in the item prices, so counting it again would overstate
 * spending.
 */
const SAVINGS_LINE =
  /\b(you\s+saved|total\s+savings?|member\s+savings?|savings?|saved|discounts?|coupons?|store\s+savings?|bonus\s+savings?|loyalty|rewards?)\b/i;

const ADDRESS_LIKE =
  /^\s*\d+\s+\w+(\s+\w+)*\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|suite|ste)\b/i;

/**
 * Tax summary lines. "SALES TAX 0.66" and "STATE TAX" do not start with the word
 * "tax", so the anchored NON_ITEM pattern misses them and their amount gets read
 * as a purchased item. Any line naming a tax type is a summary, not a product.
 */
const TAX_SUMMARY =
  /\b(sales|state|city|county|local|use|excise|goods\s+and\s+services|value\s+added|liquor|tobacco)\s+tax\b|\b(vat|gst|hst|pst|qst)\b/i;

/** Card/bank payment lines ("VISA CREDIT 12.00", "DEBIT CARD ..."). */
const PAYMENT_LINE =
  /\b(visa|mastercard|master\s+card|amex|american\s+express|discover|debit|credit|eft|e-?transfer|interac|auth|approval)\b/i;

function toNumber(raw: string): number {
  // Handles "1,234.56", "12.50", "12,50" (comma decimal), and trailing minus.
  let s = raw.trim();
  const negative = /-\s*$/.test(s) || /^-/.test(s);
  s = s.replace(/[^0-9.,]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, '');
  } else if (/,\d{2}$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) return NaN;
  return negative ? -n : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * Amounts on a receipt always carry cents ("3.49"), whereas the numbers that
 * sit next to item names are usually quantities or pack sizes ("120", "92OZ").
 * Requiring a decimal point is what stops "HUGGIES DIAPERS 120" being read as a
 * $120 item. Values immediately followed by "%" are rates, not amounts.
 */
function decimalMoney(line: string): number[] {
  const out: number[] = [];
  const re = /\d[\d,]*(?:\.\d{1,2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const after = line.slice(m.index + m[0].length);
    if (/^\s*%/.test(after)) continue;
    const v = toNumber(m[0]);
    if (!Number.isNaN(v)) out.push(v);
  }
  return out;
}

function lastMoney(line: string): number | null {
  const vals = decimalMoney(line);
  return vals.length ? vals[vals.length - 1] : null;
}

/**
 * Tesseract frequently confuses digits that share strokes — 8↔6, 0↔8, 5↔6,
 * 1↔7. When a printed figure disagrees with the value it must equal (a printed
 * total vs. subtotal + tax, or the sum of the line items), look for a single
 * misread digit that reconciles them, so "61.41" can be repaired to "81.41".
 */
const DIGIT_CONFUSIONS: Record<string, string> = {
  '0': '869',
  '1': '74',
  '2': '7',
  '3': '89',
  '4': '91',
  '5': '6',
  '6': '850',
  '7': '12',
  '8': '603',
  '9': '438',
};

function repairMisreadAmount(printed: number, targets: number[]): number | null {
  const valid = targets.filter((t) => Number.isFinite(t) && t > 0);
  if (!valid.length) return null;
  const s = printed.toFixed(2);
  const variants = new Set<string>();
  for (let i = 0; i < s.length; i++) {
    const alts = DIGIT_CONFUSIONS[s[i]];
    if (!alts) continue;
    for (const a of alts) variants.add(s.slice(0, i) + a + s.slice(i + 1));
  }
  for (const v of variants) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) continue;
    for (const t of valid) {
      if (Math.abs(n - t) <= 0.02) return t;
    }
  }
  return null;
}

/** Strips prices, quantities and stray symbols to leave a readable item name. */
function itemName(line: string): string {
  return line
    .replace(/\d[\d,]*(?:\.\d{1,2})/g, ' ')
    .replace(/\b\d+\s*[xX@*]\s*/g, ' ')
    .replace(/[%$€£₹¥]/g, ' ')
    .replace(/^[#*.\-•\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function quantityFrom(line: string): number {
  const m = line.match(/(\d{1,3})\s*[xX@*]\s*\d/);
  return m ? parseInt(m[1], 10) || 1 : 1;
}

function detectCurrency(text: string): string | null {
  if (/\bEUR\b|€/.test(text)) return '€';
  if (/\bGBP\b|£/.test(text)) return '£';
  if (/\bINR\b|₹/.test(text)) return '₹';
  if (/\bJPY\b|¥/.test(text)) return '¥';
  if (/\bUSD\b|\$/.test(text)) return '$';
  return null;
}

export interface ParsedReceipt {
  merchant: string;
  date: string;
  currency: string | null;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  /** Tax rate in percent, when the receipt prints one (e.g. 8.25). */
  taxRate?: number;
  total: number;
  /** Amount the receipt reports as saved, if any. Never added to items or total. */
  savings?: number;
  rawText: string;
  warnings: string[];
  /**
   * How internally consistent the parse is (higher is better). Used to choose
   * between OCR passes; it rewards a total that reconciles with the subtotal,
   * tax and line items without any digit repair.
   */
  quality: number;
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const warnings: string[] = [];
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0);

  // ---- date ----
  const found = parseReceiptDate(rawText);
  const dateFound = found !== null;
  const date = found?.iso ?? todayISO();
  if (!found) warnings.push('No date found on the receipt; defaulted to today.');

  // ---- merchant: first line that looks like a name ----
  const merchantLine =
    lines.find(
      (l) =>
        /[A-Za-z]{3,}/.test(l) &&
        !/\d{1,2}[:/]\d{1,2}/.test(l) &&
        !/receipt|invoice|tax|tel|phone/i.test(l) &&
        !ADDRESS_LIKE.test(l) &&
        l.trim().length <= 40,
    ) || lines[0] || 'Unknown merchant';
  let merchant = merchantLine.trim().replace(/\s{2,}/g, ' ');

  // The store is usually printed at the top. Scan the first lines for a known
  // chain first — that catches "WALMART #4521 SUPERCENTER" that the name-like
  // heuristic above would otherwise keep verbatim.
  for (const l of lines.slice(0, 8)) {
    const hit = recognizeStore(l);
    if (hit.known) {
      merchant = hit.name;
      break;
    }
  }

  // ---- totals ----
  const amountOnSummaryLine = (re: RegExp): number | undefined => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (re.test(lines[i])) {
        const v = lastMoney(lines[i]);
        if (v !== null && v > 0) return v;
      }
    }
    return undefined;
  };

  const subtotal = amountOnSummaryLine(/\bsub\s*-?\s*total\b|\bsubtotal\b/i);
  const printedTax = amountOnSummaryLine(/\b(tax|vat|gst|hst|sales\s+tax)\b/i);
  const printedTotal = amountOnSummaryLine(
    /\b(grand\s+total|total\s+due|amount\s+due|balance\s+due|total)\b/i,
  );

  // Tax is often printed as a rate ("SALES TAX 8.25%") rather than an amount.
  // When only a rate is printed, the amount is computed from the base
  // (subtotal, or the sum of the line items). A rate learned for this store on
  // an earlier receipt is applied afterwards, in applyLearning.
  const printedRate = extractTaxRate(rawText) ?? undefined;

  // Savings are reported, not spent — shown to the user but never counted.
  let savings: number | undefined;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (SAVINGS_LINE.test(lines[i])) {
      const v = lastMoney(lines[i]);
      if (v !== null && v > 0) {
        savings = v;
        break;
      }
    }
  }

  // ---- items ----
  const items: ReceiptItem[] = [];
  const pushItem = (name: string, price: number, source: string) => {
    if (!name || name.length < 2 || !/[A-Za-z]/.test(name)) return;
    items.push({
      id: uid(),
      name,
      price: round2(price),
      qty: quantityFrom(source),
      category: categorize(name, { store: merchant }),
      code: extractCode(source),
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 2) continue;
    if (NON_ITEM.test(line)) continue;
    if (TAX_SUMMARY.test(line)) continue;
    if (PAYMENT_LINE.test(line)) continue;
    if (SAVINGS_LINE.test(line)) continue;
    if (ADDRESS_LIKE.test(line)) continue;

    const nameHere = itemName(line);
    const priceHere = lastMoney(line);

    // (a) Name and price on the same line.
    if (priceHere !== null && priceHere > 0 && nameHere.length >= 2 && /[A-Za-z]/.test(nameHere)) {
      pushItem(nameHere, priceHere, line);
      continue;
    }

    // (b) Name on this line, price on the next — the common layout on thermal
    // receipts, where the item name is followed by "1 @ 3.49   3.49".
    if (priceHere === null && /[A-Za-z]{3,}/.test(line)) {
      const next = (lines[i + 1] ?? '').trim();
      const nextPrice = next ? lastMoney(next) : null;
      const nextIsPriceOnly =
        nextPrice !== null &&
        nextPrice > 0 &&
        !/[A-Za-z]{3,}/.test(next.replace(/[xX@*]/g, ''));
      if (nextIsPriceOnly && nextPrice !== null) {
        pushItem(nameHere, nextPrice, next);
        i++; // consume the price line
      }
    }
  }

  // ---- reconcile total ----
  const itemsSum = round2(items.reduce((s, it) => s + it.price, 0));

  // Decide the tax amount: a printed amount wins; otherwise calculate it from
  // the printed or learned rate.
  const taxResult = resolveTax({
    subtotal,
    itemsSum,
    total: printedTotal,
    tax: printedTax,
    printedRate,
    taxLinePresent: hasTaxLabel(rawText),
  });
  const tax = taxResult.tax;
  const taxRate = taxResult.rate;
  if (taxResult.note) warnings.push(taxResult.note);

  const expected = subtotal !== undefined ? round2(subtotal + (tax ?? 0)) : undefined;
  const agrees = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.5, b * 0.02);

  let total: number;
  let repaired = false;
  if (printedTotal !== undefined && printedTotal > 0) {
    // Cross-check the printed total against every independent figure we trust:
    // subtotal + tax, the subtotal itself, and the sum of the line items.
    const targets = [expected, subtotal, itemsSum > 0 ? itemsSum : undefined].filter(
      (v): v is number => v !== undefined && v > 0,
    );
    const agree = targets.find((t) => agrees(printedTotal, t));

    if (agree !== undefined) {
      total = printedTotal;
    } else {
      // A printed total that matches nothing almost always means a digit was
      // misread. Try to repair a single digit ("61.41" -> "81.41").
      const fixed = repairMisreadAmount(printedTotal, targets);
      if (fixed !== null) {
        warnings.push(
          `The total looked like ${printedTotal.toFixed(2)} but the other figures point to ` +
            `${fixed.toFixed(2)}; used ${fixed.toFixed(2)}. Please double-check.`,
        );
        total = fixed;
        repaired = true;
      } else if (expected !== undefined) {
        warnings.push(
          `Printed total ${printedTotal.toFixed(2)} did not match subtotal + tax ` +
            `(${expected.toFixed(2)}); used ${expected.toFixed(2)}. Please double-check.`,
        );
        total = expected;
        repaired = true;
      } else {
        warnings.push(
          `The printed total (${printedTotal.toFixed(2)}) did not match the line items ` +
            `(${itemsSum.toFixed(2)}). Please check both against the photo.`,
        );
        total = printedTotal;
      }
    }
  } else if (expected !== undefined) {
    total = expected;
    warnings.push('No total found on the receipt; calculated it from subtotal and tax.');
  } else {
    total = itemsSum;
    if (items.length) warnings.push('No total found on the receipt; summed the line items instead.');
  }

  // ---- quality score (higher is better) ----
  let quality = 0;
  if (printedTotal !== undefined && !repaired) quality += 2;
  if (expected !== undefined && agrees(total, expected)) quality += 2;
  if (itemsSum > 0 && (subtotal !== undefined || printedTotal !== undefined)) {
    const ref = subtotal ?? printedTotal ?? 0;
    if (ref > 0) {
      const gap = Math.abs(itemsSum - ref);
      quality += gap <= Math.max(0.5, ref * 0.02) ? 3 : gap <= Math.max(1, ref * 0.1) ? 1 : 0;
    }
  }
  quality += Math.min(3, items.length / 3);
  if (dateFound) quality += 1;
  if (!repaired) quality += 1;
  quality -= warnings.length * 0.5;

  if (items.length === 0) {
    warnings.push('No line items were detected — add them manually.');
  } else {
    // Compare the items against whichever printed figure is most trustworthy.
    // A large gap means OCR merged or dropped digits on the item lines.
    const reference = subtotal ?? (printedTotal !== undefined ? printedTotal : undefined);
    if (reference !== undefined && reference > 0) {
      const gap = Math.abs(itemsSum - reference);
      if (gap > Math.max(1, reference * 0.15)) {
        warnings.push(
          'The line items do not add up to the receipt total — some prices were probably ' +
            'misread. Please check each item against the photo.',
        );
      }
    }
  }

  return {
    merchant,
    date,
    currency: detectCurrency(rawText),
    items,
    subtotal,
    tax,
    taxRate,
    total: round2(total),
    savings,
    rawText,
    warnings,
    quality: Math.round(quality * 100) / 100,
  };
}

export function parsedToReceipt(p: ParsedReceipt, fallbackCurrency: string): Receipt {
  return {
    id: uid(),
    merchant: p.merchant,
    date: p.date,
    currency: p.currency || fallbackCurrency,
    items: p.items,
    subtotal: p.subtotal,
    tax: p.tax,
    taxRate: p.taxRate,
    total: p.total,
    savings: p.savings,
    rawText: p.rawText,
    createdAt: Date.now(),
  };
}

export { uid };
