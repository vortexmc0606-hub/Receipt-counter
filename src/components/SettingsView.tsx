import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Download, MapPin, Moon, Save, ScanLine, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Upload, XCircle } from 'lucide-react';
import type { Settings } from '../types';
import { Modal } from './ui';
import { HAS_SHARED_KEY } from '../lib/env';
import { backendStatus } from '../lib/api';
import {
  describeLocation,
  detectLocationDetailed,
  estimateTax,
  geoStatus,
  type GeoStatus,
} from '../lib/geo';

export function SettingsView({
  settings,
  onSave,
  onExport,
  onImport,
  onClearAll,
}: {
  settings: Settings;
  onSave: (s: Settings) => Promise<void>;
  onExport: () => void;
  onImport: (json: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [backendMsg, setBackendMsg] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [geo, setGeo] = useState<GeoStatus | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...p }));
    setSaved(false);
  };

  // Read the capability/permission picture without prompting, so the panel can
  // say Yes/No and why before the user taps anything.
  useEffect(() => {
    let alive = true;
    void geoStatus().then((s) => {
      if (alive) setGeo(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const detectHere = async () => {
    setLocating(true);
    setLocMsg(null);
    try {
      const { location, status } = await detectLocationDetailed();
      setGeo(status);
      if (!location) {
        setLocMsg(status.reason);
        return;
      }
      patch({ location, smartLocation: true });
      const est = estimateTax(location);
      setLocMsg(
        `Detected ${describeLocation(location) || 'your area'}.` +
          (est ? ` Estimated sales tax ${est.rate}% — ${est.label}.` : ' No tax estimate available for this area.'),
      );
    } finally {
      setLocating(false);
    }
  };

  const checkBackend = async () => {
    setChecking(true);
    setBackendMsg(null);
    try {
      const status = await backendStatus({ ...draft, apiBaseUrl: draft.apiBaseUrl.trim() });
      setBackendOk(status.enabled);
      setBackendMsg(
        status.enabled
          ? `Connected. Server AI reading is on (${status.visionModel ?? status.model}).`
          : 'Connected, but the server has no API key configured — it will use on-device reading.',
      );
    } catch (e) {
      setBackendOk(false);
      setBackendMsg(`Could not reach the backend: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    await onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="card card-pad">
        <h3 className="section-title">
          <Sun size={16} /> Appearance &amp; currency
        </h3>
        <div className="grid" style={{ gap: 14 }}>
          <div className="field">
            <label>Currency symbol</label>
            <input
              className="input"
              maxLength={3}
              value={draft.currency}
              onChange={(e) => patch({ currency: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Default tax rate %</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={draft.defaultTaxRate || ''}
              onChange={(e) => patch({ defaultTaxRate: e.target.value === '' ? 0 : Number(e.target.value) })}
            />
            <p className="tiny muted" style={{ marginTop: 4 }}>
              Used when a receipt shows no tax and the app has not yet learned a rate for that store.
              Leave at 0 to never add tax automatically.
            </p>
          </div>
          <div className="field">
            <label>Smart location &amp; tax</label>
            <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={draft.smartLocation}
                onChange={(e) => patch({ smartLocation: e.target.checked })}
              />
              <span>Estimate sales tax from where I am</span>
            </label>
            <p className="tiny muted" style={{ marginTop: 4 }}>
              When a receipt shows tax but not the amount, the app uses your location (or the address
              printed on the receipt) to estimate the rate. Your location never leaves this device.
            </p>
            {geo && (
              <div className={`geo-status ${geo.granted ? 'ok' : 'no'}`} role="status">
                <span className="geo-status-icon">
                  {geo.granted ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                </span>
                <div>
                  <strong>{geo.granted ? 'Location: Yes' : 'Location: No'}</strong>
                  <span className="geo-status-reason">{geo.reason}</span>
                  {!geo.secure && (
                    <span className="geo-status-reason">
                      On iPhone/iPad open the https:// address in Safari; on Android use Chrome over https://.
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <button className="btn" onClick={() => void detectHere()} disabled={locating}>
                <MapPin size={15} /> {locating ? 'Checking…' : 'Use my location'}
              </button>
              {draft.location && (
                <button className="btn" onClick={() => patch({ location: null })}>
                  Clear
                </button>
              )}
            </div>
            {draft.location && (
              <p className="tiny" style={{ marginTop: 6 }}>
                Saved location: {describeLocation(draft.location) || 'set'}
                {(() => {
                  const est = estimateTax(draft.location);
                  return est ? ` — approx. ${est.rate}% sales tax` : '';
                })()}
              </p>
            )}
            {locMsg && (
              <p className="tiny muted" style={{ marginTop: 4 }}>
                {locMsg}
              </p>
            )}
          </div>
          <div className="field">
            <label>Theme</label>
            <div className="row">
              <button
                className={`btn${draft.theme === 'light' ? ' btn-primary' : ''}`}
                onClick={() => patch({ theme: 'light' })}
              >
                <Sun size={15} /> Light
              </button>
              <button
                className={`btn${draft.theme === 'dark' ? ' btn-primary' : ''}`}
                onClick={() => patch({ theme: 'dark' })}
              >
                <Moon size={15} /> Dark
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="section-title">
          <ScanLine size={16} /> Photo cleanup
        </h3>
        <p className="tiny muted" style={{ marginTop: -6, marginBottom: 14 }}>
          Clean up each photo like a document scanner: removes shadows and uneven light, levels slight
          tilts, crops to the receipt, and boosts contrast. This makes both on-device and AI reading
          more accurate, and the cleaned image is what gets saved.
        </p>
        <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.enhanceScan}
            onChange={(e) => patch({ enhanceScan: e.target.checked })}
          />
          <span>Clean up photos before reading</span>
        </label>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Scan resolution</label>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {[
              { v: 1800, label: 'Fast' },
              { v: 2600, label: 'Balanced' },
              { v: 3200, label: 'Sharp' },
            ].map((opt) => (
              <button
                key={opt.v}
                className={`btn btn-sm${draft.scanResolution === opt.v ? ' btn-primary' : ''}`}
                onClick={() => patch({ scanResolution: opt.v })}
              >
                {opt.label} · {opt.v}px
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            Higher resolution reads small receipt digits more reliably but takes a little longer.
            Balanced (2600px) is the tested sweet spot.
          </p>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="section-title">
          <ShieldCheck size={16} /> Privacy
        </h3>
        <p className="tiny muted" style={{ marginTop: -6, marginBottom: 14 }}>
          Personal details on a receipt — card numbers, phone numbers, addresses and names — are
          blacked out of the image and removed from the text before anything is sent to an AI, and
          are not kept when a receipt is saved.
        </p>
        <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.redactPersonal}
            onChange={(e) => patch({ redactPersonal: e.target.checked })}
          />
          <span>Black out personal details</span>
        </label>
        <label
          className="row"
          style={{ alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 12 }}
        >
          <input
            type="checkbox"
            checked={draft.reverseStoreSearch}
            onChange={(e) => patch({ reverseStoreSearch: e.target.checked })}
          />
          <span>Reverse-search the store when the header is unclear</span>
        </label>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          When the store name cannot be read, the AI identifies the chain from the other details on
          the receipt (store number, city, slogan). Only the blacked-out text is sent.
        </p>
      </div>

      <div className="card card-pad">
        <h3 className="section-title">
          <Sparkles size={16} /> AI reading
        </h3>
        <p className="tiny muted" style={{ marginTop: -6, marginBottom: 14 }}>
          {HAS_SHARED_KEY
            ? 'This app is set up with a shared connection, so AI reading works out of the box. No key is needed.'
            : 'When on, the receipt photo is sent to the app\u2019s AI service for a much more accurate read. Personal details are blacked out first. When off, reading happens on your device.'}
        </p>
        <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.aiReading}
            onChange={(e) => patch({ aiReading: e.target.checked })}
          />
          <span>Read receipts with AI</span>
        </label>
        {!HAS_SHARED_KEY && (
          <p className="tiny muted" style={{ marginTop: 8 }}>
            AI reading needs a connection. Add one under <strong>Advanced</strong> below.
          </p>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="section-title">
          <Database size={16} /> Your data
        </h3>
        <p className="tiny muted" style={{ marginTop: -6, marginBottom: 14 }}>
          All receipts live in this browser's IndexedDB. Back them up or move them to another device.
        </p>
        <div className="row">
          <button className="btn" onClick={onExport}>
            <Download size={16} /> Export JSON
          </button>
          <button className="btn" onClick={() => importRef.current?.click()}>
            <Upload size={16} /> Import JSON
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImportError(null);
              try {
                await onImport(await file.text());
              } catch (err) {
                setImportError(err instanceof Error ? err.message : 'Import failed.');
              } finally {
                if (importRef.current) importRef.current.value = '';
              }
            }}
          />
        </div>
        {importError && (
          <div className="alert alert-danger" style={{ marginTop: 12 }}>
            <AlertTriangle size={16} /> {importError}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-danger" onClick={() => setConfirmClear(true)}>
            <AlertTriangle size={16} /> Delete all receipts
          </button>
        </div>
      </div>

      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 className="section-title">
          <Save size={16} /> Save changes
        </h3>
        <p className="tiny muted" style={{ marginTop: -6 }}>
          Apply your appearance, currency and assistant settings.
        </p>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={save} style={{ justifySelf: 'start' }}>
          <Save size={16} /> {saved ? 'Saved!' : 'Save settings'}
        </button>
      </div>

      <div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
        <button
          className="row"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            alignItems: 'center',
            gap: 10,
            width: '100%',
            background: 'none',
            border: 0,
            cursor: 'pointer',
            padding: 0,
            color: 'inherit',
          }}
          aria-expanded={showAdvanced}
        >
          <SlidersHorizontal size={16} />
          <strong style={{ fontSize: 14 }}>Advanced</strong>
          <span className="muted tiny">— connections, endpoints and keys</span>
          <span className="spacer" />
          <span className="muted tiny">{showAdvanced ? 'Hide' : 'Show'}</span>
        </button>

        {showAdvanced && (
          <div className="grid" style={{ gap: 16, marginTop: 16 }}>
            <div className="alert alert-info">
              <ShieldCheck size={16} />
              <div>
                These are for advanced setups only. Most people never need to change them — the app
                already ships with a working connection.
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 6px', fontSize: 14 }}>Backend (optional)</h4>
              <p className="tiny muted" style={{ marginTop: 0, marginBottom: 12 }}>
                Point the app at its backend and the server holds the API key — this browser never sees
                it, and receipts can sync across devices.
              </p>
              <div className="field">
                <label>Backend URL</label>
                <input
                  className="input"
                  placeholder="https://your-backend.example.com"
                  value={draft.apiBaseUrl}
                  onChange={(e) => patch({ apiBaseUrl: e.target.value })}
                />
              </div>
              <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 14 }}>
                <input
                  type="checkbox"
                  checked={draft.backendSync}
                  onChange={(e) => patch({ backendSync: e.target.checked })}
                />
                <span>Sync receipts with the backend</span>
              </label>
              {draft.apiBaseUrl.trim() && (
                <div className="row" style={{ marginTop: 12, gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-sm" onClick={checkBackend} disabled={checking}>
                    {checking ? 'Checking…' : 'Test connection'}
                  </button>
                  {backendMsg && (
                    <span className="tiny muted" style={{ color: backendOk ? undefined : '#c0392b' }}>
                      {backendMsg}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 style={{ margin: '0 0 6px', fontSize: 14 }}>Assistant &amp; AI connection</h4>
              <p className="tiny muted" style={{ marginTop: 0, marginBottom: 12 }}>
                {HAS_SHARED_KEY
                  ? 'A shared connection is already configured. Leave these as they are unless you want your own.'
                  : 'Add an OpenAI-compatible endpoint so the assistant can answer free-form questions. The key is stored only in this browser.'}
              </p>
              {!HAS_SHARED_KEY && (
                <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      patch({
                        llmBaseUrl: 'https://openrouter.ai/api/v1',
                        llmModel: draft.llmModel || 'openai/gpt-4o-mini',
                      })
                    }
                  >
                    Use OpenRouter
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => patch({ llmBaseUrl: 'https://api.openai.com/v1', llmModel: 'gpt-4o-mini' })}
                  >
                    Use OpenAI
                  </button>
                </div>
              )}
              <div className="grid grid-2" style={{ gap: 14 }}>
                <div className="field">
                  <label>Base URL</label>
                  <input
                    className="input"
                    placeholder="https://api.openai.com/v1"
                    value={draft.llmBaseUrl}
                    onChange={(e) => patch({ llmBaseUrl: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Model</label>
                  <input
                    className="input"
                    placeholder="gpt-4o-mini"
                    value={draft.llmModel}
                    onChange={(e) => patch({ llmModel: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>API key</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="sk-…"
                    value={draft.llmApiKey}
                    onChange={(e) => patch({ llmApiKey: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Vision model</label>
                  <input
                    className="input"
                    placeholder="openai/gpt-4o-mini"
                    value={draft.visionModel}
                    onChange={(e) => patch({ visionModel: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {confirmClear && (
        <Modal
          title="Delete all receipts?"
          onClose={() => setConfirmClear(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={async () => {
                  await onClearAll();
                  setConfirmClear(false);
                }}
              >
                Delete everything
              </button>
            </>
          }
        >
          <div className="alert alert-danger">
            <AlertTriangle size={17} />
            <div>
              This permanently removes every saved receipt from this browser. Export a backup first if you
              might want them later.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
