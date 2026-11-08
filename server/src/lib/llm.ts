import type { AiReadResult, Category, ChatMessage, ReceiptItem } from '../types.js';
import { resolveTax } from './tax.js';

/**
 * Talks to an OpenAI-compatible chat-completions endpoint. The API key stays on
 * this server; callers never see it.
 */

const CATEGORIES: Category[] = [
  'Groceries',
  'Dining',
  'Household',
  'Health',
  'Transport',
  'Electronics',
  'Clothing',
  'Entertainment',
  'Bills',
  'Other',
];

function chatUrl(base: string): string {
  const b = base.trim().replace(/\/$/, '');
  return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

function normalizeDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const a = +dmy[1];
    const b = +dmy[2];
    let y = +dmy[3];
    if (y < 100) y += y > 70 ? 1900 : 2000;
    const [mo, d] = a > 12 ? [b, a] : [a, b];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

function asCategory(v: unknown): Category {
  if (typeof v === 'string') {
    const hit = CATEGORIES.find((c) => c.toLowerCase() === v.toLowerCase());
    if (hit) return hit;
  }
  return 'Other';
}

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
      /* fall through */
    }
  }
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
  while (stack.length) candidate += stack.pop() === '{' ? '}' : ']';
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error('The AI returned malformed JSON.');
  }
}

const READ_PROMPT = `You are an expert receipt parser. Read the attached receipt image and return ONLY JSON.

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
For each item, "code" is the product/SKU/UPC number printed beside it, or null when none is printed. If a value is unreadable, use null rather than guessing.
Allowed category values: ${CATEGORIES.join(', ')}.`;

interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

async function post(baseUrl: string, apiKey: string, payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(chatUrl(baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM request failed (${res.status}). ${body.slice(0, 240)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Reads a receipt image and returns a structured result. */
export async function readReceipt(cfg: LlmConfig, dataUrl: string): Promise<AiReadResult> {
  const model = cfg.model;
  const json = await post(cfg.baseUrl, cfg.apiKey, {
    model,
    temperature: 0,
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: READ_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const choices = json.choices as { message?: { content?: string } }[] | undefined;
  const content = choices?.[0]?.message?.content;
  if (!content) throw new Error('The AI returned an empty response.');

  const parsed = extractJson(content) as Record<string, unknown>;
  const warnings: string[] = [];

  const merchantRaw =
    typeof parsed.merchant === 'string' && parsed.merchant.trim() ? parsed.merchant.trim() : 'Unknown merchant';

  const items: ReceiptItem[] = [];
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  for (const raw of rawItems) {
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    const price = coerceNumber(r.price);
    if (price === undefined || price <= 0) continue;
    const code = typeof r.code === 'string' && r.code.trim() ? r.code.trim() : undefined;
    items.push({
      id: uid(),
      name,
      price: round2(price),
      qty: Math.max(1, Math.round(coerceNumber(r.qty) ?? 1)),
      category: asCategory(r.category),
      code,
    });
  }

  const subtotal = coerceNumber(parsed.subtotal) ?? undefined;
  const taxAmount = coerceNumber(parsed.tax) ?? undefined;
  const taxRateRead = coerceNumber(parsed.taxRate) ?? undefined;
  const savings = coerceNumber(parsed.savings) ?? undefined;
  const itemsSum = round2(items.reduce((s, it) => s + it.price, 0));

  let total = coerceNumber(parsed.total) ?? 0;
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
  if (total <= 0) total = expected ?? itemsSum;
  if (subtotal !== undefined && Math.abs(subtotal - itemsSum) > Math.max(0.5, itemsSum * 0.05)) {
    warnings.push('The item lines do not add up to the printed subtotal — check the items.');
  }
  if (!items.length) warnings.push('No line items were recognised.');
  if (!normalizeDate(parsed.date)) warnings.push('No date found on the receipt.');

  return {
    merchant: merchantRaw,
    date: normalizeDate(parsed.date) ?? new Date().toISOString().slice(0, 10),
    currency: typeof parsed.currency === 'string' ? parsed.currency : null,
    items,
    subtotal,
    tax,
    taxRate,
    total: round2(total),
    savings,
    rawText: content,
    warnings,
  };
}

/** Answers a question from receipt data (already serialised to text). */
export async function ask(
  cfg: LlmConfig,
  question: string,
  dataContext: string,
  history: ChatMessage[] = [],
  memory: string[] = [],
): Promise<string> {
  const memoryBlock = memory.length
    ? ['', 'THINGS THE USER ASKED YOU TO REMEMBER:', ...memory.map((m) => `- ${m}`)]
    : [];
  const system = [
    'You are a helpful personal-finance assistant embedded in a receipt-scanner app.',
    'Answer only from the receipt data provided. Be concise and concrete.',
    'If the user asks for a list or comparison, respond with a short sentence followed by a markdown table.',
    ...memoryBlock,
    '',
    'RECEIPT DATA:',
    dataContext,
  ].join('\n');

  const messages = [
    { role: 'system', content: system },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  const json = await post(cfg.baseUrl, cfg.apiKey, { model: cfg.model, messages, temperature: 0.2 });
  const choices = json.choices as { message?: { content?: string } }[] | undefined;
  const content = choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('The model returned an empty response.');
  return content;
}
