import type { Category, Receipt, ReceiptItem } from '../types';

const KEYWORD_CATEGORY: [RegExp, Category][] = [
  [/milk|bread|egg|cheese|yogurt|apple|banana|tomato|onion|potato|rice|pasta|coffee bean|tea|sugar|flour|butter|chicken|beef|pork|fish|vegetable|fruit|cereal|juice|water|snack|chips|chocolate/i, 'Groceries'],
  [/burger|pizza|sandwich|salad|fries|sushi|taco|meal|combo|lunch|dinner|breakfast|latte|cappuccino|espresso|beer|wine|cocktail|soda|dessert|cake/i, 'Dining'],
  [/soap|detergent|shampoo|tissue|paper towel|toothpaste|cleaner|bleach|sponge|trash bag|dish|laundry|napkin/i, 'Household'],
  [/medicine|tablet|capsule|syrup|vitamin|bandage|mask|sanitizer|pain|aspirin|pharmacy|dental/i, 'Health'],
  [/fuel|petrol|diesel|gas|toll|parking|bus|train|taxi|uber|lyft|fare|metro|ride/i, 'Transport'],
  [/cable|charger|battery|headphone|earbud|laptop|phone|usb|adapter|mouse|keyboard|monitor|screen|speaker/i, 'Electronics'],
  [/shirt|tshirt|jeans|pants|dress|shoe|sneaker|jacket|sock|hat|clothing|apparel/i, 'Clothing'],
  [/movie|cinema|ticket|game|netflix|spotify|subscription|concert|museum|book|magazine/i, 'Entertainment'],
];

export function guessCategory(name: string): Category {
  for (const [re, cat] of KEYWORD_CATEGORY) {
    if (re.test(name)) return cat;
  }
  return 'Other';
}

/** Keywords that indicate a summary line rather than a purchasable item. */
const NON_ITEM =
  /^(sub\s*-?\s*total|subtotal|total|amount\s*due|balance|change|cash|credit|debit|visa|mastercard|amex|card|payment|tax|vat|gst|hst|tip|gratuity|discount|coupon|savings|tendered|auth|approval|invoice|receipt|order|table|server|cashier|thank|welcome|store|tel|phone|www\.|http|date|time|item\s+qty|qty\s+price|transaction|terminal|ref\b|#\d+)/i;

const ADDRESS_LIKE =
  /^\s*\d+\s+\w+(\s+\w+)*\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|suite|ste)\b/i;

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

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function parseDate(text: string): string | null {
  const iso = (y: number, mo: number, d: number) => {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const yy = y < 100 ? (y > 70 ? 1900 + y : 2000 + y) : y;
    return `${yy.toString().padStart(4, '0')}-${mo.toString().padStart(2, '0')}-${d
      .toString()
      .padStart(2, '0')}`;
  };

  // 2024-03-05 / 2024.03.05
  let m = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // 05/03/2024 or 03/05/24 (assume day-first when first part > 12, else month-first)
  m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    if (a > 12 && b <= 12) return iso(+m[3], b, a);
    return iso(+m[3], a, b);
  }

  // 05 Mar 2024 / Mar 05, 2024 / 05-MAR-24
  m = text.match(/\b(\d{1,2})[\s-]*([A-Za-z]{3,9})[\s,-]*(\d{2,4})\b/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    if (mo) return iso(+m[3], mo, +m[1]);
  }
  m = text.match(/\b([A-Za-z]{3,9})[\s-]*(\d{1,2})[\s,-]*(\d{2,4})\b/);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    if (mo) return iso(+m[3], mo, +m[2]);
  }
  return null;
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
  total: number;
  rawText: string;
  warnings: string[];
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const warnings: string[] = [];
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0);

  // ---- date ----
  let date: string | null = null;
  for (const l of lines) {
    date = parseDate(l);
    if (date) break;
  }
  if (!date) {
    date = new Date().toISOString().slice(0, 10);
    warnings.push('No date found on the receipt; defaulted to today.');
  }

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
  const merchant = merchantLine.trim().replace(/\s{2,}/g, ' ');

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
  const tax = amountOnSummaryLine(/\b(tax|vat|gst|hst|sales\s+tax)\b/i);
  const printedTotal = amountOnSummaryLine(
    /\b(grand\s+total|total\s+due|amount\s+due|balance\s+due|total)\b/i,
  );

  // ---- items ----
  const items: ReceiptItem[] = [];
  const pushItem = (name: string, price: number, source: string) => {
    if (!name || name.length < 2 || !/[A-Za-z]/.test(name)) return;
    items.push({
      id: uid(),
      name,
      price: round2(price),
      qty: quantityFrom(source),
      category: guessCategory(name),
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 2) continue;
    if (NON_ITEM.test(line)) continue;
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
  const expected = subtotal !== undefined ? round2(subtotal + (tax ?? 0)) : undefined;

  let total: number;
  if (printedTotal !== undefined && printedTotal > 0) {
    total = printedTotal;
    // A printed total that disagrees with subtotal + tax almost always means a
    // digit was misread (e.g. "81.41" -> "41"). Trust the printed subtotal and
    // tax, which are short, unambiguous numbers, and flag the correction.
    if (expected !== undefined && Math.abs(printedTotal - expected) > Math.max(1, expected * 0.05)) {
      warnings.push(
        `Printed total ${printedTotal.toFixed(2)} did not match subtotal + tax ` +
          `(${expected.toFixed(2)}); used ${expected.toFixed(2)}. Please double-check.`,
      );
      total = expected;
    }
  } else if (expected !== undefined) {
    total = expected;
    warnings.push('No total found on the receipt; calculated it from subtotal and tax.');
  } else {
    total = itemsSum;
    if (items.length) warnings.push('No total found on the receipt; summed the line items instead.');
  }

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
    total: round2(total),
    rawText,
    warnings,
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
    total: p.total,
    rawText: p.rawText,
    createdAt: Date.now(),
  };
}

export { uid };
