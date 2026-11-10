// @ts-check
//! 软件包 rail（右边的跳转条）：正在看哪一句；列哪几句（核心列的拼上画出来的，W-1069）；清单合法（出厂值过得了自己的校验）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reading } from '../../packages/rail/reading.js';
import { listed } from '../../packages/rail/listed.js';
import { PromptRail } from '../../packages/rail/rail.js';
import { problems } from '../../src/kernel/config.js';

test('跳转条上正在看哪一句：顶边在视口上面三分之一以内的最后一句；一句都没到的算第一句', () => {
  // 视口 900 高：三分之一是 297
  assert.equal(reading([-800, -100, 200, 700], 900, 0.33), 2);
  assert.equal(reading([-800, -100, 400, 700], 900, 0.33), 1);
  assert.equal(reading([350, 700], 900, 0.33), 0);
  assert.equal(reading([], 900, 0.33), -1);
});

test('清单：出厂值过得了自己的校验', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../packages/rail/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(problems(manifest.settings), []);
});

test('列哪几句：照核心列的全部，画出来的带上节点、照原话；刚说的接在后面；问不到核心的只照画出来的（W-1069）', () => {
  const node = /** @type {any} */ ({});
  const shown = [
    { key: 'm40', seq: 40, text: '第四十句\n第二行', node, mine: true },
    { key: 'm44', seq: 44, text: '子代理派来的', node, mine: false },
    { key: 'm50', seq: 50, text: '刚说的', node, mine: true },
  ];
  const asked = [{ seq: 3, text: '最早那句' }, { seq: 40, text: '第四十句' }];
  assert.deepEqual(listed(asked, shown), [
    { seq: 3, text: '最早那句', node: null },
    { seq: 40, text: '第四十句\n第二行', node },
    { seq: 50, text: '刚说的', node },
  ], '没读进来的没有节点；别人说的照核心不列；核心还没列的你刚说的接上');
  assert.deepEqual(listed(null, shown).map((p) => p.seq), [40, 44, 50], '旧核心照画出来的');
  assert.deepEqual(listed([], []), []);
});

test('跳到一句：先告诉对话区人离开了底下，再平滑滚过去——读更早的几页花的时间长了，也不被「跟着最新的」拉回底下（W-1148）', () => {
  /** @type {string[]} */
  const did = [];
  const box = (/** @type {number} */ top) => ({ getBoundingClientRect: () => ({ top }) });
  const rail = {
    config: { jump_margin: 24 },
    chat: { leave: () => did.push('leave') },
    scroller: { ...box(100), scrollTop: 5000, scrollTo: (/** @type {any} */ to) => did.push(`scroll ${to.top} ${to.behavior}`) },
  };
  PromptRail.prototype.scrollTo.call(/** @type {any} */ (rail), /** @type {any} */ (box(-900)));
  assert.deepEqual(did, ['leave', 'scroll 3976 smooth']);
  // 旧的对话区服务没有 `leave` 的照旧滚
  did.length = 0;
  PromptRail.prototype.scrollTo.call(/** @type {any} */ ({ ...rail, chat: {} }), /** @type {any} */ (box(-900)));
  assert.deepEqual(did, ['scroll 3976 smooth']);
});
