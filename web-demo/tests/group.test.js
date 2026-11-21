// @ts-check
//! 正文分块（`src/model/group.js`）：她那一块带上回复条目里的人格（核心 70d6ff7d），中途换了人格的会话以前那几轮照原来的人格画。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { itemsOf } from '../src/model/entries.js';
import { group } from '../src/model/group.js';

loadRes();

const AT = '2026-10-19T10:00:00.000Z';
const her = (blocks) => blocks.filter((b) => b.kind === 'her').map((b) => ('persona' in b ? b.persona : 'none'));

test('中途换人格：换之前的回复照旧人格，换之后的照新的，无人格的是 null', () => {
  const entries = [
    { id: 'm1', kind: 'user', text: '一', turn: 1, at: AT },
    { id: 'b1.0', kind: 'reply', turn: 1, text: '好', persona: 'miyu', at: AT },
    { id: 'e1', kind: 'end', turn: 1, at: AT },
    { id: 'm2', kind: 'user', text: '二', turn: 2, at: AT },
    { id: 'b2.0', kind: 'reply', turn: 2, text: '好', persona: 'test', at: AT },
    { id: 'e2', kind: 'end', turn: 2, at: AT },
    { id: 'm3', kind: 'user', text: '三', turn: 3, at: AT },
    { id: 'b3.0', kind: 'reply', turn: 3, text: '好', persona: null, at: AT },
    { id: 'e3', kind: 'end', turn: 3, at: AT },
  ];
  assert.deepEqual(her(group(itemsOf(entries, {}).items)), ['miyu', 'test', null]);
});

test('老核心的回复没有 persona：块里不写（照会话现在的人格画）', () => {
  const entries = [
    { id: 'm1', kind: 'user', text: '一', turn: 1, at: AT },
    { id: 'b1.0', kind: 'reply', turn: 1, text: '好', at: AT },
  ];
  assert.deepEqual(her(group(itemsOf(entries, {}).items)), ['none']);
});

test('同一轮被插进来的话切成两块：两块都照这一轮回复的人格（W-1250：原来前半块没有回复、照会话现在的人格画，一块有头像一块没有）', () => {
  const entries = [
    { id: 'm1', kind: 'user', text: '一', turn: 1, at: AT },
    { id: 'g1.0', kind: 'group', turn: 1, at: AT, steps: ['b1.0'], summary: [{ text: '1 次思考' }] },
    { id: 'b1.0', kind: 'thought', group: 'g1.0', turn: 1, at: AT, text: '想' },
    { id: 'm2', kind: 'user', text: '插一句', turn: 1, at: AT },
    { id: 'b3.0', kind: 'reply', turn: 1, text: '好', persona: 'old', at: AT },
    { id: 'e4', kind: 'end', turn: 1, at: AT },
  ];
  const blocks = group(itemsOf(entries, {}).items);
  assert.deepEqual(blocks.map((b) => b.kind), ['user', 'her', 'user', 'her']);
  assert.deepEqual(her(blocks), ['old', 'old']);
});

test('结束了的一轮没有回复（只调了工具、只发了表情）：照前面最近一轮回复的人格，前面没有的照后面的；还在进行的不猜', () => {
  const quiet = (/** @type {number} */ turn, ended = true) => [
    { id: `g${turn}.0`, kind: 'group', turn, at: AT, steps: [`b${turn}.0`], summary: [{ text: '1 次思考' }] },
    { id: `b${turn}.0`, kind: 'thought', group: `g${turn}.0`, turn, at: AT, text: '想' },
    ...(ended ? [{ id: `e${turn + 1}`, kind: 'end', turn, at: AT }] : []),
  ];
  const entries = [
    ...quiet(1),
    { id: 'b5.0', kind: 'reply', turn: 5, text: '好', persona: 'a', at: AT },
    { id: 'e6', kind: 'end', turn: 5, at: AT },
    ...quiet(7),
    { id: 'b9.0', kind: 'reply', turn: 9, text: '好', persona: null, at: AT },
    { id: 'e10', kind: 'end', turn: 9, at: AT },
    ...quiet(11),
    ...quiet(13, false),
  ];
  assert.deepEqual(her(group(itemsOf(entries, {}).items)), ['a', 'a', 'a', null, null, 'none']);
});
