// @ts-check
//! 推演人生（核心设计 70；蓝图 `web.md`「推演人生」）：会话表认人生会话、`/life` 哪几种先问、`life.status` 怎么读、开关拨了做什么；
//! 「推演人生」那一层怎么排、下次几点醒怎么写；选预设的地方不列 `hidden` 的；新会话不照人生会话选；推演方法怎么存。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLife, lifeEnded, lifeAsk, lifeState, lifeToggle } from '../../src/lib/life.js';
import { lifeRows, lifePersonas, wakeText } from '../../packages/life/model.js';
import { pickable, lastChoice, personaSave } from '../../packages/setup/model.js';

test('会话表里认人生会话：life 是 true 的才算；life_ended 只在人生会话上算结束', () => {
  assert.equal(isLife({ life: true }), true);
  assert.equal(isLife({}), false);
  assert.equal(isLife(null), false);
  assert.equal(lifeEnded({ life: true, life_ended: true }), true);
  assert.equal(lifeEnded({ life: true }), false);
  assert.equal(lifeEnded({ life_ended: true }), false);
});

test('/life 先问的只有 kill、new（2026-11-14 项目主人：网页确认）；不分大小写，别的命令、别的几种不问', () => {
  assert.equal(lifeAsk('life', 'kill'), 'kill');
  assert.equal(lifeAsk('LIFE', ' New '), 'new');
  assert.equal(lifeAsk('life', null), null);
  assert.equal(lifeAsk('life', 'pause'), null);
  assert.equal(lifeAsk('life', 'resume'), null);
  assert.equal(lifeAsk('goal', 'kill'), null);
});

test('life.status：在跑的才有下次醒；在干嘛取 doing.text；认不得的当 none', () => {
  const run = lifeState({ state: 'running', session: 's1', next: '2026-11-14T10:00:00.000Z', doing: { text: ' 在看书 ', at: 'x' } });
  assert.equal(run.state, 'running');
  assert.equal(run.session, 's1');
  assert.equal(run.next?.toISOString(), '2026-11-14T10:00:00.000Z');
  assert.equal(run.doing, '在看书');
  const paused = lifeState({ state: 'paused', session: 's1', next: '2026-11-14T10:00:00.000Z' });
  assert.equal(paused.next, null);
  assert.deepEqual(lifeState({ state: 'weird' }), { state: 'none', session: null, next: null, doing: null });
  assert.equal(lifeState(null).state, 'none');
});

test('开关：拨开时没有的、结束了的 start（先问），暂停着的 resume；拨关时在跑的 pause（关掉算暂停）；不用动的是 null', () => {
  assert.equal(lifeToggle('none', true), 'start');
  assert.equal(lifeToggle('ended', true), 'start');
  assert.equal(lifeToggle('paused', true), 'resume');
  assert.equal(lifeToggle('running', true), null);
  assert.equal(lifeToggle('running', false), 'pause');
  assert.equal(lifeToggle('paused', false), null);
  assert.equal(lifeToggle('none', false), null);
});

test('「推演人生」那一层：只列人生会话；眼下那一条照 life.status，以前结束的写已结束；在跑、暂停在前，结束的在后，同一档新的在前', () => {
  const entries = [
    { session: 'n1', persona: 'miyu', last_active: '2026-11-14T09:00:00Z' },
    { session: 'old', persona: 'miyu', life: true, life_ended: true, last_active: '2026-11-10T00:00:00Z' },
    { session: 'cur', persona: 'miyu', life: true, last_active: '2026-11-13T00:00:00Z', title: '日常' },
    { session: 'b', persona: 'bea', life: true, last_active: '2026-11-14T08:00:00Z' },
  ];
  const statuses = new Map([
    ['miyu', lifeState({ state: 'running', session: 'cur', next: '2026-11-14T10:00:00Z', doing: { text: '散步' } })],
    ['bea', lifeState({ state: 'paused', session: 'b' })],
  ]);
  const rows = lifeRows(entries, statuses);
  assert.deepEqual(rows.map((r) => [r.session, r.state]), [['cur', 'running'], ['b', 'paused'], ['old', 'ended']]);
  assert.equal(rows[0].doing, '散步');
  assert.equal(rows[0].next?.toISOString(), '2026-11-14T10:00:00.000Z');
  assert.equal(rows[2].doing, null);
  assert.deepEqual(lifePersonas(entries), ['miyu', 'bea']);
  // 还没问回来：照会话表，没结束的先算暂停（不写下次）
  assert.deepEqual(lifeRows(entries, new Map()).map((r) => [r.session, r.state, r.next]), [['b', 'paused', null], ['cur', 'paused', null], ['old', 'ended', null]]);
});

test('下次醒：今天只写时刻，明天写「明天」，再往后写月/日', () => {
  const t = (/** @type {string} */ key, /** @type {any} */ f) => (key === 'tomorrow' ? `明天 ${f.time}` : key);
  const now = new Date(2026, 10, 14, 9, 30);
  assert.equal(wakeText(new Date(2026, 10, 14, 14, 5), now, t), '14:05');
  assert.equal(wakeText(new Date(2026, 10, 15, 8, 0), now, t), '明天 08:00');
  assert.equal(wakeText(new Date(2026, 10, 17, 8, 0), now, t), '11/17 08:00');
});

test('选预设的地方不列 hidden 的（出厂的「推演人生」）；正选着的照样留着', () => {
  const presets = [{ preset: 'full' }, { preset: 'life', hidden: true }, { preset: 'none' }];
  assert.deepEqual(pickable(presets).map((p) => p.preset), ['full', 'none']);
  assert.deepEqual(pickable(presets, 'life').map((p) => p.preset), ['full', 'life', 'none']);
});

test('新会话先选上一次的：人生会话不算（它用的是出厂的「推演人生」预设）', () => {
  const sessions = [
    { session: 'l', persona: 'miyu', preset: 'life', life: true },
    { session: 'a', persona: 'miyu', preset: 'full' },
  ];
  const got = lastChoice(sessions, [{ persona: 'miyu' }], [{ preset: 'full' }, { preset: 'life', hidden: true }]);
  assert.deepEqual(got, { persona: 'miyu', preset: 'full' });
});

test('推演方法：改了发字带版本；清空发 unset（回到出厂的）；没读到的（引导里新建的）不发', () => {
  const base = { name: 'm', summary: '', persona: '', reminders: '', pairs: [], versions: { persona: null, reminders: null, examples: null, life: 'v1' } };
  assert.deepEqual(personaSave({ ...base, life: 'old' }, { ...base, life: ' new ' })?.prompts, { life: { text: 'new', expect: 'v1' } });
  assert.deepEqual(personaSave({ ...base, life: 'old' }, { ...base, life: '  ' })?.prompts, { life: { unset: true, expect: 'v1' } });
  assert.equal(personaSave({ ...base, life: 'same' }, { ...base, life: 'same ' }), null);
  assert.equal(personaSave(base, base), null);
});
