// @ts-check
//! 第一次引导里一格一格变的几样（软件包 `welcome` 的 `twinkle.js`，蓝图 `web.md`「动效」第 4 条）：亮度照原来 CSS `steps()` 动画的那几档，
//! 星点各颗错开着换；减少动画的只摆好不动、不开计时器。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLINK, STAR, TICK_MS, starLevel, twinkle } from '../../packages/welcome/twinkle.js';

/** 假的元素：只有 `style` 的三个方法。 */
const fake = () => {
  const props = new Map();
  return { props, style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k), getPropertyValue: (k) => props.get(k) ?? '' } };
};

test('闪的四格照原来 wl-blink（一秒一轮、steps(2)、50% 处 0.25）；星点六档照原来 wl-twinkle（steps(3)、0.15 → 0.7 → 0.15）', () => {
  assert.deepEqual(BLINK, [1, 0.625, 0.25, 0.625]);
  assert.equal(BLINK.length * TICK_MS, 1000);
  assert.deepEqual(STAR, [0.15, 0.333, 0.517, 0.7, 0.517, 0.333]);
});

test('星点：每颗一秒换一档、在自己那一格换，四格错开；六档走一圈回到起点', () => {
  for (let slot = 0; slot < 4; slot += 1) {
    const changes = [];
    for (let tick = 1; tick <= 24; tick += 1) if (starLevel(tick, 0, slot) !== starLevel(tick - 1, 0, slot)) changes.push(tick);
    // 第 0 档 → 第 1 档 …… 有几档一样（0.517、0.333 各出现两次），只数和上一格不一样的
    assert.ok(changes.every((t) => (t - 1 - slot) % 4 === 0), `slot ${slot} 在自己那一格换：${changes}`);
    assert.equal(starLevel(24, 0, slot), starLevel(0, 0, slot));
  }
  assert.equal(starLevel(0, 3, 0), 0.7);
  assert.equal(starLevel(1, 3, 0), 0.517);
});

test('减少动画的：星点摆好、闪的那几样不暗，不开计时器', () => {
  globalThis.getComputedStyle = /** @type {any} */ (() => ({ getPropertyValue: () => '1' }));
  const layer = fake();
  const stars = [fake(), fake()];
  const stop = twinkle(/** @type {any} */ (layer), /** @type {any} */ (stars), { reduced: true, random: () => 0.5 });
  assert.equal(layer.props.has('--wl-blink'), false);
  assert.equal(stars[0].props.get('--o'), String(STAR[3]));
  stop();
});

test('开着的：闪的写在整层上，每格换一下；停掉以后不再换', async () => {
  globalThis.getComputedStyle = /** @type {any} */ (() => ({ getPropertyValue: () => '0.02' }));
  globalThis.document = /** @type {any} */ ({ hidden: false });
  const layer = fake();
  let writes = 0;
  const set = layer.style.setProperty;
  layer.style.setProperty = (k, v) => { writes += 1; set(k, v); };
  const stars = [fake()];
  const stop = twinkle(/** @type {any} */ (layer), /** @type {any} */ (stars), { random: () => 0 });
  assert.equal(layer.props.get('--wl-blink'), '1');
  await new Promise((done) => setTimeout(done, 40));
  stop();
  assert.ok(writes >= 3, `换了 ${writes} 下`);
  const after = writes;
  await new Promise((done) => setTimeout(done, 30));
  assert.equal(writes, after);
});
