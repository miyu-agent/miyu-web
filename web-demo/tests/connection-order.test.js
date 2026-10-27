// @ts-check
//! 回应只照 `id` 认（蓝图「连核心」第 1 条，核心 V-19）：「落了盘才回」的命令，回应可能排在这一轮的推送、`turn.ended` 后面到。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Connection } from '../src/core/connection.js';

/** 一条通着的假线：发出去的记下来 */
function wired() {
  const conn = new Connection(() => { throw new Error('不开线'); });
  /** @type {string[]} */
  const sent = [];
  conn.ws = /** @type {any} */ ({ readyState: 1, send: (/** @type {string} */ line) => sent.push(line) });
  /** @type {[string, any][]} */
  const pushes = [];
  conn.onPush((method, params) => pushes.push([method, params]));
  const frame = (/** @type {any} */ m) => conn.receive(JSON.stringify(m), () => {});
  return { conn, sent, pushes, frame };
}

test('回应晚于这一轮的推送和 turn.ended 到：推送照推送交，回应照 id 交给等着的请求，回应里的 cwd、untrusted_project 读得到', async () => {
  const { conn, sent, pushes, frame } = wired();
  const asked = conn.request('session.send', { session: 's1', text: '你好' });
  const { id } = JSON.parse(sent[0]);
  frame({ jsonrpc: '2.0', method: 'view.delta', params: { session: 's1', seq: 5 } });
  frame({ jsonrpc: '2.0', method: 'event', params: { session: 's1', kind: 'turn.ended' } });
  frame({ jsonrpc: '2.0', id, result: { cwd: '/home/a/proj', untrusted_project: true } });
  assert.deepEqual(await asked, { cwd: '/home/a/proj', untrusted_project: true });
  assert.deepEqual(pushes.map(([m]) => m), ['view.delta', 'event'], '推送一条不少，也没被当成回应');
});

test('两个请求的回应倒着到：各照各的 id 交；对不上 id 的回应不交给别人', async () => {
  const { conn, sent, frame } = wired();
  const a = conn.request('session.send', { session: 's1', text: 'a' });
  const b = conn.request('command.run', { session: 's1', command: 'goal' });
  const [ia, ib] = sent.map((l) => JSON.parse(l).id);
  frame({ jsonrpc: '2.0', id: 'web-somebody-else-1', result: { said: '别人的' } });
  frame({ jsonrpc: '2.0', id: ib, result: { said: '无长期目标。' } });
  frame({ jsonrpc: '2.0', id: ia, result: { cwd: '/w' } });
  assert.deepEqual(await b, { said: '无长期目标。' });
  assert.deepEqual(await a, { cwd: '/w' });
});
