// @ts-check
//! 「核心已停止」那张卡上的「启动」（蓝图 `web.md`「连核心」第 1 条）：点了以后按钮一直写「正在启动…」、灰着，直到接上了卡收完，
//! 或者拉不起来写出那一头给的原因、按钮放开（2026-11-20 主人验收：点了「启动」按钮闪一下又变回「启动」——接上了卡在淡出，按钮已经写回了「启动」）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadRes } from './support.js';

loadRes();

/** 假的节点：`h` 用到的几样（建元素、接子节点、属性、事件、类名），退场动画照 `getComputedStyle` 读 0.2 秒、等 `animationend` 收 */
class FakeNode {
  constructor(text = '') {
    /** @type {FakeNode[]} */
    this.children = [];
    this.text = text;
    this.hidden = false;
    this.disabled = false;
    this.isConnected = true;
    /** @type {Record<string, any[]>} */
    this.listeners = {};
    const classes = new Set();
    this.classList = {
      add: (/** @type {string} */ c) => classes.add(c),
      remove: (/** @type {string} */ c) => classes.delete(c),
      contains: (/** @type {string} */ c) => classes.has(c),
      toggle: (/** @type {string} */ c, /** @type {boolean} */ on) => (on ? classes.add(c) : classes.delete(c)),
    };
    this.style = {};
    this.dataset = {};
  }
  set className(v) { for (const c of String(v).split(' ').filter(Boolean)) this.classList.add(c); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = []; this.text = String(v); }
  /** @param {any[]} kids */
  append(...kids) { this.children.push(...kids); }
  setAttribute() {}
  /** @param {string} type @param {any} fn */
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  /** @param {string} type @param {any} fn */
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }
  /** @param {string} type */
  fire(type) { for (const fn of [...(this.listeners[type] ?? [])]) fn({ type, target: this }); }
  focus() {}
}
Object.assign(globalThis, {
  Node: FakeNode,
  document: { createElement: () => new FakeNode(), createTextNode: (/** @type {string} */ s) => new FakeNode(s) },
  getComputedStyle: () => ({ animationName: 'fade-out', animationDuration: '0.2s', animationDelay: '0s' }),
  matchMedia: () => ({ matches: false }),
});

const { StoppedCard } = await import('../src/ui/stopped-card.js');

/** 一张卡，`start` 交回的 Promise 由测试来定 */
const card = () => {
  /** @type {{resolve: (v?: any) => void, reject: (e: any) => void}} */
  const pending = /** @type {any} */ ({});
  const c = new StoppedCard(() => new Promise((resolve, reject) => Object.assign(pending, { resolve, reject })));
  c.el.hidden = true;
  return { c, pending };
};

test('点了「启动」、线开了（核心还在拉起）：按钮一直写「正在启动…」、灰着', async () => {
  const { c, pending } = card();
  c.stopped('核心已停止');
  c.start();
  assert.equal(c.button.textContent, '正在启动…');
  assert.equal(c.button.disabled, true);
  // 线开了 Promise 就交回了，那一头这时才去拉起核心：还没接上，不放开
  pending.resolve();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(c.button.textContent, '正在启动…');
  assert.equal(c.button.disabled, true);
});

test('接上了：卡淡出的时候按钮照旧写「正在启动…」，收完了下次出卡才写回「启动」', () => {
  const { c } = card();
  c.stopped('核心已停止');
  c.start();
  c.joined();
  assert.equal(c.el.classList.contains('is-leaving'), true, '卡在淡出');
  assert.equal(c.button.textContent, '正在启动…', '淡出的时候不写回「启动」');
  assert.equal(c.button.disabled, true);
  c.el.fire('animationend');
  assert.equal(c.el.hidden, true, '淡完收起');
  // 又停了：卡重新出来，按钮是「启动」、能点
  c.stopped('核心已停止');
  assert.equal(c.el.hidden, false);
  assert.equal(c.button.textContent, '启动');
  assert.equal(c.button.disabled, false);
});

test('卡正在淡出时又停了：停掉淡出，卡留着，按钮写回「启动」', () => {
  const { c } = card();
  c.stopped('核心已停止');
  c.start();
  c.joined();
  c.stopped('核心又停了');
  assert.equal(c.el.hidden, false);
  assert.equal(c.el.classList.contains('is-leaving'), false);
  assert.equal(c.title.textContent, '核心又停了');
  assert.equal(c.button.textContent, '启动');
  assert.equal(c.button.disabled, false);
});

test('拉不起来：写出那一头给的整句原因，按钮放开写回「启动」', () => {
  const { c } = card();
  c.stopped('核心已停止');
  c.start();
  c.failed('拉不起核心：找不到 miyu 程序');
  assert.equal(c.why.hidden, false);
  assert.equal(c.why.textContent, '拉不起核心：找不到 miyu 程序');
  assert.equal(c.button.textContent, '启动');
  assert.equal(c.button.disabled, false);
});

test('卡盖在页面上所有浮层的上面（2026-11-20 主人验收第 31 条，W-1241）：开着设置、看图、仪表盘时停核心，卡和「启动」照样看得见、点得到', () => {
  const dirs = ['styles', 'packages'];
  /** @type {{file: string, sel: string, z: number}[]} */
  const all = [];
  const walk = (/** @type {URL} */ dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const at = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walk(at);
      else if (entry.name.endsWith('.css')) {
        const css = readFileSync(at, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
          const z = m[2].match(/z-index:\s*(\d+)/);
          if (z) all.push({ file: at.pathname.split('/web-demo/')[1], sel: m[1].trim(), z: Number(z[1]) });
        }
      }
    }
  };
  for (const d of dirs) walk(new URL(`../${d}/`, import.meta.url));
  const card = all.find((r) => r.sel === '.core-stopped');
  assert.ok(card, '找得到卡的那一条');
  const above = all.filter((r) => r !== card && r.z >= card.z);
  assert.deepEqual(above, [], '没有浮层压在卡上面');
});
