import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Receipt, type Settings } from '../types';
import { EMPTY_LEARNING, type LearningData } from './learning';
import { ENV_DEFAULTS } from './env';

interface ReceiptDB extends DBSchema {
  receipts: {
    key: string;
    value: Receipt;
    indexes: { 'by-date': string; 'by-created': number };
  };
  settings: {
    key: string;
    value: unknown;
  };
  learning: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<ReceiptDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ReceiptDB>('receipt-scanner', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('receipts', { keyPath: 'id' });
          store.createIndex('by-date', 'date');
          store.createIndex('by-created', 'createdAt');
          db.createObjectStore('settings');
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains('learning')) {
          db.createObjectStore('learning');
        }
      },
    });
  }
  return dbPromise;
}

export async function getAllReceipts(): Promise<Receipt[]> {
  const db = await getDB();
  const all = await db.getAll('receipts');
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
}

export async function putReceipt(receipt: Receipt): Promise<void> {
  const db = await getDB();
  await db.put('receipts', receipt);
}

export async function deleteReceipt(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('receipts', id);
}

export async function clearAllReceipts(): Promise<void> {
  const db = await getDB();
  await db.clear('receipts');
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDB();
  const stored = (await db.get('settings', 'app')) as Partial<Settings> | undefined;
  const env = Object.fromEntries(
    Object.entries(ENV_DEFAULTS).filter(([, v]) => v !== undefined),
  ) as Partial<Settings>;
  // Order: defaults, then env prefill, then whatever the user saved.
  return { ...DEFAULT_SETTINGS, ...env, ...(stored ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDB();
  await db.put('settings', settings, 'app');
}

export async function loadLearning(): Promise<LearningData> {
  const db = await getDB();
  const stored = (await db.get('learning', 'app')) as Partial<LearningData> | undefined;
  return { ...EMPTY_LEARNING, ...(stored ?? {}) };
}

export async function saveLearning(data: LearningData): Promise<void> {
  const db = await getDB();
  await db.put('learning', data, 'app');
}

export async function clearLearning(): Promise<void> {
  const db = await getDB();
  await db.put('learning', EMPTY_LEARNING, 'app');
}

export async function exportJSON(): Promise<string> {
  const [receipts, settings] = await Promise.all([getAllReceipts(), loadSettings()]);
  const safeSettings = { ...settings, llmApiKey: '' };
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings: safeSettings, receipts }, null, 2);
}

export async function importJSON(json: string): Promise<number> {
  const data = JSON.parse(json) as { receipts?: Receipt[] };
  const receipts = data.receipts ?? [];
  const db = await getDB();
  const tx = db.transaction('receipts', 'readwrite');
  for (const r of receipts) {
    if (r && r.id) await tx.store.put(r);
  }
  await tx.done;
  return receipts.length;
}
