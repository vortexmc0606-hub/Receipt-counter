import type { Receipt } from '../types.js';

/**
 * Serialises receipts into compact text for the assistant prompt. Mirrors the
 * client-side builder so answers are the same whichever path serves them.
 */
export function dataContext(receipts: Receipt[], currency: string): string {
  const money = (n: number): string => `${currency}${n.toFixed(2)}`;
  const total = (r: Receipt): number => {
    const sum = r.items.reduce((s, it) => s + it.price, 0);
    return r.total > 0 ? r.total : Math.round(sum * 100) / 100;
  };

  const lines: string[] = [];
  const sorted = [...receipts].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 200);
  for (const r of sorted) {
    lines.push(`# ${r.date} | ${r.merchant} | total ${money(total(r))}`);
    for (const it of r.items.slice(0, 40)) {
      lines.push(`  - ${it.name} | ${it.category} | qty ${it.qty} | ${money(it.price)}`);
    }
  }
  return lines.join('\n');
}
