import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Brain, Loader2, Moon, ReceiptText, ScanLine, Settings as SettingsIcon, Sparkles, Store as StoreIcon, Sun, TrendingUp } from 'lucide-react';
import { DEFAULT_SETTINGS, type MemoryFact, type Receipt, type Settings } from './types';
import {
  clearAllReceipts,
  clearLearning,
  deleteReceipt,
  exportJSON,
  getAllReceipts,
  importJSON,
  loadLearning,
  loadMemory,
  loadSettings,
  putReceipt,
  saveLearning,
  saveMemory,
  saveSettings,
} from './lib/db';
import { EMPTY_LEARNING, learnFromSave, type LearningData } from './lib/learning';
import type { ParsedReceipt } from './lib/parser';
import { todayISO } from './lib/dates';
import { download, receiptsToCSV } from './lib/utils';
import { Dashboard } from './components/Dashboard';
import { ScanView } from './components/ScanView';
import { ReceiptsView } from './components/ReceiptsView';
import { Trends } from './components/Trends';
import { Stores } from './components/Stores';
import {
  deleteBackendReceipt,
  fetchBackendReceipts,
  hasBackend,
  pushBackendReceipt,
} from './lib/api';
import { Assistant } from './components/Assistant';
import { LearningView } from './components/LearningView';
import { SettingsView } from './components/SettingsView';

