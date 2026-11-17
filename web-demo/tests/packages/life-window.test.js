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
