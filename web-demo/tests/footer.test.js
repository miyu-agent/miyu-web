// @ts-check
//! 输入框下面那一行：左边级别和模型，右边用量那一格（环 · 累计 · 花费，卡住的变红，2026-11-02）；放不下时先收花费（`tui.md`「框下面那一行」）。
//! 速度 2026-10-26 起挪到每轮收尾那一行（`entries.test.js`）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { statusFooter, fit, stuckOf, previewRing, ringTip } from '../src/model/footer.js';

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

test('一个会话的底栏：级别、模型照会话状态；右边一格累计 token，环照上下文占窗口多少；会话状态里有速度也不写（2026-10-26 项目主人：挪到每轮收尾那一行）', () => {
  const f = statusFooter(status);
  assert.deepEqual(f.left, { level: 'workspace', label: '▣ 工作区', model: 'deepseek-v4', endpoint: 'deepseek' });
  assert.deepEqual(f.right.map((p) => p.text), ['12.4k']);
  assert.deepEqual(f.ring, { ratio: 0.0023, used: 2300, window: 1_000_000, stuck: null });
  assert.equal(ringTip(/** @type {any} */ (f.ring)), '上下文 2.3k / 1M（0.2%）');
});

test('累计和花费连子代理（usage_tree，同终端的 Σ，2026-11-02 项目主人）；旧核心没有的照 usage', () => {
  const tree = { usage: u(5000, 40000, 3000), amounts: [], converted: { currency: 'CNY', amount: 0.42 } };
  assert.deepEqual(statusFooter({ ...status, usage_tree: tree }).right.map((p) => p.text), ['48k', '¥0.42']);
  assert.deepEqual(statusFooter(status).right.map((p) => p.text), ['12.4k']);
});

test('只读开着写只读，只读盖过常用的那一级；还是 0 的不写；没有会话状态的是工作区、什么数都不写', () => {
  assert.equal(statusFooter({ ...status, permission: { level: 'full', read_only: true } }).left.label, '⏸ 只读');
  assert.equal(statusFooter({ ...status, permission: { level: 'full', read_only: false } }).left.level, 'full');
  const fresh = statusFooter({ state: 'idle', permission: { level: 'workspace', read_only: false }, context: { window: 1_000_000, used: 0 } });
  assert.equal(fresh.left.model, null);
  assert.deepEqual(fresh.right, []);
  assert.equal(fresh.ring, null);
  assert.deepEqual(statusFooter(null), { left: { level: 'workspace', label: '▣ 工作区', model: null, endpoint: null }, right: [], ring: null });
});

test('会话状态不知道窗口多大的照订阅回应的限额；都不知道的环不画比例，悬停只写用了多少', () => {
  const unknown = { ...status, context: { used: 2300 } };
  assert.equal(statusFooter(unknown, { window: 1_000_000 }).ring?.ratio, 0.0023);
  const bare = statusFooter(unknown, {}).ring;
  assert.equal(bare?.ratio, null);
  assert.equal(ringTip(/** @type {any} */ (bare)), '上下文 2.3k');
});

test('花费接在累计后面：有 converted 写它（rest 接在后面），一笔都没换成的、没定价的不写（核心 UC-1，2026-10-26、10-31 项目主人）', () => {
  const priced = (cost) => statusFooter({ ...status, usage: { ...status.usage, ...cost } }).right.map((p) => p.text);
  assert.deepEqual(priced({ amounts: [{ currency: 'USD', amount: 0.045 }], converted: { currency: 'CNY', amount: 0.32 } }), ['12.4k', '¥0.32']);
  assert.deepEqual(priced({ amounts: [{ currency: 'USD', amount: 0.4 }, { currency: 'CNY', amount: 0.32 }], converted: { currency: 'CNY', amount: 0.32, rest: [{ currency: 'USD', amount: 0.4 }] } }).at(-1), '¥0.32 + $0.40');
  assert.deepEqual(priced({ amounts: [{ currency: 'USD', amount: 0.05 }] }), ['12.4k'], '汇率还没有（第一次）：只写 token');
  assert.deepEqual(priced({ amounts: [] }), ['12.4k'], '没定价：只写 token');
});

test('放不下时先收花费，累计留着；卡住的先收「用了多少 / 线」，那几个字留着', () => {
  const width = (ps) => ps.map((p) => p.text).join(' · ').length;
  const parts = statusFooter({ ...status, usage: { ...status.usage, amounts: [], converted: { currency: 'CNY', amount: 0.32 } } }).right;
  assert.deepEqual(fit(parts, 20, width).map((p) => p.key), ['total', 'cost']);
  assert.deepEqual(fit(parts, 8, width).map((p) => p.key), ['total'], '放不下：先收花费');
  assert.deepEqual(fit(parts, 2, width), []);
  const stuck = statusFooter({ ...status, context: { window: 128000, used: 203000 } }).right;
  assert.deepEqual(stuck.map((p) => p.text), ['上下文超出窗口', '203k/128k']);
  assert.deepEqual(fit(stuck, 10, width).map((p) => p.key), ['stuck']);
});

test('卡住了没有：最近一次压缩失败了、或自动压缩暂停了，后来没压好、清空过、用量到了线的是压缩失败；超出窗口的是超出窗口；正在压的转圈', () => {
  const over = { context: { window: 128000, used: 203000 } };
  const busy = { context: { window: 200000, used: 195000 } };
  assert.equal(stuckOf(busy, [{ what: 'compaction', state: 'failed' }], 200000, 190000), 'failed');
  assert.equal(stuckOf(busy, [{ what: 'paused', reason: 'failures' }], 200000, 190000), 'failed');
  assert.equal(stuckOf(busy, [{ what: 'compaction', state: 'failed' }, { what: 'compaction', state: 'done' }], 200000, 190000), null, '后来压好了');
  assert.equal(stuckOf(busy, [{ what: 'paused' }, { what: 'cleared' }], 200000, 190000), null, '后来清空了');
  assert.equal(stuckOf({ context: { window: 200000, used: 50000 } }, [{ what: 'compaction', state: 'failed' }], 200000, 190000), null, '没到线（手动压没压成）：不算卡住');
  assert.equal(stuckOf(over, [], 128000, 108800), 'over');
  assert.equal(stuckOf({ ...over, doing: { what: 'compacting' } }, [], 128000, 108800), 'compacting');
  const f = statusFooter({ ...status, context: { window: 200000, compaction_line: 190000, used: 195000 } }, {}, [{ what: 'compaction', state: 'failed' }]);
  assert.deepEqual(f.right.map((p) => p.text), ['上下文压缩失败', '195k/190k']);
  assert.equal(f.ring?.stuck, 'failed');
  assert.deepEqual(statusFooter({ ...status, doing: { what: 'compacting' } }).right.map((p) => p.text), ['正在压缩上下文']);
});

test('新会话的环照预览画；没有数的不画', () => {
  assert.deepEqual(previewRing({ used: 3434, window: 1000000 }), { ratio: 0.003434, used: 3434, window: 1000000, stuck: null });
  assert.deepEqual(previewRing({ used: 3434 }), { ratio: null, used: 3434, window: null, stuck: null });
  assert.equal(previewRing({ used: 0 }), null);
  assert.equal(previewRing(null), null);
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
