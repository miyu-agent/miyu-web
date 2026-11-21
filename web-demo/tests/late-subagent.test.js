// @ts-check
//! 晚订阅的子代理（LiteMiyu LM-24 的同一类问题，W-1244）：子代理第一步已经落了盘、还在跑时网页才订阅它的视图流（重开页面、点进子代理），
//! 回应里补上的那一截也要让时间线认出它正在跑的那一步，不能只剩它收到的那句话。底料是核心 62d294acd 真跑录下的回应
//! （`fixtures/late-subagent.json`）。核心照日志补的会话状态里没有 `doing`（只有流式的那几样才记），网页照条目认在跑的那一步。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRes } from './support.js';
import { Store } from '../src/core/store.js';
import { itemsOf } from '../src/model/entries.js';
import { active } from '../src/model/timeline.js';

loadRes();

const fixture = JSON.parse(readFileSync(new URL('./fixtures/late-subagent.json', import.meta.url), 'utf8'));

/** 一个假核心：订阅这个子会话时交录下的回应 */
function lateStore() {
  const conn = {
    onPush: () => {},
    request: async (/** @type {string} */ method, /** @type {any} */ params) => (method === 'subscribe' && params.stream === 'view' ? structuredClone(fixture.subscribe) : {}),
  };
  return new Store(/** @type {any} */ (conn));
}

test('晚订阅的子代理：订阅回应补上的那一截里有它在跑的那一步，时间线转圈的就是这一步（执行命令），不是空的', async () => {
  const store = lateStore();
  await store.load('child');
  const s = /** @type {any} */ (store.sessions.get('child'));
  assert.equal(s.view.status?.state, 'running');
  assert.equal(s.view.status?.doing, undefined, '录下的核心回应里本来就没有 doing：网页不能靠它');
  const { items } = itemsOf(s.view.list, s.view.status, { parent: 'sess-parent' });
  const steps = /** @type {any} */ (items.find((it) => it.type === 'steps'));
  assert.ok(steps, '这一轮的时间线在');
  const i = active(steps);
  assert.notEqual(i, null, '有一步在转圈');
  const step = steps.steps[/** @type {number} */ (i)];
  assert.equal(step.kind, 'tool');
  assert.equal(step.name, 'shell');
  assert.equal(step.state, 'running');
  assert.equal(step.title?.object, '算一个慢的数', '写得出它在做什么');
});
