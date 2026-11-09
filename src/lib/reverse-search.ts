/**
 * Reverse store search.
 *
 * When the header of a receipt is damaged or stylised, the merchant name can be
 * hard to read. A receipt usually carries other clues — a store number, a
 * city/state, a slogan — that together identify the chain. This module pulls
 * those clues out of the (already redacted) text and asks the configured model
 * to name the store, then snaps the answer to a canonical catalog name.
 *
 * Only the redacted text is sent; personal data has been removed by `redact.ts`
 * before this runs.
 */

import type { Settings } from '../types';
import { recognizeStore, type StoreMatch } from './stores';
import { redactText, type RedactionResult } from './redact';

export interface ReverseSearchResult {
  match: StoreMatch;
  /** The redacted text that was used, for transparency. */
  redacted: RedactionResult;
  /** How the name was found. */
  method: 'model' | 'catalog' | 'none';
}

/** Lines most likely to name the store: the header, before the first item. */
function headerCandidates(text: string, maxLines = 8): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);
  const out: string[] = [];
  for (const line of lines) {
    // Stop once we reach item lines (they start with a price-ish number pair).
    if (/\d+[.,]\d{2}\s*$/.test(line) && /[A-Za-z]/.test(line) === false) continue;
    out.push(line);
    if (out.length >= maxLines) break;
  }
  return out;
}

function chatUrl(base: string): string {
  const b = base.trim().replace(/\/$/, '');
  return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`;
}

/**
 * Asks the model to identify the store from the redacted header. Returns a
 * canonical name (or null when the model cannot tell), so the caller can fall
 * back to the local catalog.
 */
async function askModelForStore(
  header: string,
  settings: Settings,
): Promise<string | null> {
  const base = settings.llmBaseUrl.trim();
  const model = settings.llmModel.trim();
  if (!base || !model) return null;

  const prompt = [
    'You identify the retail store or restaurant from a receipt header.',
    'Personal data has already been removed and replaced with [tags]; ignore those.',
    'Use the brand text, store number, city/state, and any slogan to name the CHAIN.',
    'Return ONLY JSON: {"store": "<chain name>"} or {"store": null} when you cannot tell.',
    'Never guess from a single generic word. If unsure, return null.',
    '',
    'RECEIPT HEADER:',
    header,
  ].join('\n');

  const res = await fetch(chatUrl(base), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.llmApiKey ? { Authorization: `Bearer ${settings.llmApiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 60,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? '';
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as { store?: unknown };
    if (typeof parsed.store === 'string' && parsed.store.trim()) return parsed.store.trim();
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Identifies the store from receipt text. The text is redacted first, then the
 * local catalog is consulted; if the model is configured and the catalog is not
 * confident, the model is asked for a second opinion.
 */
export async function reverseSearchStore(
  rawText: string,
  items: { name: string }[],
  settings: Settings,
): Promise<ReverseSearchResult> {
  const redacted = redactText(rawText);
  const catalog = recognizeStore(extractHeaderText(redacted.text), items);

  if (catalog.known) {
    return { match: catalog, redacted, method: 'catalog' };
  }

  const header = headerCandidates(redacted.text).join('\n');
  const fromModel = await askModelForStore(header, settings).catch(() => null);
  if (fromModel) {
    // Snap the model's answer back onto the catalog so the name is consistent.
    const snapped = recognizeStore(fromModel, items);
    return { match: snapped, redacted, method: 'model' };
  }

  return { match: catalog, redacted, method: 'none' };
}

/** The top lines of a receipt, which hold the store name and address. */
export function extractHeaderText(text: string): string {
  return headerCandidates(text, 6).join('\n');
}
