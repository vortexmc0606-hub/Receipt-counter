import { loadBitmap } from './ocr';
import { detectDocument } from './cv/detector';
import { warpPerspective, warpSize } from './cv/geometry';
import { analyzeQuality, type QualityReport } from './cv/quality';
import { blackoutRegions, describeRedactions, redactText, type Box, type RedactionKind } from './redact';

export interface EnhanceResult {
  dataUrl: string;
  blob: Blob;
  angle: number;
  cropped: boolean;
  /** True when a document boundary was found and the perspective was corrected. */
  perspective: boolean;
  /** Confidence (0..1) of the detected boundary, or 0 when none was used. */
  perspectiveScore: number;
}

export interface EnhanceOptions {
  maxEdge?: number;
  deskew?: boolean;
  crop?: boolean;
  shadow?: boolean;
  /** Correct the perspective of a skewed photo. */
  perspective?: boolean;
}

const DEFAULTS: Required<EnhanceOptions> = {
  // Hard pixel cap: big enough to keep small digits legible while still
  // finishing quickly on a phone. Raised from 2000 to 2600 after measuring that
  // small receipt digits keep improving up to ~2400–2600px on the long edge and
  // only stop after that.
  maxEdge: 2600,
  deskew: true,
  crop: true,
  shadow: true,
  perspective: true,
};

/** Confidence below which a detected boundary is ignored (deskew/crop only). */
const MIN_PERSPECTIVE_SCORE = 0.5;

/**
 * Quick quality check on an image before it is read, so the user can be warned
 * about a blurry or badly lit photo. Mirrors SmartScan CV's `analyze` command.
 */
export async function inspectImage(source: Blob): Promise<QualityReport> {
  const bitmap = await loadBitmap(source);
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return analyzeQuality(data, w, h);
}

export interface RedactImageResult {
  dataUrl: string;
  blob: Blob;
  /** Number of text lines blacked out. */
  lines: number;
  /** Human summary of the kinds of data removed. */
  summary: string | null;
}

/**
 * Blacks out the personal data on a receipt image. The image is OCR'd to locate
 * each text line, lines that carry a card number, phone, e-mail, address or
 * person name are painted over, and the cleaned image is returned. This is what
 * makes a scanned receipt safe to keep or share.
 */
export async function redactImage(source: Blob): Promise<RedactImageResult> {
  const bitmap = await loadBitmap(source);
  const w = bitmap.width;
  const h = bitmap.height;
  if (!w || !h) throw new Error('That image could not be opened.');

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  const { recognizeImageLines } = await import('./ocr');
  const lines = await recognizeImageLines(source);
  const boxes: Box[] = [];
  const totals: Record<RedactionKind, number> = { card: 0, phone: 0, email: 0, address: 0, name: 0 };
  for (const line of lines) {
    const result = redactText(line.text);
    if (result.text !== line.text) {
      boxes.push(line.bbox);
      for (const k of Object.keys(result.counts) as RedactionKind[]) totals[k] += result.counts[k];
    }
  }

  if (boxes.length) {
    const image = ctx.getImageData(0, 0, w, h);
    blackoutRegions(image.data, w, h, boxes);
    ctx.putImageData(image, 0, 0);
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const blob = await canvasBlob(canvas);
  return { dataUrl, blob, lines: boxes.length, summary: describeRedactions(totals) };
}

function grayPixels(data: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return out;
}

function integral(src: Uint8ClampedArray, w: number, h: number): Float64Array {
  const stride = w + 1;
  const sat = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      sat[(y + 1) * stride + x + 1] = sat[y * stride + x + 1] + row;
    }
  }
  return sat;
}

function localMean(sat: Float64Array, w: number, h: number, x: number, y: number, r: number): number {
  const x1 = Math.max(0, x - r);
  const y1 = Math.max(0, y - r);
  const x2 = Math.min(w - 1, x + r);
  const y2 = Math.min(h - 1, y + r);
  const s = w + 1;
  const sum = sat[(y2 + 1) * s + x2 + 1] - sat[y1 * s + x2 + 1] -
    sat[(y2 + 1) * s + x1] + sat[y1 * s + x1];
  return sum / ((x2 - x1 + 1) * (y2 - y1 + 1));
}

