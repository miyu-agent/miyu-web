// @ts-check
//! 选吉祥物（软件包 `character`，蓝图 `web.md`「选吉祥物」，2026-11-02 项目主人：吉祥物作为主题下的一个子项，和主题分开选、随便搭）：
//! 声明挂载位 `mascot.characters`（外观包挂吉祥物），照设置项 `character` 把选着的那一只画进整页最前面一层（`host.layer`，不跟着输入框藏）。
//! 「Deniro」是软件包 `mascot`：选它就启用那个包，选别的停用它（那个包自己画、自己挂在 `body` 上，这里不管它怎么画）。改名以前存的 `miyu`
//! 照 `deniro` 读（`characterOf`，2026-11-10 项目主人）。
//! 提供服务 `character`：`current()`、`list()`（给设置页的下拉）、`choose(id)`。交给角色的 host 里状态、站的那条边、有人动了由这里统一算
//! （`model.js`，2026-11-02 77 要的：混搭的两只同一时刻播同一个动作、站同一条边）。

/** 弹出、收起以后跟着动画再量几帧（毫秒） */
const SETTLE_MS = 400;

import { h } from '../../src/lib/dom.js';
import { combine } from '../../src/lib/anchors.js';
import { nowOf, endedOf, surfaceOf, characterOf, DENIRO } from './model.js';

