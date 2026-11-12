// `/status` 会话状态要写的几行（W-1152）：照页面已经有的数，没有的那一行不写。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { statusRows } from '../src/model/status.js';
import { t } from '../src/util/res.js';

await loadRes();

const tt = (key, fields) => t(`status_box.${key}`, fields);
const u = (uncached, cache_read, output) => ({ uncached, cache_read, cache_write: 0, output });
const facts = {
  id: 's-1', title: '修登录页', persona: '小美', preset: '默认', level: '开放权限', cwd: '~/work', effort: '高',
  status: {
    model: { endpoint: 'deepseek', model: 'deepseek-v4' },
    context: { used: 41_200, window: 1_000_000, compaction_line: 850_000, context: 128_000 },
    usage: { usage: u(1000, 99_000, 5000), compactions: 2, cache_breaks: 1, amounts: [], converted: { currency: 'CNY', amount: 0.42 } },
  },
};
const text = (f) => Object.fromEntries(statusRows(f, tt).map((r) => [r.key, r.value]));

test('开着的会话：一行一样，上下文接会话上限，累计连输入输出，缓存写命中和断裂', () => {
  const got = text(facts);
  assert.deepEqual(Object.keys(got), ['id', 'title', 'persona', 'preset', 'level', 'cwd', 'model', 'context', 'compaction', 'usage', 'cache', 'cost']);
  assert.equal(got.model, 'deepseek/deepseek-v4 · 思考 高 · 窗口 1M');
  assert.equal(got.context, '41.2k / 1M（4.1%） · 会话上限 128k');
  assert.equal(got.compaction, '已压缩 2 次 · 到 850k 自动压缩');
  assert.equal(got.usage, '105k（输入 100k · 输出 5k）');
  assert.equal(got.cache, '命中 99% · 断裂 1 次');
  assert.equal(got.cost, '¥0.42');
});

test('连子代理的照 usage_tree；没有的行不写；窗口照订阅回应的限额', () => {
  const tree = { usage: u(2000, 8000, 1000) };
  assert.equal(text({ ...facts, status: { ...facts.status, usage_tree: tree } }).usage, '11k（输入 10k · 输出 1k）');
  const bare = text({ id: 's-2', title: null, persona: '无人格', preset: null, level: null, cwd: null, effort: null, status: { context: { used: 500 } }, limits: { window: 200_000 } });
  assert.deepEqual(Object.keys(bare), ['id', 'persona', 'context']);
  assert.equal(bare.context, '500 / 200k（0.3%）');
  assert.deepEqual(Object.keys(text({ ...facts, status: null })), ['id', 'title', 'persona', 'preset', 'level', 'cwd']);
});

test('压缩那一行：会话钉了压缩线的（核心 CT-1，view.status 顶层的 compaction_line，百分数）接「这个会话 70%」；没钉的不写（W-1163）', () => {
  const tr = (/** @type {string} */ key, /** @type {any} */ fields) => t(`status_box.${key}`, fields);
  const base = { id: 's1', title: null, persona: null, preset: null, level: null, cwd: null, effort: null };
  const pinned = statusRows({ ...base, status: { compaction_line: 70, context: { window: 128000, compaction_line: 89600, used: 1000 }, usage: { compactions: 1 } } }, tr);
  const row = pinned.find((r) => r.key === 'compaction');
  assert.match(row?.value ?? '', /这个会话 70%/);
  const plain = statusRows({ ...base, status: { context: { window: 128000, compaction_line: 108800, used: 1000 }, usage: { compactions: 0 } } }, tr);
  assert.doesNotMatch(plain.find((r) => r.key === 'compaction')?.value ?? '', /这个会话/);
});
