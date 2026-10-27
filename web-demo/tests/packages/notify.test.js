// @ts-check
//! 系统通知写什么（软件包 `notify` 的 `model.js`，2026-10-17 项目主人定）：标题照会话的标题；正文只写为什么通知，不带 AI 写的字；
//! 图标是人格的头像，没有的用 Miyu 的；子会话、一次性的会话不弹。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noteOf, noticeNote } from '../../packages/notify/model.js';

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

test('账号级的提醒（核心 J-3 中）：定时跑完照会话的标题、tag 同「回答完了」；没跑完另一句；唤醒表坏了页面里也说；认不得的不弹', () => {
  const ran = noticeNote({ kind: 'schedule.ran', schedule: 't3', session: 's1', ok: true }, { title: '早报' }, { avatar: 'blob:a' }, null, MIYU, t);
  assert.deepEqual(ran, { title: '早报', body: '定时任务跑完了', icon: 'blob:a', tag: 's1:done', session: 's1', say: null });
  assert.equal(noticeNote({ kind: 'schedule.ran', schedule: 't3', session: 's1', ok: false }, null, null, '整理今天的新闻', MIYU, t)?.title, '整理今天的新闻', '会话表里还没有的照那句话');
  assert.equal(noticeNote({ kind: 'schedule.ran', schedule: 't3', session: 's1', ok: false }, null, null, null, MIYU, t)?.body, '定时任务没跑完');
  assert.equal(noticeNote({ kind: 'schedule.ran', session: 's1' }, null, null, null, MIYU, t)?.title, 'Miyu');
  const reset = noticeNote({ kind: 'schedules.reset' }, null, null, null, MIYU, t);
  assert.equal(reset?.say, reset?.body);
  assert.equal(reset?.session, null);
  assert.equal(noticeNote({ kind: 'later' }, null, null, null, MIYU, t), null);
  for (const lang of ['zh', 'en', 'ja']) for (const k of ['schedule_ran', 'schedule_failed', 'schedules_reset']) assert.ok(manifest.text[lang][k], `${lang} ${k}`);
});
