// @ts-check
//! 下拉的选项（核心设计 72，W-1228）：`description` 写在名字下面，核心的 `note` 接在名字后面，`available: false` 的点不了；
//! 带 `notice` 的选项选了照常存，再弹一句提示。不认键名、不认值。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { menuOptions, noticeFor } from '../../packages/settings/option-menu.js';

const NOTICE = '这个搜索服务只适用于 DeepSeek 官方的 Responses 接口';
const options = [
  { value: 'auto', name: '自动' },
  { value: 'deepseek', name: 'DeepSeek 搜索接口', description: '按次计费。', note: '需要密钥' },
  { value: 'deepseek-responses', name: 'DeepSeek Responses 接口内置', description: '由模型自己搜索网页。', notice: NOTICE },
  { value: 'local', name: '内置模型', available: false },
];

test('菜单的一项：说明写在名字下面，核心的暗字接在后面，用不了的点不了；没有的格不带', () => {
  const menu = menuOptions(options);
  assert.deepEqual(menu[0], { value: 'auto', name: '自动', desc: undefined, note: undefined, off: false, notice: undefined });
  assert.deepEqual(menu[1], { value: 'deepseek', name: 'DeepSeek 搜索接口', desc: '按次计费。', note: '需要密钥', off: false, notice: undefined });
  assert.equal(menu[2].note, undefined, '核心没给 note 的不写「需要密钥」');
  assert.equal(menu[2].notice, NOTICE);
  assert.equal(menu[3].off, true);
  assert.deepEqual(menuOptions(undefined), []);
});

test('选了带 notice 的：交回那一句；别的、没有这一项的交回 null', () => {
  const menu = menuOptions(options);
  assert.equal(noticeFor(menu, 'deepseek-responses'), NOTICE);
  assert.equal(noticeFor(menu, 'deepseek'), null);
  assert.equal(noticeFor(menu, 'nope'), null);
  assert.equal(noticeFor(menuOptions([{ value: 'x', name: 'x', notice: '  ' }]), 'x'), null, '空白的不弹');
});

test('提示卡片的按钮字三种语言都有', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../packages/settings/manifest.json', import.meta.url), 'utf8'));
  const words = JSON.stringify(manifest);
  for (const want of ['"notice_ok":"知道了"', '"notice_ok":"Got it"', '"notice_ok":"了解"']) assert.ok(words.includes(want), want);
});
