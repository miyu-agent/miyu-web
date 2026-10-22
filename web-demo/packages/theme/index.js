// @ts-check
//! 主题（软件包 `theme`，蓝图 `web.md`「主题」）：声明 `theme.palettes`，一个个主题由主题包（`theme-default`、`theme-persona`、
//! `theme-wallpaper`）挂进来，每个都是成对的一套（浅色、深色各一份，`model.js`）。照设置项 `palette` 选哪个主题（空着的是第一个）、
//! `scheme` 选浅深（`auto` 跟随系统，`light`、`dark`），把那一份颜色写成页面的 CSS 变量：页面那一组是 `--名字`，终端那一组是
//! `--t-名字`，名字里的 `_` 换成 `-`。
//!
//! 提供服务 `theme`：现在是哪个主题、是不是深色、切浅深（左栏的按钮，写进个人那一层的设置）、一个主题这时实际是什么颜色（设置页的
//! 卡片小样用）。换了发事件 `theme.changed`（写好以后发）。头一次以后再换颜色，整页一起 0.3 秒淡过去（`src/lib/retheme.js`）；算出来和
//! 写着的一样的不重写、不发事件。

import { retheme } from '../../src/lib/retheme.js';
import { chosenOf, colorsOf as colorsIn, schemeOf } from './model.js';

/** @param {any} ctx */
export function apply(ctx) {
  ctx.slots.declare('theme.palettes', 'list');
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  /** 写上去的变量：换了一套先拿掉原来的，撤回时全拿掉 */
  let written = [];
  /** 写着的那一份（一样的不重写） */
  let shown = '';

  const palettes = () => ctx.slots.list('theme.palettes');
  /** 这时浅的还是深的：设置项「明暗」，跟随系统的照系统 */
  const scheme = () => schemeOf(ctx.config.scheme, dark.matches ? 'dark' : 'light');
  const chosen = () => chosenOf(palettes(), ctx.config.palette, ctx.config.default_palette);
  /** 一个主题这时实际的颜色 @param {import('./model.js').Palette} p */
  const colorsOf = (p) => colorsIn(palettes(), p, scheme());

  let painted = false;
  const paint = () => {
    const p = chosen();
    const s = scheme();
    const colors = p ? colorsOf(p) : null;
    const sig = p ? JSON.stringify([p.id, s, colors]) : '';
    if (sig === shown) return;
    shown = sig;
    // 头一次直接上色，以后的整页淡过去
    retheme(() => {
      for (const name of written) root.style.removeProperty(name);
      written = [];
      if (!p || !colors) return;
      const set = (name, value) => {
        root.style.setProperty(name, value);
        written.push(name);
      };
      for (const [k, v] of Object.entries(colors.page)) set(`--${k.replaceAll('_', '-')}`, v);
      for (const [k, v] of Object.entries(colors.tui)) set(`--t-${k.replaceAll('_', '-')}`, v);
      root.style.colorScheme = s;
      root.dataset.theme = p.id;
      ctx.emit('theme.changed', p.id);
    }, { animate: painted });
    painted = painted || !!colors;
  };
  ctx.slots.watch('theme.palettes', paint);
  // 换了一套（设置项 palette 是 live 的）：当场重画，不重来
  ctx.watchConfig(paint);
  ctx.effect(() => {
    dark.addEventListener('change', paint);
    return () => dark.removeEventListener('change', paint);
  });
  ctx.effect(() => () => {
    for (const name of written) root.style.removeProperty(name);
    root.style.colorScheme = '';
    delete root.dataset.theme;
  });
  paint();

  ctx.provide('theme', {
    current: () => chosen(),
    dark: () => scheme() === 'dark',
    /** 一个主题这时实际的颜色（`{page, tui}`；都交不出的是 `null`） */
    colorsOf,
    /** 现在这套主题浅的、深的那一份颜色（不管这时是浅是深；管理员后台的左栏一直用深的那一份）；交不出的是 `null` @param {'light'|'dark'} s */
    colorsFor: (s) => {
      const p = chosen();
      return p ? colorsIn(palettes(), p, s) : null;
    },
    /** 切浅深（左栏的按钮）：「明暗」成了定的另一边，记进个人那一层 */
    toggle: () => ctx.packages.set('theme', { config: { scheme: scheme() === 'dark' ? 'light' : 'dark' } }),
  });
}
