import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus, Search, TrendingUp } from 'lucide-react';
import type { Receipt } from '../types';
import { itemTrends, money, prettyDate, type ItemTrend } from '../lib/utils';
import { Empty } from './ui';

const chartTooltip = {
  background: 'var(--surface-solid)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  fontSize: 12.5,
  color: 'var(--text)',
} as const;

function TrendDelta({ pct }: { pct: number }) {
  const flat = Math.abs(pct) < 0.5;
  const up = pct > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const cls = flat ? 'trend-flat' : up ? 'trend-up' : 'trend-down';
  return (
    <span className={`trend-delta ${cls}`} title="Change from the first to the latest purchase">
      <Icon size={13} />
      {flat ? 'no change' : `${up ? '+' : ''}${pct.toFixed(1)}%`}
    </span>
  );
}

function ItemHistory({ trend, currency }: { trend: ItemTrend; currency: string }) {
  const data = trend.points.map((p) => ({
    date: p.date,
    label: prettyDate(p.date),
    unitPrice: p.unitPrice,
    merchant: p.merchant,
  }));
  const min = Math.min(...data.map((d) => d.unitPrice));
  const max = Math.max(...data.map((d) => d.unitPrice));

  return (
    <div className="card card-pad glass reveal">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 className="section-title" style={{ marginBottom: 4 }}>{trend.name}</h3>
          <div className="tiny muted">
            {trend.category} · bought {trend.count} time{trend.count === 1 ? '' : 's'} ·
            {' '}latest {money(trend.latest, currency)}
          </div>
        </div>
        <TrendDelta pct={trend.changePct} />
      </div>

      {data.length > 1 ? (
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={data} margin={{ top: 14, right: 12, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[Math.floor(min * 0.9 * 100) / 100, Math.ceil(max * 1.1 * 100) / 100]}
              tick={{ fontSize: 11, fill: 'var(--text-3)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={chartTooltip}
              formatter={(v: number) => [money(v, currency), 'Unit price']}
              labelFormatter={(l, p) => {
                const first = p?.[0]?.payload as { merchant?: string } | undefined;
                return first?.merchant ? `${l} · ${first.merchant}` : l;
              }}
            />
            <Line
              type="monotone"
              dataKey="unitPrice"
              stroke="var(--primary)"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: 'var(--primary)' }}
              activeDot={{ r: 6 }}
              isAnimationActive
              animationDuration={700}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="tiny muted" style={{ padding: '18px 0' }}>
          Scan this item again on a later date to see a price trend line.
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th className="num">Qty</th>
              <th className="num">Unit price</th>
            </tr>
          </thead>
          <tbody>
            {[...trend.points].reverse().map((p) => (
              <tr key={`${p.receiptId}-${p.date}-${p.unitPrice}`}>
                <td className="tiny">{prettyDate(p.date)}</td>
                <td>{p.merchant}</td>
                <td className="num">{p.qty}</td>
                <td className="num">{money(p.unitPrice, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Trends({ receipts, currency }: { receipts: Receipt[]; currency: string }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const trends = useMemo(() => itemTrends(receipts), [receipts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? trends.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
      : trends;
    // Show the most repurchased items first — they are the ones worth watching.
    return list.slice(0, 60);
  }, [trends, query]);

  const active = useMemo(
    () => trends.find((t) => t.key === selected) ?? filtered[0] ?? null,
    [trends, selected, filtered],
  );

  if (receipts.length === 0) {
    return (
      <Empty icon={<TrendingUp size={28} />} title="No items to trend yet">
        Scan a few receipts and every product you buy will get its own price history here.
      </Empty>
    );
  }

  if (trends.length === 0) {
    return (
      <Empty icon={<TrendingUp size={28} />} title="No line items found">
        Your receipts don&apos;t have any recognised items yet.
      </Empty>
    );
  }

  return (
    <div className="grid">
      <div className="card card-pad glass">
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-field" style={{ flex: 1, minWidth: 220 }}>
            <Search size={15} />
            <input
              className="input"
              placeholder="Search an item, e.g. milk or bananas…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <span className="tiny muted">{trends.length} items tracked</span>
        </div>

        <div className="chip-row" style={{ marginTop: 14 }}>
          {filtered.map((t) => (
            <button
              key={t.key}
              className={`chip${active?.key === t.key ? ' chip-active' : ''}`}
              onClick={() => setSelected(t.key)}
            >
              <span>{t.name}</span>
              <span className="chip-badge">{t.count}</span>
            </button>
          ))}
          {filtered.length === 0 && <span className="tiny muted">No items match “{query}”.</span>}
        </div>
      </div>

      {active && <ItemHistory trend={active} currency={currency} />}
    </div>
  );
}
