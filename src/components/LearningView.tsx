import { useRef, useState } from 'react';
import { Brain, Download, Sparkles, Trash2, Upload } from 'lucide-react';
import {
  learningSummary,
  type LearningData,
} from '../lib/learning';
import { download } from '../lib/utils';

/**
 * Shows what the app has learned from your corrections and lets you back it up,
 * move it between devices, or start over.
 */
export function LearningView({
  data,
  onImport,
  onClear,
}: {
  data: LearningData;
  onImport: (json: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const summary = learningSummary(data);
  const empty = summary.lines === 0 && summary.fixes === 0 && summary.junk === 0 && summary.stores === 0;

  const exportLearning = () => {
    download(
      `receipt-learning-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    );
  };

  const handleImportFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    try {
      await onImport(await file.text());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div className="grid">
      <div className="card card-pad">
        <h3 className="section-title">
          <Brain size={16} /> Learning
        </h3>
        <p className="muted" style={{ marginTop: 4 }}>
          The app learns from every correction you make in the review screen — a fixed item name, a
          corrected price, a header line you delete — and replays it on your next scans. Everything
          stays on this device. Scan and correct a few receipts and the same mistakes stop coming
          back.
        </p>
        <div className="row" style={{ gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="stat-value">{summary.trainedOn}</div>
            <div className="stat-label">Receipts learned from</div>
          </div>
          <div>
            <div className="stat-value">{summary.lines}</div>
            <div className="stat-label">Remembered lines</div>
          </div>
          <div>
            <div className="stat-value">{summary.fixes}</div>
            <div className="stat-label">Name fixes</div>
          </div>
          <div>
            <div className="stat-value">{summary.junk}</div>
            <div className="stat-label">Ignored lines</div>
          </div>
          <div>
            <div className="stat-value">{summary.stores}</div>
            <div className="stat-label">Stores learned</div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={exportLearning} disabled={empty}>
            <Download size={16} /> Export learning
          </button>
          <button className="btn" onClick={() => importRef.current?.click()}>
            <Upload size={16} /> Import learning
          </button>
          <div className="spacer" />
          {!confirmClear ? (
            <button className="btn btn-danger" onClick={() => setConfirmClear(true)} disabled={empty}>
              <Trash2 size={16} /> Forget everything
            </button>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <span className="muted">Forget all learned corrections?</span>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await onClear();
                  setConfirmClear(false);
                }}
              >
                Yes, forget
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => handleImportFile(e.target.files)}
        />
        {error && (
          <div className="alert-warning" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}
      </div>

      {empty ? (
        <div className="card card-pad">
          <p className="muted">
            Nothing learned yet. Scan a receipt, fix anything the reader got wrong, and save — the
            corrections appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card card-pad">
            <h4 className="section-title">
              <Sparkles size={14} /> Remembered lines
            </h4>
            {data.items.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              <ul className="learning-list">
                {[...data.items]
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 50)
                  .map((i) => (
                    <li key={i.from}>
                      <span className="muted">{i.from}</span>
                      <span aria-hidden> → </span>
                      <strong>{i.name}</strong>
                      {i.price !== undefined && <span className="muted"> ({i.price.toFixed(2)})</span>}
                      <span className="muted"> ×{i.count}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="card card-pad">
            <h4 className="section-title">
              <Sparkles size={14} /> Name fixes
            </h4>
            {data.tokenFixes.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              <ul className="learning-list">
                {[...data.tokenFixes]
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 50)
                  .map((t) => (
                    <li key={t.from}>
                      <span className="muted">{t.from}</span>
                      <span aria-hidden> → </span>
                      <strong>{t.to}</strong>
                      <span className="muted"> ×{t.count}</span>
                    </li>
                  ))}
              </ul>
            )}
            {data.junk.length > 0 && (
              <>
                <h4 className="section-title" style={{ marginTop: 20 }}>
                  Ignored lines
                </h4>
                <ul className="learning-list">
                  {data.junk.slice(0, 50).map((j) => (
                    <li key={j.text}>
                      <span className="muted">{j.text}</span>
                      <span className="muted"> ×{j.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
