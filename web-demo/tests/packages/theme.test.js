// @ts-check
//! 主题包用哪个主题、浅的还是深的、一个主题实际是什么颜色（`packages/theme/model.js`，蓝图「主题」：主题是成对的一套，明暗另是一项）；
//! 「自动」借哪一套（`packages/theme-auto`）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chosenOf, choicesOf, colorsOf, schemeOf } from '../../packages/theme/model.js';
import { sourceOf } from '../../packages/theme-auto/model.js';
import { apply as applyAuto } from '../../packages/theme-auto/index.js';

/** 一个主题：浅、深各一份 */
const pair = (/** @type {string} */ id, /** @type {string} */ light, /** @type {string} */ dark) => ({
  id, render: (/** @type {'light'|'dark'} */ s) => ({ page: { surface: s === 'dark' ? dark : light }, tui: {} }),
});
const byDefault = pair('default', '#faf9f7', '#1a1b26');
const persona = pair('persona', '#fff8f5', '#161311');
/** 「跟随人格」这时没有颜色可取 */
const blank = { id: 'persona', render: () => null };

test('明暗：定了的照它；跟随系统（auto、没写、写错的）照系统', () => {
  assert.equal(schemeOf('dark', 'light'), 'dark');
  assert.equal(schemeOf('light', 'dark'), 'light');
  assert.equal(schemeOf('auto', 'dark'), 'dark');
  assert.equal(schemeOf(undefined, 'light'), 'light');
  assert.equal(schemeOf('sepia', 'dark'), 'dark');
});

test('用哪个主题：写了的用它；没写、写的没了的用第一个（默认）', () => {
  const all = [byDefault, persona];
  assert.equal(chosenOf(all, 'persona')?.id, 'persona');
  assert.equal(chosenOf(all, '')?.id, 'default');
  assert.equal(chosenOf(all, 'morning')?.id, 'default', '原来存的晨光、tokyonight 没了，回到默认');
  assert.equal(chosenOf([], 'persona'), null);
});

test('没选主题的照出厂的跟随人格（2026-10-20 项目主人：默认配色跟随人格）；人选过的、选了默认的照选的；没有跟随人格这一套的用第一个', () => {
  const all = [byDefault, persona];
  assert.equal(chosenOf(all, '', 'persona')?.id, 'persona');
  assert.equal(chosenOf(all, undefined, 'persona')?.id, 'persona');
  assert.equal(chosenOf(all, 'default', 'persona')?.id, 'default');
  assert.equal(chosenOf([byDefault], '', 'persona')?.id, 'default');
});

test('一个主题的颜色：照明暗取它自己的那一份；交不出的用默认那一份', () => {
  assert.equal(colorsOf([byDefault, persona], persona, 'light')?.page.surface, '#fff8f5');
  assert.equal(colorsOf([byDefault, persona], persona, 'dark')?.page.surface, '#161311');
  assert.equal(colorsOf([byDefault, blank], blank, 'dark')?.page.surface, '#1a1b26');
  assert.equal(colorsOf([blank], blank, 'dark'), null, '第一个也交不出：不写');
});

// 「自动」（`packages/theme-auto`，2026-11-02 项目主人定成出厂）：人格有主色的照人格，没有的照壁纸，都没有的交 null（主题包照默认）

const wallpaper = pair('wallpaper', '#f4fbf8', '#0f1513');

test('自动借哪一套：人格交得出颜色的照人格，不然照壁纸，都没有的是 null', () => {
  assert.equal(sourceOf([byDefault, persona, wallpaper], 'light')?.id, 'persona');
  assert.equal(sourceOf([byDefault, blank, wallpaper], 'dark')?.id, 'wallpaper', '人格没头像、没自选主色：照壁纸');
  assert.equal(sourceOf([byDefault, wallpaper], 'light')?.id, 'wallpaper', '停用了跟随人格：照壁纸');
  assert.equal(sourceOf([byDefault, blank], 'light'), null, '壁纸读不到（没挂）：什么都不借');
  assert.equal(sourceOf([byDefault], 'light'), null, '默认不在借的里头');
});

