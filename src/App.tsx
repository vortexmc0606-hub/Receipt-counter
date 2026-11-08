import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Moon, ReceiptText, ScanLine, Settings as SettingsIcon, Sparkles, Sun } from 'lucide-react';
import { DEFAULT_SETTINGS, type Receipt, type Settings } from './types';
import {
  clearAllReceipts,
  deleteReceipt,
  exportJSON,
  getAllReceipts,
  importJSON,
  loadSettings,
  putReceipt,
  saveSettings,
} from './lib/db';
import { download, receiptsToCSV } from './lib/utils';
import { Dashboard } from './components/Dashboard';
import { ScanView } from './components/ScanView';
import { ReceiptsView } from './components/ReceiptsView';
import { Assistant } from './components/Assistant';
import { SettingsView } from './components/SettingsView';

type Tab = 'dashboard' | 'scan' | 'receipts' | 'assistant' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof ScanLine }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'scan', label: 'Scan', icon: ScanLine },
  { id: 'receipts', label: 'Receipts', icon: ReceiptText },
  { id: 'assistant', label: 'Assistant', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setReceipts(await getAllReceipts());
  }, []);

  useEffect(() => {
    (async () => {
      const [r, s] = await Promise.all([getAllReceipts(), loadSettings()]);
      setReceipts(r);
      setSettings(s);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const saveReceipt = useCallback(
    async (receipt: Receipt) => {
      await putReceipt(receipt);
      await refresh();
      setTab('receipts');
    },
    [refresh],
  );

  const removeReceipt = useCallback(
    async (id: string) => {
      await deleteReceipt(id);
      await refresh();
    },
    [refresh],
  );

  const persistSettings = useCallback(async (next: Settings) => {
    await saveSettings(next);
    setSettings(next);
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
    download(`receipts-${new Date().toISOString().slice(0, 10)}.csv`, receiptsToCSV(receipts, settings.currency), 'text/csv');
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
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">
            <ReceiptText size={18} />
          </span>
          <span className="brand-text">Receipt Scanner</span>
        </div>
        <div className="spacer" />
        <nav className="nav">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                className={tab === t.id ? 'active' : ''}
                onClick={() => setTab(t.id)}
                title={t.label}
              >
                <Icon size={16} />
                <span>{t.label}</span>
                {t.id === 'receipts' && totalCount > 0 && <span className="badge">{totalCount}</span>}
              </button>
            );
          })}
        </nav>
        <button
          className="btn btn-ghost btn-icon"
          title="Toggle theme"
          onClick={() => void persistSettings({ ...settings, theme: settings.theme === 'dark' ? 'light' : 'dark' })}
        >
          {settings.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>

      <main className="main">
        {tab === 'dashboard' && <Dashboard receipts={receipts} currency={settings.currency} />}
        {tab === 'scan' && <ScanView currency={settings.currency} onSave={saveReceipt} />}
        {tab === 'receipts' && (
          <ReceiptsView
            receipts={receipts}
            currency={settings.currency}
            onDelete={removeReceipt}
            onExportCSV={handleExportCSV}
          />
        )}
        {tab === 'assistant' && <Assistant receipts={receipts} settings={settings} />}
        {tab === 'settings' && (
          <SettingsView
            settings={settings}
            onSave={persistSettings}
            onExport={async () => download(`receipts-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportJSON())}
            onImport={handleImport}
            onClearAll={handleClearAll}
          />
        )}
      </main>
    </div>
  );
}
