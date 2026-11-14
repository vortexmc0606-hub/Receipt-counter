/**
 * Document boundary detection, ported from the SmartScan CV `detector.py`
 * (Canny edges -> morphological close -> largest quadrilateral contour, with a
 * min-area-rectangle fallback). Runs on a height-500 copy for speed, exactly
 * like the original, then scales the corners back to full resolution.
 *
 * Returns `null` (instead of throwing) when no confident boundary is found so
 * the caller can fall back to its previous behaviour.
 */

import { canny, connectedComponents, gaussianBlur, morphClose, toGray } from './image';
import {
  Quad,
  Point,
  quadArea,
  quadFromPoints,
} from './geometry';

export interface Detection {
  quad: Quad;
  /** 0..1 confidence in the detected boundary. */
  score: number;
}

const WORK_HEIGHT = 500;
/** A document must cover at least this fraction of the frame to count. */
const MIN_AREA_FRACTION = 0.1;

export function detectDocument(rgba: Uint8ClampedArray, w: number, h: number): Detection | null {
  if (w < 8 || h < 8) return null;
  const ratio = h / WORK_HEIGHT;
  const sw = Math.max(8, Math.round(w / ratio));
  const sh = WORK_HEIGHT;

  const small = resample(rgba, w, h, sw, sh);
  const gray = toGray(small);
  const blurred = gaussianBlur(gray, sw, sh, 2);
  const edges = canny(blurred, sw, sh, 75, 200);
  const closed = morphClose(edges, sw, sh, 5);

  const comps = connectedComponents(closed, sw, sh);
  const imageArea = sw * sh;

  // Rank blobs by the area their hull encloses, mirroring OpenCV's
  // contourArea sort (a border loop encloses the whole document).
  const candidates = comps
    .map((px) => {
      const pts = pixelsToPoints(px, sw);
      const hull = convexHull(pts);
      return { hull, area: polygonArea(hull) };
    })
    .filter((c) => c.hull.length >= 4)
    .sort((a, b) => b.area - a.area)
    .slice(0, 5);

  for (const { hull, area } of candidates) {
    if (area <= MIN_AREA_FRACTION * imageArea) continue;
    const peri = perimeter(hull);
    const approx = approxPolyDP(hull, 0.04 * peri);
    if (approx.length === 4) {
      const score = Math.min(0.99, 0.7 + (area / imageArea) * 0.29);
      return { quad: scaleQuad(quadFromPoints(approx), ratio), score };
    }
  }

  // Fallback: a nearly convex blob whose area is close to its hull.
  for (const { hull, area } of candidates) {
    if (area <= MIN_AREA_FRACTION * imageArea) continue;
    const peri = perimeter(hull);
    const approx = approxPolyDP(hull, 0.02 * peri);
    if (approx.length <= 6) {
      const rect = minAreaRect(hull);
      if (!rect) continue;
      const score = Math.min(0.69, 0.4 + (area / imageArea) * 0.29);
      return { quad: scaleQuad(quadFromPoints(rect), ratio), score };
    }
  }

  return null;
}

function pixelsToPoints(px: number[], w: number): Point[] {
  const pts: Point[] = new Array(px.length);
  for (let i = 0; i < px.length; i++) {
    pts[i] = { x: px[i] % w, y: (px[i] / w) | 0 };
  }
  return pts;
}

function scaleQuad(q: Quad, ratio: number): Quad {
  const s = (p: Point): Point => ({ x: p.x * ratio, y: p.y * ratio });
  return { tl: s(q.tl), tr: s(q.tr), br: s(q.br), bl: s(q.bl) };
}

function resample(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
      const s = (sy * sw + sx) * 4;
      const d = (y * dw + x) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = src[s + 3];
    }
  }
  return out;
}

/** Andrew's monotone chain; returns the hull counter-clockwise. */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function polygonArea(poly: Point[]): number {
  if (poly.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function perimeter(poly: Point[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    p += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return p;
}

/**
 * Douglas-Peucker simplification of a closed polygon. The ring is split at the
 * vertex farthest from the first point so RDP has two stable endpoints.
 */
export function approxPolyDP(poly: Point[], epsilon: number): Point[] {
  if (poly.length <= 4) return poly.slice();
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < poly.length; i++) {
    const d = (poly[i].x - poly[0].x) ** 2 + (poly[i].y - poly[0].y) ** 2;
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const chainA = poly.slice(0, far + 1);
  const chainB = poly.slice(far).concat([poly[0]]);
  const a = rdp(chainA, epsilon);
  const b = rdp(chainB, epsilon);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  let index = -1;
  let maxDist = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon && index !== -1) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Minimum-area bounding rectangle of a point set, via edge-aligned boxes. */
export function minAreaRect(points: Point[]): Point[] | null {
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  let best: Point[] | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of hull) {
      const rx = p.x * cos - p.y * sin;
      const ry = p.x * sin + p.y * cos;
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
      minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area < bestArea) {
      bestArea = area;
      const cos2 = Math.cos(angle);
      const sin2 = Math.sin(angle);
      const corners = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ].map((p) => ({ x: p.x * cos2 - p.y * sin2, y: p.x * sin2 + p.y * cos2 }));
      best = corners;
    }
  }
  return best;
}

export { quadArea };
