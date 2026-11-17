// @ts-check
//! 快速跳转人生会话（核心 LF-12；2026-11-17 项目主人本机验收第 25、28、29 条，W-1211）：`life.list`、光打 `/life` 回的 `lives` 怎么读，
//! 一条直接跳、几条让人挑，空会话里光打 `/life` 也列。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { livesOf, endedUnseenOf, lifeJump, lifeSide, emptyLife } from '../../src/lib/life.js';
import { read } from '../../src/model/commands.js';

const NEXT = '2026-11-18T14:05:00.000Z';

test('life.list 一项：照 life.status 的样子读，多带人格编号、名字、busy（WK-2 起不叫 awake）；认不得的项丢掉', () => {
  const got = livesOf({ lives: [
    { state: 'running', session: 's1', next: NEXT, persona: 'miyu', name: 'Miyu', busy: true, doing: { text: '散步', at: NEXT } },
    { state: 'paused', session: 's2', persona: 'bea', name: 'Bea' },
    { state: 'running', persona: 'x' },
    'junk',
  ] });
  assert.deepEqual(got.map((l) => [l.session, l.persona, l.name, l.state, l.busy, l.doing]), [['s1', 'miyu', 'Miyu', 'running', true, '散步'], ['s2', 'bea', 'Bea', 'paused', false, null]]);
  assert.equal(got[0].next?.toISOString(), NEXT);
  assert.equal(livesOf({ lives: [{ state: 'running', session: 's', persona: 'p', awake: true }] })[0].busy, false, '旧名字 awake 不认');
  assert.equal(livesOf({ lives: [{ state: 'paused', session: 's', persona: 'p' }] })[0].name, 'p', '没有名字的写编号');
  assert.deepEqual(livesOf(null), []);
});

test('ended_unseen：她自己结束了、还没看过的，一项会话、人格、名字、时刻；没人格的不写人格', () => {
  assert.deepEqual(endedUnseenOf({ ended_unseen: [{ session: 'e1', persona: 'miyu', name: 'Miyu', at: NEXT }, { session: 'e2', at: NEXT }, { at: NEXT }] }),
    [{ session: 'e1', persona: 'miyu', name: 'Miyu', at: NEXT }, { session: 'e2', persona: null, name: null, at: NEXT }]);
  assert.deepEqual(endedUnseenOf({}), []);
});

test('光打 /life：没有的照回执；一条直接跳过去；几条出列表让人挑（这个会话的人格排最前，核心排好的照原样）', () => {
  const one = livesOf({ lives: [{ state: 'running', session: 's1', persona: 'miyu', name: 'Miyu' }] });
  const two = livesOf({ lives: [{ state: 'running', session: 's1', persona: 'miyu', name: 'Miyu' }, { state: 'paused', session: 's2', persona: 'bea', name: 'Bea' }] });
  assert.deepEqual(lifeJump([]), { kind: 'none' });
  assert.deepEqual(lifeJump(one), { kind: 'open', session: 's1' });
  assert.deepEqual(lifeJump(two), { kind: 'pick' });
});

test('一行右边的状态：这一轮正在跑、进行中 · 下次继续（今天只写时刻）、已暂停；不写第几轮', () => {
  const t = (/** @type {string} */ key, /** @type {any} */ f) => ({ busy: '这一轮正在跑', running: '进行中', paused: '已暂停', next: `进行中 · 下次继续 ${f?.time}`, tomorrow: `明天 ${f?.time}` })[key] ?? key;
  const now = new Date(2026, 10, 18, 9, 0);
  const at = new Date(2026, 10, 18, 14, 5);
  const [run] = livesOf({ lives: [{ state: 'running', session: 's', persona: 'p', next: at.toISOString(), rounds: 7 }] });
  assert.equal(lifeSide(run, now, t), '进行中 · 下次继续 14:05');
  assert.equal(lifeSide({ ...run, busy: true }, now, t), '这一轮正在跑');
  assert.equal(lifeSide({ ...run, next: null }, now, t), '进行中');
  assert.equal(lifeSide({ ...run, state: 'paused', next: null }, now, t), '已暂停');
  assert.doesNotMatch(lifeSide(run, now, t), /7/);
});

test('空会话里光打 /life 不说「需要先开始会话」：认得出来交给推演人生列；带字的照旧要先开会话', () => {
  const later = new Set(['life']);
  const line = read([], '/life', later);
  assert.equal(line.kind, 'later');
  assert.equal(emptyLife(/** @type {any} */ (line)), true);
  assert.equal(emptyLife(/** @type {any} */ (read([], '/LIFE', later))), true);
  assert.equal(emptyLife(/** @type {any} */ (read([], '/life new', later))), false);
  assert.equal(emptyLife(/** @type {any} */ (read([], '/remember', new Set(['remember'])))), false);
});
