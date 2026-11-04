// @ts-check
//! 导入会话和只读存档（核心 SE-1 下，设计 58 第三节第 4 条，W-1094）：左栏、全部会话把存档排成最后一段；导入的回应、拒绝换成界面要做的事。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byTime, archiveLast, ARCHIVE_GROUP } from '../src/model/session.js';
import { filterRows, groupRows } from '../src/model/session-filter.js';
import { importDone, importRefusal } from '../src/model/session-import.js';

const now = new Date(2026, 10, 4, 14, 0).getTime();
const day = 86400000;
const ids = (/** @type {any[]} */ list) => list.map((r) => r.session);

test('按时间分组：存档不进最近、近 7 天这几组，单成最后一段，段里照进来的先后；没有存档的不出这一段', () => {
  const rows = [
    { session: 'a', active: now - 1000 },
    { session: 'old-archive', active: now - 90 * day, archived: true },
    { session: 'b', active: now - 3 * day },
    { session: 'new-archive', active: now - 2000, archived: true },
    { session: 'c', active: now - 40 * day },
  ];
  assert.deepEqual(byTime(rows, now).map((g) => [g.group, ids(g.rows)]),
    [['recent', ['a']], ['week', ['b']], ['older', ['c']], [ARCHIVE_GROUP, ['old-archive', 'new-archive']]]);
  assert.deepEqual(byTime(rows.filter((r) => !r.archived), now).map((g) => g.group), ['recent', 'week', 'older'], '没有存档：没有这一段');
  assert.deepEqual(byTime(rows.filter((r) => r.archived), now).map((g) => g.group), [ARCHIVE_GROUP], '只有存档：只有这一段');
});

test('左栏露前几个之前：存档挪到最后，别的先后不动（存档不占在聊的会话的位置）', () => {
  const rows = [{ session: 'x', archived: true }, { session: 'a' }, { session: 'y', archived: true }, { session: 'b' }];
  assert.deepEqual(ids(archiveLast(rows)), ['a', 'b', 'x', 'y']);
  assert.deepEqual(archiveLast([]), []);
});

test('全部会话：两种排法存档都在最后一段、新的在前；筛选照旧管得到存档', () => {
  const uuid = (/** @type {number} */ ms) => `${ms.toString(16).padStart(12, '0').replace(/^(.{8})(.{4})$/, '$1-$2')}-7000-8000-000000000000`;
  const base = { title: null, project: null, running: false, unread: false };
  const rows = [
    { ...base, session: uuid(now - 10 * day), active: now - 1000 },
    { ...base, session: uuid(now - 50 * day), active: now - 60 * day, archived: true, unread: true },
    { ...base, session: uuid(now - 20 * day), active: now - 2 * day, archived: true },
    { ...base, session: uuid(now - 5 * day), active: now - 3 * day },
  ];
  const [fresh, oldArchive, newArchive, week] = rows.map((r) => r.session);
  assert.deepEqual(groupRows(rows, 'active', now).map((g) => [g.group, ids(g.rows)]),
    [['recent', [fresh]], ['week', [week]], [ARCHIVE_GROUP, [newArchive, oldArchive]]], '照最近活动：存档段里新的在前');
  assert.deepEqual(groupRows(rows, 'created', now).map((g) => [g.group, ids(g.rows)]),
    [['week', [week]], ['month', [fresh]], [ARCHIVE_GROUP, [newArchive, oldArchive]]], '照创建时间：存档段里开得晚的在前，不进时间的几组');
  // 未读筛选照旧对存档生效
  const unread = groupRows(filterRows(rows, 'unread', '', new Set()), 'active', now);
  assert.deepEqual(unread.map((g) => [g.group, ids(g.rows)]), [[ARCHIVE_GROUP, [oldArchive]]]);
});

test('导入成了：打开包的主会话；present 里有主会话的是早就在的（重导同一个包）', () => {
  assert.deepEqual(importDone({ main: 'm', sessions: ['m', 'k'], present: [] }), { open: 'm', present: false });
  assert.deepEqual(importDone({ main: 'm', sessions: [], present: ['m', 'k'] }), { open: 'm', present: true });
  assert.deepEqual(importDone({ main: 'm', sessions: ['m'], present: ['k'] }), { open: 'm', present: false }, '只有子会话早就在的不算');
  assert.deepEqual(importDone({ sessions: [] }), { open: null, present: false }, '没写主会话的不打开');
  assert.deepEqual(importDone(null), { open: null, present: false });
});

test('导入被拒了：认得的原因码一种一句，session_exists 带上撞的编号，别的照核心的话', () => {
  const refusal = (/** @type {string|null} */ reason, data = null, message = '核心的话') => Object.assign(new Error(message), { reason, data });
  for (const reason of ['bad_bundle', 'bundle_mismatch', 'bundle_too_new', 'unknown_attachment']) {
    assert.deepEqual(importRefusal(refusal(reason)), { key: reason });
  }
  assert.deepEqual(importRefusal(refusal('session_exists', { session: 's1' })), { key: 'session_exists', session: 's1' });
  assert.deepEqual(importRefusal(refusal('session_exists')), { key: 'session_exists', session: null }, '没给编号的照样认');
  assert.deepEqual(importRefusal(refusal('too_big', null, '超过上限')), { key: 'other', reason: '超过上限' });
  assert.deepEqual(importRefusal(refusal(null, null, '连接断了')), { key: 'other', reason: '连接断了' });
});
