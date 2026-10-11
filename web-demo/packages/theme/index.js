// @ts-check
//! 主题（软件包 `theme`，蓝图 `web.md`「主题」）：声明 `theme.palettes`，一套一套的颜色由主题包（`theme-morning`、
//! `theme-tokyonight`……）挂进来；照设置项 `palette` 选一套（空着的跟着系统：浅色用第一套浅的，深色用第一套深的），把颜色写成
//! 页面的 CSS 变量：页面那一组是 `--名字`，终端那一组是 `--t-名字`，名字里的 `_` 换成 `-`。
//!
//! 挂进来的一套有两种：
//! - 定的（`scheme` 是 `light`、`dark`）：`render()` 交整套 `{page, tui}`；
//! - 生成的（`scheme` 是 `auto`，「跟随人格」`theme-persona`、「跟随壁纸」`theme-wallpaper`，蓝图「跟着人格的外观」）：浅色、深色跟着
//!   系统，`render(scheme)` 交要盖在同深浅的第一套定的上面的那几格，交 `null` 的不盖（没有人格、取不出颜色）。颜色变了它换一份挂上
//!   （同一个 `id` 后挂的盖住先挂的）。
//!
//! 提供服务 `theme`：现在是哪一套、是不是深色、换到下一套（写进个人那一层的设置，`/theme`、左栏的按钮用）、一套这时实际是什么颜色
//! （设置页的卡片小样用）。换了发事件 `theme.changed`。头一次以后再换颜色，整页的底色、字色、线色 0.3 秒渐变过去（`style.css` 的
//! `is-retheming`，过完拿掉）；算出来和写着的一样的不重写、不发事件。

import { chosenOf, colorsOf as colorsIn, schemeOf } from './model.js';

const RETHEME_MS = 400;

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
  /** 系统这时是浅的还是深的 @returns {'light'|'dark'} */
  const system = () => (dark.matches ? 'dark' : 'light');
  const chosen = () => chosenOf(palettes(), ctx.config.palette, system());
  /** 一套这时实际的颜色 @param {import('./model.js').Palette} p */
  const colorsOf = (p) => colorsIn(palettes(), p, system());

  let painted = false;
  let fading = 0;
  const paint = () => {
    const p = chosen();
    const colors = p ? colorsOf(p) : null;
    const sig = p ? JSON.stringify([p.id, schemeOf(p, system()), colors]) : '';
    if (sig === shown) return;
    shown = sig;
    // 头一次以后的换色带过渡
    if (painted && p) {
      root.classList.add('is-retheming');
      clearTimeout(fading);
      fading = window.setTimeout(() => root.classList.remove('is-retheming'), RETHEME_MS);
    }
    for (const name of written) root.style.removeProperty(name);
    written = [];
    if (!p || !colors) return;
    painted = true;
    const set = (name, value) => {
      root.style.setProperty(name, value);
      written.push(name);
    };
    for (const [k, v] of Object.entries(colors.page)) set(`--${k.replaceAll('_', '-')}`, v);
    for (const [k, v] of Object.entries(colors.tui)) set(`--t-${k.replaceAll('_', '-')}`, v);
    root.style.colorScheme = schemeOf(p, system());
    root.dataset.theme = p.id;
    ctx.emit('theme.changed', p.id);
  };
  ctx.slots.watch('theme.palettes', paint);
  // 换了一套（设置项 palette 是 live 的）：当场重画，不重来
  ctx.watchConfig(paint);
  ctx.effect(() => {
    dark.addEventListener('change', paint);
    return () => dark.removeEventListener('change', paint);
  });
  ctx.effect(() => () => {
    clearTimeout(fading);
    root.classList.remove('is-retheming');
    for (const name of written) root.style.removeProperty(name);
    root.style.colorScheme = '';
    delete root.dataset.theme;
  });
  paint();

  ctx.provide('theme', {
    current: () => chosen(),
    dark: () => {
      const p = chosen();
      return !!p && schemeOf(p, system()) === 'dark';
    },
    /** 一套这时实际的颜色（`{page, tui}`） */
    colorsOf,
    /** 换到下一套，记进个人那一层（这个包的设置项 `palette`），这个包照新的设置重来 */
    next: async () => {
      const all = palettes();
      if (!all.length) return null;
      const now = chosen();
      const after = all[(all.indexOf(now) + 1) % all.length];
      await ctx.packages.set('theme', { config: { palette: after.id } });
      return after;
    },
  });
}
