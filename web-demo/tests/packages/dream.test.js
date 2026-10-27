// @ts-check
//! 人叫的整理的进度（`packages/memory/dream-model.js`，蓝图 `web.md`「记忆页」第 13 条，核心 R-21、R-22）：头一批的 left 是总数，
//! 一批之内不挪（2026-10-20 项目主人：进度条是假的），merged 才走；后台的不管；只重看旧记忆的合完才满；叫停；滚动区浮过哪几行；结果点开列什么。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DreamTrack } from '../../packages/memory/dream-model.js';

const ev = (kind, body) => ({ kind, body });

test('两批：头一批的 left 是总数，一批之内不挪，merged 才走；一共几批照 left ÷ fresh', () => {
  const tr = new DreamTrack();
  const read = tr.logged(ev('ext.memory.merging', { upto: 10, fresh: 4, left: 6, manual: true, given: ['m1', 'm2', 'm9'] }));
  assert.deepEqual(read.map((l) => l.kind === 'read' && l.id), ['m1', 'm2', 'm9']);
  assert.equal(tr.total, 6);
  assert.equal(tr.progress(), 0);
  assert.equal(tr.planned(), 2);
  assert.ok(tr.quiet(), '还没写出东西：做梦中');
  for (let i = 0; i < 30; i++) tr.dreaming({ upto: 10, kind: 'revised', id: 'm1', text: 'x' });
  assert.equal(tr.progress(), 0, '写了几条决定也不挪');
  assert.ok(!tr.quiet());
  tr.logged(ev('ext.memory.merged', { upto: 10, given: 4 }));
  assert.equal(tr.progress(), 4 / 6);
  tr.logged(ev('ext.memory.merging', { upto: 20, fresh: 2, left: 2, manual: true, given: ['m5'] }));
  assert.equal(tr.total, 6, '后面一批的 left 不改总数');
  assert.equal(tr.planned(), 2);
  tr.logged(ev('ext.memory.merged', { upto: 20 }));
  assert.equal(tr.progress(), 1);
  assert.equal(tr.batches, 2);
  assert.equal(tr.planned(), 2);
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

test('只重看旧记忆（fresh、left 都是 0）：合完了才满', () => {
  const tr = new DreamTrack();
  tr.logged(ev('ext.memory.merging', { upto: 9, fresh: 0, left: 0, manual: true, given: ['m1', 'm2', 'm3'] }));
  assert.equal(tr.total, 0);
  assert.equal(tr.given, 3);
  assert.equal(tr.progress(), 0);
  tr.dreaming({ upto: 9, kind: 'retired', id: 'm1', retire: 'outdated', why: '' });
  assert.equal(tr.progress(), 0);
  assert.equal(tr.planned(), 1);
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

test('叫停（R-22）：正在合的那一批记 merge_failed why stopped，写一行放下了，不写「再试一次」；合完的批照算', () => {
  const tr = new DreamTrack();
  tr.logged(ev('ext.memory.merging', { upto: 10, fresh: 4, left: 8, manual: true, given: [] }));
  tr.logged(ev('ext.memory.merged', { upto: 10 }));
  tr.logged(ev('ext.memory.merging', { upto: 20, fresh: 4, left: 4, manual: true, given: [] }));
  assert.deepEqual(tr.logged(ev('ext.memory.merge_failed', { upto: 20, why: 'stopped' })), [{ kind: 'stopped' }]);
  assert.ok(tr.stopped);
  assert.equal(tr.batch, null);
  assert.equal(tr.progress(), 0.5);
  assert.ok(!tr.quiet());
});

test('结果点开列的：合着的时候日志里真正存下的（改、作废、最后一份摘要），合着以外的、新记的不算', () => {
  const tr = new DreamTrack();
  tr.logged(ev('ext.memory.saved', { text: '早先抽到的', replaces: 'm0' }));
  tr.logged(ev('ext.memory.merging', { upto: 5, fresh: 2, left: 2, manual: true, given: ['m1', 'm2'] }));
  tr.logged(ev('ext.memory.saved', { text: '别的会话新记的' }));
  tr.logged(ev('ext.memory.saved', { text: '改成这样', replaces: 'm1' }));
  tr.logged(ev('ext.memory.retired', { id: 'm2', kind: 'repeat', kept: 'm1', why: '说的是一件事' }));
  tr.logged(ev('ext.memory.retired', { id: 'm7', why: '人删的' }));
  tr.logged(ev('ext.memory.summary', { text: '第一版', upto: 5 }));
  tr.logged(ev('ext.memory.summary', { text: '第二版', upto: 5 }));
  tr.logged(ev('ext.memory.merged', { upto: 5 }));
  tr.logged(ev('ext.memory.saved', { text: '合完以后的', replaces: 'm3' }));
  assert.deepEqual(tr.saved, [
    { kind: 'new', id: 'm1', text: '改成这样' },
    { kind: 'del', id: 'm2', retire: 'repeat', kept: 'm1', why: '说的是一件事' },
    { kind: 'summary', text: '第二版' },
  ]);
});

test('整理记录一行右边（核心 DR-1、记忆 D-2 补的 dream.result）：在跑的、跑完的、叫停的、没跑完的', async () => {
  const { dreamOutcome } = await import('../../packages/memory/dream-model.js');
  assert.deepEqual(dreamOutcome({ busy: true, dream: {} }), { kind: 'running' });
  assert.deepEqual(dreamOutcome({ dream: { result: { given: 2, revised: 3, retired: 1, summary: true } } }), { kind: 'done', revised: 3, retired: 1, stopped: false });
  assert.deepEqual(dreamOutcome({ dream: { result: { given: 0, revised: 1, retired: 0, summary: false, stopped: true } } }), { kind: 'done', revised: 1, retired: 0, stopped: true });
  assert.deepEqual(dreamOutcome({ dream: { persona: 'cat' } }), { kind: 'unfinished' }, '没有 result：没跑完');
  assert.deepEqual(dreamOutcome({ dream: { result: { revised: 'x' } } }), { kind: 'done', revised: 0, retired: 0, stopped: false }, '认不得的数当 0');
});
