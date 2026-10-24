// @ts-check
// 存密钥存到哪一份（蓝图「连核心」第 1 条下面「存密钥存到哪一份」，核心 Y-2下下中中）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from '../support.js';
import { secretTag } from '../../packages/settings/rows.js';

loadRes();

/** 假的设置页：字照键原样，`secretLayers` 是 secret.list 读进来的 @param {Record<string, string|null>} layers */
const dialog = (layers) => ({ ctx: { text: (/** @type {string} */ k) => ({ 'secret_scope.system': '大家共用', 'secret_scope.personal': '只给我' })[k] ?? k }, secretLayers: new Map(Object.entries(layers)) });

test('设了的密钥标出是哪一份：照 secret.list 的 layer；认 secret:<名字> 和光名字；两份里都没有的、没有这一格的不标', () => {
  const d = dialog({ 'deepseek-1': 'system', 'mine-2': 'personal', 'gone-3': null });
  assert.equal(secretTag(d, 'secret:deepseek-1'), ' · 大家共用');
  assert.equal(secretTag(d, 'mine-2'), ' · 只给我');
  assert.equal(secretTag(d, 'secret:gone-3'), '', '引用了、两份里都没设');
  assert.equal(secretTag(d, 'secret:unknown'), '');
  assert.equal(secretTag(d, null), '');
  assert.equal(secretTag({ ctx: d.ctx }, 'secret:deepseek-1'), '', '老核心：没读到列表');
});