/** Reduce lighting gradients without destroying the grayscale detail used by vision models. */
function removeShadows(gray: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const sat = integral(gray, w, h);
  const radius = Math.max(18, Math.round(Math.min(w, h) / 16));
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const background = Math.max(1, localMean(sat, w, h, x, y, radius));
      // Blend original detail with illumination-normalized detail to avoid
      // amplifying paper texture, folds, and thermal-print noise.
      const normalized = Math.min(255, (gray[p] / background) * 246);
      out[p] = Math.max(0, Math.min(255, Math.round(gray[p] * 0.35 + normalized * 0.65)));
    }
  }
  return out;
}

function stretchContrast(gray: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const lowTarget = gray.length * 0.015;
  const highTarget = gray.length * 0.985;
  let sum = 0;
  let low = 0;
  let high = 255;
  for (let i = 0; i < 256; i++) {
    sum += hist[i];
    if (sum >= lowTarget) { low = i; break; }
  }
  sum = 0;
  for (let i = 255; i >= 0; i--) {
    sum += hist[i];
    if (sum >= gray.length - highTarget) { high = i; break; }
  }
  const range = Math.max(24, high - low);
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(((gray[i] - low) / range) * 255)));
  }
  return out;
}

/** Fast low-resolution row-projection estimate; deliberately capped for phones. */
function estimateSkew(gray: Uint8ClampedArray, w: number, h: number): number {
  const targetW = Math.min(420, w);
  const targetH = Math.min(900, Math.max(1, Math.round(h * targetW / w)));
  const sample = new Uint8ClampedArray(targetW * targetH);
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      sample[y * targetW + x] = gray[Math.min(h - 1, Math.floor(y * h / targetH)) * w +
        Math.min(w - 1, Math.floor(x * w / targetW))];
    }
  }
  const rows = new Float64Array(targetH);
  let bestAngle = 0;
  let bestScore = -1;
  const cx = targetW / 2;
  const cy = targetH / 2;
  for (let degrees = -5; degrees <= 5; degrees += 1) {
    rows.fill(0);
    const rad = degrees * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (let y = 2; y < targetH; y += 3) {
      for (let x = 2; x < targetW; x += 3) {
        if (sample[y * targetW + x] > 150) continue;
        const ry = Math.round((y - cy) * cos - (x - cx) * sin + cy);
        if (ry >= 0 && ry < targetH) rows[ry]++;
      }
    }
    let mean = 0;
    for (let y = 0; y < targetH; y++) mean += rows[y];
    mean /= targetH;
    let score = 0;
    for (let y = 0; y < targetH; y++) {
      const d = rows[y] - mean;
      score += d * d;
    }
    if (score > bestScore) { bestScore = score; bestAngle = degrees; }
  }
  // Avoid rotating a clean image because of random texture/noise.
  return Math.abs(bestAngle) <= 1 ? 0 : bestAngle;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode enhanced image.')), 'image/jpeg', 0.94);
  });
}

/**
 * Creates a vision-friendly scan: grayscale detail is retained (unlike a
 * pure black/white threshold image), shadows are reduced, contrast is lifted,
 * and slight rotation is corrected. Processing is bounded to maxEdge pixels.
 */
