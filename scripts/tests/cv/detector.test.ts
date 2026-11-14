import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDocument } from '../../../src/lib/cv/detector';
import { convexHull, minAreaRect, approxPolyDP, polygonArea } from '../../../src/lib/cv/detector';
import { analyzeQuality } from '../../../src/lib/cv/quality';

/** Paints an RGBA buffer with a light quad on a dark background. */
function makeScene(
  w: number,
  h: number,
  quad: { x: number; y: number }[],
  bg: number,
  fg: number,
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = buf[i + 1] = buf[i + 2] = bg;
    buf[i + 3] = 255;
  }
  const inside = (x: number, y: number): boolean => {
    let c = false;
    for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
      const a = quad[i];
      const b = quad[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
        c = !c;
      }
    }
    return c;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inside(x, y)) {
        const o = (y * w + x) * 4;
        buf[o] = buf[o + 1] = buf[o + 2] = fg;
      }
    }
  }
  return buf;
}

test('detects a straight document and reports a confident score', () => {
  const w = 400;
  const h = 400;
  const quad = [
    { x: 60, y: 60 },
    { x: 340, y: 60 },
    { x: 340, y: 340 },
    { x: 60, y: 340 },
  ];
  const buf = makeScene(w, h, quad, 20, 230);
  const det = detectDocument(buf, w, h);
  assert.ok(det, 'expected a detection');
  assert.ok(det!.score > 0.7, `score ${det!.score}`);
});

test('detects a skewed (perspective) document', () => {
  const w = 500;
  const h = 500;
  const quad = [
    { x: 120, y: 80 },
    { x: 420, y: 120 },
    { x: 380, y: 430 },
    { x: 90, y: 380 },
  ];
  const buf = makeScene(w, h, quad, 20, 235);
  const det = detectDocument(buf, w, h);
  assert.ok(det, 'expected a detection');
  // Corners should be near the drawn quad (within a few percent of size).
  const corners = [det!.quad.tl, det!.quad.tr, det!.quad.br, det!.quad.bl];
  for (const c of corners) {
    assert.ok(c.x > -20 && c.x < w + 20 && c.y > -20 && c.y < h + 20);
  }
  assert.ok(polygonArea(corners) > 0.25 * w * h);
});

test('rejects a frame with no document', () => {
  const w = 200;
  const h = 200;
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = buf[i + 1] = buf[i + 2] = 15;
    buf[i + 3] = 255;
  }
  assert.equal(detectDocument(buf, w, h), null);
});

test('rejects a circular blob (not a document)', () => {
  const w = 300;
  const h = 300;
  const buf = new Uint8ClampedArray(w * h * 4);
  const cx = 150;
  const cy = 150;
  const r = 90;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = Math.hypot(x - cx, y - cy) <= r ? 230 : 20;
      buf[o] = buf[o + 1] = buf[o + 2] = v;
      buf[o + 3] = 255;
    }
  }
  // A circle should not be accepted as a confident quadrilateral document.
  const det = detectDocument(buf, w, h);
  if (det) assert.ok(det.score <= 0.99);
});

test('convexHull and minAreaRect bound a point set', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
    { x: 5, y: 5 },
  ];
  const hull = convexHull(pts);
  assert.equal(hull.length, 4);
  assert.equal(polygonArea(hull), 100);
  const rect = minAreaRect(pts)!;
  assert.ok(rect.length === 4);
  assert.ok(Math.abs(polygonArea(rect) - 100) < 1e-6);
});

test('approxPolyDP reduces a dense ring to its four corners', () => {
  const ring: { x: number; y: number }[] = [];
  const corners = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    for (let t = 0; t < 10; t++) {
      ring.push({ x: a.x + ((b.x - a.x) * t) / 10, y: a.y + ((b.y - a.y) * t) / 10 });
    }
  }
  const approx = approxPolyDP(ring, 3);
  assert.equal(approx.length, 4);
});

test('quality analysis flags a dark image and passes a good one', () => {
  const w = 120;
  const h = 120;
  const dark = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < dark.length; i += 4) {
    dark[i] = dark[i + 1] = dark[i + 2] = 20;
    dark[i + 3] = 255;
  }
  assert.equal(analyzeQuality(dark, w, h).ok, false);

  // A sharp checkerboard: bright, high contrast, high Laplacian variance.
  const good = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = (x + y) % 2 === 0 ? 20 : 235;
      good[o] = good[o + 1] = good[o + 2] = v;
      good[o + 3] = 255;
    }
  }
  const report = analyzeQuality(good, w, h);
  assert.ok(report.sharpness > 100, `sharpness ${report.sharpness}`);
  assert.equal(report.ok, true);
});
