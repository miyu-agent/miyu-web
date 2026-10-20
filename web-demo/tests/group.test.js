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
