// @ts-check
//! 引导把焦点关在自己里面（后面的页面点不到、Tab 不过去）；盖在引导上面的对话框（设置框、确认框）里的焦点不往回拉。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pullsFocus } from '../../packages/welcome/guide.js';

/** 假的节点：`inside` 是它在不在引导那一层里，`modal` 是它在不在一个 `aria-modal` 的对话框里 */
const node = (/** @type {{inside?: boolean, modal?: boolean}} */ o) => ({ inside: !!o.inside, closest: (/** @type {string} */ sel) => (sel === '[aria-modal="true"]' && o.modal ? {} : null) });
const layer = { contains: (/** @type {any} */ n) => n.inside };

test('焦点跑到引导后面的页面上：拉回引导', () => {
  assert.equal(pullsFocus(/** @type {any} */ (layer), /** @type {any} */ (node({}))), true);
});

test('焦点在引导里面：不动', () => {
  assert.equal(pullsFocus(/** @type {any} */ (layer), /** @type {any} */ (node({ inside: true }))), false);
});

test('焦点在盖在引导上面的设置框里：不拉回（对照报告：开着引导打开设置，点输入框焦点也被拉回「开始」，打不了字）', () => {
  assert.equal(pullsFocus(/** @type {any} */ (layer), /** @type {any} */ (node({ modal: true }))), false);
});
