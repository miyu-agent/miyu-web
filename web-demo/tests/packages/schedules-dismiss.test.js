// @ts-check
//! 设置框外面开的定时任务浮窗按 `Esc` 收起（软件包 `schedules` 的 `dismiss.js`，2026-11-14 W-1181 走查：详情只能点 ✕、点遮罩关）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escDismisses } from '../../packages/schedules/dismiss.js';

/** 假的元素：记下收到的 `set-dismiss`；`inner` 是浮窗里开着的菜单 @param {string} name @param {any[]} [inner] */
const el = (name, inner = []) => {
  const got = [];
  return { name, got, inner, isConnected: true, querySelectorAll: () => inner, dispatchEvent: (/** @type {any} */ e) => { got.push(e.type); return true; } };
};
/** 假的 document：照登记的顺序派 keydown，`modals` 是页面上的几张浮窗（后面的在上面） @param {any[]} modals */
const page = (modals) => {
  /** @type {Set<(e: any) => void>} */
  const listeners = new Set();
  return {
    modals,
    querySelectorAll: () => modals,
    addEventListener: (/** @type {string} */ _t, /** @type {any} */ f) => listeners.add(f),
    removeEventListener: (/** @type {string} */ _t, /** @type {any} */ f) => listeners.delete(f),
    press(/** @type {string} */ key, prevented = false) {
      const e = { key, defaultPrevented: prevented, preventDefault() { this.defaultPrevented = true; } };
      for (const f of listeners) f(e);
      return e;
    },
    get count() { return listeners.size; },
  };
};

test('Esc 收起浮窗：发给它 set-dismiss；别的键、别处处理过的不管', () => {
  const modal = el('detail');
  const doc = page([modal]);
  escDismisses(/** @type {any} */ (modal), /** @type {any} */ (doc));
  doc.press('Enter');
  doc.press('Escape', true);
  assert.deepEqual(modal.got, []);
  assert.equal(doc.press('Escape').defaultPrevented, true);
  assert.deepEqual(modal.got, ['set-dismiss']);
});

test('叠了几张只收最上面那张；浮窗里开着菜单的先收菜单', () => {
  const menu = el('menu');
  const under = el('detail');
  const top = el('form', [menu]);
  const doc = page([under, top]);
  escDismisses(/** @type {any} */ (under), /** @type {any} */ (doc));
  escDismisses(/** @type {any} */ (top), /** @type {any} */ (doc));
  doc.press('Escape');
  assert.deepEqual(menu.got, ['set-dismiss']);
  assert.deepEqual(top.got, []);
  assert.deepEqual(under.got, []);
});

test('收起以后不再听；已经从页面上拿掉的不管', () => {
  const modal = el('detail');
  const doc = page([modal]);
  const off = escDismisses(/** @type {any} */ (modal), /** @type {any} */ (doc));
  off();
  assert.equal(doc.count, 0);
  const gone = el('detail');
  gone.isConnected = false;
  escDismisses(/** @type {any} */ (gone), /** @type {any} */ (doc));
  doc.press('Escape');
  assert.deepEqual(gone.got, []);
});
