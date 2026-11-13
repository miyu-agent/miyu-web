// @ts-check
//! 手机上设置页的返回键（`packages/settings/back-history.js`，2026-11-13 主人验 check 7）：开着时垫一层历史，按返回退一步、还开着的再垫一层，
//! 退到关掉为止；从别处关掉的把垫的那一层收回去。

import { test } from 'node:test';
import assert from 'node:assert/strict';

/** 假的浏览器历史：记着垫了几层、`back` 发一次 `popstate`。 */
function fakeBrowser() {
  /** @type {Set<() => void>} */
  const pops = new Set();
  const state = { depth: 0 };
  globalThis.window = /** @type {any} */ ({
    addEventListener: (/** @type {string} */ _, /** @type {() => void} */ fn) => pops.add(fn),
    removeEventListener: (/** @type {string} */ _, /** @type {() => void} */ fn) => pops.delete(fn),
  });
  globalThis.history = /** @type {any} */ ({
    pushState: () => { state.depth += 1; },
    back: () => { state.depth -= 1; for (const fn of [...pops]) fn(); },
  });
  return state;
}

test('返回键一层层退：点进去的一层、这一页、分页列表，退到关掉为止，历史不多也不少', async () => {
  const { BackHistory } = await import('../../packages/settings/back-history.js');
  const browser = fakeBrowser();
  const steps = ['sub', 'page', 'close'];
  /** @type {string[]} */
  const done = [];
  const backs = new BackHistory(() => {
    const s = /** @type {string} */ (steps.shift());
    done.push(s);
    if (s === 'close') backs.stop();
    return s !== 'close';
  });
  backs.start();
  assert.equal(browser.depth, 1, '开着时垫一层');
  history.back();
  history.back();
  assert.equal(browser.depth, 1, '退一步还开着的再垫一层');
  history.back();
  assert.deepEqual(done, ['sub', 'page', 'close']);
  assert.equal(browser.depth, 0, '关掉以后不多垫，也不多退');
});

test('从别处关掉（✕、Esc）：把垫的那一层收回去，不再听返回键', async () => {
  const { BackHistory } = await import('../../packages/settings/back-history.js');
  const browser = fakeBrowser();
  let stepped = 0;
  const backs = new BackHistory(() => { stepped += 1; return true; });
  backs.start();
  backs.stop();
  assert.equal(browser.depth, 0);
  assert.equal(stepped, 0, '收回去那一下不算退一步');
});
