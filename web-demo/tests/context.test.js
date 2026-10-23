// @ts-check
//! 上下文明细、累计按用途（蓝图 `web.md`「上下文明细、累计按用途」第 3、4 条）：怎么摊、横条一段多宽、百分比的写法、用途怎么归、怎么排。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaledParts, bar, share, toneOf, useRows } from '../src/model/context.js';
import { previewPart } from '../src/model/footer.js';
import { loadRes } from './support.js';

loadRes();

const SAMPLE = {
  window: 128000, line: 102400, used: 45231, basis: 'measured', anchor: 41000, estimated_total: 43800,
  parts: [
    { part: 'system', label: '系统提示', tokens: 6100, children: [{ part: 'system.skills', label: '技能目录', tokens: 900 }, { part: 'system.other', label: '人设和其余说明', tokens: 5200 }] },
    { part: 'tools', label: '工具说明', tokens: 9800 },
    { part: 'summary', label: '检查点摘要', tokens: 2100 },
    { part: 'messages', label: '对话', tokens: 25800, children: [{ part: 'messages.memory', label: '记忆', tokens: 1100, children: [{ part: 'messages.memory.resident', label: '常驻记忆', tokens: 800 }] }] },
  ],
};

test('给了 used 的照 used/原值之和摊，连子项；顶层加起来约等于 used', () => {
  const parts = scaledParts(SAMPLE);
  const k = 45231 / 43800;
  assert.equal(parts[0].tokens, Math.round(6100 * k));
  assert.equal(parts[0].children?.[1].tokens, Math.round(5200 * k));
  assert.equal(parts[3].children?.[0].children?.[0].tokens, Math.round(800 * k));
  const sum = parts.reduce((n, p) => n + p.tokens, 0);
  assert.ok(Math.abs(sum - 45231) <= parts.length);
});

test('核心摊好了（顶层之和等于 used）、没给 used 的照原值；0 的块不要', () => {
  const done = { used: 300, parts: [{ part: 'system', label: 's', tokens: 100 }, { part: 'messages', label: 'm', tokens: 200 }, { part: 'demos', label: 'd', tokens: 0 }] };
  assert.deepEqual(scaledParts(done).map((p) => p.tokens), [100, 200]);
  const raw = { parts: [{ part: 'tools', label: 't', tokens: 50 }] };
  assert.deepEqual(scaledParts(raw).map((p) => p.tokens), [50]);
  assert.deepEqual(scaledParts(/** @type {any} */ ({})), []);
});

test('横条照窗口算一段多宽、压缩线在哪；没窗口的照用了多少当满格、不画线', () => {
  const parts = [{ part: 'system', label: '', tokens: 32000 }, { part: 'messages', label: '', tokens: 64000 }];
  const b = bar({ window: 128000, line: 102400 }, parts);
  assert.deepEqual(b.segments, [{ part: 'system', ratio: 0.25 }, { part: 'messages', ratio: 0.5 }]);
  assert.equal(b.line, 0.8);
  const n = bar({}, parts);
  assert.equal(n.full, 96000);
  assert.equal(n.line, null);
});

test('百分比一位小数，用了一点又不到 0.1 的写 <0.1；颜色照顶层那一块', () => {
  assert.equal(share(45231, 128000), '35.3');
  assert.equal(share(10, 128000), '<0.1');
  assert.equal(share(0, 128000), '0.0');
  assert.equal(toneOf('messages.memory.recall'), 'gold');
  assert.equal(toneOf('tools.mcp:notes'), 't-thought');
  assert.equal(toneOf('whatever'), 'text-faint');
});

test('用途：不认得的归 other、加起来，照 token 从多到少排，0 的不要，花费照币种加', () => {
  const u = (n) => ({ uncached: n, cache_read: 0, cache_write: 0, output: 0 });
  const rows = useRows([
    { use: 'main', usage: u(500), amounts: [{ currency: 'USD', amount: 0.5 }] },
    { use: 'compaction', usage: u(900), amounts: [] },
    { use: 'vision-ish', usage: u(30), amounts: [{ currency: 'USD', amount: 0.01 }] },
    { use: 'other', usage: u(20), amounts: [{ currency: 'USD', amount: 0.02 }] },
    { use: 'recap', usage: u(0), amounts: [] },
  ]);
  assert.deepEqual(rows.map((r) => [r.use, r.tokens]), [['compaction', 900], ['main', 500], ['other', 50]]);
  assert.deepEqual(rows[2].amounts, [{ currency: 'USD', amount: 0.03 }]);
});

test('新会话的上下文那一格照预览写，写法同开了的；没有数的不写', () => {
  assert.deepEqual(previewPart({ used: 3434, window: 1000000 }), { key: 'context', text: '3.4k/1M(0.3%)' });
  assert.deepEqual(previewPart({ used: 3434 }), { key: 'context', text: '3.4k' });
  assert.equal(previewPart({ used: 0 }), null);
  assert.equal(previewPart(null), null);
});
