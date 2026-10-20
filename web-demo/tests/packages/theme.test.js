// @ts-check
//! 主题包用哪个主题、浅的还是深的、一个主题实际是什么颜色（`packages/theme/model.js`，蓝图「主题」：主题是成对的一套，明暗另是一项）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chosenOf, colorsOf, schemeOf } from '../../packages/theme/model.js';

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
