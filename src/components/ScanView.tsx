import { useCallback, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  Image as ImageIcon,
  Loader2,
  Plus,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { CATEGORIES, type Category, type Receipt, type ReceiptItem, type Settings } from '../types';
import { makeThumbnail, recognizeImageVariants } from '../lib/ocr';
import { enhanceDocument } from '../lib/scan';
import { readReceiptWithAI } from '../lib/ai';
import { parseReceiptText, uid, type ParsedReceipt } from '../lib/parser';
import { applyLearning, type LearningData } from '../lib/learning';
import { money, todayISO } from '../lib/utils';
import { Modal } from './ui';

type Stage = 'idle' | 'ocr' | 'review';

interface ReadOutcome {
  merchant: string;
  date: string;
  currency: string | null;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  total: number;
  savings?: number;
  rawText: string;
  warnings: string[];
  quality: number;
}

export function ScanView({
  currency,
  settings,
  learning,
  onSave,
}: {
  currency: string;
  settings: Settings;
  learning: LearningData;
  onSave: (r: Receipt, original?: ParsedReceipt) => Promise<void>;
}) {
  const [stage, setStage] = useState<Stage>('idle');
  const [dragover, setDragover] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Receipt | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const originalRef = useRef<ParsedReceipt | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const runOcr = useCallback(
    async (file: Blob) => {
      setError(null);
      setStage('ocr');
      setProgress(0);
      setStatusText('Preparing…');
      const notes: string[] = [];
      try {
        const thumb = await makeThumbnail(file).catch(() => undefined);
        setPreview(thumb ?? null);

        // Clean the photo up first (Apple-style): shadows removed, contrast
        // normalised, small rotations levelled, paper cropped and thresholded.
        // The cleaned image is what we read from and what we keep on screen, so
        // a dim, angled snapshot becomes a flat, high-contrast scan.
        let cleaned: Blob = file;
        let cleanedPreview: string | undefined;
        if (settings.enhanceScan) {
          setStatusText('Cleaning up the photo…');
          setProgress(8);
          try {
            const enhanced = await enhanceDocument(file);
            cleaned = enhanced.blob;
            cleanedPreview = enhanced.dataUrl;
            if (cleanedPreview) setPreview(cleanedPreview);
            if (enhanced.angle !== 0 || enhanced.cropped) {
              notes.push('Straightened and cropped the photo for a clearer read.');
            }
          } catch {
            notes.push('Could not clean up the photo; using it as-is.');
          }
        }

        let outcome: ReadOutcome | null = null;

        // Preferred path: a vision model, when the user has enabled it.
        if (settings.aiReading && settings.llmBaseUrl.trim()) {
          setStatusText('Reading with AI…');
          setProgress(35);
          try {
            const ai = await readReceiptWithAI(cleaned, settings);
            outcome = { ...ai, quality: 0 };
            notes.push(...ai.warnings);
            notes.push('Read by AI — check the amounts against the photo.');
          } catch (aiErr) {
            notes.push(
              `AI reading failed (${aiErr instanceof Error ? aiErr.message : 'unknown error'}). ` +
                'Fell back to on-device reading.',
            );
          }
        }

        // Fallback (and default): on-device Tesseract OCR.
        if (!outcome) {
          setStatusText('Reading on your device…');
          const variants = await recognizeImageVariants(cleaned, (status, p) => {
            setStatusText(status);
            setProgress(Math.round(p * 100));
          });
          const parses = variants.map((v) => ({ ocr: v, parsed: parseReceiptText(v.text) }));
          // Keep the parse that reconciles best (total vs. subtotal/tax/items).
          parses.sort((a, b) => b.parsed.quality - a.parsed.quality);
          const best = parses[0];
          if (!best || best.ocr.text.trim().length < 8) {
            throw new Error('No readable text was found in that image. Try a clearer, well-lit photo.');
          }
          outcome = best.parsed;
          if (best.ocr.confidence > 0 && best.ocr.confidence < 70) {
            notes.unshift(
              `The photo was hard to read (confidence ${Math.round(best.ocr.confidence)}%). ` +
                'Please check the amounts against the receipt.',
            );
          }
          notes.push(...best.parsed.warnings);
        }

        // Replay everything learned from previous corrections.
        const raw = outcome as ParsedReceipt;
        const learned = applyLearning(raw, learning);
        outcome = learned.result;
        // Diff against the raw reader output when learning from the final save.
        originalRef.current = raw;
        if (learned.applied.length) {
          notes.push(...learned.applied.map((a) => `Applied from your corrections: ${a}`));
        }

        setWarnings(notes);
        setDraft({
          id: uid(),
          merchant: outcome.merchant,
          date: outcome.date,
          currency: outcome.currency || currency,
          items: outcome.items,
          subtotal: outcome.subtotal,
          tax: outcome.tax,
          total: outcome.total,
          savings: outcome.savings,
          rawText: outcome.rawText,
          imageThumb: thumb,
          createdAt: Date.now(),
        });
        setStage('review');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong while reading the receipt.');
        setStage('idle');
      }
    },
    [currency, settings, learning],
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void runOcr(file);
    },
    [runOcr],
  );

  const updateDraft = (patch: Partial<Receipt>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const updateItem = (id: string, patch: Partial<ReceiptItem>) =>
    setDraft((d) =>
      d ? { ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } : d,
    );

  const removeItem = (id: string) =>
    setDraft((d) => (d ? { ...d, items: d.items.filter((it) => it.id !== id) } : d));

  const addItem = () =>
    setDraft((d) =>
      d
        ? {
            ...d,
            items: [...d.items, { id: uid(), name: '', price: 0, qty: 1, category: 'Other' }],
          }
        : d,
    );

  const itemsSum = draft ? draft.items.reduce((s, i) => s + (Number(i.price) || 0), 0) : 0;

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const clean: Receipt = {
        ...draft,
        merchant: draft.merchant.trim() || 'Unknown merchant',
        items: draft.items
          .filter((i) => i.name.trim().length > 0)
          .map((i) => ({ ...i, name: i.name.trim(), price: Number(i.price) || 0, qty: Number(i.qty) || 1 })),
        total: Number(draft.total) || itemsSum,
        subtotal: draft.subtotal !== undefined ? Number(draft.subtotal) : undefined,
        tax: draft.tax !== undefined ? Number(draft.tax) : undefined,
        savings: draft.savings !== undefined ? Number(draft.savings) : undefined,
      };
      await onSave(clean, originalRef.current ?? undefined);
      reset();
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(null);
    setPreview(null);
    setWarnings([]);
    setStage('idle');
    setProgress(0);
    setError(null);
    originalRef.current = null;
    if (fileInput.current) fileInput.current.value = '';
    if (cameraInput.current) cameraInput.current.value = '';
  };

  return (
    <div className="grid">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />

      {stage === 'idle' && (
        <>
          <div
            className={`dropzone${dragover ? ' dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragover(true);
            }}
            onDragLeave={() => setDragover(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragover(false);
              onFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
          >
            <div className="dropzone-icon">
              <ScanLine size={28} />
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 19 }}>Scan a receipt</h2>
            <p className="muted" style={{ margin: '0 0 18px', fontSize: 13.5 }}>
              Drop an image here, or choose a source. Text is read on your device — nothing is uploaded.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  cameraInput.current?.click();
                }}
              >
                <Camera size={17} /> Take photo
              </button>
              <button
                className="btn"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInput.current?.click();
                }}
              >
                <Upload size={17} /> Choose image
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger">
              <AlertTriangle size={17} />
              <div>{error}</div>
            </div>
          )}

          <div className="alert alert-info">
            <Sparkles size={17} />
            <div>
              <strong>Tip:</strong> lay the receipt flat on a dark surface, fill the frame, and avoid shadows.
              You can fix anything the reader gets wrong before saving.
            </div>
          </div>
        </>
      )}

      {stage === 'ocr' && (
        <div className="card card-pad" style={{ textAlign: 'center', padding: 42 }}>
          <Loader2 size={34} className="spin" style={{ color: 'var(--primary)' }} />
          <h3 style={{ margin: '16px 0 4px' }}>Reading your receipt…</h3>
          <p className="muted tiny" style={{ textTransform: 'capitalize' }}>
            {statusText || 'working'} {progress > 0 && `· ${progress}%`}
          </p>
          <div className="progress-track" style={{ maxWidth: 420, margin: '18px auto 0' }}>
            <div className="progress-fill" style={{ width: `${Math.max(6, progress)}%` }} />
          </div>
          <p className="tiny muted" style={{ marginTop: 16 }}>
            First run downloads the OCR engine (~10&nbsp;MB) and caches it for next time.
          </p>
        </div>
      )}

      {stage === 'review' && draft && (
        <Modal
          wide
          title="Review scanned receipt"
          onClose={reset}
          footer={
            <>
              <button className="btn" onClick={reset} disabled={saving}>
                Discard
              </button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />} Save receipt
              </button>
            </>
          }
        >
          <div className="grid grid-2" style={{ alignItems: 'start' }}>
            <div className="grid" style={{ gap: 12 }}>
              <div className="field">
                <label>Merchant</label>
                <input
                  className="input"
                  value={draft.merchant}
                  onChange={(e) => updateDraft({ merchant: e.target.value })}
                />
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1, minWidth: 150 }}>
                  <label>Date</label>
                  <input
                    className="input"
                    type="date"
                    value={draft.date || todayISO()}
                    onChange={(e) => updateDraft({ date: e.target.value })}
                  />
                </div>
                <div className="field" style={{ width: 92 }}>
                  <label>Currency</label>
                  <input
                    className="input"
                    value={draft.currency}
                    maxLength={3}
                    onChange={(e) => updateDraft({ currency: e.target.value })}
                  />
                </div>
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Subtotal</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={draft.subtotal ?? ''}
                    onChange={(e) =>
                      updateDraft({ subtotal: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Tax</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={draft.tax ?? ''}
                    onChange={(e) =>
                      updateDraft({ tax: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Total</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={draft.total}
                    onChange={(e) => updateDraft({ total: Number(e.target.value) })}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Saved (optional)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    placeholder="—"
                    value={draft.savings ?? ''}
                    onChange={(e) =>
                      updateDraft({ savings: e.target.value === '' ? undefined : Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </div>

            <div>
              {preview ? (
                <img src={preview} alt="Scanned receipt" className="preview-img" />
              ) : (
                <div className="empty" style={{ padding: 24 }}>
                  <ImageIcon size={26} />
                  <div className="tiny">No preview available</div>
                </div>
              )}
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="alert alert-warning" style={{ marginTop: 16 }}>
              <AlertTriangle size={17} />
              <div>
                {warnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            </div>
          )}

          <div className="section-title" style={{ marginTop: 20 }}>
            Line items <span className="badge">{draft.items.length}</span>
            <div className="spacer" />
            <span className="tiny muted">
              Items total {money(itemsSum, draft.currency)} · Receipt total {money(Number(draft.total) || 0, draft.currency)}
            </span>
          </div>

          <div className="grid" style={{ gap: 8 }}>
            {draft.items.map((item) => (
              <div className="item-edit" key={item.id}>
                <input
                  className="input"
                  placeholder="Item name"
                  value={item.name}
                  onChange={(e) => updateItem(item.id, { name: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  min={1}
                  title="Quantity"
                  value={item.qty}
                  onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) })}
                />
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  title="Line total"
                  value={item.price}
                  onChange={(e) => updateItem(item.id, { price: Number(e.target.value) })}
                />
                <select
                  className="select"
                  value={item.category}
                  onChange={(e) => updateItem(item.id, { category: e.target.value as Category })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost btn-icon btn-danger"
                  onClick={() => removeItem(item.id)}
                  aria-label="Remove item"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {draft.items.length === 0 && (
              <div className="tiny muted" style={{ padding: '6px 0' }}>
                No items detected — add them below.
              </div>
            )}
            <button className="btn btn-sm" onClick={addItem} style={{ justifySelf: 'start' }}>
              <Plus size={15} /> Add item
            </button>
          </div>

          {draft.rawText && (
            <details style={{ marginTop: 18 }}>
              <summary className="tiny muted" style={{ cursor: 'pointer' }}>
                View raw OCR text
              </summary>
              <pre
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11.5,
                  background: 'var(--surface-2)',
                  padding: 12,
                  borderRadius: 9,
                  maxHeight: 220,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {draft.rawText}
              </pre>
            </details>
          )}
        </Modal>
      )}
    </div>
  );
}