export async function enhanceDocument(
  source: Blob,
  options: EnhanceOptions = {},
): Promise<EnhanceResult> {
  const opts = { ...DEFAULTS, ...options };
  const bitmap = await loadBitmap(source);
  if (!bitmap.width || !bitmap.height) throw new Error('That image could not be opened.');

  const scale = Math.min(1, opts.maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const input = document.createElement('canvas');
  input.width = w;
  input.height = h;
  const ictx = input.getContext('2d', { willReadFrequently: true });
  if (!ictx) throw new Error('Canvas is not available in this browser.');
  ictx.imageSmoothingEnabled = true;
  ictx.imageSmoothingQuality = 'high';
  ictx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  const sourcePixels = ictx.getImageData(0, 0, w, h);

  // Perspective correction: if a document boundary can be found, flatten it to
  // a top-down rectangle before anything else. This is the single biggest win
  // for a receipt photographed at an angle. Falls back to the untouched pixels
  // when no confident boundary is present.
  let working = sourcePixels.data;
  let workW = w;
  let workH = h;
  let perspective = false;
  let perspectiveScore = 0;
  if (opts.perspective) {
    const detection = detectDocument(sourcePixels.data, w, h);
    if (detection && detection.score >= MIN_PERSPECTIVE_SCORE) {
      const { width, height } = warpSize(detection.quad);
      if (width >= 16 && height >= 16) {
        working = warpPerspective(sourcePixels.data, w, h, detection.quad, width, height);
        workW = width;
        workH = height;
        perspective = true;
        perspectiveScore = detection.score;
      }
    }
  }

  let gray = grayPixels(working);
  if (opts.shadow) gray = removeShadows(gray, workW, workH);
  gray = stretchContrast(gray);

  const angle = opts.deskew ? estimateSkew(gray, workW, workH) : 0;
  const rotated = document.createElement('canvas');
  rotated.width = workW;
  rotated.height = workH;
  const rctx = rotated.getContext('2d', { willReadFrequently: true });
  if (!rctx) throw new Error('Canvas is not available in this browser.');
  const pixels = rctx.createImageData(workW, workH);
  for (let p = 0; p < gray.length; p++) {
    const v = gray[p];
    pixels.data[p * 4] = v;
    pixels.data[p * 4 + 1] = v;
    pixels.data[p * 4 + 2] = v;
    pixels.data[p * 4 + 3] = 255;
  }
  rctx.putImageData(pixels, 0, 0);

  const corrected = document.createElement('canvas');
  corrected.width = workW;
  corrected.height = workH;
  const cctx = corrected.getContext('2d', { willReadFrequently: true });
  if (!cctx) throw new Error('Canvas is not available in this browser.');
  cctx.fillStyle = '#fff';
  cctx.fillRect(0, 0, workW, workH);
  if (angle !== 0) {
    cctx.translate(workW / 2, workH / 2);
    cctx.rotate((-angle * Math.PI) / 180);
    cctx.drawImage(rotated, -workW / 2, -workH / 2);
  } else { cctx.drawImage(rotated, 0, 0); }

  let cropped = false;
  let output = corrected;
  // After a perspective warp the document already fills the frame, so the
  // dark-pixel crop is unnecessary (and can nibble a printed edge).
  if (opts.crop && !perspective) {
    const image = cctx.getImageData(0, 0, workW, workH);
    let minX = workW, minY = workH, maxX = 0, maxY = 0;
    // Use a dark-pixel bounding box with a generous margin; ignore faint noise.
    for (let y = 0; y < workH; y += 2) {
      for (let x = 0; x < workW; x += 2) {
        const p = (y * workW + x) * 4;
        if (image.data[p] < 205) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX > minX && maxY > minY) {
      const margin = Math.round(Math.min(workW, workH) * 0.025);
      const x = Math.max(0, minX - margin);
      const y = Math.max(0, minY - margin);
      const cw = Math.min(workW - x, maxX - minX + margin * 2);
      const ch = Math.min(workH - y, maxY - minY + margin * 2);
      // Do not crop away large receipt margins; only remove obvious empty borders.
      if (cw < workW * 0.96 || ch < workH * 0.96) {
        output = document.createElement('canvas');
        output.width = cw;
        output.height = ch;
        const octx = output.getContext('2d');
        if (octx) octx.drawImage(corrected, x, y, cw, ch, 0, 0, cw, ch);
        cropped = true;
      }
    }
  }

  const [dataUrl, blob] = await Promise.all([Promise.resolve(output.toDataURL('image/jpeg', 0.94)), canvasBlob(output)]);
  return { dataUrl, blob, angle, cropped, perspective, perspectiveScore };
}
