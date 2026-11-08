import { createWorker, type Worker } from 'tesseract.js';

export type OcrProgress = (status: string, progress: number) => void;

let workerPromise: Promise<Worker> | null = null;

async function getWorker(onProgress?: OcrProgress): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: (m: { status: string; progress: number }) => {
        onProgress?.(m.status, m.progress);
      },
    });
  }
  const worker = await workerPromise;
  return worker;
}

/**
 * Runs OCR entirely in the browser. The language model data (~10 MB) is fetched
 * from a CDN on first use and cached by the browser thereafter.
 */
export async function recognizeImage(image: Blob | string, onProgress?: OcrProgress): Promise<string> {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(image);
  return data.text;
}

/** Downscales an image to a data URL thumbnail to keep IndexedDB small. */
export async function makeThumbnail(source: Blob, maxSize = 720, quality = 0.7): Promise<string> {
  const bitmap = await loadBitmap(source);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

async function loadBitmap(source: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(source);
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(source);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
