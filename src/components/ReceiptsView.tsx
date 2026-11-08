import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, ImageOff, ReceiptText, Search, Trash2, X } from 'lucide-react';
import { CATEGORIES, type Category, type Receipt } from '../types';
import { groupByDate, money, prettyDate, receiptTotal } from '../lib/utils';
import { Empty, Modal } from './ui';

export function ReceiptsView({
  receipts,
  currency,
  onDelete,
  onExportCSV,
}: {
  receipts: Receipt[];
  currency: string;
  onDelete: (id: string) => void;
  onExportCSV: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'All'>('All');
  const [open, setOpen] = useState<Receipt | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return receipts.filter((r) => {
      if (category !== 'All' && !r.items.some((i) => i.category === category)) return false;
      if (!q) return true;
      return (
        r.merchant.toLowerCase().includes(q) ||
        r.date.includes(q) ||
        r.items.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [receipts, query, category]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  if (receipts.length === 0) {
    return (
      <Empty icon={<ReceiptText size={28} />} title="No receipts saved">
        Scanned receipts are stored in your browser and listed here, newest date first.
      </Empty>
    );
  }

  return (
    <div className="grid">
      <div className="row" style={{ alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-3)' }}
          />
          <input
            className="input"
            style={{ paddingLeft: 34 }}
            placeholder="Search items, merchants, dates…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="select"
          style={{ width: 170 }}
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | 'All')}
        >
          <option value="All">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn" onClick={onExportCSV} title="Export all receipts to CSV">
          <FileSpreadsheet size={16} /> CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <Empty icon={<X size={26} />} title="No matches">
          Try a different search term or category.
        </Empty>
      ) : (
        [...groups.entries()].map(([date, list]) => {
          const dayTotal = list.reduce((s, r) => s + receiptTotal(r), 0);
          return (
            <div className="date-group" key={date}>
              <div className="date-head">
                <h3>{prettyDate(date)}</h3>
                <span className="badge">{list.length}</span>
                <span className="date-total">{money(dayTotal, currency)}</span>
              </div>
              <div className="card">
                {list.map((r) => (
                  <div className="receipt-row" key={r.id} onClick={() => setOpen(r)}>
                    {r.imageThumb ? (
                      <img className="receipt-thumb" src={r.imageThumb} alt="" />
                    ) : (
                      <div className="receipt-thumb">
                        <ImageOff size={17} />
                      </div>
                    )}
                    <div className="receipt-main">
                      <div className="receipt-merchant">{r.merchant}</div>
                      <div className="receipt-meta">
                        {r.items.length} item{r.items.length === 1 ? '' : 's'}
                        {r.items.length > 0 && ` · ${r.items.slice(0, 3).map((i) => i.name).join(', ')}`}
                      </div>
                    </div>
                    <div className="receipt-amount">{money(receiptTotal(r), r.currency || currency)}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {open && (
        <Modal
          wide
          title={open.merchant}
          onClose={() => setOpen(null)}
          footer={
            <>
              <button
                className="btn btn-danger"
                onClick={() => {
                  onDelete(open.id);
                  setOpen(null);
                }}
              >
                <Trash2 size={16} /> Delete
              </button>
              <div className="spacer" />
              <button className="btn" onClick={() => setOpen(null)}>
                Close
              </button>
            </>
          }
        >
          <div className="row" style={{ marginBottom: 16, alignItems: 'center' }}>
            <span className="badge badge-primary">{prettyDate(open.date)}</span>
            <span className="badge">{money(receiptTotal(open), open.currency || currency)}</span>
            {open.tax !== undefined && (
              <span className="badge">
                Tax {money(open.tax, open.currency || currency)}
                {open.taxRate ? ` (${open.taxRate}%)` : ''}
              </span>
            )}
            {open.subtotal !== undefined && (
              <span className="badge">Subtotal {money(open.subtotal, open.currency || currency)}</span>
            )}
          </div>

          {open.items.length > 0 ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th className="num">Qty</th>
                    <th className="num">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {open.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td>
                        <span className="badge">{i.category}</span>
                      </td>
                      <td className="num">{i.qty}</td>
                      <td className="num">{money(i.price, open.currency || currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="tiny muted">No line items were captured for this receipt.</div>
          )}

          {open.imageThumb && (
            <img
              src={open.imageThumb}
              alt="Receipt"
              className="preview-img"
              style={{ marginTop: 16 }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn" onClick={onClick}>
      <Download size={16} /> Export
    </button>
  );
}
