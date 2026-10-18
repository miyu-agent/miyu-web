// @ts-check
//! 跟着人格的外观（软件包 `theme-persona`，蓝图 `web.md`「主题」的「跟着人格的外观」）：照正在看的会话用的人格（状态事件
//! `look.changed`，和左栏左上角、对话区的头像同一份）：
//! - 主题「跟随人格」：往主题包的 `theme.palettes` 挂一个生成的主题（浅、深两份都生成，`src/lib/md3/`）；颜色照人格自选的主色（核心 P-6
//!   的 `seed`），没选的照头像的第一个候选色（核心算好给的 `seeds`，2026-10-14 项目主人定头像取色归核心）。都没有、无人格的交 `null`：
//!   就是默认那个主题。换了颜色换一份挂上，选着它的当场渐变过去。设置页「主题」那一组的「主色」照这一套交的 `seeds()` 画：候选色就是
//!   头像的，选了经服务 `personas` 存成人格的主题色（和编辑卡片那一格同一份）。
//! - 背景图（核心 P-6）：和选哪个主题无关，一直跟着人格。铺满整个窗口（`style.css`：页面根上 `has-persona-backdrop`、变量
//!   `--persona-backdrop`、`--persona-veil`、`--persona-focus`），上面盖一层底色；左栏、标签、输入框磨砂。透明度、焦点照人格的（核心
//!   P-7，`look.js`），没设的透明度照设置项 `veil`、焦点居中。编辑卡片拖滑杆、拖焦点时发 `look.preview`，正在看的就是那个人格的当场
//!   照它铺，松手存了以后照 `look.changed` 来的。换图和换颜色并成一次整页淡过去（`src/lib/retheme.js`）。
//! - 模糊（核心 P-7 补）：开了的铺预先糊好的那张（`blur.js`），糊好以前照旧铺原来的（第一次的不铺，免得先闪一下清楚的）；页面根上
//!   `has-persona-blur`、`--persona-blur-px`（屏幕上已经糊掉多少），左栏、输入框的磨砂照它减（`style.css`）。
//! 停用了这个包就没有「跟随人格」这一套、没有背景图。

import { themeOf } from '../../src/lib/md3/index.js';
import { retheme } from '../../src/lib/retheme.js';
import { veilOf, positionOf, blurOn, screenBlur } from './look.js';
import { baked } from './blur.js';

/** 排在定的那几套后面 */
const ORDER = 10;

