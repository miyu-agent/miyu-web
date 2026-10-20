// @ts-check
//! 整理那一块下面的光点（`packages/memory/dots.js`，蓝图「记忆页」第 13 条；2026-10-20 项目主人选的「光点合并」）：读进来一条一个点，
//! 并进别的飞过去、过时的淡掉，合完一批留下的挪到左边那一堆；点多了变小、不重叠。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dots } from '../../packages/memory/dots.js';

/** 推到都停了（最多 400 帧） @param {Dots} d */
const settle = (d, from = 0) => {
  let now = from;
  for (let i = 0; i < 400; i++) { now += 16; d.step(now, true); }
  return now;
};

test('读进来一条一个点；同一条读两次不多出一个点', () => {
  const d = new Dots();
  d.add('m1'); d.add('m2'); d.add('m1');
  assert.equal(d.live().length, 2);
});

test('并进留下的那条：飞过去、那个点大一圈；过时的、留下的找不到的淡掉', () => {
  const d = new Dots();
  for (const id of ['m1', 'm2', 'm3', 'm4']) d.add(id);
  d.merge('m1', 'm2', 0);
  d.merge('m3', null, 0);
  d.merge('m4', 'm99', 0);
  assert.equal(d.live().length, 1, '只剩 m2');
  settle(d);
  assert.equal(d.byId.get('m2')?.grow, 1);
  assert.ok(d.byId.get('m1')?.gone && d.byId.get('m3')?.gone && d.byId.get('m4')?.gone);
});

test('并进的那条后来也被并走了：跟着飞到最后留下的那条', () => {
  const d = new Dots();
  for (const id of ['a', 'b', 'c']) d.add(id);
  d.merge('a', 'b', 0);
  d.merge('b', 'c', 0);
  settle(d);
  assert.equal(d.live().map((x) => x.id).join(), 'c');
  assert.equal(d.byId.get('c')?.grow, 2);
});

test('合完一批：留下的挪到左边那一堆，下一批的在右边', () => {
  const d = new Dots();
  d.resize(600, 96);
  for (let i = 1; i <= 10; i++) d.add(`m${i}`);
  d.settle();
  for (let i = 11; i <= 20; i++) d.add(`m${i}`);
  const left = Math.max(...d.dots.filter((x) => x.settled).map((x) => /** @type {number} */ (x.tx)));
  const right = Math.min(...d.dots.filter((x) => !x.settled).map((x) => /** @type {number} */ (x.tx)));
  assert.ok(left < right, `${left} < ${right}`);
});

test('点多了变小，排出来的位置不重叠、都在这一条里面', () => {
  const d = new Dots();
  d.resize(600, 96);
  for (let i = 1; i <= 120; i++) d.add(`m${i}`);
  assert.equal(d.r, 2);
  const pts = d.dots.map((x) => [/** @type {number} */ (x.tx), x.ty]);
  for (const [x, y] of pts) assert.ok(x > 0 && x < 600 && y > 0 && y < 96);
  let close = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < 2 * d.r) close++;
  assert.equal(close, 0);
});

test('老核心只说一批几条：照条数出点', () => {
  const d = new Dots();
  d.addMany(3);
  assert.equal(d.live().length, 3);
});