test('自动挂成一套：颜色照这一刻借的那一套、浅深各算各的；都借不到的交 null，主题包照默认那一份；主色、来处照借的那一套', () => {
  globalThis.matchMedia ??= /** @type {any} */ (() => ({ matches: false }));
  /** @type {any[]} */
  let mounted = [byDefault, blank, { ...wallpaper, seeds: () => ({ colors: ['#123456'] }) }];
  let dark = false;
  const ctx = {
    slots: {
      list: () => mounted,
      mount: (/** @type {any} */ _slot, /** @type {any} */ entry) => {
        mounted = [...mounted, entry];
        return () => { mounted = mounted.filter((x) => x !== entry); };
      },
    },
    theme: { dark: () => dark },
    text: () => '自动',
    effect: () => {},
  };
  applyAuto(ctx);
  const auto = mounted.find((x) => x.id === 'auto');
  assert.equal(auto.render('light')?.page.surface, '#f4fbf8', '人格没颜色：借壁纸');
  assert.equal(auto.render('dark')?.page.surface, '#0f1513');
  assert.equal(auto.source(), 'wallpaper');
  assert.deepEqual(auto.seeds()?.colors, ['#123456'], '主色那一行是壁纸的候选色');
  // 设了头像：跟随人格重挂成交得出颜色的那一套，自动当场改借人格
  mounted = mounted.map((x) => (x.id === 'persona' ? persona : x));
  dark = true;
  assert.equal(auto.render('dark')?.page.surface, '#161311');
  assert.equal(auto.source(), 'persona');
  assert.equal(auto.seeds(), null, '借的那一套没有主色那一行：不画');
  // 都借不到：交 null，主题包照默认
  mounted = mounted.filter((x) => x.id !== 'persona' && x.id !== 'wallpaper');
  assert.equal(auto.render('light'), null);
  assert.equal(auto.source(), null);
  assert.equal(colorsOf(mounted, auto, 'light')?.page.surface, '#faf9f7');
  // 出厂的设置项 default_palette 是 auto：没选过的用自动
  assert.equal(chosenOf(mounted, '', 'auto')?.id, 'auto');
});

test('默认只兜底（2026-11-02 项目主人：有了自动之后就不需要默认了）：设置项写了 default 也不认，照出厂的自动；自动没了的照旧用它', () => {
  const fallback = { ...byDefault, hidden: true };
  const auto = pair('auto', '#f4fbf8', '#0f1513');
  assert.equal(chosenOf([fallback, auto, persona], 'default', 'auto')?.id, 'auto', '原来点过默认的回到自动');
  assert.equal(chosenOf([fallback, persona], '', 'auto')?.id, 'default', '停用了自动：兜底');
  assert.equal(colorsOf([fallback, blank], blank, 'light')?.page.surface, '#faf9f7', '交不出颜色的照旧用它的那一份');
});

test('出卡片的：默认不出；这时交不出颜色的（人格没头像、没自选主色）不出，正选着的照旧出', () => {
  const fallback = { ...byDefault, hidden: true };
  const auto = pair('auto', '#f4fbf8', '#0f1513');
  const ids = (/** @type {any[]} */ list) => list.map((p) => p.id);
  assert.deepEqual(ids(choicesOf([fallback, auto, persona, wallpaper], 'auto', 'light')), ['auto', 'persona', 'wallpaper']);
  assert.deepEqual(ids(choicesOf([fallback, auto, blank, wallpaper], 'auto', 'dark')), ['auto', 'wallpaper'], '人格没颜色：没有跟随人格');
  assert.deepEqual(ids(choicesOf([fallback, auto, blank], 'persona', 'light')), ['auto', 'persona'], '正选着跟随人格：照旧出');
});
