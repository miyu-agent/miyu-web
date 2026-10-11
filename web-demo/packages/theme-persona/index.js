// @ts-check
//! 跟着人格的外观（软件包 `theme-persona`，蓝图 `web.md`「主题」的「跟着人格的外观」）：照正在看的会话用的人格（状态事件
//! `look.changed`，和左栏左上角、对话区的头像同一份）：
//! - 主题「跟随人格」：往主题包的 `theme.palettes` 挂一个生成的主题（浅、深两份都生成，`src/lib/md3/`）；颜色照人格自选的主色（核心 P-6
//!   的 `seed`），没选的照头像取的第一名。都没有、无人格、取不出的交 `null`：就是默认那个主题。换了颜色换一份挂上，选着它的当场渐变过去。
//! - 背景图（核心 P-6）：和选哪个主题无关，一直跟着人格。铺满整个窗口（`style.css`：页面根上 `has-persona-backdrop`、变量
//!   `--persona-backdrop`、`--persona-veil`、`--persona-focus`），上面盖一层底色；左栏、标签、输入框磨砂。透明度、焦点照人格的（核心
//!   P-7，`look.js`），没设的透明度照设置项 `veil`、焦点居中。编辑卡片拖滑杆、拖焦点时发 `look.preview`，正在看的就是那个人格的当场
//!   照它铺，松手存了以后照 `look.changed` 来的。换图和换颜色并成一次整页淡过去（`src/lib/retheme.js`）。
//! 停用了这个包就没有「跟随人格」这一套、没有背景图。
//!
//! 头像在浏览器里缩小到长边 `sample_side` 再取色；同一张图取过的记着，换回来不再算。

import { seedOf, themeOf } from '../../src/lib/md3/index.js';
import { pixelsOf } from '../../src/lib/md3/pixels.js';
import { retheme } from '../../src/lib/retheme.js';
import { veilOf, positionOf } from './look.js';

/** 排在定的那几套后面 */
const ORDER = 10;

/** @param {any} ctx */
export function apply(ctx) {
  /** 头像的地址 → 主色（ARGB；取不出来的是 `null`） @type {Map<string, Promise<number|null>>} */
  const seeds = new Map();
  /** 最近一次要的头像：取色是异步的，取完时已经换了人格的不挂 */
  let wanted = /** @type {string|null} */ (null);

  /**
   * 挂一套：先挂新的再拿掉原来的（同一个 `id` 后挂的盖住先挂的，主题包不会在中间看到没有这一套）。
   * @param {number|string|null} seed ARGB（从头像取的）、`#rrggbb`（自选的）；`null` 交不出（用默认那个主题）
   */
  const palette = (seed) => {
    /** @type {Partial<Record<'light'|'dark', ReturnType<typeof themeOf>>>} */
    const made = {};
    return ctx.slots.mount('theme.palettes', {
      id: 'persona', name: ctx.text('name'), order: ORDER,
      render: (/** @type {'light'|'dark'} */ scheme) => (seed == null ? null : (made[scheme] ??= themeOf(seed, scheme))),
    });
  };
  let current = /** @type {number|string|null} */ (null);
  let undo = palette(null);
  /** @param {number|string|null} seed */
  const use = (seed) => {
    if (seed === current) return;
    current = seed;
    const before = undo;
    undo = palette(seed);
    before();
  };

  /** 读一张图、缩小、取色。 @param {string} url @returns {Promise<number|null>} */
  const sample = async (url) => {
    const rgba = await pixelsOf(url, ctx.config.sample_side);
    return rgba ? seedOf(rgba) : null;
  };

  const root = document.documentElement;
  /**
   * 铺着的背景图：哪个人格的、图、透明度、焦点（改了设置项 `veil`、编辑卡片预览时照它重铺）
   * @type {{persona: string|null, url: string|null, opacity: number|null, focus: any}}
   */
  let shown = { persona: null, url: null, opacity: null, focus: null };
  /** 编辑卡片正在预览的（拖滑杆、拖焦点）：盖在 `shown` 上面，`null` 是没在预览 @type {{opacity?: number, focus?: any}|null} */
  let preview = null;
  /** 背景图：有的铺上、没有的拿掉；换了图的整页淡过去 @param {typeof shown} next */
  const backdrop = (next) => {
    const swap = next.url !== shown.url;
    shown = next;
    if (swap) retheme(lay);
    else lay();
  };
  /** 照 `shown` 和预览真去铺 */
  const lay = () => {
    const url = shown.url;
    root.classList.toggle('has-persona-backdrop', !!url);
    if (url) {
      root.style.setProperty('--persona-backdrop', `url("${url}")`);
      root.style.setProperty('--persona-veil', `${veilOf(preview?.opacity ?? shown.opacity, ctx.config.veil)}%`);
      root.style.setProperty('--persona-focus', positionOf(preview?.focus ?? shown.focus));
    } else {
      for (const name of ['--persona-backdrop', '--persona-veil', '--persona-focus']) root.style.removeProperty(name);
    }
  };
  // 编辑卡片拖滑杆、拖焦点：正在看的就是那个人格的当场照它铺；`null` 是不预览了
  ctx.on('look.preview', (/** @type {{persona: string, opacity?: number, focus?: any}|null} */ p) => {
    preview = p && p.persona === shown.persona ? p : null;
    lay();
  });

  ctx.on('look.changed', async (/** @type {{persona?: string, name: string, avatar?: string|null, seed?: string|null, background?: string|null, opacity?: number|null, focus?: any}|null} */ look) => {
    // 存好、人格重读了：照新的铺，预览收掉
    preview = null;
    backdrop({ persona: look?.persona ?? null, url: look?.background ?? null, opacity: look?.opacity ?? null, focus: look?.focus ?? null });
    // 自选的主题色照它，不用取
    if (look?.seed) {
      wanted = look.seed;
      return use(look.seed);
    }
    const url = look?.avatar ?? null;
    wanted = url;
    if (!url) return use(null);
    if (!seeds.has(url)) seeds.set(url, sample(url));
    const seed = (await seeds.get(url)) ?? null;
    if (wanted === url) use(seed);
  });
  // 没设透明度的人格盖多浓（设置项 `veil`）改了：当场重铺
  ctx.watchConfig(lay);
  ctx.effect(() => () => {
    undo();
    shown = { persona: null, url: null, opacity: null, focus: null };
    lay();
  });
}
