// @ts-check
//! `/life new`、`/life kill` 发之前问不问、问什么（2026-11-17 项目主人本机验收第 25 条，核心 LF-12，W-1211）：没人格的会话里 `/life new`
//! 不问（核心回一句先选人格）；有人格的照 `life.status`，有在过的才说「先结束现在这段」；没人格的会话里 `/life kill` 写清结束的是哪个人格的。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { livesOf, lifeConfirm } from '../../src/lib/life.js';

test('/life new：没人格的会话不问、直接发（核心回一句先选人格）；有人格的有在过的才问「先结束现在这段」，没有的直接开', () => {
  assert.equal(lifeConfirm('new', { persona: null, status: null, lives: [] }), null);
  assert.deepEqual(lifeConfirm('new', { persona: 'miyu', status: 'running', lives: [] }), { kind: 'new', name: null });
  assert.deepEqual(lifeConfirm('new', { persona: 'miyu', status: 'paused', lives: [] }), { kind: 'new', name: null });
  assert.equal(lifeConfirm('new', { persona: 'miyu', status: 'none', lives: [] }), null);
  assert.equal(lifeConfirm('new', { persona: 'miyu', status: 'ended', lives: [] }), null);
});

test('/life kill：有人格的有在过的才问；没人格的会话照所有人格找，只有一个的问「结束 <名字> 的这段人生」，一个都没有、好几个的核心不动、不问', () => {
  const lives = (/** @type {number} */ n) => livesOf({ lives: [{ state: 'running', session: 's1', persona: 'miyu', name: 'Miyu' }, { state: 'paused', session: 's2', persona: 'bea', name: 'Bea' }].slice(0, n) });
  assert.deepEqual(lifeConfirm('kill', { persona: 'miyu', status: 'running', lives: [] }), { kind: 'kill', name: null });
  assert.equal(lifeConfirm('kill', { persona: 'miyu', status: 'none', lives: [] }), null);
  assert.deepEqual(lifeConfirm('kill', { persona: null, status: null, lives: lives(1) }), { kind: 'kill', name: 'Miyu' });
  assert.equal(lifeConfirm('kill', { persona: null, status: null, lives: lives(0) }), null);
  assert.equal(lifeConfirm('kill', { persona: null, status: null, lives: lives(2) }), null);
});
