import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderPoints,
  quadFromPoints,
  getPerspectiveTransform,
  invertMatrix,
  applyMatrix,
  warpPerspective,
  warpSize,
  quadArea,
} from '../../../src/lib/cv/geometry';

test('orderPoints returns tl, tr, br, bl from shuffled input', () => {
  const pts = [
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 100, y: 0 },
    { x: 0, y: 0 },
  ];
  const [tl, tr, br, bl] = orderPoints(pts);
  assert.deepEqual(tl, { x: 0, y: 0 });
  assert.deepEqual(tr, { x: 100, y: 0 });
  assert.deepEqual(br, { x: 100, y: 100 });
  assert.deepEqual(bl, { x: 0, y: 100 });
});

test('a homography maps the source corners onto the destination corners', () => {
  const src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 200 },
    { x: 0, y: 200 },
  ];
  const dst = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 200 },
    { x: 0, y: 200 },
  ];
  const m = getPerspectiveTransform(src, dst)!;
  for (let i = 0; i < 4; i++) {
    const p = applyMatrix(m, src[i]);
    assert.ok(Math.abs(p.x - dst[i].x) < 1e-6, `${p.x} != ${dst[i].x}`);
    assert.ok(Math.abs(p.y - dst[i].y) < 1e-6, `${p.y} != ${dst[i].y}`);
  }
});

test('a homography rectifies a skewed quad', () => {
  // A trapezoid that should map to a rectangle.
  const quad = quadFromPoints([
    { x: 20, y: 10 },
    { x: 180, y: 40 },
    { x: 160, y: 300 },
    { x: 40, y: 280 },
  ]);
  const { width, height } = warpSize(quad);
  const m = getPerspectiveTransform(
    [quad.tl, quad.tr, quad.br, quad.bl],
    [
      { x: 0, y: 0 },
      { x: width - 1, y: 0 },
      { x: width - 1, y: height - 1 },
      { x: 0, y: height - 1 },
    ],
  )!;
  const inv = invertMatrix(m)!;
  const p = applyMatrix(inv, { x: 0, y: 0 });
  assert.ok(Math.abs(p.x - quad.tl.x) < 1e-6);
  assert.ok(Math.abs(p.y - quad.tl.y) < 1e-6);
});

test('warpPerspective flattens a synthetic skewed dark-on-light document', () => {
  const w = 240;
  const h = 320;
  const src = new Uint8ClampedArray(w * h * 4).fill(255);
  // Fill the whole image with white, then paint a black border so the warped
  // result can be checked for a rectangular border.
  const quad = quadFromPoints([
    { x: 20, y: 20 },
    { x: 220, y: 40 },
    { x: 200, y: 300 },
    { x: 40, y: 280 },
  ]);
  const { width, height } = warpSize(quad);
  const out = warpPerspective(src, w, h, quad, width, height);
  assert.equal(out.length, width * height * 4);
  // Interior pixels are white (255) after warping.
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const o = (cy * width + cx) * 4;
  assert.equal(out[o], 255);
  assert.equal(out[o + 3], 255);
});

test('warpSize keeps the long edge of a tall receipt', () => {
  const quad = quadFromPoints([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 400 },
    { x: 0, y: 400 },
  ]);
  const { width, height } = warpSize(quad);
  assert.equal(width, 100);
  assert.equal(height, 400);
});

test('quadArea matches the shoelace area', () => {
  const quad = quadFromPoints([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 20 },
    { x: 0, y: 20 },
  ]);
  assert.equal(quadArea(quad), 200);
});
