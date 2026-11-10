import type { ChatMessage, MemoryFact, Receipt, Settings } from '../types';
import {
  categoryTotals,
  merchantTotals,
  money,
  monthlyTotals,
  monthLabel,
  prettyDate,
  receiptTotal,
} from './utils';
import { uid } from './parser';
import { addDays, endOfMonth, todayISO } from './dates';
import { formatMemory } from './memory';
import { HttpError, describeHttpError, isRetryable, withRetry } from './net';

export interface AssistantAnswer {
  content: string;
  table?: { columns: string[]; rows: (string | number)[][] };
  sources?: string[];
}

interface FlatItem {
  name: string;
  price: number;
  qty: number;
  category: string;
  merchant: string;
  date: string;
}

function flatten(receipts: Receipt[]): FlatItem[] {
  const out: FlatItem[] = [];
  for (const r of receipts) {
    for (const it of r.items) {
      out.push({
        name: it.name,
        price: it.price,
        qty: it.qty,
        category: it.category,
        merchant: r.merchant,
        date: r.date,
      });
    }
  }
  return out;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'did', 'do', 'does', 'i', 'me', 'my', 'on', 'in', 'at', 'for', 'of', 'to',
  'how', 'much', 'what', 'where', 'when', 'which', 'show', 'list', 'all', 'and', 'was', 'were',
  'is', 'are', 'get', 'buy', 'bought', 'purchase', 'purchased', 'spend', 'spent', 'cost',
  'costs', 'price', 'prices', 'paid', 'pay', 'receipt', 'receipts', 'item', 'items', 'find',
  'total', 'totals', 'from', 'with', 'that', 'this', 'these', 'have', 'has', 'between',
  // time words — handled by the date-range logic, not item matching
  'today', 'yesterday', 'week', 'month', 'year', 'day', 'days', 'weeks', 'months', 'years',
  'last', 'next', 'current', 'average', 'avg', 'mean', 'many', 'number', 'count',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep',
  'sept', 'oct', 'nov', 'dec',
]);

function keywords(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s.&-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^20\d{2}$/.test(w));
}

