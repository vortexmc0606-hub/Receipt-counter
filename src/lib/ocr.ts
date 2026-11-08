import { createWorker, PSM, type Worker } from 'tesseract.js';

export type OcrProgress = (status: string, progress: number) => void;

export interface OcrResult {
  text: string;
  /** Mean Tesseract word confidence, 0–100. Low values usually mean a blurry photo. */
  confidence: number;
  /** Which pass produced this result, for diagnostics. */
  pass: string;
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(onProgress?: OcrProgress): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: (m: { status: string; progress: number }) => {
        onProgress?.(m.status, m.progress);
      },
    });
  }
  return workerPromise;
}

/**
 * The page-segmentation modes worth trying on a receipt, best first.
 *
 * Tesseract's default "single uniform block" (SINGLE_BLOCK) assumes the whole
 * image is one paragraph. Thermal receipts are a narrow single column of short
 * lines, so that assumption frequently merges or drops leading digits — the
 * cause of figures like "81.41" being read as "41". AUTO and SINGLE_COLUMN model
 * the layout far better; in testing they lifted mean word confidence from ~40 to
 * ~55–80 and recovered digits the block mode lost.
 */
const PASSES: { name: string; psm: PSM }[] = [
  { name: 'auto', psm: PSM.AUTO },
  { name: 'column', psm: PSM.SINGLE_COLUMN },
  { name: 'block', psm: PSM.SINGLE_BLOCK },
];

/**
 * Prepares a photo for OCR. Raw phone photos of thermal receipts are the main
 * source of bad reads: low resolution, grey paper and uneven lighting cause
 * Tesseract to drop or merge digits.
 *
 * Two variants are produced from the same photo — a plain greyscale downscale
 * and an illumination-normalised one. Which wins depends on the shot: shadowed
 * or dim photos read much better after normalisation, while already-flat ones
 * can lose a little contrast. Both are tried and the parse that reconciles best
 * is kept. Binarisation is deliberately NOT used: thresholding was measured to
 * cut word confidence roughly in half on these receipts.
 */
async function preprocess(source: Blob, mode: 'gray' | 'illum'): Promise<Blob | string> {
  try {
    const bitmap = await loadBitmap(source);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (!srcW || !srcH) return source;

    // Target ~2000px on the long edge: enough detail for small digits without
    // making OCR crawl on a phone. Photos already smaller are left alone.
    const target = 2000;
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
    const gray = new Float32Array(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      gray[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    }

    let out: Float32Array;
    if (mode === 'illum') {
      // Divide each pixel by the local background so paper goes white and ink
      // stays dark. This is the single biggest win for dim, shadowed photos.
      const radius = Math.max(12, Math.round(Math.min(w, h) / 18));
      const sat = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) {
        let rowSum = 0;
        for (let x = 0; x < w; x++) {
          rowSum += gray[y * w + x];
          sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)] + rowSum;
        }
      }
      const W = w + 1;
      out = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        const y1 = Math.max(0, y - radius);
        const y2 = Math.min(h - 1, y + radius);
        for (let x = 0; x < w; x++) {
          const x1 = Math.max(0, x - radius);
          const x2 = Math.min(w - 1, x + radius);
          const area = (x2 - x1 + 1) * (y2 - y1 + 1);
          const sum =
            sat[(y2 + 1) * W + (x2 + 1)] -
            sat[y1 * W + (x2 + 1)] -
            sat[(y2 + 1) * W + x1] +
            sat[y1 * W + x1];
          const bg = sum / area || 1;
          out[y * w + x] = (gray[y * w + x] / bg) * 255;
        }
      }
    } else {
      out = gray;
    }

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = out[p] < 0 ? 0 : out[p] > 255 ? 255 : out[p];
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
 * Runs OCR passes over the photo, best pass first, yielding each result so the
 * caller can parse it and stop early once a pass reconciles well. Each pass
 * combines one preprocessing variant with one page-segmentation mode; a pass is
 * skipped when it produces the same text as one already seen.
 */
export async function* recognizeReceiptPasses(
  image: Blob,
  onProgress?: OcrProgress,
): AsyncGenerator<OcrResult> {
  const worker = await getWorker(onProgress);
  const seen = new Set<string>();
  let produced = 0;

  // Each preprocessing variant is computed once, lazily, on first use: the
  // pixel work is far more expensive than a recognition pass and is independent
  // of the segmentation mode.
  for (const prep of ['illum', 'gray'] as const) {
    const blob = await preprocess(image, prep);
    for (const { name, psm } of PASSES) {
      try {
        await worker.setParameters({ tessedit_pageseg_mode: psm });
        const { data } = await worker.recognize(blob);
        const text = data.text ?? '';
        if (text.trim().length < 8) continue;
        if (seen.has(text)) continue;
        seen.add(text);
        produced++;
        yield { text, confidence: data.confidence ?? 0, pass: `${prep}/${name}` };
      } catch {
        /* try the next pass */
      }
    }
  }

  if (!produced) throw new Error('No readable text was found in that image.');
}

/**
 * Runs every OCR pass and returns all results. Slower than the streaming
 * version because it cannot stop early; prefer `recognizeReceiptPasses`.
 */
export async function recognizeImageVariants(
  image: Blob,
  onProgress?: OcrProgress,
): Promise<OcrResult[]> {
  const results: OcrResult[] = [];
  for await (const r of recognizeReceiptPasses(image, onProgress)) results.push(r);
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
