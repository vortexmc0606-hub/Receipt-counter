import { createWorker, PSM, type Worker } from 'tesseract.js';

export type OcrProgress = (status: string, progress: number) => void;

export interface OcrResult {
  text: string;
  /** Mean Tesseract word confidence, 0–100. Low values usually mean a blurry photo. */
  confidence: number;
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(onProgress?: OcrProgress): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: (m: { status: string; progress: number }) => {
        onProgress?.(m.status, m.progress);
      },
    }).then(async (worker) => {
      // Assume a single uniform block of text: correct for a receipt and much
      // more reliable than the default "automatic page segmentation", which
      // frequently drops leading digits on narrow thermal printouts.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      return worker;
    });
  }
  const worker = await workerPromise;
  return worker;
}

/**
 * Prepares a photo for OCR. Raw phone photos of thermal receipts are the main
 * source of bad reads: low resolution, grey paper and uneven lighting cause
 * Tesseract to drop or merge digits (e.g. reading "81.41" as "41").
 *
 * Two variants are produced — a contrast-stretched greyscale image and an
 * Otsu-binarised one — because which wins depends on the photo (shadowed shots
 * favour the binarised version, low-contrast ones favour greyscale). Both are
 * recognised and the parse that reconciles best is kept.
 */
async function preprocess(source: Blob, mode: 'gray' | 'binary'): Promise<Blob | string> {
  try {
    const bitmap = await loadBitmap(source);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (!srcW || !srcH) return source;

    // Target ~1600px on the long edge: enough detail for small digits without
    // making OCR crawl on a phone.
    const target = 1600;
    const scale = Math.min(3.5, Math.max(1, target / Math.max(srcW, srcH)));
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return source;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

    const image = ctx.getImageData(0, 0, w, h);
    const d = image.data;
    const gray = new Uint8ClampedArray(w * h);
    let min = 255;
    let max = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      gray[p] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }

    // Contrast stretch across the 1st–99th percentile so a few dark/bright
    // outliers don't flatten the whole histogram.
    const hist = new Uint32Array(256);
    for (let p = 0; p < gray.length; p++) hist[gray[p]]++;
    const total = gray.length;
    const lowCut = total * 0.01;
    const highCut = total * 0.99;
    let acc = 0;
    let lo = min;
    let hi = max;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= lowCut) {
        lo = v;
        break;
      }
    }
    acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= highCut) {
        hi = v;
        break;
      }
    }
    const range = Math.max(1, hi - lo);

    // Otsu's threshold, computed on the stretched histogram.
    let threshold = 128;
    if (mode === 'binary') {
      const h2 = new Uint32Array(256);
      for (let p = 0; p < gray.length; p++) {
        const v = Math.min(255, Math.max(0, Math.round(((gray[p] - lo) / range) * 255)));
        h2[v]++;
      }
      let sumAll = 0;
      for (let v = 0; v < 256; v++) sumAll += v * h2[v];
      let sumB = 0;
      let wB = 0;
      let best = 0;
      let bestVar = -1;
      for (let v = 0; v < 256; v++) {
        wB += h2[v];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += v * h2[v];
        const mB = sumB / wB;
        const mF = (sumAll - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > bestVar) {
          bestVar = between;
          best = v;
        }
      }
      threshold = best;
    }

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      let v = ((gray[p] - lo) / range) * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      if (mode === 'binary') v = v >= threshold ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return source;
  }
}

/**
 * Runs OCR entirely in the browser. The language model data (~10 MB) is fetched
 * from a CDN on first use and cached by the browser thereafter.
 */
export async function recognizeImage(image: Blob, onProgress?: OcrProgress): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  const prepared = await preprocess(image, 'gray');
  const { data } = await worker.recognize(prepared);
  return { text: data.text, confidence: data.confidence ?? 0 };
}

/**
 * Recognises the same image with both preprocessing variants and returns every
 * result, so the caller can pick the parse that reconciles best. Slower than
 * `recognizeImage` but noticeably more accurate on difficult photos.
 */
export async function recognizeImageVariants(
  image: Blob,
  onProgress?: OcrProgress,
): Promise<OcrResult[]> {
  const worker = await getWorker(onProgress);
  const results: OcrResult[] = [];
  for (const mode of ['gray', 'binary'] as const) {
    try {
      const prepared = await preprocess(image, mode);
      const { data } = await worker.recognize(prepared);
      const text = data.text ?? '';
      if (text.trim().length >= 8) results.push({ text, confidence: data.confidence ?? 0 });
    } catch {
      /* try the next variant */
    }
  }
  if (!results.length) throw new Error('No readable text was found in that image.');
  return results;
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

export async function loadBitmap(source: Blob): Promise<ImageBitmap | HTMLImageElement> {
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
