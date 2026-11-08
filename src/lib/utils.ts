import type { Receipt } from '../types';

export function money(value: number, currency = '$'): string {
  const n = Number.isFinite(value) ? value : 0;
  const sign = n < 0 ? '-' : '';
  return `${sign}${currency}${Math.abs(n).toFixed(2)}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function receiptTotal(r: Receipt): number {
  if (r.total > 0) return r.total;
  return r.items.reduce((s, i) => s + i.price, 0);
}

export function groupByDate(receipts: Receipt[]): Map<string, Receipt[]> {
  const map = new Map<string, Receipt[]>();
  for (const r of receipts) {
    const list = map.get(r.date) ?? [];
    list.push(r);
    map.set(r.date, list);
  }
  return new Map([...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)));
}

export function categoryTotals(receipts: Receipt[]): { category: string; total: number }[] {
  const map = new Map<string, number>();
  for (const r of receipts) {
    for (const item of r.items) {
      map.set(item.category, (map.get(item.category) ?? 0) + item.price);
    }
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

export function monthlyTotals(receipts: Receipt[]): { month: string; label: string; total: number }[] {
  const map = new Map<string, number>();
  for (const r of receipts) {
    const k = monthKey(r.date);
    map.set(k, (map.get(k) ?? 0) + receiptTotal(r));
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, total]) => ({ month, label: monthLabel(month), total: Math.round(total * 100) / 100 }));
}

export function merchantTotals(receipts: Receipt[]): { merchant: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const r of receipts) {
    const key = r.merchant || 'Unknown';
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += receiptTotal(r);
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([merchant, v]) => ({ merchant, total: Math.round(v.total * 100) / 100, count: v.count }))
    .sort((a, b) => b.total - a.total);
}

export function download(filename: string, content: string, type = 'application/json'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function receiptsToCSV(receipts: Receipt[], currency = '$'): string {
  const rows: string[][] = [
    ['Date', 'Merchant', 'Item', 'Category', 'Qty', 'Price', 'Receipt Total', 'Currency'],
  ];
  for (const r of receipts) {
    if (r.items.length === 0) {
      rows.push([r.date, r.merchant, '', '', '', '', String(r.total), r.currency || currency]);
      continue;
    }
    for (const item of r.items) {
      rows.push([
        r.date,
        r.merchant,
        item.name,
        item.category,
        String(item.qty),
        item.price.toFixed(2),
        r.total.toFixed(2),
        r.currency || currency,
      ]);
    }
  }
  return rows
    .map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    .join('\n');
}
