import type { AiReadResult } from './ai';
import { loadBitmap } from './ocr';
import type { ChatMessage, Receipt, Settings } from '../types';

/**
 * Client for the Receipt Scanner backend.
 *
 * The backend holds the LLM API key, so when it is configured the browser never
 * sees a key: it sends the receipt image or a question to our server and the
 * server talks to the model provider. The backend is optional — with no
 * `apiBaseUrl` set the app runs exactly as before, fully on-device.
 */

export function hasBackend(settings: Settings): boolean {
  return Boolean(settings.apiBaseUrl.trim());
}

function base(settings: Settings): string {
  return settings.apiBaseUrl.trim().replace(/\/$/, '');
}

async function req<T>(settings: Settings, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base(settings)}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const message = typeof json.error === 'string' ? json.error : `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return json as T;
}

/** Downscales an image to a JPEG data URL for the backend to read. */
async function toDataUrl(source: Blob, maxEdge = 1400, quality = 0.85): Promise<string> {
  const bitmap = await loadBitmap(source);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the image for the server.');
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

export interface BackendStatus {
  enabled: boolean;
  model: string | null;
  visionModel: string | null;
}

/** Checks the backend is reachable and whether its AI reading is configured. */
export async function backendStatus(settings: Settings): Promise<BackendStatus> {
  return req<BackendStatus>(settings, '/api/ai/status');
}

/** Reads a receipt image through the backend (which holds the API key). */
export async function readReceiptViaBackend(file: Blob, settings: Settings): Promise<AiReadResult> {
  const image = await toDataUrl(file);
  const result = await req<AiReadResult>(settings, '/api/parse', {
    method: 'POST',
    body: JSON.stringify({ image }),
  });
  return result;
}

/** Asks the assistant a question, with receipt data supplied by the client. */
export async function askBackend(
  question: string,
  receipts: Receipt[],
  settings: Settings,
  history: ChatMessage[] = [],
): Promise<string> {
  const res = await req<{ content: string }>(settings, '/api/assistant', {
    method: 'POST',
    body: JSON.stringify({
      question,
      receipts,
      currency: settings.currency,
      history: history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  return res.content;
}

// ---- optional receipt sync ----

export async function fetchBackendReceipts(settings: Settings): Promise<Receipt[]> {
  const res = await req<{ receipts: Receipt[] }>(settings, '/api/receipts');
  return res.receipts;
}

export async function pushBackendReceipt(receipt: Receipt, settings: Settings): Promise<void> {
  await req<{ saved: number }>(settings, '/api/receipts', {
    method: 'POST',
    body: JSON.stringify({ receipts: [receipt] }),
  });
}

export async function deleteBackendReceipt(id: string, settings: Settings): Promise<void> {
  await req<{ removed: boolean }>(settings, `/api/receipts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
