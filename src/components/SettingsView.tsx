import { useRef, useState } from 'react';
import { AlertTriangle, Bot, Database, Download, Moon, Save, ScanLine, Sparkles, Sun, Upload } from 'lucide-react';
import type { Settings } from '../types';
import { Modal } from './ui';
import { HAS_SHARED_KEY } from '../lib/env';

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
  const importRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...p }));
    setSaved(false);
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
      </div>

      <div className="card card-pad">
        <h3 className="section-title">
          <Sparkles size={16} /> AI reading
        </h3>
        <p className="tiny muted" style={{ marginTop: -6, marginBottom: 14 }}>
          Send the receipt photo to a vision model for a much more accurate read. Uses the endpoint and
          key below. When this is off, reading happens on your device with OCR.
        </p>
        <label className="row" style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.aiReading}
            onChange={(e) => patch({ aiReading: e.target.checked })}
          />
          <span>Read receipts with AI</span>
        </label>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Vision model</label>
          <input
            className="input"
            placeholder="openai/gpt-4o-mini"
            value={draft.visionModel}
            onChange={(e) => patch({ visionModel: e.target.value })}
          />
          <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => patch({ visionModel: 'openai/gpt-4o-mini' })}>
              GPT-4o mini
            </button>
            <button className="btn btn-sm" onClick={() => patch({ visionModel: 'openai/gpt-4o' })}>
              GPT-4o
            </button>
            <button className="btn btn-sm" onClick={() => patch({ visionModel: 'google/gemini-3.8-flash' })}>
              Gemini Flash
            </button>
            <button
              className="btn btn-sm"
              onClick={() => patch({ visionModel: 'anthropic/claude-sonnet-5.5' })}
            >
              Claude Sonnet
            </button>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="section-title">
          <Bot size={16} /> Assistant (optional LLM)
        </h3>
        <p className="tiny muted" style={{ marginTop: -6, marginBottom: 14 }}>
          {HAS_SHARED_KEY
            ? 'This app is set up with a shared connection, so scanning works out of the box. No key is needed.'
            : 'The assistant works offline for common questions. Add an OpenAI-compatible endpoint to answer free-form questions. The key is stored only in this browser and sent directly to your endpoint.'}
        </p>
        {HAS_SHARED_KEY ? (
          <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} /> Using the app's shared connection. Nothing to configure.
          </div>
        ) : (
          <>
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
        <div className="grid" style={{ gap: 14 }}>
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
        </div>
          </>
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
