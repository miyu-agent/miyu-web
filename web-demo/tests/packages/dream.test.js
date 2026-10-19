// @ts-check
//! 人叫的整理的进度（`packages/memory/dream-model.js`，蓝图 `web.md`「记忆页」第 13 条，核心 R-21）：头一批的 left 是总数，
//! 一批之内照推来的决定往前挪、最多九成，merged 走满；后台的不管；只重看旧记忆的照自己的批走；滚动区浮过哪几行。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DreamTrack, WITHIN } from '../../packages/memory/dream-model.js';

const ev = (kind, body) => ({ kind, body });

test('两批：头一批的 left 是总数，一批之内挪不过九成，merged 走满', () => {
  const tr = new DreamTrack();
  const read = tr.logged(ev('ext.memory.merging', { upto: 10, fresh: 4, left: 6, manual: true, given: ['m1', 'm2', 'm9'] }));
  assert.deepEqual(read.map((l) => l.kind === 'read' && l.id), ['m1', 'm2', 'm9']);
  assert.equal(tr.total, 6);
  assert.equal(tr.progress(), 0);
  for (let i = 0; i < 30; i++) tr.dreaming({ upto: 10, kind: 'revised', id: 'm1', text: 'x' });
  assert.ok(tr.progress() < (4 * WITHIN) / 6 + 1e-9, String(tr.progress()));
  assert.ok(tr.progress() > 0.5);
  tr.logged(ev('ext.memory.merged', { upto: 10, given: 4 }));
  assert.equal(tr.progress(), 4 / 6);
  tr.logged(ev('ext.memory.merging', { upto: 20, fresh: 2, left: 2, manual: true, given: ['m5'] }));
  assert.equal(tr.total, 6, '后面一批的 left 不改总数');
  tr.logged(ev('ext.memory.merged', { upto: 20 }));
  assert.equal(tr.progress(), 1);
  assert.equal(tr.batches, 2);
});

test('后台自己整理的、别的批推来的不管', () => {
  const tr = new DreamTrack();
  assert.deepEqual(tr.logged(ev('ext.memory.merging', { upto: 5, fresh: 3, left: 3, manual: false, given: ['m1'] })), []);
  assert.equal(tr.batch, null);
  tr.logged(ev('ext.memory.merging', { upto: 7, fresh: 3, left: 3, manual: true, given: [] }));
  assert.deepEqual(tr.dreaming({ upto: 5, kind: 'revised', id: 'm1', text: 'x' }), []);
  assert.equal(tr.batch?.decided, 0);
});

test('推来的决定、补的关键词变成滚动区的行，数跟着加', () => {
  const tr = new DreamTrack();
  tr.logged(ev('ext.memory.merging', { upto: 3, fresh: 2, left: 2, manual: true, given: ['m1', 'm2'] }));
  assert.deepEqual(tr.dreaming({ upto: 3, kind: 'revised', id: 'm1', text: '新的' }), [{ kind: 'new', id: 'm1', text: '新的' }]);
  assert.deepEqual(tr.dreaming({ upto: 3, kind: 'retired', id: 'm2', retire: 'repeat', kept: 'm1', why: '一样' }), [{ kind: 'del', id: 'm2', retire: 'repeat', kept: 'm1', why: '一样' }]);
  assert.deepEqual(tr.dreaming({ upto: 3, kind: 'retired', id: 'm3', retire: 'worthless', why: '' }), [{ kind: 'del', id: 'm3', retire: 'worthless', kept: null, why: '' }]);
  assert.deepEqual(tr.dreaming({ upto: 3, kind: 'summary', chars: 40, done: false }), [{ kind: 'sum', chars: 40, done: false }]);
  tr.logged(ev('ext.memory.merged', { upto: 3 }));
  assert.deepEqual(tr.logged(ev('ext.memory.tagged', { id: 'm1', keywords: 'README、补丁' })), [{ kind: 'kw', id: 'm1', keywords: 'README、补丁' }]);
  assert.deepEqual(tr.tally, { del: 2, new: 1, kw: 1 });
});

test('只重看旧记忆（fresh、left 都是 0）：照这一批自己的决定走', () => {
  const tr = new DreamTrack();
  tr.logged(ev('ext.memory.merging', { upto: 9, fresh: 0, left: 0, manual: true, given: ['m1', 'm2', 'm3'] }));
  assert.equal(tr.total, 0);
  assert.equal(tr.given, 3);
  assert.equal(tr.progress(), 0);
  tr.dreaming({ upto: 9, kind: 'retired', id: 'm1', retire: 'outdated', why: '' });
  assert.ok(tr.progress() > 0 && tr.progress() < WITHIN);
  tr.logged(ev('ext.memory.merged', { upto: 9 }));
  assert.equal(tr.progress(), 1);
});

test('这一批没合成：一行提示，这一批里挪的退回去重来', () => {
  const tr = new DreamTrack();
  tr.logged(ev('ext.memory.merging', { upto: 4, fresh: 2, left: 2, manual: true, given: [] }));
  tr.dreaming({ upto: 4, kind: 'revised', id: 'm1', text: 'x' });
  assert.deepEqual(tr.logged(ev('ext.memory.merge_failed', { upto: 4, why: 'bad' })), [{ kind: 'fail' }]);
  assert.equal(tr.progress(), 0);
});

test('老核心不带 given：写一行这一批几条', () => {
  const tr = new DreamTrack();
  assert.deepEqual(tr.logged(ev('ext.memory.merging', { upto: 1, fresh: 12, left: 12, manual: true })), [{ kind: 'batch', count: 12 }]);
});
