import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type MemoryFact, type Receipt, type Settings } from '../types';
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
  memory: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<ReceiptDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ReceiptDB>('receipt-scanner', 3, {
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
        if (oldVersion < 3 && !db.objectStoreNames.contains('memory')) {
          db.createObjectStore('memory');
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
  // Order: defaults, then whatever the user saved, then the build-time values.
  // The build-time values win so a shared key can never be shadowed by a stale
  // value left in this browser.
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}), ...env };
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

export async function loadMemory(): Promise<MemoryFact[]> {
  const db = await getDB();
  const stored = (await db.get('memory', 'app')) as MemoryFact[] | undefined;
  return Array.isArray(stored) ? stored : [];
}

export async function saveMemory(facts: MemoryFact[]): Promise<void> {
  const db = await getDB();
  await db.put('memory', facts, 'app');
}

export async function exportJSON(): Promise<string> {
  const [receipts, settings, memory] = await Promise.all([
    getAllReceipts(),
    loadSettings(),
    loadMemory(),
  ]);
  const safeSettings = { ...settings, llmApiKey: '' };
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), settings: safeSettings, receipts, memory },
    null,
    2,
  );
}

export async function importJSON(json: string): Promise<number> {
  const data = JSON.parse(json) as { receipts?: Receipt[]; memory?: MemoryFact[] };
  const receipts = data.receipts ?? [];
  const db = await getDB();
  const tx = db.transaction('receipts', 'readwrite');
  for (const r of receipts) {
    if (r && r.id) await tx.store.put(r);
  }
  await tx.done;
  if (Array.isArray(data.memory) && data.memory.length) {
    await saveMemory(data.memory.filter((f) => f && f.id && typeof f.text === 'string'));
  }
  return receipts.length;
}
