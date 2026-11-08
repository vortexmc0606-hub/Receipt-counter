import { loadBitmap } from './ocr';

export interface EnhanceResult {
  /** Cleaned image as a PNG data URL, ready to draw or recognise. */
  dataUrl: string;
  /** Same image as a JPEG blob, sized for sending to a vision model. */
  blob: Blob;
  /** Skew that was corrected, in degrees (0 when none was needed). */
  angle: number;
  /** True when the image was cropped down to the paper. */
  cropped: boolean;
}

export interface EnhanceOptions {
  /** Working resolution on the long edge. Higher is slower but sharper. */
  maxEdge?: number;
  /** Correct small rotations so text lines run level. */
  deskew?: boolean;
  /** Trim the empty border around the paper. */
  crop?: boolean;
  /** Remove shadows and uneven lighting before thresholding. */
  shadow?: boolean;
}

const DEFAULTS: Required<EnhanceOptions> = {
  maxEdge: 1800,
  deskew: true,
  crop: true,
  shadow: true,
};

function toGray(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return gray;
}

/** Summed-area table for O(1) box means. */
function integral(src: Uint8ClampedArray, w: number, h: number): Float64Array {
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  return sat;
}

function boxMean(sat: Float64Array, w: number, h: number, x: number, y: number, r: number): number {
  const x1 = Math.max(0, x - r);
  const y1 = Math.max(0, y - r);
  const x2 = Math.min(w - 1, x + r);
  const y2 = Math.min(h - 1, y + r);
  const W = w + 1;
  const area = (x2 - x1 + 1) * (y2 - y1 + 1);
  const sum =
    sat[(y2 + 1) * W + (x2 + 1)] -
    sat[y1 * W + (x2 + 1)] -
    sat[(y2 + 1) * W + x1] +
    sat[y1 * W + x1];
  return sum / area;
}

/**
 * Removes shadows and uneven lighting by dividing each pixel by the local
 * background, so paper becomes uniformly white and ink stays dark. This is the
 * single biggest win for phone photos of receipts.
 */
function normalizeIllumination(gray: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const radius = Math.max(12, Math.round(Math.min(w, h) / 18));
  const sat = integral(gray, w, h);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bg = boxMean(sat, w, h, x, y, radius) || 1;
      // 255 * pixel / background pushes paper to white and keeps ink dark.
      const v = (gray[y * w + x] / bg) * 255;
      out[y * w + x] = v > 255 ? 255 : v;
    }
  }
  return out;
}

/** Stretches contrast across the 2nd–98th percentile. */
function contrastStretch(gray: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Uint32Array(256);
  for (let p = 0; p < gray.length; p++) hist[gray[p]]++;
  const total = gray.length;
  const loCut = total * 0.02;
  const hiCut = total * 0.98;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= loCut) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= total - hiCut) {
      hi = v;
      break;
    }
  }
  const range = Math.max(1, hi - lo);
  const out = new Uint8ClampedArray(gray.length);
  for (let p = 0; p < gray.length; p++) {
    const v = ((gray[p] - lo) / range) * 255;
    out[p] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

/** Bradley adaptive threshold: locally-dark pixels become black. */
function adaptiveThreshold(gray: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const radius = Math.max(8, Math.round(Math.min(w, h) / 32));
  const sat = integral(gray, w, h);
  const out = new Uint8ClampedArray(w * h);
  const t = 0.86; // keep only pixels clearly darker than their neighbourhood
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mean = boxMean(sat, w, h, x, y, radius);
      out[y * w + x] = gray[y * w + x] < mean * t ? 0 : 255;
    }
  }
  return out;
}

function otsu(gray: Uint8ClampedArray): number {
  const hist = new Uint32Array(256);
  for (let p = 0; p < gray.length; p++) hist[gray[p]]++;
  const total = gray.length;
  let sumAll = 0;
  for (let v = 0; v < 256; v++) sumAll += v * hist[v];
  let sumB = 0;
  let wB = 0;
  let best = 128;
  let bestVar = -1;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += v * hist[v];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = v;
    }
  }
  return best;
}

/**
 * Estimates the small rotation that makes text lines horizontal by maximising
 * the variance of the row-projection profile — level text gives sharp, tall
 * peaks where lines fall.
 */
function estimateSkew(binary: Uint8ClampedArray, w: number, h: number): number {
  let bestAngle = 0;
  let bestScore = -1;
  const cx = w / 2;
  const cy = h / 2;
  for (let angle = -8; angle <= 8; angle += 0.5) {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rows = new Float64Array(h);
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (binary[y * w + x] !== 0) continue; // only ink
        const dx = x - cx;
        const dy = y - cy;
        const ry = Math.round(dy * cos - dx * sin + cy);
        if (ry >= 0 && ry < h) rows[ry]++;
      }
    }
    let mean = 0;
    for (let y = 0; y < h; y++) mean += rows[y];
    mean /= h;
    let variance = 0;
    for (let y = 0; y < h; y++) {
      const d = rows[y] - mean;
      variance += d * d;
    }
    if (variance > bestScore) {
      bestScore = variance;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image.'))), type, quality);
  });
}

