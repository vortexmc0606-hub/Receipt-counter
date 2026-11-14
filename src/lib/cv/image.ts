/**
 * Minimal image-processing primitives needed for document boundary detection,
 * implemented in plain TypeScript so the whole detector can run in the browser
 * and be unit tested in `node` (no canvas, no OpenCV).
 *
 * Only the operations the detector needs are here: grayscale, Gaussian blur,
 * Sobel gradients, a Canny-style edge map, morphological close, and connected
 * components over a binary mask.
 */

/** Rec.601 luma. */
export function toGray(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    out[p] = (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114) | 0;
  }
  return out;
}

/** Separable Gaussian blur with a reflected border. */
export function gaussianBlur(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  radius = 2,
): Uint8ClampedArray {
  const sigma = Math.max(0.6, radius * 0.6);
  const size = radius * 2 + 1;
  const k = new Float64Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const d = i - radius;
    k[i] = Math.exp(-(d * d) / (2 * sigma * sigma));
    sum += k[i];
  }
  for (let i = 0; i < size; i++) k[i] /= sum;

  const tmp = new Float64Array(w * h);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = 0; i < size; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i - radius));
        acc += src[y * w + xx] * k[i];
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = 0; i < size; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i - radius));
        acc += tmp[yy * w + x] * k[i];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

export interface Gradients {
  mag: Float32Array;
  dir: Float32Array;
}

export function sobel(src: Uint8ClampedArray, w: number, h: number): Gradients {
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = src[i - w - 1], t = src[i - w], tr = src[i - w + 1];
      const l = src[i - 1], r = src[i + 1];
      const bl = src[i + w - 1], b = src[i + w], br = src[i + w + 1];
      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
      mag[i] = Math.hypot(gx, gy);
      dir[i] = Math.atan2(gy, gx);
    }
  }
  return { mag, dir };
}

/**
 * Canny-style edge map. `low`/`high` are gradient-magnitude thresholds; edges
 * above `high` are strong, edges above `low` are kept only when connected to a
 * strong edge (hysteresis). Returns a 0/255 mask.
 */
export function canny(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  low: number,
  high: number,
): Uint8ClampedArray {
  const { mag, dir } = sobel(src, w, h);
  const suppressed = nonMaxSuppress(mag, dir, w, h);
  const out = new Uint8ClampedArray(w * h);
  const stack: number[] = [];
  for (let i = 0; i < suppressed.length; i++) {
    if (suppressed[i] >= high) {
      out[i] = 255;
      stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const j = ny * w + nx;
        if (out[j] === 0 && suppressed[j] >= low) {
          out[j] = 255;
          stack.push(j);
        }
      }
    }
  }
  return out;
}

function nonMaxSuppress(
  mag: Float32Array,
  dir: Float32Array,
  w: number,
  h: number,
): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const angle = ((dir[i] * 180) / Math.PI + 180) % 180;
      let a = mag[i - 1];
      let b = mag[i + 1];
      if (angle >= 22.5 && angle < 67.5) {
        a = mag[i - w + 1];
        b = mag[i + w - 1];
      } else if (angle >= 67.5 && angle < 112.5) {
        a = mag[i - w];
        b = mag[i + w];
      } else if (angle >= 112.5 && angle < 157.5) {
        a = mag[i - w - 1];
        b = mag[i + w + 1];
      }
      out[i] = mag[i] >= a && mag[i] >= b ? mag[i] : 0;
    }
  }
  return out;
}

/** Morphological close (dilate then erode) on a 0/255 mask with a square kernel. */
export function morphClose(mask: Uint8ClampedArray, w: number, h: number, k: number): Uint8ClampedArray {
  const dilated = morph(mask, w, h, k, 'max');
  return morph(dilated, w, h, k, 'min');
}

function morph(
  mask: Uint8ClampedArray,
  w: number,
  h: number,
  k: number,
  op: 'max' | 'min',
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  const r = Math.floor(k / 2);
  const wantMax = op === 'max';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = wantMax ? 0 : 255;
      for (let dy = -r; dy <= r; dy++) {
        const ny = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -r; dx <= r; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const s = mask[ny * w + nx];
          v = wantMax ? Math.max(v, s) : Math.min(v, s);
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * Connected components (8-connectivity) of non-zero pixels. Returns the list of
 * pixel lists, so callers can run contour analysis on each blob.
 */
export function connectedComponents(mask: Uint8ClampedArray, w: number, h: number): number[][] {
  const labels = new Int32Array(w * h).fill(-1);
  const comps: number[][] = [];
  const queue = new Int32Array(w * h);
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || labels[start] !== -1) continue;
    const id = comps.length;
    const pixels: number[] = [];
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = id;
    while (head < tail) {
      const i = queue[head++];
      pixels.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] !== 0 && labels[j] === -1) {
            labels[j] = id;
            queue[tail++] = j;
          }
        }
      }
    }
    comps.push(pixels);
  }
  return comps;
}
