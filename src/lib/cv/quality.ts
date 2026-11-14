/**
 * Image-quality analysis, ported from SmartScan CV `quality.py`. Reports
 * sharpness (Laplacian variance), brightness and contrast, plus a plain-language
 * recommendation. Used to warn the user before/after a scan.
 */

import { toGray } from './image';

export interface QualityReport {
  sharpness: number;
  brightness: number;
  contrast: number;
  recommendation: string;
  /** True when the image is good enough to read reliably. */
  ok: boolean;
}

export function analyzeQuality(rgba: Uint8ClampedArray, w: number, h: number): QualityReport {
  const gray = toGray(rgba);

  // Laplacian variance (sharpness).
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const mean = count ? sum / count : 0;
  const sharpness = count ? sumSq / count - mean * mean : 0;

  // Brightness (mean) and contrast (stddev).
  let bSum = 0;
  let bSq = 0;
  for (let i = 0; i < gray.length; i++) {
    bSum += gray[i];
    bSq += gray[i] * gray[i];
  }
  const brightness = gray.length ? bSum / gray.length : 0;
  const contrast = Math.sqrt(Math.max(0, (gray.length ? bSq / gray.length : 0) - brightness * brightness));

  let recommendation = 'Good quality';
  let ok = true;
  if (sharpness < 100) {
    recommendation = 'The photo looks blurry — hold steadier and tap to focus.';
    ok = false;
  } else if (brightness < 60) {
    recommendation = 'The photo looks dark — add more light.';
    ok = false;
  } else if (brightness > 220) {
    recommendation = 'The photo looks washed out — reduce glare.';
    ok = false;
  } else if (contrast < 30) {
    recommendation = 'The photo has low contrast — flatten the receipt and avoid shadows.';
    ok = false;
  }

  return { sharpness, brightness, contrast, recommendation, ok };
}