/** @param {any} ctx */
export function apply(ctx) {
  /** @typedef {{persona?: string, seed?: string|null, seeds?: string[]}|null} Look */

  /**
   * 挂一套：先挂新的再拿掉原来的（同一个 `id` 后挂的盖住先挂的，主题包不会在中间看到没有这一套）。
   * @param {Look} look 正在看的人格（`look.changed`）
   */
  const palette = (look) => {
    const seed = look?.seed ?? look?.seeds?.[0] ?? null;
    /** @type {Partial<Record<'light'|'dark', ReturnType<typeof themeOf>>>} */
    const made = {};
    const id = look?.persona;
    return ctx.slots.mount('theme.palettes', {
      id: 'persona', name: ctx.text('name'), order: ORDER,
      render: (/** @type {'light'|'dark'} */ scheme) => (seed == null ? null : (made[scheme] ??= themeOf(seed, scheme))),
      // 「主色」那一行：头像的候选色，「自动」就是不存（照第一个）
      seeds: id && ctx.personas?.setSeed ? () => ({
        colors: look?.seeds ?? [], current: look?.seed ?? null, auto: true,
        pick: (/** @type {string|null} */ hex) => ctx.personas.setSeed(id, hex),
      }) : undefined,
    });
  };
  let current = '';
  let undo = palette(null);
  /** @param {Look} look */
  const use = (look) => {
    const key = JSON.stringify([look?.persona ?? null, look?.seed ?? null, look?.seeds ?? []]);
    if (key === current) return;
    current = key;
    const before = undo;
    undo = palette(look);
    before();
  };

  const root = document.documentElement;
  /**
   * 铺着的背景图：哪个人格的、图、透明度、焦点（改了设置项 `veil`、编辑卡片预览时照它重铺）
   * @type {{persona: string|null, url: string|null, opacity: number|null, focus: any, blur: number|null}}
   */
  let shown = { persona: null, url: null, opacity: null, focus: null, blur: null };
  /** 编辑卡片正在预览的（拖滑杆、拖焦点）：盖在 `shown` 上面，`null` 是没在预览 @type {{opacity?: number, focus?: any, blur?: number|null}|null} */
  let preview = null;
  /** 背景图：有的铺上、没有的拿掉；换了图的整页淡过去 @param {typeof shown} next */
  const backdrop = (next) => {
    const swap = next.url !== shown.url;
    shown = next;
    if (swap) retheme(lay);
    else lay();
  };
  /** 铺着的是哪一张（原图或糊好的 `blob:`）：糊好的晚到时只铺最新要的那一张 */
  let painted = '';
  /** 铺着的那张是哪张原图的（换了原图的才淡过去，同一张糊的程度变了直接换） */
  let paintedFrom = '';
  let wanted = '';
  /** 照 `shown` 和预览真去铺 */
  const lay = () => {
    const url = shown.url;
    if (!url) {
      painted = paintedFrom = wanted = '';
      root.classList.remove('has-persona-backdrop', 'has-persona-blur');
      for (const name of ['--persona-backdrop', '--persona-veil', '--persona-focus', '--persona-blur-px']) root.style.removeProperty(name);
      return;
    }
    root.style.setProperty('--persona-veil', `${veilOf(preview?.opacity ?? shown.opacity, ctx.config.veil)}%`);
    root.style.setProperty('--persona-focus', positionOf(preview?.focus ?? shown.focus));
    const amount = preview && 'blur' in preview ? preview.blur : shown.blur;
    if (!blurOn(amount)) {
      wanted = url;
      image(url, url, 0, false);
      return;
    }
    const key = `${url}\n${amount}`;
    wanted = key;
    baked(url, /** @type {number} */ (amount), !!preview).then((got) => {
      if (wanted !== key) return;
      // 糊不了的（画布不支持滤镜）照原图铺
      const fade = !preview && paintedFrom !== url;
      if (!got) return image(url, url, 0, fade);
      image(got.url, url, screenBlur(amount, got, { width: innerWidth, height: innerHeight }), fade);
    });
  };
  /**
   * 铺一张。同步铺的（`lay` 里）已经在换图的那一次淡过去里面；糊好的晚到、换了原图的另起一次淡过去。
   * @param {string} src 铺的（原图或糊好的） @param {string} from 哪张原图 @param {number} blurPx 屏幕上已经糊掉多少 @param {boolean} fade
   */
  const image = (src, from, blurPx, fade) => {
    if (src === painted) return;
    const put = () => {
      painted = src;
      paintedFrom = from;
      root.classList.add('has-persona-backdrop');
      root.classList.toggle('has-persona-blur', blurPx > 0);
      root.style.setProperty('--persona-backdrop', `url("${src}")`);
      root.style.setProperty('--persona-blur-px', `${blurPx}px`);
    };
    if (fade) retheme(put);
    else put();
  };
  // 编辑卡片拖滑杆、拖焦点：正在看的就是那个人格的当场照它铺；`null` 是不预览了
  ctx.on('look.preview', (/** @type {{persona: string, opacity?: number, focus?: any}|null} */ p) => {
    preview = p && p.persona === shown.persona ? p : null;
    lay();
  });

  ctx.on('look.changed', (/** @type {{persona?: string, name: string, avatar?: string|null, seed?: string|null, seeds?: string[], background?: string|null, opacity?: number|null, focus?: any, blur?: number|null}|null} */ look) => {
    // 存好、人格重读了：照新的铺，预览收掉
    preview = null;
    backdrop({ persona: look?.persona ?? null, url: look?.background ?? null, opacity: look?.opacity ?? null, focus: look?.focus ?? null, blur: look?.blur ?? null });
    use(look);
  });
  // 没设透明度的人格盖多浓（设置项 `veil`）改了：当场重铺
  ctx.watchConfig(lay);
  ctx.effect(() => () => {
    undo();
    shown = { persona: null, url: null, opacity: null, focus: null, blur: null };
    lay();
  });
}
