import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Download, MapPin, Moon, ShieldCheck, Sparkles, Sun, Upload, XCircle } from 'lucide-react';
import type { Settings } from '../types';
import { Modal } from './ui';
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
  const draftRef = useRef(settings);
  const importRef = useRef<HTMLInputElement>(null);
  const [geo, setGeo] = useState<GeoStatus | null>(null);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [importError, setImportError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    draftRef.current = settings;
    setDraft(settings);
  }, [settings]);

  // Inspect permission state without opening a browser permission prompt.
  useEffect(() => {
    let alive = true;
    void geoStatus().then((status) => {
      if (alive) setGeo(status);
    });
    return () => { alive = false; };
  }, []);

  const savePatch = async (patch: Partial<Settings>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    setSaved(false);
    setError('');
    setSaving(true);
    try {
      await onSave(next);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that preference.');
    } finally {
      setSaving(false);
    }
  };

  const detectHere = async () => {
    setLocating(true);
    setLocMsg('');
    try {
      const { location, status } = await detectLocationDetailed();
      setGeo(status);
      if (!location) {
        setLocMsg(status.reason);
        return;
      }
      await savePatch({ location, smartLocation: true });
      const estimate = estimateTax(location);
      setLocMsg(
        `Location enabled: ${describeLocation(location) || 'your area'}.` +
        (estimate ? ` Approximate tax rate: ${estimate.rate}% (${estimate.label}).` : ' No tax estimate is available for this area.'),
      );
    } catch (err) {
      setLocMsg(err instanceof Error ? err.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  };

  const toggle = (key: 'smartLocation' | 'enhanceScan' | 'redactPersonal' | 'reverseStoreSearch' | 'aiReading') =>
    (event: React.ChangeEvent<HTMLInputElement>) => void savePatch({ [key]: event.target.checked });

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <section className="card card-pad">
        <h3 className="section-title"><Sun size={16} /> Preferences</h3>
        <p className="tiny muted">Everything here is a preference. Changes save automatically — no typing, API keys, or setup forms.</p>
        <div className="field" style={{ marginTop: 16 }}>
          <label>Currency</label>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {[
              { value: '$', label: 'USD $' },
              { value: 'C$', label: 'CAD C$' },
              { value: '£', label: 'GBP £' },
              { value: '€', label: 'EUR €' },
              { value: '₹', label: 'INR ₹' },
            ].map((option) => (
              <button key={option.value} className={`btn btn-sm${draft.currency === option.value ? ' btn-primary' : ''}`}
                onClick={() => void savePatch({ currency: option.value })}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginTop: 18 }}>
          <label>Appearance</label>
          <div className="row" style={{ gap: 8 }}>
            <button className={`btn${draft.theme === 'light' ? ' btn-primary' : ''}`}
              onClick={() => void savePatch({ theme: 'light' })}><Sun size={15} /> Light</button>
            <button className={`btn${draft.theme === 'dark' ? ' btn-primary' : ''}`}
              onClick={() => void savePatch({ theme: 'dark' })}><Moon size={15} /> Dark</button>
          </div>
        </div>
        <div className="field" style={{ marginTop: 18 }}>
          <label>Scanning</label>
          <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.enhanceScan} onChange={toggle('enhanceScan')} />
            <span>Clean up receipt photos automatically</span>
          </label>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {[
              { value: 1800, label: 'Fast' },
              { value: 2600, label: 'Balanced' },
              { value: 3200, label: 'Sharp' },
            ].map((option) => (
              <button key={option.value} className={`btn btn-sm${draft.scanResolution === option.value ? ' btn-primary' : ''}`}
                onClick={() => void savePatch({ scanResolution: option.value })}>{option.label}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="card card-pad">
        <h3 className="section-title"><Sparkles size={16} /> AI preferences</h3>
        <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.aiReading} onChange={toggle('aiReading')} />
          <span>Use AI to read receipts when available</span>
        </label>
        <p className="tiny muted">If AI is unavailable, the app falls back to on-device OCR.</p>
        <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 16 }}>
          <input type="checkbox" checked={draft.reverseStoreSearch} onChange={toggle('reverseStoreSearch')} />
          <span>Use extra store clues when the header is unclear</span>
        </label>
        <h3 className="section-title" style={{ marginTop: 24 }}><ShieldCheck size={16} /> Privacy</h3>
        <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.redactPersonal} onChange={toggle('redactPersonal')} />
          <span>Hide personal details before AI processing</span>
        </label>
        <p className="tiny muted">Keep this enabled to remove sensitive receipt details before remote AI processing.</p>
      </section>

      <section className="card card-pad" style={{ gridColumn: '1 / -1' }}>
        <h3 className="section-title"><MapPin size={16} /> Location &amp; tax</h3>
        <p className="tiny muted">Location is requested only when you tap the button. The app stores a coarse region for tax estimates; it does not need an address or API key.</p>
        <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 12 }}>
          <input type="checkbox" checked={draft.smartLocation} onChange={toggle('smartLocation')} />
          <span>Use my saved region for tax estimates</span>
        </label>
        {geo && (
          <div className={`geo-status ${geo.granted ? 'ok' : 'no'}`} role="status" style={{ marginTop: 12 }}>
            <span className="geo-status-icon">{geo.granted ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span>
            <div><strong>{geo.granted ? 'Location permission: available' : 'Location permission: not confirmed'}</strong>
              <span className="geo-status-reason">{geo.reason}</span>
              {!geo.secure && <span className="geo-status-reason">Open the app using its HTTPS address to enable browser location.</span>}
            </div>
          </div>
        )}
        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => void detectHere()} disabled={locating}>
            <MapPin size={15} /> {locating ? 'Getting location…' : 'Enable location'}
          </button>
          {draft.location && <button className="btn" onClick={() => void savePatch({ location: null, smartLocation: false })}>Clear saved region</button>}
        </div>
        {draft.location && <p className="tiny" style={{ marginTop: 8 }}>Saved region: {describeLocation(draft.location)}{(() => {
          const estimate = estimateTax(draft.location!);
          return estimate ? ` · approx. ${estimate.rate}% tax` : '';
        })()}</p>}
        {locMsg && <p className="tiny muted" role="status" style={{ marginTop: 8 }}>{locMsg}</p>}
      </section>

      <section className="card card-pad">
        <h3 className="section-title"><Database size={16} /> Receipt data</h3>
        <p className="tiny muted">Your receipts stay in this browser unless you choose to sync them.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onExport}><Download size={16} /> Export backup</button>
          <button className="btn" onClick={() => importRef.current?.click()}><Upload size={16} /> Import backup</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setImportError('');
            try { await onImport(await file.text()); }
            catch (err) { setImportError(err instanceof Error ? err.message : 'Import failed.'); }
            finally { if (importRef.current) importRef.current.value = ''; }
          }} />
        </div>
        {importError && <div className="alert alert-danger" style={{ marginTop: 10 }}>{importError}</div>}
        <button className="btn btn-danger" style={{ marginTop: 14 }} onClick={() => setConfirmClear(true)}>
          <AlertTriangle size={16} /> Delete all receipts
        </button>
      </section>

      <section className="card card-pad">
        <h3 className="section-title"><ShieldCheck size={16} /> Automatic saving</h3>
        <p className="tiny muted">Preferences are saved as soon as you change them.</p>
        <p className="tiny" role="status">{saving ? 'Saving…' : saved ? 'All preferences saved.' : 'Ready'}</p>
        {error && <div className="alert alert-danger">{error}</div>}
      </section>

      {confirmClear && (
        <Modal title="Delete all receipts?" onClose={() => setConfirmClear(false)}
          footer={<>
            <button className="btn" onClick={() => setConfirmClear(false)}>Cancel</button>
            <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={async () => { await onClearAll(); setConfirmClear(false); }}>
              Delete everything
            </button>
          </>}>
          <div className="alert alert-danger"><AlertTriangle size={17} /><div>This permanently removes every saved receipt from this browser. Export a backup first if you might want them later.</div></div>
        </Modal>
      )}
    </div>
  );
}
