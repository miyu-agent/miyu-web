// @ts-check
//! 会话的先后、打开页面时进哪个会话（蓝图 `web.md`「左栏」「连核心」第 4 条）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rank, startupSession, timeGroup, byTime } from '../src/model/session.js';


test('先后：置顶的在最前，别的照最近活动从近到远；不知道活动时刻的照开的时刻（编号里的时间）', () => {
  // 编号里的时间：前 12 位十六进制是毫秒
  const id = (ms) => `${ms.toString(16).padStart(12, '0').replace(/^(.{8})(.{4})$/, '$1-$2')}-7000-8000-000000000000`;
  const rows = [
    { session: id(1000), pinned: false, active: 9000 },
    { session: id(2000), pinned: false, active: null },
    { session: id(3000), pinned: true, active: 4000 },
    { session: id(5000), pinned: false, active: null },
    { session: id(6000), pinned: true, active: 8000 },
  ];
  assert.deepEqual(rank(rows).map((r) => r.session), [id(6000), id(3000), id(1000), id(5000), id(2000)]);
});

test('打开页面时进哪个会话：ui.startup 是 recent 的进最近的那个，new、读不出来的（核心旧、没有这一项）是新会话', () => {
  const recent = { items: { 'ui.startup': { value: 'recent', origin: { layer: 'personal' } } } };
  assert.equal(startupSession(recent, ['b', 'a']), 'b');
  assert.equal(startupSession(recent, []), null, '一个会话都没有的是新会话');
  assert.equal(startupSession({ items: { 'ui.startup': { value: 'new' } } }, ['b']), null);
  assert.equal(startupSession(null, ['b']), null, '读不出来（拒了）的照出厂的 new');
  assert.equal(startupSession({ items: {} }, ['b']), null);
});

test('按时间分组：今天、昨天是最近，7 天、30 天以内各一组，更早的 30 天前；空组不出来，组里照原来的先后', () => {
  const now = new Date(2026, 9, 19, 14, 0).getTime();
  const at = (y, mo, d, h = 12) => new Date(y, mo, d, h).getTime();
  assert.equal(timeGroup(at(2026, 9, 19, 9), now), 'recent');
  assert.equal(timeGroup(at(2026, 9, 18, 1), now), 'recent', '昨天凌晨也是最近');
  assert.equal(timeGroup(at(2026, 9, 17, 23), now), 'week', '前天算近 7 天');
  assert.equal(timeGroup(at(2026, 9, 13), now), 'week');
  assert.equal(timeGroup(at(2026, 9, 12), now), 'month', '第 7 天起算近 30 天');
  assert.equal(timeGroup(at(2026, 8, 20), now), 'month');
  assert.equal(timeGroup(at(2026, 8, 19), now), 'older');
  const rows = [
    { session: 'a', active: at(2026, 9, 19) }, { session: 'b', active: at(2026, 9, 15) }, { session: 'c', active: at(2026, 9, 18) },
    { session: 'd', active: at(2026, 7, 1) },
  ];
  assert.deepEqual(byTime(rows, now).map((g) => [g.group, g.rows.map((r) => r.session)]), [['recent', ['a', 'c']], ['week', ['b']], ['older', ['d']]]);
  assert.deepEqual(byTime([], now), []);
});
