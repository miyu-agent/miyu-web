// @ts-check
//! 选吉祥物（软件包 `character`，蓝图 `web.md`「选吉祥物」，2026-11-02 项目主人：吉祥物作为主题下的一个子项，和主题分开选、随便搭）：
//! 声明挂载位 `mascot.characters`（外观包挂吉祥物），照设置项 `character` 把选着的那一只画进整页最前面一层（`host.layer`，不跟着输入框藏）。
//! 「Miyu」是软件包 `mascot`：选它就启用那个包，选别的停用它（那个包自己画、自己挂在 `body` 上，这里不管它怎么画）。
//! 提供服务 `character`：`current()`、`list()`（给设置页的下拉）、`choose(id)`。

import { h } from '../../src/lib/dom.js';

/** 「Miyu」那一项的编号：软件包 `mascot` */
export const MIYU = 'miyu';

/** @param {any} ctx */
export function apply(ctx) {
  ctx.slots.declare('mascot.characters', 'list');
  const layer = h('div.character-layer', { 'aria-hidden': 'true' });
  document.body.append(layer);
  /** 最近一份 `view.changed`、听的人 */
  let lastView = /** @type {any} */ (null);
  /** @type {Set<(v: any) => void>} */
  const views = new Set();
  ctx.on('view.changed', (/** @type {any} */ v) => {
    lastView = v;
    for (const fn of [...views]) fn(v);
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
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
  /** 照设置项画：选着的不是挂进来的（无、Miyu、挂的包没了）什么都不画 */
  const sync = () => {
    const id = ctx.config.character ?? '';
    const entry = id && id !== MIYU ? ctx.slots.list('mascot.characters').find((/** @type {any} */ e) => e.id === id) ?? null : null;
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
    current: () => ctx.config.character ?? '',
    /**
     * 设置页下拉的几项 `{id, name}`：无、Miyu（装了 `mascot` 包才有）、挂进来的；`chosen` 是这时选着的（设置项空着、`mascot` 包手动开了的算 Miyu）。
     * @returns {Promise<{items: {id: string, name: string}[], chosen: string}>}
     */
    list: async () => {
      const on = await mascotOn();
      const items = [{ id: '', name: ctx.text('none') }];
      if (on !== null) items.push({ id: MIYU, name: ctx.text('miyu') });
      for (const e of ctx.slots.list('mascot.characters')) items.push({ id: e.id, name: typeof e.name === 'string' ? e.name : ctx.local?.(e.name) ?? e.id });
      const id = ctx.config.character ?? '';
      return { items, chosen: id || (on ? MIYU : '') };
    },
    /** 换一只：记进设置项；Miyu 启用 `mascot` 包，别的停用它 @param {string} id */
    choose: async (id) => {
      await ctx.packages.set('character', { config: { character: id || null } });
      const on = await mascotOn();
      if (on === null) return;
      if (id === MIYU && !on) await ctx.packages.set('mascot', { disabled: false });
      if (id !== MIYU && on) await ctx.packages.set('mascot', { disabled: true });
    },
  });
}
