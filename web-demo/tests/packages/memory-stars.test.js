// @ts-check
//! 整理那一块下面的星空（`packages/memory/stars.js`，蓝图「记忆页」第 13 条；2026-10-20 项目主人选的「星空」）：一条记忆一颗星，
//! 并进别的滑过去、过时的淡掉，合完一批连成星座；放不下的整理过的缩成星尘。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sky, MAX_STARS } from '../../packages/memory/stars.js';

/** 推到都停了 @param {Sky} s */
const run = (s, from = 0) => {
  let now = from;
  for (let i = 0; i < 400; i++) { now += 16; s.step(now, true); }
  return now;
};

test('读进来一条一颗星；同一条读两次不多出一颗；同一个编号每次的样子、位置一样', () => {
  const s = new Sky();
  s.resize(600, 120);
  s.add('m1', 0); s.add('m2', 0); s.add('m1', 0);
  assert.equal(s.live().length, 2);
  const again = new Sky();
  again.resize(600, 120);
  again.add('m1', 0);
  const [a, b] = [s.byId.get('m1'), again.byId.get('m1')];
  assert.deepEqual([a?.x, a?.y, a?.shape, a?.color, a?.size], [b?.x, b?.y, b?.shape, b?.color, b?.size]);
});

test('大小、形状、颜色不统一：几十颗里有大有小、几种形状、几种颜色', () => {
  const s = new Sky();
  s.resize(600, 120);
  for (let i = 1; i <= 60; i++) s.add(`m${i}`, 0);
  const stars = s.live();
  assert.ok(new Set(stars.map((x) => x.shape)).size >= 3);
  assert.ok(new Set(stars.map((x) => x.color)).size >= 4);
  assert.ok(Math.max(...stars.map((x) => x.size)) > 2 * Math.min(...stars.map((x) => x.size)));
  for (const x of stars) assert.ok(x.x > 0 && x.x < 600 && x.y > 0 && x.y < 120);
});

test('并进留下的那颗：滑过去、那颗大一点；过时的、找不到的淡掉；跟着滑到最后留下的', () => {
  const s = new Sky();
  for (const id of ['a', 'b', 'c', 'd']) s.add(id, 0);
  const before = /** @type {number} */ (s.byId.get('c')?.size);
  s.merge('a', 'b', 0);
  s.merge('b', 'c', 0);
  s.merge('d', 'zz', 0);
  run(s);
  assert.equal(s.live().map((x) => x.id).join(), 'c');
  assert.ok(/** @type {number} */ (s.byId.get('c')?.size) > before);
  assert.ok(s.byId.get('d')?.gone);
});

test('合完一批连成星座：星不挪、不重复连、太远的不连；整理完从中间顺着线一颗颗亮', () => {
  const s = new Sky();
  s.resize(600, 120);
  for (let i = 1; i <= 20; i++) s.add(`m${i}`, 0);
  const at = s.live().map((x) => [x.x, x.y].join());
  s.settle(0);
  assert.deepEqual(s.live().map((x) => [x.x, x.y].join()), at);
  assert.ok(s.links.length > 0);
  for (const l of s.links) assert.ok(Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y) <= 600 * 0.18);
  const n = s.links.length;
  s.settle(0);
  assert.equal(s.links.length, n);
  s.finish(1000);
  const lit = s.live().map((x) => x.lit);
  assert.equal(Math.min(...lit), 1000);
  assert.ok(Math.max(...lit) > 1000);
});

test(`放不下：多于 ${MAX_STARS} 颗时，最早一颗整理过的缩成星尘`, () => {
  const s = new Sky();
  s.resize(600, 120);
  for (let i = 1; i <= MAX_STARS; i++) s.add(`m${i}`, 0);
  s.settle(0);
  const dust = s.dust.length;
  for (let i = 1; i <= 10; i++) s.add(`n${i}`, 0);
  assert.equal(s.live().length, MAX_STARS);
  run(s);
  assert.equal(s.dust.length, dust + 10);
});

test('老核心只说一批几条：照条数出星', () => {
  const s = new Sky();
  s.addMany(3, 0);
  assert.equal(s.live().length, 3);
});
