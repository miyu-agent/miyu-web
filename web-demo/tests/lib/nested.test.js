// @ts-check
//! 脚本里调的工具（蓝图 `web.md`「时间线」的「脚本里调的工具」；核心 M-5 上）：那一行后面接的字、颜色，接着要来的怎么拼、下一次从哪个序号要。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nestedTail, toneOf, mergeNested, afterOf, nestedSig, argLines, nameOf } from '../../src/lib/nested.js';

const last = (n, state, name = '翻记忆') => ({ count: n, last: { n, name: 'memory_search', title: { name, object: '猫' }, state } });

test('那一行后面接 #n 显示名；出错、被拒 danger，要确认、脚本里没问的 warn；没调过、认不出的没有', () => {
  assert.deepEqual(nestedTail(last(12, 'ok')), { text: '#12 翻记忆', tone: null });
  assert.deepEqual(nestedTail(last(3, 'running')), { text: '#3 翻记忆', tone: null });
  assert.equal(nestedTail(last(3, 'error'))?.tone, 'danger');
  assert.equal(nestedTail(last(3, 'denied'))?.tone, 'danger');
  assert.equal(nestedTail(last(3, 'needs_approval'))?.tone, 'warn');
  assert.equal(toneOf('cancelled'), null);
  assert.equal(nestedTail(null), null);
  assert.equal(nestedTail({ count: 1 }), null);
  assert.equal(nameOf({ n: 1, name: 'read', state: 'ok' }), 'read', '没有显示名的照工具名');
});

test('接着要来的照序号拼，同一个序号换成新的（在跑的了结了）；下一次从最大的序号要，一个都没有的要整份', () => {
  const had = [{ n: 1, name: 'a', state: 'ok' }, { n: 2, name: 'b', state: 'running' }];
  const got = mergeNested(had, [{ n: 2, name: 'b', state: 'ok' }, { n: 3, name: 'c', state: 'running' }]);
  assert.deepEqual(got.map((c) => `${c.n}${c.state}`), ['1ok', '2ok', '3running']);
  assert.equal(afterOf(got), 3);
  assert.equal(afterOf([]), null);
  assert.deepEqual(mergeNested(had, null), had);
  assert.notEqual(nestedSig(last(2, 'running')), nestedSig(last(2, 'ok')), '状态变了也算变了');
  assert.equal(nestedSig(null), '');
});

test('参数写成一行一个 键: 值；嵌套的压成一行 JSON；读不懂的照原文', () => {
  assert.equal(argLines('{"query":"猫","limit":3,"filter":{"a":1}}'), 'query: 猫\nlimit: 3\nfilter: {"a":1}');
  assert.equal(argLines('{oops'), '{oops');
  assert.equal(argLines(undefined), '');
});
