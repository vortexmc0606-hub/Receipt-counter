/**
 * Privacy redaction for receipt text.
 *
 * Before a receipt is sent anywhere (an AI reader, the assistant, a reverse
 * store lookup), the personal data a receipt carries is blacked out: card
 * numbers, phone numbers, e-mail addresses, postal addresses and person names.
 * What remains — store name, item lines, amounts, dates — is what the AI needs.
 *
 * Redaction is text-level. The receipt image itself is never sent by the
 * on-device OCR path; when AI reading is on, only the *redacted text* is shared
 * with the assistant, and the image path is left to the vision model the user
 * explicitly configured.
 */

export interface RedactionResult {
  text: string;
  /** How many of each kind were removed, for showing the user. */
  counts: Record<RedactionKind, number>;
}

export type RedactionKind = 'card' | 'phone' | 'email' | 'address' | 'name';

const LABELS: Record<RedactionKind, string> = {
  card: '[card number removed]',
  phone: '[phone removed]',
  email: '[email removed]',
  address: '[address removed]',
  name: '[name removed]',
};

/** Long digit runs (13–19) and masked card forms. */
const CARD_PATTERNS: RegExp[] = [
  /\b(?:\d[ -]?){12,18}\d\b/g,
  /(?:\*{3,}[\s-]?){2,}\d{2,4}\b/g,
  /(?:[Xx]{3,}[\s-]?){3,}[Xx]?\d{2,4}\b/g,
  /\b\d{4}[\s-]?[Xx*]{4}[\s-]?[Xx*]{4}[\s-]?\d{4}\b/g,
];

/** Phone numbers in the shapes receipts print them. */
const PHONE_PATTERNS: RegExp[] = [
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
  /\b\d{3}[\s.-]\d{4}\b/g,
  /\b1[-.\s]?8(?:00|88|77|66|55)[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
];

const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;

/** Street-address fragments, PO boxes and suite/apt markers. */
const ADDRESS_PATTERNS: RegExp[] = [
  /\b\d+\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+)*\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|circle|cir|place|pl|terrace|ter|highway|hwy|parkway|pkwy|square|sq|trail|trl|loop|plaza|plz|crossing|xing)\b\.?/gi,
  /\bp\.?\s?o\.?\s?box\s+\d+/gi,
  /\b(?:suite|ste|apt|apartment|unit|bldg|building|floor|fl)\s*#?\s*[\w-]+/gi,
];

/** "City, ST 12345" — the tail of a US address. */
const CITY_STATE_ZIP = /\b[A-Za-z][A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g;

/** Lines explicitly labelling a person. */
const NAME_LABEL = /\b(?:name|customer|card\s?holder|cardmember|member|attn|attention|account\s?holder|bill\s?to|ship\s?to)\b\s*[:#]?\s*(.+)/i;

/**
 * Common given names used to catch an unlabelled "John Smith" line without
 * touching store names (a receipt header is a brand, not a person's first name).
 */
const GIVEN_NAMES = new Set(
  [
    'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas',
    'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'donald', 'mark', 'paul', 'steven',
    'andrew', 'kenneth', 'george', 'joshua', 'kevin', 'brian', 'edward', 'ronald', 'timothy',
    'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen',
    'larry', 'justin', 'scott', 'brandon', 'frank', 'benjamin', 'gregory', 'samuel', 'raymond',
    'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah',
    'karen', 'nancy', 'lisa', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily',
    'donna', 'michelle', 'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca',
    'sharon', 'laura', 'cynthia', 'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda',
    'mihir', 'gupta', 'vanshika', 'rathore',
  ].map((n) => n.toLowerCase()),
);

function blankLine(line: string): { line: string; hits: RedactionKind[] } {
  const hits: RedactionKind[] = [];
  let out = line;

  // Labelled names first: the label tells us the rest of the line is a person.
  const labelled = out.match(NAME_LABEL);
  if (labelled && labelled[1] && labelled[1].trim().length >= 2) {
    out = out.replace(labelled[1], LABELS.name);
    hits.push('name');
  }

  // "John Smith" — a two-word Title Case name whose first word is a known given
  // name. Skipped when the line also holds a store-ish token.
  const words = out.trim().split(/\s+/);
  if (
    words.length >= 2 &&
    words.length <= 4 &&
    GIVEN_NAMES.has(words[0].replace(/[^a-z]/gi, '').toLowerCase()) &&
    /^[A-Z][a-z]/.test(words[1] ?? '') &&
    !/\d/.test(out)
  ) {
    out = LABELS.name;
    hits.push('name');
  }

  for (const re of ADDRESS_PATTERNS) {
    if (re.test(out)) {
      out = out.replace(re, LABELS.address);
      hits.push('address');
    }
  }
  if (CITY_STATE_ZIP.test(out)) {
    out = out.replace(CITY_STATE_ZIP, LABELS.address);
    hits.push('address');
  }
  return { line: out, hits };
}

/** Removes personal data from receipt text, returning the cleaned text. */
export function redactText(text: string): RedactionResult {
  const counts: Record<RedactionKind, number> = { card: 0, phone: 0, email: 0, address: 0, name: 0 };
  if (!text) return { text: '', counts };

  let out = text;

  // Global patterns run before the per-line pass so a card number is not partly
  // consumed by the phone pattern.
  for (const re of CARD_PATTERNS) {
    out = out.replace(re, () => {
      counts.card++;
      return LABELS.card;
    });
  }
  for (const re of PHONE_PATTERNS) {
    out = out.replace(re, () => {
      counts.phone++;
      return LABELS.phone;
    });
  }
  out = out.replace(EMAIL_PATTERN, () => {
    counts.email++;
    return LABELS.email;
  });

  out = out
    .split('\n')
    .map((line) => {
      const { line: cleaned, hits } = blankLine(line);
      for (const h of hits) counts[h]++;
      return cleaned;
    })
    .join('\n');

  return { text: out, counts };
}

/** A short, human summary of what was removed, or null when nothing was. */
export function describeRedactions(counts: Record<RedactionKind, number>): string | null {
  const parts: string[] = [];
  const label: Record<RedactionKind, string> = {
    card: 'card number',
    phone: 'phone number',
    email: 'email',
    address: 'address',
    name: 'name',
  };
  for (const kind of Object.keys(counts) as RedactionKind[]) {
    const n = counts[kind];
    if (n > 0) parts.push(`${n} ${label[kind]}${n > 1 ? 's' : ''}`);
  }
  if (!parts.length) return null;
  return `Removed ${parts.join(', ')} before sending to the AI.`;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** True when a line contains any personal data that redaction would remove. */
export function lineHasPersonalData(line: string): boolean {
  return redactText(line).text !== line;
}

/**
 * Blacks out rectangular regions of an RGBA buffer in place — used to hide the
 * personal data on the scanned image itself, so a shared receipt photo carries
 * no card number, phone, address or name.
 */
export function blackoutRegions(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  boxes: Box[],
): void {
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x0));
    const y0 = Math.max(0, Math.floor(b.y0));
    const x1 = Math.min(width, Math.ceil(b.x1));
    const y1 = Math.min(height, Math.ceil(b.y1));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * width + x) * 4;
        rgba[o] = 0;
        rgba[o + 1] = 0;
        rgba[o + 2] = 0;
        rgba[o + 3] = 255;
      }
    }
  }
}
