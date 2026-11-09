/**
 * Perspective geometry for document scanning, ported from the SmartScan CV
 * project (Python/OpenCV) so the same boundary-detection and four-point warp can
 * run in the browser.
 *
 * All functions work on plain arrays (no canvas, no DOM) so they can be unit
 * tested under `node` and reused by the detector and the enhancer.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  /** top-left, top-right, bottom-right, bottom-left */
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

/** Orders four points as top-left, top-right, bottom-right, bottom-left. */
export function orderPoints(pts: Point[]): [Point, Point, Point, Point] {
  if (pts.length !== 4) throw new Error('orderPoints needs exactly four points');
  const sum = pts.map((p) => p.x + p.y);
  const diff = pts.map((p) => p.x - p.y);
  const tl = pts[argMin(sum)];
  const br = pts[argMax(sum)];
  const tr = pts[argMax(diff)];
  const bl = pts[argMin(diff)];
  return [tl, tr, br, bl];
}

function argMin(a: number[]): number {
  let best = 0;
  for (let i = 1; i < a.length; i++) if (a[i] < a[best]) best = i;
  return best;
}

function argMax(a: number[]): number {
  let best = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[best]) best = i;
  return best;
}

export function quadFromPoints(pts: Point[]): Quad {
  const [tl, tr, br, bl] = orderPoints(pts);
  return { tl, tr, br, bl };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The output size a four-point warp should produce: the longest top/bottom edge
 * and the longest left/right edge. Keeps the receipt's aspect ratio instead of
 * squashing it.
 */
export function warpSize(quad: Quad): { width: number; height: number } {
  const widthA = dist(quad.br, quad.bl);
  const widthB = dist(quad.tr, quad.tl);
  const heightA = dist(quad.tr, quad.br);
  const heightB = dist(quad.tl, quad.bl);
  return {
    width: Math.max(1, Math.round(Math.max(widthA, widthB))),
    height: Math.max(1, Math.round(Math.max(heightA, heightB))),
  };
}

/** Signed area of a quad (shoelace). */
export function quadArea(quad: Quad): number {
  const pts = [quad.tl, quad.tr, quad.br, quad.bl];
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % 4];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export interface Matrix3 {
  /** Row-major 3x3. */
  m: number[];
}

/**
 * Homography that maps the four source points onto the four destination points.
 * Solves the standard 8x8 linear system with Gaussian elimination; returns null
 * when the system is singular (degenerate quad).
 */
export function getPerspectiveTransform(src: Point[], dst: Point[]): Matrix3 | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(a, b);
  if (!h) return null;
  return { m: [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] };
}

function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const pv = m[col][col];
    for (let c = col; c <= n; c++) m[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

export function applyMatrix(m: Matrix3, p: Point): Point {
  const [a, b, c, d, e, f, g, h] = m.m;
  const w = g * p.x + h * p.y + 1;
  const iw = w === 0 ? 0 : 1 / w;
  return { x: (a * p.x + b * p.y + c) * iw, y: (d * p.x + e * p.y + f) * iw };
}

export function invertMatrix(m: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, h, i] = m.m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const raw = [
    A * inv,
    -(b * i - c * h) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    -(a * f - c * d) * inv,
    C * inv,
    -(a * h - b * g) * inv,
    (a * e - b * d) * inv,
  ];
  // Homographies are defined up to scale; normalise so the bottom-right term
  // is 1, which is what applyMatrix() assumes.
  const norm = raw[8];
  if (Math.abs(norm) < 1e-12) return null;
  return { m: raw.map((v) => v / norm) };
}

/**
 * Warps an RGBA pixel buffer to a top-down rectangle of `width` x `height`
 * using the inverse mapping and bilinear sampling. Returns a new RGBA buffer.
 */
export function warpPerspective(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  quad: Quad,
  width: number,
  height: number,
) {
  const dstCorners: Point[] = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  const srcCorners = [quad.tl, quad.tr, quad.br, quad.bl];
  const fwd = getPerspectiveTransform(srcCorners, dstCorners);
  const inv = fwd ? invertMatrix(fwd) : null;
  const out = new Uint8ClampedArray(width * height * 4);
  if (!inv) return out;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = applyMatrix(inv, { x, y });
      const o = (y * width + x) * 4;
      sampleBilinear(src, srcW, srcH, p.x, p.y, out, o);
    }
  }
  return out;
}

function sampleBilinear(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  fx: number,
  fy: number,
  out: Uint8ClampedArray,
  o: number,
): void {
  if (fx < 0 || fy < 0 || fx > w - 1 || fy > h - 1) {
    out[o] = out[o + 1] = out[o + 2] = 255;
    out[o + 3] = 255;
    return;
  }
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const dx = fx - x0;
  const dy = fy - y0;
  for (let c = 0; c < 4; c++) {
    const p00 = src[(y0 * w + x0) * 4 + c];
    const p10 = src[(y0 * w + x1) * 4 + c];
    const p01 = src[(y1 * w + x0) * 4 + c];
    const p11 = src[(y1 * w + x1) * 4 + c];
    const top = p00 + (p10 - p00) * dx;
    const bot = p01 + (p11 - p01) * dx;
    out[o + c] = top + (bot - top) * dy;
  }
}