function matchMonth(q: string, receipts: Receipt[]): string | null {
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const lower = q.toLowerCase();
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  let monthIdx = -1;
  for (let i = 0; i < months.length; i++) {
    if (new RegExp(`\\b${months[i].slice(0, 3)}`, 'i').test(lower)) {
      monthIdx = i + 1;
      break;
    }
  }
  const iso = lower.match(/\b(20\d{2})-(\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;

  if (monthIdx === -1) return null;

  // Prefer a year that actually appears in the user's receipts.
  if (yearMatch) return `${yearMatch[1]}-${String(monthIdx).padStart(2, '0')}`;
  const mm = String(monthIdx).padStart(2, '0');
  const years = [...new Set(receipts.map((r) => r.date.slice(0, 4)))].filter(Boolean).sort();
  const matching = years.filter((y) => receipts.some((r) => r.date.slice(0, 7) === `${y}-${mm}`));
  const year = matching.length ? matching[matching.length - 1] : String(new Date().getFullYear());
  return `${year}-${mm}`;
}

function parseExplicitDate(q: string): string | null {
  const iso = q.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = q.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (dmy) {
    const a = +dmy[1];
    const b = +dmy[2];
    const y = dmy[3];
    const [mo, d] = a > 12 ? [b, a] : [a, b];
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function rangeFromQuery(q: string, receipts: Receipt[]): { label: string; from: string; to: string } | null {
  const lower = q.toLowerCase();
  const today = todayISO();

  if (/\b(today)\b/.test(lower)) return { label: 'today', from: today, to: today };
  if (/\b(yesterday)\b/.test(lower)) {
    const iso = addDays(today, -1);
    return { label: 'yesterday', from: iso, to: iso };
  }
  if (/\b(this\s+week)\b/.test(lower)) {
    const [y, m, d] = today.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return { label: 'this week', from: addDays(today, -dow), to: today };
  }
  if (/\b(last\s+month)\b/.test(lower)) {
    const firstOfThis = `${today.slice(0, 7)}-01`;
    return { label: 'last month', from: addDays(firstOfThis, -1).slice(0, 7) + '-01', to: addDays(firstOfThis, -1) };
  }
  if (/\b(this\s+month)\b/.test(lower)) {
    return { label: 'this month', from: `${today.slice(0, 7)}-01`, to: today };
  }
  if (/\b(this\s+year)\b/.test(lower)) {
    return { label: 'this year', from: `${today.slice(0, 4)}-01-01`, to: today };
  }

  const mk = matchMonth(q, receipts);
  if (mk) {
    const from = `${mk}-01`;
    return { label: monthLabel(mk), from, to: endOfMonth(from) };
  }

  const explicit = parseExplicitDate(q);
  if (explicit) return { label: prettyDate(explicit), from: explicit, to: explicit };

  if (/\b(all|ever|overall|total)\b/.test(lower) || receipts.length === 0) {
    if (receipts.length === 0) return null;
    const dates = receipts.map((r) => r.date).sort();
    return { label: 'all time', from: dates[0], to: dates[dates.length - 1] };
  }
  return null;
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/** Deterministic answers for the common questions. Returns null if unsure. */
export function answerLocally(question: string, receipts: Receipt[], currency: string): AssistantAnswer | null {
  if (receipts.length === 0) {
    return {
      content:
        "You haven't added any receipts yet. Scan one with the Scan tab and I'll be able to answer questions about your spending.",
    };
  }

  const q = question.trim();
  const lower = q.toLowerCase();
  const range = rangeFromQuery(q, receipts);
  const scoped = range ? receipts.filter((r) => inRange(r.date, range.from, range.to)) : receipts;
  const scopeLabel = range ? range.label : 'all time';
  const items = flatten(scoped);

  // --- spend by category ---
  if (/(categor|breakdown|split|by type)/.test(lower)) {
    const rows = categoryTotals(scoped).map((c) => [c.category, money(c.total, currency)]);
    const sum = scoped.reduce((s, r) => s + receiptTotal(r), 0);
    return {
      content: `Here is your spending by category for ${scopeLabel} — ${money(sum, currency)} across ${scoped.length} receipt(s).`,
      table: { columns: ['Category', 'Total'], rows },
    };
  }

  // --- top merchants ---
  if (/(merchant|store|shop|where.*(spend|shop)|vendor)/.test(lower)) {
    const rows = merchantTotals(scoped).slice(0, 10).map((m) => [m.merchant, m.count, money(m.total, currency)]);
    return {
      content: `Your top merchants for ${scopeLabel}:`,
      table: { columns: ['Merchant', 'Receipts', 'Total'], rows },
    };
  }

  // --- most expensive item ---
  if (/(most expensive|highest|biggest|priciest|largest).*(item|thing|purchase|buy)?/.test(lower)) {
    const top = [...items].sort((a, b) => b.price - a.price).slice(0, 5);
    if (top.length === 0) return { content: `I couldn't find any line items for ${scopeLabel}.` };
    return {
      content: `Your most expensive items for ${scopeLabel}:`,
      table: {
        columns: ['Item', 'Merchant', 'Date', 'Price'],
        rows: top.map((i) => [i.name, i.merchant, i.date, money(i.price, currency)]),
      },
    };
  }

  // --- average receipt ---
  if (/(average|avg|mean)/.test(lower)) {
    const sum = scoped.reduce((s, r) => s + receiptTotal(r), 0);
    const avg = scoped.length ? sum / scoped.length : 0;
    return { content: `Your average receipt for ${scopeLabel} is ${money(avg, currency)} (${scoped.length} receipt(s), ${money(sum, currency)} total).` };
  }

  // --- count ---
  if (/(how many|number of)/.test(lower)) {
    const count = items.length;
    return { content: `You have ${scoped.length} receipt(s) and ${count} line item(s) for ${scopeLabel}.` };
  }

  // --- receipt list on a date / range ---
  if (/(receipts?|purchases?)\b/.test(lower) && (range || /list|show|which|what/.test(lower))) {
    const rows = scoped
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((r) => [r.date, r.merchant, r.items.length, money(receiptTotal(r), currency)]);
    const sum = scoped.reduce((s, r) => s + receiptTotal(r), 0);
    return {
      content: `${scoped.length} receipt(s) for ${scopeLabel}, totalling ${money(sum, currency)}.`,
      table: { columns: ['Date', 'Merchant', 'Items', 'Total'], rows },
    };
  }

  // --- item lookup: price / where bought / history ---
  const kws = keywords(q);
  if (kws.length) {
    const matched = items.filter((it) => {
      const n = it.name.toLowerCase();
      return kws.some((k) => n.includes(k));
    });
    if (matched.length) {
      const total = matched.reduce((s, i) => s + i.price, 0);
      const wantPrice = /(price|cost|how much|spend|spent|paid|total)/.test(lower);
      const wantWhere = /(where|which (store|merchant|shop))/.test(lower);
      if (wantPrice) {
        return {
          content: `You spent ${money(total, currency)} on ${kws.join(' / ')} across ${matched.length} purchase(s) in ${scopeLabel}.`,
          table: {
            columns: ['Item', 'Merchant', 'Date', 'Price'],
            rows: matched
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .slice(0, 25)
              .map((i) => [i.name, i.merchant, i.date, money(i.price, currency)]),
          },
        };
      }
      if (wantWhere) {
        const byMerchant = new Map<string, number>();
        for (const m of matched) byMerchant.set(m.merchant, (byMerchant.get(m.merchant) ?? 0) + 1);
        const rows = [...byMerchant.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([m, c]) => [m, c]);
        return {
          content: `You bought ${kws.join(' / ')} at these places:`,
          table: { columns: ['Merchant', 'Times'], rows },
        };
      }
      return {
        content: `I found ${matched.length} match(es) for ${kws.join(' / ')} in ${scopeLabel}:`,
        table: {
          columns: ['Item', 'Merchant', 'Date', 'Price'],
          rows: matched
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .slice(0, 25)
            .map((i) => [i.name, i.merchant, i.date, money(i.price, currency)]),
        },
      };
    }
    if (/(how much|spend|spent|total|cost)/.test(lower) && kws.length) {
      return { content: `I couldn't find any items matching "${kws.join(' / ')}" in your receipts.` };
    }
  }

  // --- default: total spend ---
  if (/(how much|spend|spent|total|cost|sum)/.test(lower) || range) {
    const sum = scoped.reduce((s, r) => s + receiptTotal(r), 0);
    const monthly = monthlyTotals(scoped);
    if (monthly.length > 1) {
      return {
        content: `You spent ${money(sum, currency)} for ${scopeLabel} across ${scoped.length} receipt(s). Monthly breakdown:`,
        table: { columns: ['Month', 'Total'], rows: monthly.map((m) => [m.label, money(m.total, currency)]) },
      };
    }
    return { content: `You spent ${money(sum, currency)} for ${scopeLabel} across ${scoped.length} receipt(s).` };
  }

  return null;
}

/** Compact serialisation of the data for the LLM prompt. */
function dataContext(receipts: Receipt[], currency: string): string {
  const lines: string[] = [];
  const sorted = [...receipts].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 200);
  for (const r of sorted) {
    lines.push(
      `# ${r.date} | ${r.merchant} | total ${money(receiptTotal(r), currency)}` +
        (r.tax !== undefined
          ? ` | tax ${money(r.tax, currency)}${r.taxRate ? ` (${r.taxRate}%)` : ''}`
          : ''),
    );
    for (const it of r.items.slice(0, 40)) {
      lines.push(`  - ${it.name} | ${it.category} | qty ${it.qty} | ${money(it.price, currency)}`);
    }
  }
  return lines.join('\n');
}

export async function askLLM(
  question: string,
  receipts: Receipt[],
  settings: Settings,
  history: ChatMessage[] = [],
  memory: MemoryFact[] = [],
): Promise<AssistantAnswer> {
  const base = settings.llmBaseUrl.replace(/\/$/, '');
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const memoryBlock = memory.length
    ? ['', 'THINGS THE USER ASKED YOU TO REMEMBER:', formatMemory(memory)]
    : [];
  const system = [
    'You are a helpful personal-finance assistant embedded in the Lumen receipt app.',
    'Answer only from the receipt data provided. Be concise and concrete.',
    `Currency symbol: ${settings.currency}.`,
    'If the user asks for a list or comparison, respond with a short sentence followed by a markdown table.',
    ...memoryBlock,
    '',
    'RECEIPT DATA:',
    dataContext(receipts, settings.currency),
  ].join('\n');

  const messages = [
    { role: 'system', content: system },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  const request = async (): Promise<string> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.llmApiKey ? { Authorization: `Bearer ${settings.llmApiKey}` } : {}),
      },
      body: JSON.stringify({ model: settings.llmModel, messages, temperature: 0.2 }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new HttpError(res.status, describeHttpError(res.status, body));
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('The model returned an empty response.');
    return content;
  };

  // One retry smooths over a transient gateway blip so a question is not lost.
  return { content: await withRetry(request, { retries: 1, shouldRetry: (e) => e instanceof HttpError && isRetryable(e.status) }) };
}

export function newMessage(role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: uid(), role, content, createdAt: Date.now(), ...extra };
}
