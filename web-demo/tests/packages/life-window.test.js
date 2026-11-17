// @ts-check
//! 「推演人生」那一层（软件包 `life`；W-1211，「人生-归档」）：两栏，「正在过的」照 `life.list`，「已结束的人生」照会话表里 `life`、`life_ended`
//! 的，按人格分组、点进去只读看；不显示遗言、不写第几轮。正在过的那一行能暂停、继续、结束（同人生卡，调 `life.*`）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { endedGroups } from '../../packages/life/model.js';

const manifest = JSON.parse(readFileSync(new URL('../../packages/life/manifest.json', import.meta.url), 'utf8'));

test('已结束的人生：只要会话表里结束了的人生会话；按人格分组，最近结束的那一组在前，组里新的在前；名字照人格，没有人格的另一组', () => {
  const entries = [
    { session: 'n1', persona: 'miyu', last_active: '2026-11-18T09:00:00Z' },
    { session: 'run', persona: 'miyu', life: true, last_active: '2026-11-18T09:00:00Z' },
    { session: 'm1', persona: 'miyu', life: true, life_ended: true, last_active: '2026-11-10T00:00:00Z', title: '第一段' },
    { session: 'm2', persona: 'miyu', life: true, life_ended: true, last_active: '2026-11-12T00:00:00Z' },
    { session: 'b1', persona: 'bea', life: true, life_ended: true, last_active: '2026-11-15T00:00:00Z', preview: '早上好' },
    { session: 'x1', life: true, life_ended: true, last_active: '2026-11-01T00:00:00Z' },
  ];
  const names = /** @type {Record<string, string>} */ ({ miyu: 'Miyu', bea: 'Bea' });
  const groups = endedGroups(entries, (p) => names[p] ?? p);
  assert.deepEqual(groups.map((g) => [g.persona, g.name, g.rows.map((r) => r.session)]), [
    ['bea', 'Bea', ['b1']],
    ['miyu', 'Miyu', ['m2', 'm1']],
    [null, null, ['x1']],
  ]);
  assert.deepEqual(groups[1].rows.map((r) => [r.title, r.at]), [[null, '2026-11-12T00:00:00Z'], ['第一段', '2026-11-10T00:00:00Z']]);
  assert.equal(groups[0].rows[0].title, '早上好', '没标题的照第一句');
  assert.deepEqual(endedGroups([], () => ''), []);
});

test('两栏的字三种语言都有；不写遗言、第几轮', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const t = manifest.text[lang];
    for (const key of ['living', 'ended', 'no_persona', 'pause', 'resume', 'kill', 'kill_sure', 'kill_hint']) assert.ok(t[key], `${lang}.${key}`);
    for (const key of ['busy', 'running', 'paused', 'next', 'tomorrow']) assert.ok(t.side?.[key], `${lang}.side.${key}`);
  }
  const src = readFileSync(new URL('../../packages/life/card.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /last_words|rounds/);
  assert.match(src, /'life\.list'/);
  assert.match(src, /lifeSide\(/);
});

test('还没看过的那几段（核心 LF-14 的 ended_unseen）：起来、推来 life.ended、断了又连上时重问；推来 life.seen 拿掉那一段；别的推送不动', async () => {
  const { unseenAfter } = await import('../../packages/life/model.js');
  const now = new Map([['e1', { session: 'e1', persona: 'miyu', name: 'Miyu', at: 'x' }], ['e2', { session: 'e2', persona: null, name: null, at: 'y' }]]);
  assert.deepEqual(unseenAfter(now, 'notice', { kind: 'life.ended', session: 'e3', by: 'self' }), { reload: true, unseen: now });
  assert.deepEqual(unseenAfter(now, 'notice', { kind: 'life.ended', session: 'e3', by: 'owner' }), { reload: true, unseen: now }, '主人结束的也重问（核心不放进去，问了也一样）');
  const seen = unseenAfter(now, 'notice', { kind: 'life.seen', session: 'e1' });
  assert.equal(seen.reload, false);
  assert.deepEqual([...seen.unseen.keys()], ['e2']);
  assert.deepEqual(unseenAfter(now, 'resync', { stream: 'notices' }).reload, true);
  assert.deepEqual(unseenAfter(now, 'notice', { kind: 'schedule.ran' }), { reload: false, unseen: now });
  assert.deepEqual(unseenAfter(now, 'view.changed', {}), { reload: false, unseen: now });
});

test('顶上的提示、左栏的记号：三种语言的字；收起提示调 life.seen，打开会话照常（核心照 session.viewing 清）', () => {
  for (const lang of ['zh', 'en', 'ja']) for (const key of ['ended_hint', 'ended_hint_bare', 'ended_open', 'ended_dismiss']) assert.ok(manifest.text[lang][key], `${lang}.${key}`);
  const src = readFileSync(new URL('../../packages/life/unseen.js', import.meta.url), 'utf8');
  assert.match(src, /'life\.seen', \{ session/);
  assert.match(src, /'stage\.top'/);
  assert.match(readFileSync(new URL('../../packages/life/index.js', import.meta.url), 'utf8'), /mark: \(\) => /);
});
