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

test('合完一批：留下的就地连起来（每个连最近的两个），点不挪；并走了的线跟着拿掉', () => {
  const d = new Dots();
  d.resize(600, 96);
  for (let i = 1; i <= 10; i++) d.add(`m${i}`);
  const before = d.live().map((x) => [x.x, x.y].join());
  d.settle(0);
  assert.deepEqual(d.live().map((x) => [x.x, x.y].join()), before);
  assert.ok(d.links.length >= 5 && d.links.length <= 20, String(d.links.length));
  const n = d.links.length;
  d.settle(0);
  assert.equal(d.links.length, n, '再合一次不重复连');
  const one = d.links[0].a;
  d.merge(one.id, null, 0);
  assert.ok(d.links.every((l) => l.a !== one && l.b !== one));
});

test('点在这一条里随意找空地：都在里面、不重叠；同一个编号每次找的地方一样；点多了变小', () => {
  const d = new Dots();
  d.resize(600, 96);
  for (let i = 1; i <= 120; i++) d.add(`m${i}`);
  assert.equal(d.r, 2);
  const pts = d.dots.map((x) => [x.x, x.y]);
  for (const [x, y] of pts) assert.ok(x > 0 && x < 600 && y > 0 && y < 96);
  let close = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) < 2 * d.r) close++;
  assert.equal(close, 0);
  const again = new Dots();
  again.resize(600, 96);
  again.add('m1');
  const first = new Dots();
  first.resize(600, 96);
  first.add('m1');
  assert.deepEqual([again.dots[0].x, again.dots[0].y], [first.dots[0].x, first.dots[0].y]);
});

test('老核心只说一批几条：照条数出点', () => {
  const d = new Dots();
  d.addMany(3);
  assert.equal(d.live().length, 3);
});

test('合完一圈一圈点亮：从离中间最近的那个点起，顺着线越远越晚；线上跑的光点只在长完的线上放', () => {
  const d = new Dots();
  d.resize(600, 96);
  for (let i = 1; i <= 12; i++) d.add(`m${i}`);
  d.settle(0);
  d.step(10, false);
  assert.equal(d.pulses.length, 0, '线还没长完');
  d.step(2000, false);
  assert.ok(d.pulses.length >= 1);
  d.finish(5000);
  const at = d.live().map((x) => x.waveAt);
  assert.ok(at.every((t) => t >= 5000));
  assert.equal(Math.min(...at), 5000);
  assert.ok(Math.max(...at) > 5000);
});
