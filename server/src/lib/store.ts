import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Receipt } from '../types.js';

/**
 * Receipts persisted as a single JSON file. Small enough for this app's scale,
 * dependency-free, and easy to back up by copying one file. Writes go to a temp
 * file and are renamed into place so a crash mid-write cannot corrupt the store.
 */

interface StoreShape {
  version: 1;
  receipts: Receipt[];
}

let cache: StoreShape | null = null;
let writeChain: Promise<void> = Promise.resolve();

export class ReceiptStore {
  constructor(private readonly file: string) {}

  private async load(): Promise<StoreShape> {
    if (cache) return cache;
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as StoreShape;
      cache = { version: 1, receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [] };
    } catch {
      cache = { version: 1, receipts: [] };
    }
    return cache;
  }

  /** Serialises writes so concurrent requests cannot interleave file writes. */
  private persist(): Promise<void> {
    writeChain = writeChain.then(async () => {
      const data = cache ?? { version: 1, receipts: [] };
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await rename(tmp, this.file);
    });
    return writeChain;
  }

  async all(): Promise<Receipt[]> {
    const data = await this.load();
    return [...data.receipts].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt,
    );
  }

  async get(id: string): Promise<Receipt | undefined> {
    const data = await this.load();
    return data.receipts.find((r) => r.id === id);
  }

  async put(receipt: Receipt): Promise<Receipt> {
    const data = await this.load();
    const idx = data.receipts.findIndex((r) => r.id === receipt.id);
    if (idx >= 0) data.receipts[idx] = receipt;
    else data.receipts.push(receipt);
    await this.persist();
    return receipt;
  }

  async putMany(receipts: Receipt[]): Promise<number> {
    const data = await this.load();
    for (const receipt of receipts) {
      if (!receipt || !receipt.id) continue;
      const idx = data.receipts.findIndex((r) => r.id === receipt.id);
      if (idx >= 0) data.receipts[idx] = receipt;
      else data.receipts.push(receipt);
    }
    await this.persist();
    return receipts.length;
  }

  async remove(id: string): Promise<boolean> {
    const data = await this.load();
    const before = data.receipts.length;
    data.receipts = data.receipts.filter((r) => r.id !== id);
    const removed = data.receipts.length < before;
    if (removed) await this.persist();
    return removed;
  }

  async clear(): Promise<void> {
    const data = await this.load();
    data.receipts = [];
    await this.persist();
  }
}
