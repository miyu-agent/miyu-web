// @ts-check
//! 人格背景图的透明度、焦点（蓝图「跟着人格的外观」第 6 条，核心 P-7）：透明度换成盖的底色多浓、焦点换成 CSS 的位置；选焦点窗口里指针
//! 落在哪一点、图放进框里多大；模糊（P-7 补）糊多大的一张、半径多少、屏幕上已经糊掉多少。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { veilOf, positionOf, blurOn, bakeSize, blurRadius, screenBlur } from '../../packages/theme-persona/look.js';
import { pointAt, fitBox } from '../../packages/setup/focus.js';

test('透明度：设了的盖 100 减它；没设、写错的照设置项 veil', () => {
  assert.equal(veilOf(20, 0.8), 80);
  assert.equal(veilOf(0, 0.8), 100, '0 是看不见图');
  assert.equal(veilOf(100, 0.8), 0);
  assert.equal(veilOf(null, 0.8), 80);
  assert.equal(veilOf(undefined, 0.6), 60);
  assert.equal(veilOf(/** @type {any} */ (150), 0.8), 80, '超过 100 的当没设');
  assert.equal(veilOf(/** @type {any} */ (33.5), 0.8), 80, '不是整数的当没设');
});

test('焦点：[x, y] 是 x% y%；没设、写错的居中', () => {
  assert.equal(positionOf([30, 70]), '30% 70%');
  assert.equal(positionOf([0, 100]), '0% 100%');
  assert.equal(positionOf(null), 'center');
  assert.equal(positionOf([30]), 'center');
  assert.equal(positionOf([30, 170]), 'center');
  assert.equal(positionOf('30% 70%'), 'center');
});

test('选焦点：指针落在图上哪一点（夹在 0–100、取整）；图照比例放进 440×260 的框', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  assert.deepEqual(pointAt(rect, 300, 150), [50, 50]);
  assert.deepEqual(pointAt(rect, 100, 50), [0, 0]);
  assert.deepEqual(pointAt(rect, 0, 999), [0, 100], '拖到框外夹住');
  assert.deepEqual(pointAt(rect, 221, 101), [30, 26]);
  assert.deepEqual(fitBox({ w: 3200, h: 1800 }), { w: 440, h: 248 });
  assert.deepEqual(fitBox({ w: 1000, h: 2000 }), { w: 130, h: 260 });
});

test('模糊：1–100 的整数才算开着', () => {
  for (const v of [1, 40, 100]) assert.equal(blurOn(v), true, String(v));
  for (const v of [0, 101, -1, 20.5, '20', null, undefined]) assert.equal(blurOn(v), false, String(v));
});

test('模糊：糊的那张长边缩到 960，本来小的不放大', () => {
  assert.deepEqual(bakeSize(3840, 2160), { width: 960, height: 540 });
  assert.deepEqual(bakeSize(1080, 1920), { width: 540, height: 960 });
  assert.deepEqual(bakeSize(800, 450), { width: 800, height: 450 });
  assert.deepEqual(bakeSize(3840, 2160, 480), { width: 480, height: 270 }, '拖滑杆预览用一半');
});

test('模糊：半径是宽的 4% 乘程度，最少 1；不模糊的 0', () => {
  assert.equal(blurRadius(100, 960), 38);
  assert.equal(blurRadius(40, 960), 15);
  assert.equal(blurRadius(1, 100), 1);
  assert.equal(blurRadius(null, 960), 0);
  assert.equal(blurRadius(0, 960), 0);
});

test('模糊：屏幕上糊掉多少照铺满窗口的倍数算', () => {
  // 1920×1080 的图铺 1280×800 的窗口：cover 倍数 max(1280/1920, 800/1080) ≈ 0.741
  assert.equal(screenBlur(40, { width: 1920, height: 1080 }, { width: 1280, height: 800 }), 23);
  assert.equal(screenBlur(null, { width: 1920, height: 1080 }, { width: 1280, height: 800 }), 0);
});
