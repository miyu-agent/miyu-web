// @ts-check
//! 裁头像的框（`packages/setup/crop.js`，蓝图「跟着人格的外观」第 8 条）：差不多正方形的不裁；图刚好铺满 280 的框；挪、放大以后夹住，
//! 框里不露空；框对着原图的哪一块。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverScale, clampAt, sourceSquare, isSquare } from '../../packages/setup/crop.js';

test('长宽差 2% 以内算正方形，不弹', () => {
  assert.equal(isSquare({ w: 1000, h: 1000 }), true);
  assert.equal(isSquare({ w: 1000, h: 985 }), true);
  assert.equal(isSquare({ w: 1600, h: 900 }), false);
});

test('一倍时短边刚好铺满框；夹住：框里不露空', () => {
  const img = { w: 1600, h: 900 };
  const s = coverScale(img, 1);
  assert.equal(900 * s, 280);
  assert.deepEqual(clampAt(img, s, 50, 20), { x: 0, y: 0 }, '往右下挪过头');
  assert.deepEqual(clampAt(img, s, -9999, -9999), { x: 280 - 1600 * s, y: 0 }, '往左上挪过头');
  assert.equal(coverScale(img, 2), s * 2);
});

test('框对着原图的哪一块：居中、一倍时是中间那个正方形', () => {
  const img = { w: 1600, h: 900 };
  const s = coverScale(img, 1);
  const x = (280 - 1600 * s) / 2;
  const got = sourceSquare(s, x, 0);
  assert.equal(Math.round(got.side), 900);
  assert.equal(Math.round(got.sx), 350);
  assert.equal(got.sy + 0, 0);
});
