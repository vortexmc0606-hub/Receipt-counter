/**
 * Tax-rate helpers.
 *
 * Many receipts print the tax as a rate ("SALES TAX 8.25%", "VAT 20 %") instead
 * of, or as well as, an amount. The parser reads the printed amount when it can;
 * these helpers let it fall back to the rate, and let the app learn the rate a
 * store charges so the amount can be calculated on later receipts.
 */

/** Rounds to two decimals. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Tax amount for a base (pre-tax) figure at a percent rate. */
export function taxFromRate(base: number, rate: number): number {
  return round2((base * rate) / 100);
}

/**
 * The percent rate implied by a tax amount and its base, when it looks like a
 * real rate (a store's tax is always well under 30%). Returns undefined when the
 * two figures do not imply a sensible rate.
 */
export function rateFromAmounts(tax: number, base: number): number | undefined {
  if (!(base > 0) || !(tax > 0)) return undefined;
  const rate = round2((tax / base) * 100);
  return rate > 0 && rate < 30 ? rate : undefined;
}

/** Words that label a tax line, so a nearby percentage is treated as tax. */
const TAX_WORD =
  /\b(sales\s*tax|state\s*tax|local\s*tax|city\s*tax|county\s*tax|use\s*tax|goods\s+and\s+services|value\s+added|vat|gst|hst|pst|qst|tax)\b/i;

const PERCENT_IN_LINE = /(\d{1,2}(?:\.\d{1,3})?)\s*%/;
const PERCENT_ONLY = /^\s*(\d{1,2}(?:\.\d{1,3})?)\s*%\s*$/;

/** Accepts a plausible sales-tax rate; rejects page numbers and stray figures. */
function plausible(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0 && rate < 30;
}

/**
 * Finds the tax rate printed on a receipt, in percent.
 *
 * Handles the common layouts:
 *  - "SALES TAX 8.25%" and "VAT 20.0 %" on the tax line;
 *  - a bare "8.25%" on the line after a "TAX" label;
 *  - a rate printed beside an amount ("TAX 8.25%   1.23").
 * Returns null when no plausible rate is present.
 */
export function extractTaxRate(text: string): number | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0);

  // A percentage sitting on the same line as a tax word is the strongest signal.
  for (const line of lines) {
    if (!TAX_WORD.test(line)) continue;
    const m = line.match(PERCENT_IN_LINE);
    if (m) {
      const rate = parseFloat(m[1]);
      if (plausible(rate)) return rate;
    }
  }

  // Otherwise a bare percentage line directly under a tax label, e.g.
  //   TAX
  //   8.25%
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(PERCENT_ONLY);
    if (!m) continue;
    const rate = parseFloat(m[1]);
    if (plausible(rate) && TAX_WORD.test(lines[i - 1])) return rate;
  }

  return null;
}

/** True when the receipt mentions tax at all, even if the amount is unreadable. */
export function hasTaxLabel(text: string): boolean {
  return TAX_WORD.test(text);
}

export interface TaxResult {
  /** Tax amount, or undefined when none could be determined. */
  tax?: number;
  /** Rate in percent, when known. */
  rate?: number;
  /** True when the amount was calculated from the rate rather than printed. */
  estimated: boolean;
  /** Message to show the user when the amount was calculated. */
  note?: string;
}

/**
 * Decides the tax amount and rate from whatever the receipt itself shows.
 *
 * Priority:
 *  1. A printed amount wins — it is what was actually charged.
 *  2. A printed rate is applied to the base (subtotal, or the sum of the items).
 *  3. When a tax line is present but its amount is unreadable, and the printed
 *     total sits above the pre-tax base, the gap between them is the tax.
 *
 * A rate learned for the store is handled separately, in applyLearning, so there
 * is a single place that decides whether an invented tax is appropriate.
 */
export function resolveTax(input: {
  subtotal?: number;
  itemsSum: number;
  total?: number;
  tax?: number;
  printedRate?: number;
  taxLinePresent?: boolean;
}): TaxResult {
  const base = input.subtotal ?? input.itemsSum;
  const hasTaxLine = input.taxLinePresent === true;

  if (input.tax !== undefined && input.tax > 0) {
    const rate = input.printedRate ?? rateFromAmounts(input.tax, base);
    return { tax: input.tax, rate, estimated: false };
  }

  // A printed rate is authoritative (its own presence proves a tax line), so it
  // is applied before any gap is inferred.
  if (input.printedRate !== undefined && base > 0) {
    const tax = taxFromRate(base, input.printedRate);
    if (tax > 0) {
      return {
        tax,
        rate: input.printedRate,
        estimated: true,
        note:
          `Tax was shown as a rate (${input.printedRate}%), so it was calculated as ` +
          `${tax.toFixed(2)}. Please check it against the receipt.`,
      };
    }
  }

  // A tax line is present but its amount was not read; the total already
  // includes the tax, so the gap above the base is the amount.
  if (hasTaxLine && base > 0 && input.total !== undefined && input.total > base + 0.005) {
    const gap = round2(input.total - base);
    const implied = rateFromAmounts(gap, base);
    if (implied !== undefined) {
      return {
        tax: gap,
        rate: implied,
        estimated: false,
        note:
          `The tax line had no readable amount, so tax was taken from the gap between the ` +
          `subtotal and the total (${gap.toFixed(2)}). Please check it against the receipt.`,
      };
    }
  }

  return { tax: input.tax, rate: input.printedRate, estimated: false };
}
