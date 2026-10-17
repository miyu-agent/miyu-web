// @ts-check
//! 系统通知写什么（软件包 `notify` 的 `model.js`，2026-10-17 项目主人定）：标题照会话的标题；正文只写为什么通知，不带 AI 写的字；
//! 图标是人格的头像，没有的用 Miyu 的；子会话、一次性的会话不弹。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noteOf } from '../../packages/notify/model.js';

const manifest = JSON.parse(readFileSync(new URL('../../packages/notify/manifest.json', import.meta.url), 'utf8'));
const t = (path) => String(manifest.text.zh[path] ?? path);
const MIYU = 'http://x/resources/assets/miyu-avatar.png';

test('正文只写为什么：回答完了、等你回答、等你确认；三种语言都有', () => {
  assert.deepEqual(['done', 'ask', 'approve'].map((w) => noteOf(/** @type {any} */ (w), { title: 'a' }, null, MIYU, t)?.body), ['回答完了', '等你回答', '等你确认']);
  for (const lang of ['zh', 'en', 'ja']) for (const w of ['done', 'ask', 'approve']) assert.ok(manifest.text[lang][w], `${lang} ${w}`);
});

test('标题照会话的标题，没有的照第一句，再没有写 Miyu；图标是人格的头像，没有的用 Miyu 的', () => {
  assert.deepEqual(noteOf('done', { title: '修登录页' }, { avatar: 'blob:x/1' }, MIYU, t), { title: '修登录页', body: '回答完了', icon: 'blob:x/1' });
  assert.equal(noteOf('done', { preview: '帮我看看' }, null, MIYU, t)?.title, '帮我看看');
  assert.equal(noteOf('done', null, undefined, MIYU, t)?.title, 'Miyu');
  assert.equal(noteOf('ask', { title: 'a' }, { avatar: null }, MIYU, t)?.icon, MIYU, '人格没有头像的用 Miyu 的');
});

test('子会话、一次性的会话不弹', () => {
  assert.equal(noteOf('done', { title: 'a', parent: 's1' }, null, MIYU, t), null);
  assert.equal(noteOf('done', { title: 'a', oneshot: true }, null, MIYU, t), null);
});
