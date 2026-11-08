import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeft, PiggyBank, Search, Store as StoreIcon } from 'lucide-react';
import type { Receipt } from '../types';
import type { LearningData } from '../lib/learning';
import { storeFor } from '../lib/learning';
import { money, prettyDate, receiptTotal, storeTotals, type StoreTotal } from '../lib/utils';
import { Empty } from './ui';

const COLORS = ['#4f46e5', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#84cc16', '#64748b', '#0ea5e9'];

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  fontSize: 12.5,
  color: 'var(--text)',
} as const;

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Stores({
  receipts,
  learning,
  currency,
}: {
  receipts: Receipt[];
  learning: LearningData;
  currency: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const resolve = useMemo(
    () => (r: Receipt) => {
      const m = storeFor(r.merchant, r.items, learning);
      return { name: m.name, kind: m.kind };
    },
    [learning],
  );

  const totals = useMemo(() => storeTotals(receipts, resolve), [receipts, resolve]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? totals.filter((s) => s.name.toLowerCase().includes(q) || s.kind.toLowerCase().includes(q))
      : totals;
  }, [totals, query]);

  const totalSaved = useMemo(() => totals.reduce((s, t) => s + t.savings, 0), [totals]);
  const chartData = useMemo(() => totals.slice(0, 10).map((s) => ({ name: s.name, total: s.total })), [totals]);

  const activeStore: StoreTotal | null = open ? totals.find((s) => s.name === open) ?? null : null;
  const activeReceipts = useMemo(
    () => (open ? receipts.filter((r) => resolve(r).name === open) : []),
    [open, receipts, resolve],
  );

  if (receipts.length === 0) {
    return (
      <Empty icon={<StoreIcon size={28} />} title="No stores yet">
        Scan receipts and every shop or restaurant you visit will be listed here with its own spend.
      </Empty>
    );
  }

  if (activeStore) {
    const items = activeReceipts.flatMap((r) => r.items.map((it) => ({ ...it, date: r.date })));
    const byItem = new Map<string, { name: string; total: number; qty: number }>();
    for (const it of items) {
      const key = it.name.toLowerCase();
      const cur = byItem.get(key) ?? { name: it.name, total: 0, qty: 0 };
      cur.total += it.price;
      cur.qty += it.qty;
      byItem.set(key, cur);
    }
    const topItems = [...byItem.values()].sort((a, b) => b.total - a.total).slice(0, 12);

    return (
      <div className="grid">
        <button className="btn btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setOpen(null)}>
          <ArrowLeft size={16} /> All stores
        </button>

        <div className="card card-pad glass reveal">
          <div className="row" style={{ gap: 14, alignItems: 'center' }}>
            <span className="store-avatar store-avatar-lg" style={{ background: colorFor(activeStore.name) }}>
              {initials(activeStore.name)}
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.5px' }}>{activeStore.name}</h2>
              <div className="tiny muted">
                {activeStore.kind} · {activeStore.count} receipt{activeStore.count === 1 ? '' : 's'} ·
                {' '}last visit {prettyDate(activeStore.lastVisit)}
              </div>
            </div>
            <div className="spacer" />
            <div style={{ textAlign: 'right' }}>
              <div className="stat-value">{money(activeStore.total, currency)}</div>
              <div className="stat-label">Total spent</div>
            </div>
          </div>
          {activeStore.savings > 0 && (
            <div className="alert alert-info" style={{ marginTop: 14 }}>
              <PiggyBank size={15} />
              You saved {money(activeStore.savings, currency)} across {activeStore.name} receipts.
            </div>
          )}
        </div>

        <div className="grid grid-2">
          <div className="card card-pad">
            <h3 className="section-title">Visits over time</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={[...activeReceipts].sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({
                  label: prettyDate(r.date),
                  total: receiptTotal(r),
                }))}
                margin={{ top: 6, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, currency)} />
                <Bar dataKey="total" fill={colorFor(activeStore.name)} radius={[6, 6, 0, 0]} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card card-pad">
            <h3 className="section-title">Most bought here</h3>
            {topItems.length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Qty</th>
                      <th className="num">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItems.map((i) => (
                      <tr key={i.name}>
                        <td>{i.name}</td>
                        <td className="num">{i.qty}</td>
                        <td className="num">{money(i.total, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="tiny muted">No line items recognised for this store.</div>
            )}
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="section-title">Receipts from {activeStore.name}</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Items</th>
                  <th className="num">Saved</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...activeReceipts].reverse().map((r) => (
                  <tr key={r.id}>
                    <td className="tiny">{prettyDate(r.date)}</td>
                    <td className="num">{r.items.length}</td>
                    <td className="num">{r.savings ? money(r.savings, currency) : '—'}</td>
                    <td className="num">{money(receiptTotal(r), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card card-pad glass">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 className="section-title" style={{ marginBottom: 2 }}>Stores &amp; restaurants</h3>
            <div className="tiny muted">Tap any store to see its own spend and receipts.</div>
          </div>
          <div className="search-field" style={{ minWidth: 220 }}>
            <Search size={15} />
            <input
              className="input"
              placeholder="Search a store…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-stats">
        <div className="card card-pad stat">
          <div className="stat-label"><StoreIcon size={13} /> Stores</div>
          <div className="stat-value">{totals.length}</div>
          <div className="stat-sub">{receipts.length} receipts</div>
        </div>
        <div className="card card-pad stat">
          <div className="stat-label"><PiggyBank size={13} /> Total saved</div>
          <div className="stat-value">{money(totalSaved, currency)}</div>
          <div className="stat-sub">across all stores</div>
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="card card-pad">
          <h3 className="section-title">Top stores by spend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fontSize: 11.5, fill: 'var(--text-2)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, currency)} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="total" radius={[0, 6, 6, 0]} animationDuration={700}>
                {chartData.map((d) => (
                  <Cell key={d.name} fill={colorFor(d.name)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="store-grid">
        {filtered.map((s) => (
          <button key={s.name} className="store-card glass reveal" onClick={() => setOpen(s.name)}>
            <span className="store-avatar" style={{ background: colorFor(s.name) }}>
              {initials(s.name)}
            </span>
            <span className="store-card-body">
              <span className="store-card-name">{s.name}</span>
              <span className="tiny muted">
                {s.kind} · {s.count} receipt{s.count === 1 ? '' : 's'}
              </span>
            </span>
            <span className="store-card-amount">{money(s.total, currency)}</span>
          </button>
        ))}
        {filtered.length === 0 && <div className="tiny muted">No stores match “{query}”.</div>}
      </div>
    </div>
  );
}