/**
 * Turns a raw phone photo of a receipt into a clean, scan-like image: shadows
 * and uneven light removed, contrast normalised, small rotations levelled,
 * paper cropped to its edges, and text thresholded to crisp black on white.
 *
 * Everything runs locally in the browser. If any step fails the original image
 * is returned, so scanning never breaks because of enhancement.
 */
export async function enhanceDocument(
  source: Blob,
  options: EnhanceOptions = {},
): Promise<EnhanceResult> {
  const opts = { ...DEFAULTS, ...options };
  const bitmap = await loadBitmap(source);
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  if (!srcW || !srcH) throw new Error('That image could not be opened.');

  const scale = Math.min(4, Math.max(1, opts.maxEdge / Math.max(srcW, srcH)));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  let gray = toGray(image.data, w, h);
  if (opts.shadow) gray = normalizeIllumination(gray, w, h);
  gray = contrastStretch(gray);

  // Work on a downscaled copy for skew estimation to keep it fast.
  let angle = 0;
  if (opts.deskew) {
    const small = document.createElement('canvas');
    const sw = Math.min(800, w);
    const sh = Math.max(1, Math.round((h / w) * sw));
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    if (sctx) {
      const tmp = new Uint8ClampedArray(sw * sh);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          tmp[y * sw + x] = gray[Math.min(h - 1, ((y * h) / sh) | 0) * w + Math.min(w - 1, ((x * w) / sw) | 0)];
        }
      }
      const thr = otsu(tmp);
      const bin = new Uint8ClampedArray(tmp.length);
      for (let p = 0; p < tmp.length; p++) bin[p] = tmp[p] < thr ? 0 : 255;
      angle = estimateSkew(bin, sw, sh);
    }
  }

  // Binarise only to find the ink bounding box for cropping. The pixels we
  // actually keep are the cleaned greyscale: thresholding to pure black/white
  // looks crisp but was measured to roughly halve OCR word confidence, because
  // anti-aliased digit edges carry information Tesseract uses.
  const binary = adaptiveThreshold(gray, w, h);

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d', { willReadFrequently: true });
  if (!octx) throw new Error('Canvas is not available in this browser.');

  octx.fillStyle = '#ffffff';
  octx.fillRect(0, 0, w, h);
  if (angle !== 0) {
    octx.save();
    octx.translate(w / 2, h / 2);
    octx.rotate((-angle * Math.PI) / 180);
    octx.drawImage(canvas, -w / 2, -h / 2);
    octx.restore();
  } else {
    octx.drawImage(canvas, 0, 0);
  }

  // Paint the cleaned greyscale pixels on top so the result is high-contrast
  // but still smooth.
  const binImage = octx.createImageData(w, h);
  for (let p = 0; p < gray.length; p++) {
    const v = gray[p];
    binImage.data[p * 4] = v;
    binImage.data[p * 4 + 1] = v;
    binImage.data[p * 4 + 2] = v;
    binImage.data[p * 4 + 3] = 255;
  }

  // Auto-crop to the ink bounding box with a small margin.
  let cropped = false;
  let cx0 = 0;
  let cy0 = 0;
  let cw = w;
  let ch = h;
  if (opts.crop) {
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (binary[y * w + x] === 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX > minX && maxY > minY) {
      const margin = Math.round(Math.min(w, h) * 0.02);
      cx0 = Math.max(0, minX - margin);
      cy0 = Math.max(0, minY - margin);
      cw = Math.min(w - cx0, maxX - minX + margin * 2);
      ch = Math.min(h - cy0, maxY - minY + margin * 2);
      cropped = cw < w || ch < h;
    }
  }

  const final = document.createElement('canvas');
  final.width = cw;
  final.height = ch;
  const fctx = final.getContext('2d');
  if (!fctx) throw new Error('Canvas is not available in this browser.');
  fctx.fillStyle = '#ffffff';
  fctx.fillRect(0, 0, cw, ch);
  fctx.putImageData(binImage, 0, 0);
  if (cropped) {
    fctx.drawImage(out, cx0, cy0, cw, ch, 0, 0, cw, ch);
  } else {
    fctx.drawImage(out, 0, 0);
  }

  const [dataUrl, blob] = await Promise.all([
    Promise.resolve(final.toDataURL('image/png')),
    canvasToBlob(final, 'image/jpeg', 0.9),
  ]);

  return { dataUrl, blob, angle, cropped };
}
