import type { Category, ReceiptItem, Settings } from '../types';
import { CATEGORIES } from '../types';
import { loadBitmap } from './ocr';
import { categorize } from './category';
import { recognizeStore } from './stores';
import { redactText, describeRedactions } from './redact';
import { resolveTax } from './tax';
import { normalizeISODate, todayISO } from './dates';

/**
 * Reads a receipt with a vision-capable LLM instead of on-device OCR.
 *
 * This sends the receipt image to the endpoint configured in Settings, so it is
 * opt-in: the on-device OCR path stays the default and the fallback. The API key
 * is held only in this browser's IndexedDB and is never bundled or committed.
 */

export interface AiReadResult {
  merchant: string;
  date: string;
  currency: string | null;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  /** Tax rate in percent, when the receipt prints one (e.g. 8.25). */
  taxRate?: number;
  total: number;
  savings?: number;
  rawText: string;
  warnings: string[];
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function chatUrl(base: string): string {
  const b = base.trim().replace(/\/$/, '');
  return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`;
}

/** Downscales to a JPEG data URL so the request body stays a reasonable size. */
async function toDataUrl(source: Blob, maxEdge = 1400, quality = 0.85): Promise<string> {
  const bitmap = await loadBitmap(source);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the image for AI reading.');
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    const n = parseFloat(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function asCategory(v: unknown, name: string, store?: string): Category {
  if (typeof v === 'string') {
    const hit = CATEGORIES.find((c) => c.toLowerCase() === v.toLowerCase());
    if (hit) return hit;
  }
  return categorize(name, { store });
}

const PROMPT = `You are an expert receipt parser. Read the attached receipt image and return ONLY JSON.

Merchant detection is especially important:
- The store or restaurant name is usually in the TOP 25% of the receipt. Inspect that header first.
- Read centered, large, bold, stylized, faint, or partially visible brand text.
- Distinguish the brand from its address, slogan, phone number, and branch number.
- If the top is damaged or blank, inspect the entire receipt and use logo/context only as supporting evidence.
- Use a known store identity only when the image provides evidence. If uncertain, return "Unknown merchant"; never guess.

Extract, in this order:
1. "total": the printed TOTAL / AMOUNT DUE / BALANCE line (the final amount paid).
2. "subtotal": the printed SUBTOTAL line value.
3. "tax": the printed TAX / VAT / GST line amount, or null if the receipt prints no tax amount.
4. "taxRate": the tax rate in percent when the receipt prints one (e.g. 8.25 for "SALES TAX 8.25%", 20 for "VAT 20%"), else null. Do not compute a rate yourself — report only what is printed.
5. "savings": the printed "YOU SAVED" / "TOTAL SAVINGS" / member savings value, or null.
6. "items": every purchased line, each with its line total (the amount charged for that line). If a line shows "2 @ 8.99  17.98", the line total is 17.98 and qty is 2.

Never put subtotal, tax, total, savings, change, card/payment lines, or the store address/header into "items".

Return exactly this JSON shape:
{
  "merchant": string,
  "date": "yyyy-mm-dd" | null,
  "currency": string | null,
  "items": [{ "name": string, "qty": number, "price": number, "category": string, "code": string | null }],
  "subtotal": number | null,
  "tax": number | null,
  "taxRate": number | null,
  "total": number | null,
  "savings": number | null
}
For each item, "code" is the product/SKU/UPC number printed beside it (e.g. "0073373104514" or "MHK-4471"), or null when none is printed. If a value is unreadable, use null rather than guessing.
Allowed category values: ${CATEGORIES.join(', ')}.\nAccuracy rules: preserve printed digits and decimal points; do not confuse item prices with totals; include every purchased item; use null for unreadable values. Check arithmetic consistency, but never change a printed amount to force a match.`;

/** Extracts the first balanced JSON object from a model response. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  if (start === -1) throw new Error('The AI did not return usable JSON.');
  const end = body.lastIndexOf('}');
  if (end > start) {
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch {
      /* fall through and try to salvage a truncated response */
    }
  }
  // A response cut off by the token limit leaves unbalanced brackets. Close
  // them in reverse order so the partial result can still be used.
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let candidate = body.slice(start).replace(/,\s*$/, '');
  if (inStr) candidate += '"';
  while (stack.length) {
    candidate += stack.pop() === '{' ? '}' : ']';
  }
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error('The AI returned malformed JSON. Try again or use a different vision model.');
  }
}

export async function readReceiptWithAI(file: Blob, settings: Settings): Promise<AiReadResult> {
  if (!settings.llmBaseUrl.trim()) {
    throw new Error('Add an API base URL in Settings before using AI reading.');
  }
  const model = settings.visionModel.trim() || settings.llmModel.trim();
  if (!model) throw new Error('Set a vision model in Settings before using AI reading.');

  // The caller redacts the image before it reaches here; this guard keeps the
  // reader safe if it is called directly with an un-redacted photo.
  const dataUrl = await toDataUrl(file);

  const res = await fetch(chatUrl(settings.llmBaseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.llmApiKey ? { Authorization: `Bearer ${settings.llmApiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      // Bounded so a long receipt can't blow past the account's credit limit;
      // 2000 tokens comfortably fits a 40-line receipt as JSON.
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AI reading failed (${res.status}). ${body.slice(0, 240)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (json.error?.message) throw new Error(`AI reading failed: ${json.error.message}`);
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('The AI returned an empty response.');

  const parsed = extractJson(content) as Record<string, unknown>;
  const warnings: string[] = [];

  const merchantRaw =
    typeof parsed.merchant === 'string' && parsed.merchant.trim()
      ? parsed.merchant.trim()
      : 'Unknown merchant';

  const items: ReceiptItem[] = [];
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const price = coerceNumber(r.price);
    if (!name || price === undefined || price <= 0) continue;
    const code = typeof r.code === 'string' && r.code.trim() ? r.code.trim().toUpperCase() : undefined;
    items.push({
      id: uid(),
      name,
      price: round2(price),
      qty: Math.max(1, Math.round(coerceNumber(r.qty) ?? 1)),
      category: asCategory(r.category, name, merchantRaw),
      code,
    });
  }

  const subtotal = coerceNumber(parsed.subtotal) ?? undefined;
  const taxAmount = coerceNumber(parsed.tax) ?? undefined;
  const taxRateRead = coerceNumber(parsed.taxRate) ?? undefined;
  const savings = coerceNumber(parsed.savings) ?? undefined;
  const itemsSum = round2(items.reduce((s, it) => s + it.price, 0));

  // Map the printed store to its canonical name so spending groups by brand.
  const merchant = recognizeStore(merchantRaw, items).name;

  // Store the receipt text with any personal data removed, so a saved receipt
  // never keeps a card number or address.
  const textRedaction = settings.redactPersonal ? redactText(content) : null;
  const storedText = textRedaction ? textRedaction.text : content;
  if (textRedaction) {
    const summary = describeRedactions(textRedaction.counts);
    if (summary) warnings.push(summary);
  }

  let total = coerceNumber(parsed.total) ?? 0;

  // Decide the tax amount from a printed amount, a printed rate, or the gap
  // between the subtotal and the printed total.
  const taxResult = resolveTax({
    subtotal,
    itemsSum,
    total: total > 0 ? total : undefined,
    tax: taxAmount,
    printedRate: taxRateRead,
    taxLinePresent: taxAmount !== undefined || taxRateRead !== undefined,
  });
  const tax = taxResult.tax;
  const taxRate = taxResult.rate;
  if (taxResult.note) warnings.push(taxResult.note);

  const expected = subtotal !== undefined ? round2(subtotal + (tax ?? 0)) : undefined;
  if (total <= 0) {
    total = expected ?? itemsSum;
    if (total > 0) warnings.push('No total on the receipt; calculated it from the other figures.');
  } else if (expected !== undefined && Math.abs(total - expected) > Math.max(1, expected * 0.05)) {
    warnings.push(
      `The printed total (${total.toFixed(2)}) did not match subtotal + tax (${expected.toFixed(2)}).`,
    );
  }

  if (items.length === 0) {
    warnings.push('The AI found no line items — add them manually.');
  } else {
    const reference = subtotal ?? (total > 0 ? total : undefined);
    if (reference !== undefined && Math.abs(itemsSum - reference) > Math.max(1, reference * 0.15)) {
      warnings.push('The line items do not add up to the receipt total — please check them.');
    }
  }

  const date = normalizeISODate(parsed.date) ?? todayISO();
  if (!normalizeISODate(parsed.date)) warnings.push('No date found on the receipt; defaulted to today.');

  return {
    merchant,
    date,
    currency: typeof parsed.currency === 'string' ? parsed.currency : null,
    items,
    subtotal,
    tax,
    taxRate,
    total: round2(total),
    savings,
    rawText: storedText,
    warnings,
  };
}
