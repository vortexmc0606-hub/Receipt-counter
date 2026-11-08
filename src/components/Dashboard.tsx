import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarDays, CreditCard, PiggyBank, ReceiptText, TrendingUp, Wallet } from 'lucide-react';
import type { Receipt } from '../types';
import {
  categoryTotals,
  merchantTotals,
  money,
  monthKey,
  monthLabel,
  monthlyTotals,
  prettyDate,
  receiptTotal,
  savingsOverTime,
} from '../lib/utils';
import { Empty, Stat } from './ui';

const COLORS = ['#4f46e5', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#84cc16', '#64748b'];

export function Dashboard({ receipts, currency }: { receipts: Receipt[]; currency: string }) {
  const stats = useMemo(() => {
    const total = receipts.reduce((s, r) => s + receiptTotal(r), 0);
    const thisMonth = monthKey(new Date().toISOString().slice(0, 10));
    const monthTotal = receipts
      .filter((r) => monthKey(r.date) === thisMonth)
      .reduce((s, r) => s + receiptTotal(r), 0);
    const itemCount = receipts.reduce((s, r) => s + r.items.length, 0);
    const days = new Set(receipts.map((r) => r.date)).size;
    const avg = receipts.length ? total / receipts.length : 0;
    const savings = receipts.reduce((s, r) => s + (r.savings ?? 0), 0);
    return { total, monthTotal, itemCount, days, avg, count: receipts.length, savings };
  }, [receipts]);

  const byCategory = useMemo(() => categoryTotals(receipts), [receipts]);
  const byMonth = useMemo(() => monthlyTotals(receipts).slice(-8), [receipts]);
  const savingsSeries = useMemo(() => savingsOverTime(receipts).slice(-24), [receipts]);
  const topMerchants = useMemo(() => merchantTotals(receipts).slice(0, 6), [receipts]);
  const recent = useMemo(() => receipts.slice(0, 6), [receipts]);

  if (receipts.length === 0) {
    return (
      <Empty icon={<ReceiptText size={28} />} title="No receipts yet">
        Head to the Scan tab to add your first receipt. Your spending overview will appear here.
      </Empty>
    );
  }

  return (
    <div className="grid">
      <div className="grid grid-stats">
        <Stat label="Total spent" value={money(stats.total, currency)} sub={`${stats.count} receipts`} icon={<Wallet size={13} />} />
        <Stat label="This month" value={money(stats.monthTotal, currency)} sub={monthLabel(monthKey(new Date().toISOString().slice(0, 10)))} icon={<TrendingUp size={13} />} />
        <Stat label="Avg. receipt" value={money(stats.avg, currency)} sub={`${stats.itemCount} items tracked`} icon={<CreditCard size={13} />} />
        <Stat label="Days with spend" value={String(stats.days)} sub="distinct dates" icon={<CalendarDays size={13} />} />
        <Stat label="Total saved" value={money(stats.savings, currency)} sub="from discounts & coupons" icon={<PiggyBank size={13} />} />
      </div>

      <div className="card card-pad">
        <h3 className="section-title">
          <PiggyBank size={16} /> Savings over time
        </h3>
        {savingsSeries.some((s) => s.savings > 0) ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={savingsSeries} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="savingsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 9,
                  fontSize: 12.5,
                  color: 'var(--text)',
                }}
                formatter={(v: number) => money(v, currency)}
              />
              <Area
                type="monotone"
                dataKey="savings"
                stroke="var(--success)"
                strokeWidth={2.5}
                fill="url(#savingsFill)"
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="tiny muted">
            No savings recorded yet. Receipts that print a “YOU SAVED” line will show up here.
          </div>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <h3 className="section-title">Monthly spending</h3>
          {byMonth.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byMonth} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => money(v, currency)}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 9,
                    fontSize: 12.5,
                    color: 'var(--text)',
                  }}
                />
                <Bar dataKey="total" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="tiny muted">Not enough data yet.</div>
          )}
        </div>

        <div className="card card-pad">
          <h3 className="section-title">Spending by category</h3>
          {byCategory.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={byCategory} dataKey="total" nameKey="category" innerRadius={52} outerRadius={84} paddingAngle={2}>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => money(v, currency)}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 9,
                    fontSize: 12.5,
                    color: 'var(--text)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="tiny muted">Add line items to see categories.</div>
          )}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <h3 className="section-title">Top merchants</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th className="num">Receipts</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {topMerchants.map((m) => (
                  <tr key={m.merchant}>
                    <td>{m.merchant}</td>
                    <td className="num">{m.count}</td>
                    <td className="num">{money(m.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="section-title">Recent receipts</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="tiny">{prettyDate(r.date)}</td>
                    <td>{r.merchant}</td>
                    <td className="num">{money(receiptTotal(r), r.currency || currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