/** @param {any} ctx */
export function apply(ctx) {
  ctx.slots.declare('mascot.characters', 'list');
  const layer = h('div.character-layer', { 'aria-hidden': 'true' });
  document.body.append(layer);
  /** 最近一份 `view.changed`、听的人 */
  let lastView = /** @type {any} */ (null);
  /** @type {Set<(v: any) => void>} */
  const views = new Set();
  /** 状态：这一刻在做什么、听的人 @type {{now: import('./model.js').Now, ended?: string}} */
  let state = { now: 'idle' };
  /** @type {Set<(s: any) => void>} */
  const states = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // 站的那条边：照落脚点表的 composer、composer.floats 两个点和部件名表找页面上的东西，加上主题挪的（combine）
  /** @type {{anchors: any[]}|null} */
  let anchors = null;
  /** @type {Record<string, {select: string[]}>|null} */
  let parts = null;
  Promise.all([
    fetch(new URL('../../resources/mascot-anchors.json', import.meta.url)).then((r) => r.json()),
    fetch(new URL('../../resources/parts.json', import.meta.url)).then((r) => r.json()),
  ]).then(([a, p]) => {
    anchors = a;
    parts = p;
    bump();
  }).catch((err) => console.warn('吉祥物：读不到落脚点表、部件名表', err));
  const pick = (/** @type {string} */ name) => (parts?.[name]?.select ?? []).join(', ');
  const surface = () => {
    const composerSel = pick('composer') || '.composer';
    const box = document.querySelector(composerSel);
    const shown = (/** @type {Element} */ el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const menuSel = pick('menu');
    const floats = box && menuSel ? [...box.querySelectorAll(menuSel)].filter(shown).map((el) => el.getBoundingClientRect()) : [];
    const table = combine(anchors?.anchors ?? [], [], ctx.skin?.anchors?.() ?? null);
    const off = (/** @type {string} */ id) => table.find((a) => a.id === id) ?? {};
    return surfaceOf(box && shown(box) ? box.getBoundingClientRect() : null, floats, { composer: off('composer'), floats: off('composer.floats') });
  };
  /** @type {Set<(s: any) => void>} */
  const surfaces = new Set();
  let lastSurface = '';
  let settleUntil = 0;
  let frame = 0;
  const tick = () => {
    frame = 0;
    const now = surface();
    const key = JSON.stringify(now);
    if (key !== lastSurface) {
      lastSurface = key;
      for (const fn of [...surfaces]) fn(now);
    }
    if (performance.now() < settleUntil) frame = requestAnimationFrame(tick);
  };
  /** 有东西可能动了：接下来几帧跟着量（弹出、收起有动画） */
  const bump = () => {
    if (!surfaces.size) return;
    settleUntil = performance.now() + SETTLE_MS;
    if (!frame) frame = requestAnimationFrame(tick);
  };
  const watchBox = () => {
    const box = document.querySelector(pick('composer') || '.composer');
    if (!box) return () => {};
    const mo = new MutationObserver(bump);
    mo.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    const ro = new ResizeObserver(bump);
    ro.observe(box);
    return () => { mo.disconnect(); ro.disconnect(); };
  };
  let unwatchBox = () => {};
  ctx.effect(() => {
    addEventListener('resize', bump);
    return () => { removeEventListener('resize', bump); unwatchBox(); cancelAnimationFrame(frame); };
  });
  ctx.on('theme.changed', bump);

  // 有人动了：打字、点了页面
  /** @type {Set<() => void>} */
  const actives = new Set();
  const poke = () => { for (const fn of [...actives]) fn(); };
  ctx.effect(() => {
    document.addEventListener('keydown', poke, { capture: true, passive: true });
    document.addEventListener('pointerdown', poke, { capture: true, passive: true });
    return () => {
      document.removeEventListener('keydown', poke, { capture: true });
      document.removeEventListener('pointerdown', poke, { capture: true });
    };
  });
  // 状态事件：注册时当场给最后一份，用到的（surfaces、frame、tick）都在上面声明好了
  ctx.on('view.changed', (/** @type {any} */ v) => {
    const was = lastView;
    lastView = v;
    for (const fn of [...views]) fn(v);
    // 一轮刚收尾（同一个会话从在跑到不跑）：带上怎么收的尾，只这一次
    const ended = was?.running && !v?.running && was?.session === v?.session ? endedOf(v?.entries ?? []) : null;
    // 框可能只挪了位置（空会话时在正中，开了会话落到底下：上面的类变了，框的大小不变）：量一帧，不追动画（回答出字时 view.changed 很密）
    if (surfaces.size && !frame) frame = requestAnimationFrame(tick);
    const now = nowOf(v);
    if (now === state.now && !ended) return;
    state = { now };
    const told = ended ? { now, ended } : state;
    for (const fn of [...states]) fn(told);
  });
  /** 交给角色的（蓝图「选吉祥物」第 3 条） */
  const host = {
    layer,
    view: () => lastView,
    onView: (/** @type {(v: any) => void} */ fn) => {
      views.add(fn);
      return () => views.delete(fn);
    },
    reduced: () => reduced.matches,
    box: () => document.querySelector('.composer')?.getBoundingClientRect() ?? null,
    state: () => state,
    onState: (/** @type {(s: any) => void} */ fn) => {
      states.add(fn);
      return () => states.delete(fn);
    },
    surface,
    onSurface: (/** @type {(s: any) => void} */ fn) => {
      if (!surfaces.size) unwatchBox = watchBox();
      surfaces.add(fn);
      lastSurface = '';
      bump();
      return () => {
        surfaces.delete(fn);
        if (!surfaces.size) { unwatchBox(); unwatchBox = () => {}; }
      };
    },
    onActivity: (/** @type {() => void} */ fn) => {
      actives.add(fn);
      return () => actives.delete(fn);
    },
  };

  /** 画着的那一只 @type {{entry: any, el: Node, dispose?: () => void}|null} */
  let drawn = null;
  const drop = () => {
    if (!drawn) return;
    try {
      drawn.dispose?.();
    } catch (err) {
      console.error(`${drawn.entry.owner} 挂的吉祥物 ${drawn.entry.id} 拿下来时出错了`, err);
    }
    drawn.el.parentNode?.removeChild(drawn.el);
    drawn = null;
  };
  /** 照设置项画：选着的不是挂进来的（无、Deniro、挂的包没了）什么都不画 */
  const sync = () => {
    const id = characterOf(ctx.config.character);
    const entry = id && id !== DENIRO ? ctx.slots.list('mascot.characters').find((/** @type {any} */ e) => e.id === id) ?? null : null;
    if (drawn?.entry === entry) return;
    drop();
    if (!entry) return;
    const out = ctx.slots.draw(entry, host);
    const got = out instanceof Node ? { el: out } : out?.el ? out : null;
    if (!got) {
      console.error(`${entry.owner} 挂的吉祥物 ${entry.id} 画的时候${out?.failed ? `出错了：${out.reason}` : '没有交回节点'}`);
      return;
    }
    drawn = { entry, ...got };
    layer.append(got.el);
  };
  ctx.effect(() => ctx.slots.watch('mascot.characters', sync));
  ctx.watchConfig(sync);
  ctx.effect(() => () => {
    drop();
    layer.remove();
  });
  sync();

  /** 软件包 `mascot` 这时开着没有（没装的是 `null`） */
  const mascotOn = async () => {
    const p = (await ctx.packages.list()).find((/** @type {any} */ x) => x.id === 'mascot');
    return p ? p.state !== 'disabled' : null;
  };

  ctx.provide('character', {
    /** 现在选着的编号（空的是无） */
    current: () => characterOf(ctx.config.character),
    /**
     * 设置页下拉的几项 `{id, name}`：无、Deniro（装了 `mascot` 包才有）、挂进来的；`chosen` 是这时选着的（设置项空着、`mascot` 包手动开了的算 Deniro）。
     * @returns {Promise<{items: {id: string, name: string}[], chosen: string}>}
     */
    list: async () => {
      const on = await mascotOn();
      const items = [{ id: '', name: ctx.text('none') }];
      if (on !== null) items.push({ id: DENIRO, name: ctx.text('deniro') });
      for (const e of ctx.slots.list('mascot.characters')) items.push({ id: e.id, name: typeof e.name === 'string' ? e.name : ctx.local?.(e.name) ?? e.id });
      // 选着的那一只已经不在了（挂它的外观包卸了、停了）：照「无」写，不把编号原样露出来
      const id = characterOf(ctx.config.character);
      const want = id || (on ? DENIRO : '');
      return { items, chosen: items.some((x) => x.id === want) ? want : '' };
    },
    /** 换一只：记进设置项；Deniro 启用 `mascot` 包，别的停用它 @param {string} id */
    choose: async (id) => {
      await ctx.packages.set('character', { config: { character: id || null } });
      const on = await mascotOn();
      if (on === null) return;
      if (id === DENIRO && !on) await ctx.packages.set('mascot', { disabled: false });
      if (id !== DENIRO && on) await ctx.packages.set('mascot', { disabled: true });
    },
  });
}
