// @ts-check
//! 输入框下面那一行：左边级别和模型，右边速度 · 上下文 · 累计；放不下时右边先丢速度、再丢累计
//! （`tui.md`「框下面那一行」）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { statusFooter, fit } from '../src/model/footer.js';

loadRes();

const u = (uncached, cache_read, output) => ({ uncached, cache_read, cache_write: 0, output });
/** 会话状态（核心 9-8 的 `view.status`）：一次主请求以后的样子 */
const status = {
  state: 'idle',
  permission: { level: 'workspace', read_only: false },
  model: { endpoint: 'deepseek', model: 'deepseek-v4' },
  speed: { output: 50, ms: 10000 },
  context: { window: 1_000_000, used: 2300 },
  usage: { usage: u(1400, 10000, 1000), main: u(1300, 10000, 900) },
};

test('一个会话的底栏：级别、模型、速度（输出 ÷ 首字到说完）、上下文、累计（命中率照主请求）都照会话状态', () => {
  const f = statusFooter(status);
  assert.deepEqual(f.left, { level: 'workspace', label: '▣ 工作区', model: 'deepseek-v4', endpoint: 'deepseek' });
  assert.deepEqual(f.right.map((p) => p.text), ['5 tok/s', '2.3k/1M(0.2%)', 'Σ12.4k(C88%)']);
});

test('只读开着写只读，只读盖过常用的那一级；还是 0 的格子不写；没有会话状态的是工作区、什么数都不写', () => {
  assert.equal(statusFooter({ ...status, permission: { level: 'full', read_only: true } }).left.label, '⏸ 只读');
  assert.equal(statusFooter({ ...status, permission: { level: 'full', read_only: false } }).left.level, 'full');
  const fresh = statusFooter({ state: 'idle', permission: { level: 'workspace', read_only: false }, context: { window: 1_000_000, used: 0 } });
  assert.equal(fresh.left.model, null);
  assert.deepEqual(fresh.right, []);
  assert.deepEqual(statusFooter(null), { left: { level: 'workspace', label: '▣ 工作区', model: null, endpoint: null }, right: [] });
});

test('会话状态不知道窗口多大的照订阅回应的限额；都不知道的只写用了多少', () => {
  const unknown = { ...status, context: { used: 2300 } };
  assert.equal(statusFooter(unknown, { window: 1_000_000 }).right[1].text, '2.3k/1M(0.2%)');
  assert.equal(statusFooter(unknown, {}).right[1].text, '2.3k');
});

test('花费单独一格接在累计后面：有 converted 写它（rest 接在后面），没有的照 amounts，没定价的不写（核心 UC-1，2026-10-26 项目主人）', () => {
  const priced = (cost) => statusFooter({ ...status, usage: { ...status.usage, ...cost } }).right.map((p) => p.text);
  assert.deepEqual(priced({ amounts: [{ currency: 'USD', amount: 0.045 }], converted: { currency: 'CNY', amount: 0.32 } }), ['5 tok/s', '2.3k/1M(0.2%)', 'Σ12.4k(C88%)', '¥0.32']);
  assert.deepEqual(priced({ amounts: [{ currency: 'USD', amount: 0.4 }, { currency: 'CNY', amount: 0.32 }], converted: { currency: 'CNY', amount: 0.32, rest: [{ currency: 'USD', amount: 0.4 }] } }).at(-1), '¥0.32 + $0.40');
  assert.deepEqual(priced({ amounts: [{ currency: 'USD', amount: 0.05 }] }).at(-1), '$0.05', '汇率还没有（第一次）：照 amounts');
  assert.deepEqual(priced({ amounts: [] }).at(-1), 'Σ12.4k(C88%)', '没定价：不写这一格');
  const parts = statusFooter({ ...status, usage: { ...status.usage, amounts: [], converted: { currency: 'CNY', amount: 0.32 } } }).right;
  const width = (ps) => ps.map((p) => p.text).join(' · ').length;
  assert.deepEqual(fit(parts, 45, width).map((p) => p.key), ['speed', 'context', 'total'], '放不下：先丢花费');
  assert.deepEqual(fit(parts, 30, width).map((p) => p.key), ['context', 'total'], '再丢速度');
});

test('放不下时先丢速度、再丢累计，上下文留到最后', () => {
  const parts = statusFooter(status).right;
  const width = (ps) => ps.map((p) => p.text).join(' · ').length;
  const kept = (room) => fit(parts, room, width).map((p) => p.text);
  assert.deepEqual(kept(100), ['5 tok/s', '2.3k/1M(0.2%)', 'Σ12.4k(C88%)']);
  assert.deepEqual(kept(30), ['2.3k/1M(0.2%)', 'Σ12.4k(C88%)']);
  assert.deepEqual(kept(20), ['2.3k/1M(0.2%)']);
  assert.deepEqual(kept(5), []);
});

test('点一下换下一级：工作区 → 开放权限 → 只读 → 工作区', async () => {
  const { nextLevel, levelLabel } = await import('../src/model/footer.js');
  assert.deepEqual(['workspace', 'full', 'read_only'].map(nextLevel), ['full', 'read_only', 'workspace']);
  assert.equal(levelLabel('full'), '⏵⏵ 开放权限');
});

test('换级别发给核心的参数：只读只开只读开关，常用的那一级不动；工作区、开放权限写级别并关掉只读', async () => {
  const { levelParams } = await import('../src/model/footer.js');
  assert.deepEqual(levelParams('read_only'), { read_only: true });
  assert.deepEqual(levelParams('workspace'), { level: 'workspace', read_only: false });
  assert.deepEqual(levelParams('full'), { level: 'full', read_only: false });
});
