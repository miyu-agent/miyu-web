// @ts-check
//! 照一个主色生成一个主题（`src/lib/md3/`，蓝图「跟着人格的外观」第 2、4 条）：照 MD3 Content 的五条色板、每一格照原色表那一格的明度
//! 生成浅色或深色那一份的全部格子（2026-10-14 两个头同一套）。主色的候选由核心、网页服务算，不在这里测。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeOf, inkOf } from '../../src/lib/md3/index.js';
import { DESIGN } from '../../src/lib/md3/design.js';
import { Hct, argbFromHex } from '../../src/lib/md3/vendor/mcu.min.js';

test('照主色生成：每一格照原色表那一格的明度、从对应色板取色；深色和终端同一个主色出一样的颜色（终端方案页那张表）', () => {
  const tone = (/** @type {string} */ hex) => Hct.fromInt(argbFromHex(hex)).tone;
  const dark = themeOf('#ca9b83', 'dark');
  // 终端「改后 · 深色」那一列（参照都是 tokyonight 同一格）：两个头逐格一样
  const terminal = { surface: '#1f1b19', text: '#d3cac7', accent: '#c89981' };
  for (const [k, v] of Object.entries(terminal)) assert.equal(dark.page[k], v, `page.${k}`);
  const tui = { thought: '#9f9794', md_quote: '#9a8a83', code_comment: '#6c5e58', md_link: '#b2866f', md_image: '#948e62', error: '#f9786c',
    code_keyword: '#cf94eb', mascot_head: '#d3cac7', mascot_ear: '#6c5e58', mascot_fin: '#a7a073' };
  for (const [k, v] of Object.entries(tui)) assert.equal(dark.tui[k], v, `tui.${k}`);
  // 明暗层次和原色表一样：底、浮起来的、左栏的明度照默认主题那一格（差不过 1）
  for (const k of ['surface', 'surface_1', 'surface_2', 'sidebar_bg', 'text', 'text_soft']) {
    assert.ok(Math.abs(tone(dark.page[k]) - tone(DESIGN.dark.page[k])) < 1, `dark ${k} 的明度`);
  }
  // 浅色照晨光（项目主人 10-14 定：底色近白，不照 Tokyo Night Day）
  const light = themeOf('#ca9b83', 'light');
  assert.ok(tone(light.page.surface) > 97, `浅色的底近白：${light.page.surface}`);
  assert.ok(Math.abs(tone(light.page.accent) - tone(DESIGN.light.page.accent)) < 1, '强调色照晨光那一格的明度');
  assert.equal(light.page.link, light.page.accent);
});

test('生成的是整份：格子和原色表（默认主题）一样多，浅深都有，不借默认主题的', () => {
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    const got = themeOf('#7a573e', scheme);
    assert.deepEqual(Object.keys(got.page).sort(), Object.keys(DESIGN[scheme].page).sort(), `${scheme} 页面那一组`);
    assert.deepEqual(Object.keys(got.tui).sort(), Object.keys(DESIGN[scheme].tui).sort(), `${scheme} 终端那一组`);
    assert.equal(Object.keys(got.page).length + Object.keys(got.tui).length, 93);
  }
});

test('有含义的颜色色相不变、往主色靠一点；不带颜色的取中性色；吉祥物跟着换；阴影换影的颜色', () => {
  const hue = (/** @type {string} */ hex) => Hct.fromInt(argbFromHex(hex)).hue;
  const turned = (/** @type {string} */ a, /** @type {string} */ b) => { const d = Math.abs(hue(a) - hue(b)) % 360; return Math.min(d, 360 - d); };
  const brown = themeOf('#7a573e', 'dark');
  for (const k of ['danger', 'online', 'diff_add', 'tok_k', 'tok_s']) {
    const d = turned(DESIGN.dark.page[k], brown.page[k]);
    assert.ok(d > 0.5 && d <= 15.5, `${k} 转了 ${d.toFixed(1)}°（最多 15°）`);
  }
  // 深色原色表是 tokyonight：思考、暗字、注释、引用带着它的青、蓝，生成的换成这一套的中性色（彩度低）
  for (const k of ['thought', 'dim', 'code_comment', 'md_quote']) assert.ok(Hct.fromInt(argbFromHex(brown.tui[k])).chroma < 12, `${k} 是中性的：${brown.tui[k]}`);
  assert.notEqual(brown.tui.mascot_eye, DESIGN.dark.tui.mascot_eye, '吉祥物跟着换（项目主人 10-14 定）');
  assert.ok(turned(brown.tui.mascot_eye, brown.page.accent) < 5, '眼睛照主色');
  assert.equal(brown.page.card_shadow, DESIGN.dark.page.card_shadow, '深色的影照黑');
  const light = themeOf('#3368c0', 'light');
  assert.match(light.page.scrim, /^rgba\(\d+, \d+, \d+, 0\.32\)$/, '浅色的影换成这一套的字色');
  assert.notEqual(light.page.scrim, DESIGN.light.page.scrim);
  assert.equal(light.page.code_ink, DESIGN.light.page.code_ink, '算式照抄');
});

test('色块上的勾：浅的颜色上用深的，深的颜色上用白的', () => {
  assert.equal(inkOf('#ffe08a'), '#1a1b20');
  assert.equal(inkOf('#3368c0'), '#ffffff');
});

test('matugen 那一份：只取 source 当主色，照同一套算；旧模板带着角色的照样认；没有 source 的不认', async () => {
  const { matugenOf } = await import('../../src/lib/md3/index.js');
  const m = matugenOf({ source: '#3368C0', light: { primary: '#123456' }, dark: {} });
  assert.deepEqual(m, { source: '#3368c0' });
  assert.deepEqual(themeOf(m.source, 'dark'), themeOf('#3368c0', 'dark'), '和自己取到这个主色一样');
  assert.deepEqual(matugenOf({ source: '#abcdef' }), { source: '#abcdef' }, '新模板只有 source');
  assert.equal(matugenOf({ source: 'blue' }), null);
  assert.equal(matugenOf({ light: {} }), null);
  assert.equal(matugenOf(null), null);
});
