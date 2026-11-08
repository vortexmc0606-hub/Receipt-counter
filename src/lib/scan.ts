import { loadBitmap } from './ocr';

export interface EnhanceResult {
  dataUrl: string;
  blob: Blob;
  angle: number;
  cropped: boolean;
}

export interface EnhanceOptions {
  maxEdge?: number;
  deskew?: boolean;
  crop?: boolean;
  shadow?: boolean;
}

const DEFAULTS: Required<EnhanceOptions> = {
  // A hard pixel cap keeps large phone photos from freezing mobile browsers.
  maxEdge: 1500,
  deskew: true,
  crop: true,
  shadow: true,
};

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
  let gray = grayPixels(sourcePixels.data);
  if (opts.shadow) gray = removeShadows(gray, w, h);
  gray = stretchContrast(gray);

  const angle = opts.deskew ? estimateSkew(gray, w, h) : 0;
  const rotated = document.createElement('canvas');
  rotated.width = w;
  rotated.height = h;
  const rctx = rotated.getContext('2d', { willReadFrequently: true });
  if (!rctx) throw new Error('Canvas is not available in this browser.');
  const pixels = rctx.createImageData(w, h);
  for (let p = 0; p < gray.length; p++) {
    const v = gray[p];
    pixels.data[p * 4] = v;
    pixels.data[p * 4 + 1] = v;
    pixels.data[p * 4 + 2] = v;
    pixels.data[p * 4 + 3] = 255;
  }
  rctx.putImageData(pixels, 0, 0);

  if (angle !== 0) {
    const corrected = document.createElement('canvas');
    corrected.width = w;
    corrected.height = h;
    const cctx = corrected.getContext('2d', { willReadFrequently: true });
    if (cctx) {
      cctx.fillStyle = '#fff';
      cctx.fillRect(0, 0, w, h);
      cctx.translate(w / 2, h / 2);
      cctx.rotate((-angle * Math.PI) / 180);
      cctx.drawImage(rotated, -w / 2, -h / 2);
      rotated.width = corrected.width;
      rotated.height = corrected.height;
      const finalCtx = rotated.getContext('2d', { willReadFrequently: true });
      finalCtx?.drawImage(corrected, 0, 0);
    }
  }

  let cropped = false;
  let output = rotated;
  if (opts.crop) {
    const image = rctx.getImageData(0, 0, w, h);
    let minX = w, minY = h, maxX = 0, maxY = 0;
    // Use a dark-pixel bounding box with a generous margin; ignore faint noise.
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const p = (y * w + x) * 4;
        if (image.data[p] < 205) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX > minX && maxY > minY) {
      const margin = Math.round(Math.min(w, h) * 0.025);
      const x = Math.max(0, minX - margin);
      const y = Math.max(0, minY - margin);
      const cw = Math.min(w - x, maxX - minX + margin * 2);
      const ch = Math.min(h - y, maxY - minY + margin * 2);
      // Do not crop away large receipt margins; only remove obvious empty borders.
      if (cw < w * 0.96 || ch < h * 0.96) {
        output = document.createElement('canvas');
        output.width = cw;
        output.height = ch;
        const octx = output.getContext('2d');
        if (octx) octx.drawImage(rotated, x, y, cw, ch, 0, 0, cw, ch);
        cropped = true;
      }
    }
  }

  const [dataUrl, blob] = await Promise.all([Promise.resolve(output.toDataURL('image/jpeg', 0.94)), canvasBlob(output)]);
  return { dataUrl, blob, angle, cropped };
}
