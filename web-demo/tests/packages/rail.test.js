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

test('点横线不跳：打开浮层并钉住，指针离开不收；点外面、Esc 才收（2026-11-14 主人验收：不知道每条横线是什么）', () => {
  /** @type {Map<string, Function>} */
  const heard = new Map();
  const doc = {
    addEventListener: (/** @type {string} */ type, /** @type {Function} */ f) => heard.set(type, f),
    removeEventListener: (/** @type {string} */ type) => heard.delete(type),
  };
  const classes = new Set();
  const pop = { classList: { add: (/** @type {string} */ c) => classes.add(c), remove: (/** @type {string} */ c) => classes.delete(c), contains: (/** @type {string} */ c) => classes.has(c) } };
  const inside = {};
  /** @type {number[]} */
  const jumped = [];
  const rail = Object.assign(Object.create(PromptRail.prototype), {
    pop, doc, pinned: false, closeTimer: 0, current: -1, list: { children: [] }, config: { close_ms: 0 },
    el: { contains: (/** @type {any} */ n) => n === inside },
    jump: (/** @type {number} */ seq) => jumped.push(seq),
  });
  rail.onOutside = (/** @type {any} */ e) => { if (!rail.el.contains(e.target)) rail.unpin(); };
  rail.onKey = (/** @type {any} */ e) => { if (e.key === 'Escape') rail.unpin(); };
  rail.pin();
  assert.equal(classes.has('is-open'), true, '打开了浮层');
  assert.deepEqual(jumped, [], '没有跳');
  rail.show(false);
  assert.equal(classes.has('is-open'), true, '钉住了指针离开不收');
  heard.get('pointerdown')?.({ target: inside });
  assert.equal(classes.has('is-open'), true, '点浮层里面不收');
  heard.get('pointerdown')?.({ target: {} });
  assert.equal(classes.has('is-open'), false, '点外面收起');
  assert.equal(heard.size, 0, '收了以后不再听');
  rail.pin();
  heard.get('keydown')?.({ key: 'Escape', preventDefault() {} });
  assert.equal(classes.has('is-open'), false, 'Esc 收起');
});

test('横线的点击交给 pin，不交给 jump', () => {
  const src = readFileSync(new URL('../../packages/rail/rail.js', import.meta.url), 'utf8');
  const line = src.split('\n').find((l) => l.includes("button.rail-line"));
  assert.ok(line?.includes('onclick: () => this.pin()'), line);
});
