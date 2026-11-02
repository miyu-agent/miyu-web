// @ts-check
//! 独占的挂载位画进一个节点（`src/lib/mount.js` 的 `mountSingle`，左上角 `sidebar.brand`，2026-11-02）：有挂的照它画、原来那一块藏起来，
//! 交 `null` 的什么都不画（藏掉），后挂的盖住先挂的，拿掉了露出原来的；抛错的画「这一块出错了」。node 里没有 DOM：用最小的假节点。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSingle } from '../src/lib/mount.js';

class FakeNode {
  constructor(/** @type {string} */ name) { this.name = name; /** @type {any} */ this.parentNode = null; }
}
// @ts-ignore 最小的 Node：mountSingle 只用 instanceof
globalThis.Node ??= FakeNode;
const Base = /** @type {any} */ (globalThis.Node);
const node = (/** @type {string} */ name) => Object.assign(Object.create(Base.prototype), { name, parentNode: null });

function fakeHost() {
  /** @type {any[]} */
  const kids = [];
  const host = /** @type {any} */ ({
    hidden: true, kids,
    append: (/** @type {any} */ n) => { kids.push(n); n.parentNode = { removeChild: (/** @type {any} */ x) => kids.splice(kids.indexOf(x), 1) }; },
  });
  return host;
}

function fakeSlots() {
  /** @type {any[]} */
  let stack = [];
  /** @type {Set<() => void>} */
  const watchers = new Set();
  const changed = () => { for (const fn of [...watchers]) fn(); };
  return {
    single: () => stack.at(-1) ?? null,
    list: () => stack,
    watch: (/** @type {string} */ _name, /** @type {() => void} */ fn) => { watchers.add(fn); return () => watchers.delete(fn); },
    draw: (/** @type {any} */ e) => { try { return e.render(); } catch (err) { return { failed: true, owner: e.owner, reason: String(err) }; } },
    mount: (/** @type {any} */ e) => { stack = [...stack, e]; changed(); return () => { stack = stack.filter((x) => x !== e); changed(); }; },
  };
}

test('左上角那一块：有挂的照它画、原来的藏起来；交 null 的藏掉；后挂的盖住先挂的；拿掉了露出原来的；抛错的画出错', () => {
  const host = fakeHost();
  const slots = fakeSlots();
  /** @type {boolean[]} */
  const shown = [];
  const failed = (/** @type {string} */ owner, /** @type {string} */ reason) => node(`failed:${owner}:${reason.slice(0, 10)}`);
  const stop = mountSingle(host, slots, 'sidebar.brand', failed, (on) => shown.push(on));
  assert.deepEqual(shown, [false]);
  assert.equal(host.hidden, true);
  const off1 = slots.mount({ id: 'a', owner: 'theme-a', render: () => node('字标 A') });
  assert.deepEqual(host.kids.map((k) => k.name), ['字标 A']);
  assert.equal(host.hidden, false);
  assert.equal(shown.at(-1), true, '原来的头像、名字藏起来');
  const off2 = slots.mount({ id: 'b', owner: 'theme-b', render: () => null });
  assert.deepEqual(host.kids, [], '交 null：两样都不画');
  assert.equal(host.hidden, true);
  assert.equal(shown.at(-1), true);
  off2();
  assert.deepEqual(host.kids.map((k) => k.name), ['字标 A'], '拿掉后挂的：露出先挂的');
  off1();
  assert.deepEqual(host.kids, []);
  assert.equal(shown.at(-1), false, '都拿掉了：照原来的画');
  slots.mount({ id: 'c', owner: 'theme-c', render: () => { throw new Error('坏了'); } });
  assert.match(host.kids[0].name, /^failed:theme-c:/);
  stop();
  assert.deepEqual(host.kids, []);
  assert.equal(shown.at(-1), false);
});
