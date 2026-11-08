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

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Last price-like token on a line, e.g. "Milk 2L   3.49" -> 3.49 */
function trailingPrice(line: string): number | null {
  const m = line.match(/(-?\$?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|-?\$?\s?\d+[.,]\d{2}|\d+)\s*[A-Z]?\s*$/);
  if (!m) return null;
  const val = toNumber(m[1]);
  if (Number.isNaN(val)) return null;
  return val;
}

function cleanName(line: string): string {
  return line
    .replace(/(-?\$?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|-?\$?\s?\d+[.,]\d{2}|\d+)\s*[A-Z]?\s*$/, '')
    .replace(/[.·•*_\-]{2,}\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
        l.trim().length <= 40,
    ) || lines[0] || 'Unknown merchant';
  const merchant = merchantLine.trim().replace(/\s{2,}/g, ' ');

  // ---- totals ----
  const findAmount = (re: RegExp): number | undefined => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (re.test(lines[i])) {
        const v = trailingPrice(lines[i]);
        if (v !== null && v > 0) return v;
      }
    }
    return undefined;
  };

  const subtotal = findAmount(/\bsub\s*-?\s*total\b|\bsubtotal\b/i);
  const tax = findAmount(/\b(tax|vat|gst|hst|sales\s+tax)\b/i);
  let total = findAmount(/\b(grand\s+total|total\s+due|amount\s+due|balance\s+due|total)\b/i) ?? 0;

  // ---- items ----
  const items: ReceiptItem[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3) continue;
    if (NON_ITEM.test(trimmed)) continue;
    if (/\d{1,2}[:/]\d{1,2}/.test(trimmed) && !/[A-Za-z]{3,}/.test(trimmed)) continue;

    const price = trailingPrice(trimmed);
    if (price === null || price <= 0) continue;

    let qty = 1;
    // "2 x 3.50", "2 @ 3.50", "2 * 3.50"
    const qtyMatch = trimmed.match(/^\s*(\d{1,3})\s*[xX@*]\s*\$?\s*\d/);
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1], 10) || 1;
    }

    let name = cleanName(trimmed)
      .replace(/^\d{1,3}\s*[xX@*]\s*/, '')
      .replace(/^[#*.\-•]+\s*/, '')
      .trim();
    if (!name || name.length < 2 || !/[A-Za-z]/.test(name)) continue;

    // Guard: skip obvious addresses / phone lines
    if (/^\d+\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|suite|ste)\b/i.test(name)) continue;

    items.push({
      id: uid(),
      name,
      price: Math.round(price * 100) / 100,
      qty,
      category: guessCategory(name),
    });
  }

  // ---- reconcile total ----
  const itemsSum = Math.round(items.reduce((s, it) => s + it.price, 0) * 100) / 100;
  if (total <= 0) {
    total = subtotal !== undefined ? subtotal + (tax ?? 0) : itemsSum;
    if (items.length && total > 0) warnings.push('Total was inferred from line items.');
  }
  if (items.length === 0) warnings.push('No line items detected — add them manually.');

  return {
    merchant,
    date,
    currency: detectCurrency(rawText),
    items,
    subtotal,
    tax,
    total: Math.round(total * 100) / 100,
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
