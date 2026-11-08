/**
 * Assistant memory.
 *
 * The assistant can be told durable facts ("remember I'm vegetarian", "remember
 * my budget is $400/month") and recall them later. Facts are stored locally with
 * the rest of the app data and are fed back into every answer, so the assistant
 * stops asking the same questions. Commands are recognised deterministically
 * from the message text; nothing is sent anywhere to decide them.
 */

import type { AssistantAnswer } from './assistant';
import type { MemoryFact } from '../types';
import { uid } from './parser';

export const MAX_FACTS = 100;
export const MAX_FACT_LENGTH = 400;

/** Text that must never be stored, even if the user asks to remember it. */
const SECRET_RE =
  /\b(password|passcode|pin\s*code|social security|\bssn\b|\bcvv\b|\bcvc\b)\b|\b(?:\d[ -]?){13,19}\b/i;

export type MemoryCommand =
  | { action: 'remember'; text: string }
  | { action: 'forget'; query: string | null }
  | { action: 'list' };

/**
 * Recognises a memory command in a message, or returns null when the message is
 * an ordinary question. `forget` with no query clears everything.
 */
export function parseMemoryCommand(question: string): MemoryCommand | null {
  const q = question.trim();
  if (!q) return null;

  let m = q.match(/^(?:please\s+)?(?:remember|note|keep in mind|don'?t forget|save)\b[:,]?\s*(?:that\s+)?(.*)$/i);
  if (m) {
    const text = m[1].trim();
    if (text) return { action: 'remember', text };
  }

  m = q.match(/^(?:please\s+)?(?:forget|remove|delete|clear)\b[:,]?\s*(.*)$/i);
  if (m) {
    const rest = m[1].trim().replace(/^(?:that|about|my|the)\s+/i, '');
    if (!rest || /^(all|everything|memory|memories|facts|what you know)\b/i.test(rest)) {
      return { action: 'forget', query: null };
    }
    return { action: 'forget', query: rest };
  }

  if (
    /^(?:what do you (?:remember|know)|(?:list|show) (?:your |the )?memor(?:y|ies)|my memor(?:y|ies)|what have you remembered)/i.test(
      q,
    )
  ) {
    return { action: 'list' };
  }

  return null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Adds a fact, replacing an existing one with the same wording. Returns the new
 * list; `rejected` explains why nothing was stored when a fact is refused.
 */
export function rememberFact(
  facts: MemoryFact[],
  text: string,
): { facts: MemoryFact[]; fact?: MemoryFact; rejected?: string } {
  const clean = text.trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
  if (clean.length < 2) return { facts, rejected: "That's too short to remember." };
  if (SECRET_RE.test(clean)) {
    return { facts, rejected: "I won't store that — it looks like a password or card number." };
  }
  const stored = clean.length > MAX_FACT_LENGTH ? clean.slice(0, MAX_FACT_LENGTH) : clean;

  const key = normalize(stored);
  const existing = facts.find((f) => normalize(f.text) === key);
  if (existing) return { facts, fact: existing };

  const fact: MemoryFact = { id: uid(), text: stored, createdAt: Date.now() };
  const next = [...facts, fact];
  if (next.length > MAX_FACTS) next.splice(0, next.length - MAX_FACTS);
  return { facts: next, fact };
}

/** Removes facts matching a query (any word matches), or every fact when null. */
export function forgetFacts(
  facts: MemoryFact[],
  query: string | null,
): { facts: MemoryFact[]; removed: MemoryFact[] } {
  if (!query) return { facts: [], removed: facts };

  const words = normalize(query)
    .split(' ')
    .filter((w) => w.length > 2);
  const removed = facts.filter((f) => {
    const n = normalize(f.text);
    return words.length ? words.some((w) => n.includes(w)) : true;
  });
  if (removed.length === 0) return { facts, removed: [] };
  const removedIds = new Set(removed.map((f) => f.id));
  return { facts: facts.filter((f) => !removedIds.has(f.id)), removed };
}

/** Bullet list of facts for a prompt or for display. */
export function formatMemory(facts: MemoryFact[]): string {
  return facts.map((f) => `- ${f.text}`).join('\n');
}

/**
 * Turns a memory command into a reply. Returns null for an ordinary question so
 * the caller can answer it normally.
 */
export function answerMemoryCommand(
  command: MemoryCommand,
  facts: MemoryFact[],
): { answer: AssistantAnswer; facts: MemoryFact[] } | null {
  if (command.action === 'remember') {
    const res = rememberFact(facts, command.text);
    if (res.rejected) {
      return { answer: { content: res.rejected }, facts: res.facts };
    }
    if (!res.fact || res.facts === facts) {
      return { answer: { content: `I already remember that: "${res.fact?.text ?? command.text}".` }, facts: res.facts };
    }
    return { answer: { content: `Got it — I'll remember that ${res.fact.text}.` }, facts: res.facts };
  }

  if (command.action === 'forget') {
    const res = forgetFacts(facts, command.query);
    if (res.removed.length === 0) {
      return {
        answer: { content: `I don't have anything remembered about "${command.query}".` },
        facts: res.facts,
      };
    }
    if (command.query === null) {
      return { answer: { content: `Done — I cleared all ${res.removed.length} remembered fact(s).` }, facts: res.facts };
    }
    return {
      answer: {
        content: `Forgot ${res.removed.length} fact(s) about "${command.query}".`,
        table: {
          columns: ['Forgotten'],
          rows: res.removed.map((f) => [f.text]),
        },
      },
      facts: res.facts,
    };
  }

  // list
  if (facts.length === 0) {
    return {
      answer: {
        content: 'I have nothing remembered yet. Tell me "remember …" and I\'ll keep it in mind for next time.',
      },
      facts,
    };
  }
  return {
    answer: {
      content: `Here's what I remember (${facts.length}):`,
      table: { columns: ['Remembered'], rows: facts.map((f) => [f.text]) },
    },
    facts,
  };
}
