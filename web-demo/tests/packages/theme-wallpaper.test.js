// @ts-check
//! 主题「跟随壁纸」跟着换（蓝图 `web.md`「跟着人格的外观」第 5 条）：问着的时候又推来「换了」的，问完再问一次（2026-10-15 项目主人验收
//! W-163：换了壁纸没跟着变）；一时问不到（网页服务在算、连接断了）的留着原来那一套，只有网页服务说没有壁纸的才拿掉（同一条：刷新后
//! 「跟随壁纸」不见了）。

import { test } from 'node:test';
import assert from 'node:assert/strict';

// 包里用到的几样浏览器的东西
const listeners = { add() {}, remove() {} };
Object.assign(globalThis, {
  document: { hidden: false, addEventListener: listeners.add, removeEventListener: listeners.remove },
  window: { addEventListener: listeners.add, removeEventListener: listeners.remove },
  matchMedia: () => ({ matches: true }),
});
const { apply } = await import('../../packages/theme-wallpaper/index.js');

/** 一个等着答的问：`answer` 交回结果，`fail` 交回错 */
function deferred() {
  let answer = (/** @type {any} */ _v) => {};
  let fail = (/** @type {any} */ _e) => {};
  const promise = new Promise((res, rej) => { answer = res; fail = rej; });
  return { promise, answer, fail };
}

/** 假的 ctx：记下挂着的那一套，问壁纸照 `asks` 一个个交 */
function harness() {
  /** @type {ReturnType<typeof deferred>[]} */
  const asks = [];
  const state = { mounted: /** @type {any} */ (null), changed: () => {} };
  const ctx = {
    config: { seed: '' },
    text: () => '跟随壁纸',
    effect: (/** @type {() => any} */ fn) => fn(),
    on: () => {},
    watchConfig: () => {},
    packages: { set: async () => {} },
    slots: {
      mount: (/** @type {string} */ _slot, /** @type {any} */ item) => {
        state.mounted = item;
        return () => { if (state.mounted === item) state.mounted = null; };
      },
    },
    host: {
      wallpaper: () => { const d = deferred(); asks.push(d); return d.promise; },
      wallpaperChanges: (/** @type {() => void} */ changed) => { state.changed = changed; return () => {}; },
    },
  };
  return { ctx, asks, state };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('问着的时候又推来「换了」：问完再问一次，挂的是新壁纸的颜色', async () => {
  const { ctx, asks, state } = harness();
  apply(ctx);
  assert.equal(asks.length, 1, '一起来先问一次');
  asks[0].answer({ sig: 'a', kind: 'image', seeds: ['#112233'] });
  await tick();
  assert.equal(state.mounted?.seeds?.().current, '#112233');
  // 换了壁纸：推来一次，网页服务在算（还没答）时又推来一次
  state.changed();
  await tick();
  assert.equal(asks.length, 2);
  state.changed();
  await tick();
  asks[1].answer({ sig: 'a', kind: 'image', seeds: ['#112233'] });
  await tick();
  assert.equal(asks.length, 3, '问着时推来的那次没丢：问完接着再问');
  asks[2].answer({ sig: 'b', kind: 'image', seeds: ['#445566'] });
  await tick();
  assert.equal(state.mounted?.seeds?.().current, '#445566');
});

test('一时问不到（出错）留着原来那一套；网页服务说没有壁纸（null）才拿掉', async () => {
  const { ctx, asks, state } = harness();
  apply(ctx);
  asks[0].answer({ sig: 'a', kind: 'image', seeds: ['#112233'] });
  await tick();
  state.changed();
  await tick();
  asks[1].fail(new TypeError('NetworkError when attempting to fetch resource.'));
  await tick();
  assert.equal(state.mounted?.seeds?.().current, '#112233', '出错的不拿掉');
  state.changed();
  await tick();
  asks[2].answer({ sig: 'b', kind: 'image', seeds: ['#445566'] });
  await tick();
  assert.equal(state.mounted?.seeds?.().current, '#445566', '出错以后照样跟上');
  state.changed();
  await tick();
  asks[3].answer(null);
  await tick();
  assert.equal(state.mounted, null, '没有壁纸的拿掉');
});
