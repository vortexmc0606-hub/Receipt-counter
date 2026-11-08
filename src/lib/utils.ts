import type { Category, Receipt } from '../types';

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

export interface ItemTrendPoint {
  /** ISO date of the purchase. */
  date: string;
  /** What one unit cost on that date. */
  unitPrice: number;
  qty: number;
  merchant: string;
  receiptId: string;
}

export interface ItemTrend {
  key: string;
  name: string;
  category: Category;
  points: ItemTrendPoint[];
  count: number;
  latest: number;
  first: number;
  /** Percentage change from the first to the latest purchase. */
  changePct: number;
}

/**
 * Builds a price history for every distinct item, so you can see how the cost of
 * one product moves over time. Items are matched on a normalised name (case,
 * punctuation and spacing ignored) so the same product from different receipts
 * lines up.
 */
export function itemTrends(receipts: Receipt[]): ItemTrend[] {
  const byKey = new Map<string, ItemTrend>();
  for (const r of receipts) {
    for (const item of r.items) {
      const key = item.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key) continue;
      const unit = item.qty > 0 ? item.price / item.qty : item.price;
      const unitPrice = Math.round(unit * 100) / 100;
      let trend = byKey.get(key);
      if (!trend) {
        trend = { key, name: item.name, category: item.category, points: [], count: 0, latest: 0, first: 0, changePct: 0 };
        byKey.set(key, trend);
      }
      trend.points.push({ date: r.date, unitPrice, qty: item.qty, merchant: r.merchant, receiptId: r.id });
    }
  }
  const trends: ItemTrend[] = [];
  for (const trend of byKey.values()) {
    trend.points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    trend.count = trend.points.length;
    trend.first = trend.points[0].unitPrice;
    trend.latest = trend.points[trend.points.length - 1].unitPrice;
    trend.changePct = trend.first > 0 ? ((trend.latest - trend.first) / trend.first) * 100 : 0;
    trends.push(trend);
  }
  return trends.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface StoreTotal {
  name: string;
  kind: string;
  total: number;
  count: number;
  /** Total saved at this store across its receipts. */
  savings: number;
  lastVisit: string;
}

/**
 * Groups receipts by their canonical store. `resolve` maps a receipt's merchant
 * (and items) to a store, so callers can pass the learning-aware resolver.
 */
export function storeTotals(
  receipts: Receipt[],
  resolve: (r: Receipt) => { name: string; kind: string },
): StoreTotal[] {
  const map = new Map<string, StoreTotal>();
  for (const r of receipts) {
    const { name, kind } = resolve(r);
    const cur =
      map.get(name) ??
      { name, kind, total: 0, count: 0, savings: 0, lastVisit: r.date };
    cur.total += receiptTotal(r);
    cur.count += 1;
    cur.savings += r.savings ?? 0;
    if (r.date > cur.lastVisit) cur.lastVisit = r.date;
    map.set(name, cur);
  }
  return [...map.values()]
    .map((s) => ({ ...s, total: Math.round(s.total * 100) / 100, savings: Math.round(s.savings * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

/** Total savings recorded across receipts, in date order, for a savings chart. */
export function savingsOverTime(receipts: Receipt[]): { date: string; label: string; savings: number; spent: number }[] {
  const byDate = new Map<string, { savings: number; spent: number }>();
  for (const r of receipts) {
    const cur = byDate.get(r.date) ?? { savings: 0, spent: 0 };
    cur.savings += r.savings ?? 0;
    cur.spent += receiptTotal(r);
    byDate.set(r.date, cur);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) => ({
      date,
      label: prettyDate(date),
      savings: Math.round(v.savings * 100) / 100,
      spent: Math.round(v.spent * 100) / 100,
    }));
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
    ['Date', 'Merchant', 'Item', 'Category', 'Qty', 'Price', 'Subtotal', 'Tax', 'Tax Rate %', 'Receipt Total', 'Currency'],
  ];
  for (const r of receipts) {
    if (r.items.length === 0) {
      rows.push([
        r.date, r.merchant, '', '', '', '',
        r.subtotal?.toFixed(2) ?? '',
        r.tax?.toFixed(2) ?? '',
        r.taxRate !== undefined ? String(r.taxRate) : '',
        String(r.total),
        r.currency || currency,
      ]);
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
        r.subtotal?.toFixed(2) ?? '',
        r.tax?.toFixed(2) ?? '',
        r.taxRate !== undefined ? String(r.taxRate) : '',
        r.total.toFixed(2),
        r.currency || currency,
      ]);
    }
  }
  return rows
    .map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    .join('\n');
}
