/**
 * Calendar-date helpers.
 *
 * Receipt dates are plain calendar days ("7 Nov 2025"), not instants. Using
 * `new Date().toISOString()` for them is wrong: it converts to UTC, so a receipt
 * saved in the evening in the Americas shows tomorrow's date, and a month-end
 * range in Asia shows the day before. Everything here works in local calendar
 * parts, and rejects days that do not exist (30 Feb) instead of letting the
 * Date constructor roll them into the next month.
 */

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/** Formats a Date as YYYY-MM-DD using its local calendar parts. */
export function localISO(d: Date): string {
  return `${d.getFullYear().toString().padStart(4, '0')}-${(d.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

/** Today's date in the local timezone, as YYYY-MM-DD. */
export function todayISO(): string {
  return localISO(new Date());
}

function isRealDay(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= daysInMonth;
}

/** True when the string is a real YYYY-MM-DD calendar day. */
export function isValidISODate(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  return isRealDay(+m[1], +m[2], +m[3]);
}

function toISO(y: number, mo: number, d: number): string | null {
  const yy = y < 100 ? (y > 70 ? 1900 + y : 2000 + y) : y;
  if (!isRealDay(yy, mo, d)) return null;
  return `${yy.toString().padStart(4, '0')}-${mo.toString().padStart(2, '0')}-${d
    .toString()
    .padStart(2, '0')}`;
}

/** Adds (or subtracts) whole days to a YYYY-MM-DD string. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localISO(new Date(y, m - 1, d + n));
}

/** The last calendar day of the month that contains `iso`. */
export function endOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return localISO(new Date(y, m, 0));
}

export interface ParsedDate {
  iso: string;
  /** True when the line the date came from also carried a date label. */
  labelled: boolean;
}

/** All dates that appear in a single line, in order. */
function datesInLine(line: string): string[] {
  const found: string[] = [];

  // 2025-11-07 / 2025.11.07 / 2025/11/07
  let m = line.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) {
    const iso = toISO(+m[1], +m[2], +m[3]);
    if (iso) return [iso];
  }

  // 11/07/2025 or 07/11/25 — day-first when the first part is over 12.
  m = line.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const iso = a > 12 && b <= 12 ? toISO(+m[3], b, a) : toISO(+m[3], a, b);
    if (iso) return [iso];
  }

  // 07 Nov 2025 / 07-NOV-25
  const re1 = /\b(\d{1,2})[\s-]*([A-Za-z]{3,9})[\s,-]*(\d{2,4})\b/g;
  for (let x = re1.exec(line); x; x = re1.exec(line)) {
    const mo = MONTHS.indexOf(x[2].slice(0, 3).toLowerCase()) + 1;
    if (!mo) continue;
    const iso = toISO(+x[3], mo, +x[1]);
    if (iso) found.push(iso);
  }

  // Nov 07, 2025 / NOV-07-25
  const re2 = /\b([A-Za-z]{3,9})[\s-]*(\d{1,2})[\s,-]*(\d{2,4})\b/g;
  for (let x = re2.exec(line); x; x = re2.exec(line)) {
    const mo = MONTHS.indexOf(x[1].slice(0, 3).toLowerCase()) + 1;
    if (!mo) continue;
    const iso = toISO(+x[3], mo, +x[2]);
    if (iso) found.push(iso);
  }

  return found;
}

const DATE_LABEL = /\b(date|dt|dated|purchas\w*|trans\w*|sold)\b/i;

/**
 * Finds the best receipt date in the raw text. Prefers a date that sits on a
 * labelled line ("DATE 11/07/25"), then a date that is not in the future, then
 * the first date found. Returns null when nothing parses.
 */
export function parseReceiptDate(text: string, today = todayISO()): ParsedDate | null {
  const candidates: ParsedDate[] = [];
  for (const line of text.split(/\r?\n/)) {
    const labelled = DATE_LABEL.test(line);
    for (const iso of datesInLine(line)) candidates.push({ iso, labelled });
  }
  if (candidates.length === 0) return null;

  // A receipt is a recent document. A date years in the past is almost always a
  // misread number (a phone number, SKU or price that happened to look like a
  // date); a date well in the future is a misread year. Score each candidate and
  // take the best, so a stray false positive cannot beat the real date.
  const todayYear = +today.slice(0, 4);
  const score = (c: ParsedDate): number => {
    let s = c.labelled ? 4 : 0;
    if (c.iso <= today) s += 3;
    const year = +c.iso.slice(0, 4);
    const age = todayYear - year;
    if (age < 0) s -= 6; // future
    else if (age <= 1) s += 3; // this year or last
    else if (age <= 3) s += 1;
    else s -= 4; // implausibly old for a receipt
    return s;
  };
  return candidates.reduce((best, c) => (score(c) > score(best) ? c : best));
}

/**
 * Normalises a date value from an AI response into YYYY-MM-DD, validating that
 * it is a real calendar day. Accepts ISO and slash/dash forms.
 */
export function normalizeISODate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();

  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return toISO(+iso[1], +iso[2], +iso[3]);

  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    const a = +dmy[1];
    const b = +dmy[2];
    return a > 12 && b <= 12 ? toISO(+dmy[3], b, a) : toISO(+dmy[3], a, b);
  }

  const word = s.match(/^(\d{1,2})[\s-]*([A-Za-z]{3,9})[\s,-]*(\d{2,4})/);
  if (word) {
    const mo = MONTHS.indexOf(word[2].slice(0, 3).toLowerCase()) + 1;
    if (mo) return toISO(+word[3], mo, +word[1]);
  }
  return null;
}