type Tab = 'dashboard' | 'scan' | 'receipts' | 'trends' | 'stores' | 'assistant' | 'learning' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof ScanLine }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'scan', label: 'Scan', icon: ScanLine },
  { id: 'receipts', label: 'Receipts', icon: ReceiptText },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'stores', label: 'Stores', icon: StoreIcon },
  { id: 'assistant', label: 'Assistant', icon: Sparkles },
  { id: 'learning', label: 'Learning', icon: Brain },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [learning, setLearning] = useState<LearningData>(EMPTY_LEARNING);
  const [memory, setMemory] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setReceipts(await getAllReceipts());
  }, []);

  useEffect(() => {
    (async () => {
      const [r, s, l, m] = await Promise.all([
        getAllReceipts(),
        loadSettings(),
        loadLearning(),
        loadMemory(),
      ]);
      setReceipts(r);
      setSettings(s);
      setLearning(l);
      setMemory(m);
      setLoading(false);
      // When backend sync is on, pull anything the server has that this device
      // does not, so receipts show up across devices.
      if (hasBackend(s) && s.backendSync) {
        try {
          const remote = await fetchBackendReceipts(s);
          const localIds = new Set(r.map((x) => x.id));
          const missing = remote.filter((x) => !localIds.has(x.id));
          if (missing.length) {
            for (const receipt of missing) await putReceipt(receipt);
            setReceipts(await getAllReceipts());
          }
        } catch {
          /* offline or server down — the local copy still works */
        }
      }
    })();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const saveReceipt = useCallback(
    async (receipt: Receipt, original?: ParsedReceipt) => {
      await putReceipt(receipt);
      if (hasBackend(settings) && settings.backendSync) {
        // Best-effort: a failed sync must never lose the local save.
        void pushBackendReceipt(receipt, settings).catch(() => undefined);
      }
      if (original) {
        const next = learnFromSave(original, receipt, learning, settings.defaultTaxRate);
        await saveLearning(next);
        setLearning(next);
      }
      await refresh();
      setTab('receipts');
    },
    [refresh, learning, settings],
  );

  const removeReceipt = useCallback(
    async (id: string) => {
      await deleteReceipt(id);
      if (hasBackend(settings) && settings.backendSync) {
        void deleteBackendReceipt(id, settings).catch(() => undefined);
      }
      await refresh();
    },
    [refresh, settings],
  );

  const persistSettings = useCallback(async (next: Settings) => {
    await saveSettings(next);
    setSettings(next);
  }, []);

  const handleImportLearning = useCallback(async (json: string) => {
    const data = JSON.parse(json) as LearningData;
    if (!data || !Array.isArray(data.items)) throw new Error('That file is not a learning export.');
    const merged: LearningData = {
      ...EMPTY_LEARNING,
      ...data,
      version: 1,
    };
    await saveLearning(merged);
    setLearning(merged);
  }, []);

  const updateMemory = useCallback(async (facts: MemoryFact[]) => {
    setMemory(facts);
    await saveMemory(facts);
  }, []);

  const handleClearLearning = useCallback(async () => {
    await clearLearning();
    setLearning(EMPTY_LEARNING);
  }, []);

  const handleImport = useCallback(
    async (json: string) => {
      await importJSON(json);
      await refresh();
    },
    [refresh],
  );

  const handleClearAll = useCallback(async () => {
    await clearAllReceipts();
    await refresh();
  }, [refresh]);

  const handleExportCSV = useCallback(() => {
    download(`receipts-${todayISO()}.csv`, receiptsToCSV(receipts, settings.currency), 'text/csv');
  }, [receipts, settings.currency]);

  const totalCount = useMemo(() => receipts.length, [receipts]);

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-2)' }}>
          <Loader2 size={30} className="spin" style={{ color: 'var(--primary)' }} />
          <p className="tiny">Loading your receipts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge"><ReceiptText size={19} /></span>
          <span className="brand-lockup">
            <span className="brand-text">Receiptly</span>
            <span className="brand-caption">SMART EXPENSES</span>
          </span>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="nav sidebar-nav" aria-label="Main navigation">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} title={t.label}>
                <Icon size={18} strokeWidth={1.9} />
                <span>{t.label}</span>
                {t.id === 'receipts' && totalCount > 0 && <span className="badge">{totalCount}</span>}
                {tab === t.id && <span className="nav-active-mark" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon"><Brain size={16} /></span>
            <div><strong>Your data, your device</strong><span>Private by design</span></div>
            <span className="privacy-dot" />
          </div>
          <div className="sidebar-footer">RECEIPTLY <span>•</span> PERSONAL FINANCE</div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-badge"><ReceiptText size={18} /></span>
            <span className="brand-text">Receiptly</span>
          </div>
          <div className="topbar-heading">
            <span className="topbar-kicker">YOUR WORKSPACE</span>
            <strong>{TABS.find((t) => t.id === tab)?.label ?? 'Dashboard'}</strong>
          </div>
          <div className="spacer" />
          <div className="topbar-status"><span /> All changes saved locally</div>
          <button className="btn btn-primary topbar-scan" onClick={() => setTab('scan')}>
            <ScanLine size={16} /> <span>New scan</span>
          </button>
          <button className="btn btn-ghost btn-icon theme-toggle" title="Toggle theme" aria-label="Toggle theme"
            onClick={() => void persistSettings({ ...settings, theme: settings.theme === 'dark' ? 'light' : 'dark' })}>
            {settings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>

        <main className="main">
          {tab === 'dashboard' && <Dashboard receipts={receipts} currency={settings.currency} />}
          {tab === 'scan' && (
            <ScanView
              currency={settings.currency}
              settings={settings}
              learning={learning}
              onSave={saveReceipt}
              onLocation={(loc) => {
                if (loc && JSON.stringify(loc) !== JSON.stringify(settings.location)) {
                  void persistSettings({ ...settings, location: loc });
                }
              }}
            />
          )}
          {tab === 'receipts' && <ReceiptsView receipts={receipts} currency={settings.currency} onDelete={removeReceipt} onExportCSV={handleExportCSV} />}
          {tab === 'assistant' && <Assistant receipts={receipts} settings={settings} memory={memory} onMemoryChange={updateMemory} />}
          {tab === 'trends' && <Trends receipts={receipts} currency={settings.currency} />}
          {tab === 'stores' && <Stores receipts={receipts} learning={learning} currency={settings.currency} />}
          {tab === 'learning' && <LearningView data={learning} onImport={handleImportLearning} onClear={handleClearLearning} />}
          {tab === 'settings' && <SettingsView settings={settings} onSave={persistSettings}
            onExport={async () => download(`receipts-backup-${todayISO()}.json`, await exportJSON())}
            onImport={handleImport} onClearAll={handleClearAll} />}
        </main>
      </section>
    </div>
  );
}
