// @ts-check
//! 输入框下面那一行：左边级别和模型，右边速度 · 上下文环 · 累计（数据库图标、数、命中率）；放不下时右边先丢速度、
//! 再丢累计，上下文留到最后。上下文、累计两格各自带着点开就地展开要的构成（`web.md`「框下面那一行的数」）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes, sampleLog } from './support.js';
import { footer, fit } from '../src/model/footer.js';

loadRes();

const partsOf = (log, limits) => footer(log, limits).right;
const part = (log, key, limits) => partsOf(log, limits).find((p) => p.key === key);

test('一个会话的底栏：级别照最后一次改的，模型照最后一次请求，数照 TUI 的算法', () => {
  const f = footer(sampleLog(), { window: 1_000_000 });
  assert.deepEqual(f.left, { level: 'workspace', label: '▣ 工作区', model: 'deepseek-v4', endpoint: 'deepseek' });
  assert.deepEqual(f.right.map((p) => p.text), ['5 tok/s', '2.3k/1M(0.2%)', '12.4k · 命中 81%']);
});

test('上下文那一格：环的比例是用了 ÷ 窗口，构成是这一次主请求的用量四格加消息条数', () => {
  const p = part(sampleLog(), 'context', { window: 1_000_000 });
  assert.equal(p.ratio, p.used / 1_000_000, '环的比例');
  const d = p.detail;
  assert.equal(d.uncached + d.cacheRead + d.cacheWrite, p.used - d.output, '输入三格加输出就是用了多少');
  assert.equal(typeof d.messages, 'number', '这一次请求几条消息');
  assert.ok(p.used > 0 && p.used < 1_000_000);
});

test('上下文超过窗口的：环画满（比例夹到 1），字照实写', () => {
  const p = part(sampleLog(), 'context', { window: 1_000 });
  assert.equal(p.ratio, 1);
  assert.match(p.text, /^2\.3k\/1k\(/);
});

test('不知道窗口多大的：没有比例（只画轨道），字只写用了多少', () => {
  const p = part(sampleLog(), 'context', {});
  assert.equal(p.ratio, null);
  assert.equal(p.text, '2.3k');
});

test('累计那一格：构成是这一路的请求次数、输入、输出、缓存读、缓存写、命中率', () => {
  const p = part(sampleLog(), 'total', { window: 1_000_000 });
  const d = p.detail;
  assert.equal(d.input, d.uncached + d.cacheRead + d.cacheWrite, '输入是那三格之和');
  assert.ok(d.requests > 0 && Number.isInteger(d.requests), '请求几次');
  assert.ok(p.tokens.endsWith('k'), '数写短');
  assert.equal(p.text, `${p.tokens} · 命中 ${p.percent}%`);
  assert.equal(Number(p.percent), Math.round((d.hit * 100) / d.mainInput), '命中率照缓存读 ÷ 主请求的输入');
});

test('清空以后上下文那一格不写，构成也不留', () => {
  const cleared = [...sampleLog(), { seq: 999, kind: 'context.compacted', body: { trigger: 'clear' } }];
  assert.equal(part(cleared, 'context', { window: 1_000_000 }), undefined);
  assert.ok(part(cleared, 'total', { window: 1_000_000 }), '累计还留着');
});

test('只读开着写只读；还是 0 的格子不写', () => {
  const f = footer(sampleLog(52), {});
  assert.equal(f.left.label, '⏸ 只读');
  const fresh = footer(sampleLog(1), { window: 1_000_000 });
  assert.equal(fresh.left.model, null);
  assert.deepEqual(fresh.right, []);
});

test('放不下时先丢速度、再丢累计，上下文留到最后', () => {
  const parts = partsOf(sampleLog(), { window: 1_000_000 });
  const width = (ps) => ps.map((p) => p.text).join(' · ').length;
  const kept = (room) => fit(parts, room, width).map((p) => p.key);
  assert.deepEqual(kept(100), ['speed', 'context', 'total']);
  assert.deepEqual(kept(30), ['context', 'total']);
  assert.deepEqual(kept(20), ['context']);
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

test('核心切了级别（session.policy_changed）底栏跟着换：只读盖过常用的那一级', () => {
  const created = { seq: 1, kind: 'session.created', body: { permission: { level: 'workspace', read_only: false } } };
  const changed = (permission) => ({ seq: 2, kind: 'session.policy_changed', body: { permission } });
  assert.equal(footer([created, changed({ level: 'full', read_only: false })], {}).left.level, 'full');
  assert.equal(footer([created, changed({ level: 'full', read_only: true })], {}).left.level, 'read_only');
});
