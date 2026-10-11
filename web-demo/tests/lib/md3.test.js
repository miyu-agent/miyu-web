// @ts-check
//! 照一张图生成一个主题（`src/lib/md3/`，蓝图「跟着人格的外观」第 2、4 条）：从像素取前几种主色、照 MD3 Content 生成浅色或深色那一份的
//! 全部格子。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedsOf, seedOf, themeOf, hexOf, inkOf } from '../../src/lib/md3/index.js';
import { DESIGN } from '../../src/lib/md3/design.js';
import { Hct, argbFromHex } from '../../src/lib/md3/vendor/mcu.min.js';

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

test('照主色生成（Content）：中性色、强调色照 MD3 的角色；底色基本是中性的，强调带颜色', () => {
  const light = themeOf('#3368c0', 'light');
  assert.equal(light.page.surface, '#f9f9ff');
  assert.equal(light.page.surface_1, '#ffffff', '浅色里浮起来的比底亮');
  assert.equal(light.page.accent, '#0b4fa6');
  assert.equal(light.page.link, light.page.accent);
  assert.equal(light.page.text, '#191b21');
  assert.equal(light.page.accent_soft, '#c3d4fd', '垫在字下面的淡底：浅色里是浅的（不是 Content 的原色容器）');
  const dark = themeOf('#3368c0', 'dark');
  assert.equal(dark.page.surface, '#111319');
  assert.equal(dark.page.sidebar_bg, '#0c0e13', '深色里左栏比底暗一档');
  assert.equal(dark.page.surface_1, '#191b21', '深色里浮起来的也比底亮一档');
  assert.equal(dark.page.accent, '#adc6ff');
  assert.equal(dark.page.accent_soft, '#38496b', '深色里的淡底是深的');
  assert.equal(dark.tui.workspace, dark.page.accent);
  // 金发那样的暖色：底色只带一点点暖
  assert.equal(themeOf('#e0b44a', 'light').page.surface, '#fff8f2');
});

test('生成的是整份：格子和原色表（默认主题）一样多，浅深都有，不借默认主题的', () => {
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    const got = themeOf('#7a573e', scheme);
    assert.deepEqual(Object.keys(got.page).sort(), Object.keys(DESIGN[scheme].page).sort(), `${scheme} 页面那一组`);
    assert.deepEqual(Object.keys(got.tui).sort(), Object.keys(DESIGN[scheme].tui).sort(), `${scheme} 终端那一组`);
    assert.equal(Object.keys(got.page).length + Object.keys(got.tui).length, 93);
  }
});

test('有含义的颜色色相不变、往主色靠一点；不带颜色的取中性色；阴影换影的颜色；吉祥物照抄', () => {
  const hue = (/** @type {string} */ hex) => Hct.fromInt(argbFromHex(hex)).hue;
  const turned = (/** @type {string} */ a, /** @type {string} */ b) => { const d = Math.abs(hue(a) - hue(b)) % 360; return Math.min(d, 360 - d); };
  const brown = themeOf('#7a573e', 'dark');
  for (const k of ['danger', 'online', 'diff_add', 'tok_k', 'tok_s']) {
    const d = turned(DESIGN.dark.page[k], brown.page[k]);
    assert.ok(d > 0.5 && d <= 15.5, `${k} 转了 ${d.toFixed(1)}°（最多 15°）`);
  }
  // 深色原色表是 tokyonight：这几格带着它的蓝，生成的换成这一套的中性色（彩度低）
  for (const k of ['dim', 'code_comment', 'md_quote']) assert.ok(Hct.fromInt(argbFromHex(brown.tui[k])).chroma < 12, `${k} 是中性的：${brown.tui[k]}`);
  assert.equal(brown.tui.mascot_eye, DESIGN.dark.tui.mascot_eye, '吉祥物不跟着变');
  assert.equal(brown.page.card_shadow, DESIGN.dark.page.card_shadow, '深色的影照黑');
  const light = themeOf('#3368c0', 'light');
  assert.equal(light.page.scrim, 'rgba(25, 27, 33, 0.32)', '浅色的影换成这一套的字色 #191b21');
  assert.equal(light.page.code_ink, DESIGN.light.page.code_ink, '算式照抄');
});

test('色块上的勾：浅的颜色上用深的，深的颜色上用白的', () => {
  assert.equal(inkOf('#ffe08a'), '#1a1b20');
  assert.equal(inkOf('#3368c0'), '#ffffff');
});
