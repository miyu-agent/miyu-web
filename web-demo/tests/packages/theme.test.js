// @ts-check
//! 主题包选哪一套、生成的那一套实际是什么颜色（`packages/theme/model.js`，蓝图「主题」「跟着人格的外观」第 1 条）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chosenOf, colorsOf, schemeOf } from '../../packages/theme/model.js';

const morning = { id: 'morning', scheme: /** @type {const} */ ('light'), render: () => ({ page: { surface: '#fff', accent: '#36c', danger: '#c00' }, tui: { accent: '#36c', error: '#c00' } }) };
const night = { id: 'tokyonight', scheme: /** @type {const} */ ('dark'), render: () => ({ page: { surface: '#111', accent: '#7af', danger: '#f55' }, tui: { accent: '#7af', error: '#f55' } }) };
/** 生成的：浅深各交一份要盖的；`none` 的交 null */
const persona = (none = false) => ({
  id: 'persona', scheme: /** @type {const} */ ('auto'),
  render: (/** @type {any} */ scheme) => (none ? null : { page: { surface: scheme === 'dark' ? '#121' : '#efe', accent: '#4a4' }, tui: { accent: '#4a4' } }),
});

test('选哪一套：写了的用它；没写、写的没了的跟着系统用同深浅的第一套定的（不会落到生成的上）', () => {
  const all = [morning, persona(), night];
  assert.equal(chosenOf(all, 'persona', 'light')?.id, 'persona');
  assert.equal(chosenOf(all, '', 'light')?.id, 'morning');
  assert.equal(chosenOf(all, '', 'dark')?.id, 'tokyonight');
  assert.equal(chosenOf(all, 'gone', 'dark')?.id, 'tokyonight');
  assert.equal(chosenOf([persona(), night], '', 'light')?.id, 'tokyonight', '没有浅的定的：第一套定的');
  assert.equal(chosenOf([], '', 'light'), null);
});

test('生成的那一套：浅深跟着系统，盖在同深浅的第一套定的上面；没盖的格（出错的红）照那一套', () => {
  const all = [morning, persona(), night];
  const p = all[1];
  assert.equal(schemeOf(p, 'dark'), 'dark');
  assert.equal(schemeOf(morning, 'dark'), 'light', '定的不跟系统');
  assert.deepEqual(colorsOf(all, p, 'light'), { page: { surface: '#efe', accent: '#4a4', danger: '#c00' }, tui: { accent: '#4a4', error: '#c00' } });
  assert.deepEqual(colorsOf(all, p, 'dark'), { page: { surface: '#121', accent: '#4a4', danger: '#f55' }, tui: { accent: '#4a4', error: '#f55' } });
  // 没有人格、取不出颜色：就是同深浅的那一套
  assert.deepEqual(colorsOf([morning, persona(true), night], persona(true), 'dark'), night.render());
  assert.deepEqual(colorsOf(all, morning, 'dark'), morning.render(), '定的照它自己');
});
