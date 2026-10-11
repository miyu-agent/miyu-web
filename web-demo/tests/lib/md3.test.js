// @ts-check
//! 照一张图生成一套颜色（`src/lib/md3/`，蓝图「跟着人格的外观」第 2、4 条）：从像素取前几种主色、照 MD3 Content 生成要盖的那几格。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedsOf, seedOf, cellsOf, hexOf, inkOf } from '../../src/lib/md3/index.js';

/** 一张 `n` 个像素的图：一种颜色占 `share`，剩下的是另一种（`alpha` 是第二种的不透明度） */
function image(n, main, share, other, alpha = 255) {
  const rgba = [];
  for (let i = 0; i < n; i++) rgba.push(...(i < n * share ? [...main, 255] : [...other, alpha]));
  return rgba;
}

test('主色：照颜色的分布挑最像主题色的那一种；太透明的像素不算；灰的、一格都不剩的是 null', () => {
  const blue = seedOf(image(400, [51, 104, 192], 0.7, [250, 242, 233]));
  assert.ok(blue != null);
  const hex = hexOf(blue);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  assert.ok(b > r && b > g, `蓝色占多数的图取出蓝色，实际 ${hex}`);
  // 抠了图的背景（全透明）不算：剩下的只有红
  const red = hexOf(/** @type {number} */ (seedOf(image(400, [192, 40, 60], 0.3, [30, 200, 30], 0))));
  assert.ok(parseInt(red.slice(1, 3), 16) > parseInt(red.slice(3, 5), 16), `透明的绿不算，实际 ${red}`);
  assert.equal(seedOf(image(10, [0, 0, 0], 0, [9, 9, 9], 0)), null);
  // 全是灰的：库会交回兜底的蓝，不要
  assert.equal(seedOf(image(100, [128, 128, 128], 1, [0, 0, 0])), null);
  assert.deepEqual(seedsOf(image(100, [128, 128, 128], 1, [0, 0, 0])), []);
});

test('前几种：好的在前、第一种就是自动取的那一种，色相隔开的都列出来', () => {
  const rgba = [];
  for (let i = 0; i < 300; i++) rgba.push(...(i < 150 ? [51, 104, 192, 255] : i < 250 ? [200, 60, 50, 255] : [40, 160, 70, 255]));
  const all = seedsOf(rgba).map(hexOf);
  assert.deepEqual(all, ['#3368c0', '#c83c32', '#28a046']);
  assert.equal(hexOf(/** @type {number} */ (seedOf(rgba))), all[0]);
  assert.equal(seedsOf(rgba, 2).length, 2);
});

test('照主色生成（Content）：浅色、深色各一份，只盖中性色和强调色；底色基本是中性的，强调带颜色', () => {
  const light = cellsOf('#3368c0', 'light');
  assert.deepEqual(Object.keys(light.page).sort(), ['accent', 'accent_soft', 'gold', 'line', 'line_strong', 'on_primary', 'on_primary_container', 'ribbon', 'sidebar_active', 'sidebar_bg', 'surface', 'surface_1', 'surface_2', 'surface_3', 'text', 'text_soft']);
  assert.deepEqual(Object.keys(light.tui).sort(), ['accent', 'workspace']);
  assert.equal(light.page.surface, '#f9f9ff');
  assert.equal(light.page.surface_1, '#ffffff', '浅色里浮起来的比底亮');
  assert.equal(light.page.accent, '#0b4fa6');
  assert.equal(light.page.text, '#191b21');
  assert.equal(light.page.accent_soft, '#c3d4fd', '垫在字下面的淡底：浅色里是浅的（不是 Content 的原色容器）');
  const dark = cellsOf('#3368c0', 'dark');
  assert.equal(dark.page.surface, '#111319');
  assert.equal(dark.page.sidebar_bg, '#0c0e13', '深色里左栏比底暗一档');
  assert.equal(dark.page.surface_1, '#191b21', '深色里浮起来的也比底亮一档');
  assert.equal(dark.page.accent, '#adc6ff');
  assert.equal(dark.page.accent_soft, '#38496b', '深色里的淡底是深的');
  assert.equal(dark.tui.workspace, dark.page.accent);
  assert.equal(light.page.danger, undefined, '出错的红不盖');
  // 金发那样的暖色：底色只带一点点暖
  assert.equal(cellsOf('#e0b44a', 'light').page.surface, '#fff8f2');
});

test('色块上的勾：浅的颜色上用深的，深的颜色上用白的', () => {
  assert.equal(inkOf('#ffe08a'), '#1a1b20');
  assert.equal(inkOf('#3368c0'), '#ffffff');
});
