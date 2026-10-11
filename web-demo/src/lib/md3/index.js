// @ts-check
//! 照一张图生成一个主题（蓝图 `web.md`「主题」的「跟着人格的外观」第 2 条；软件包 `theme-persona`、`theme-wallpaper`，人格的编辑卡片的
//! 「主题色」那一行共用）：从像素取主色，照 MD3 `CONTENT`、对比度 0 生成浅色或深色那一份，全部的格子（和默认主题一样多）。纯函数；读图在
//! `pixels.js`，原色表在 `design.js`。
//!
//! 每一格怎么来：
//! - 中性色、强调色照 MD3 的角色（`PAGE`、`COMMON`、`TUI`）；
//! - 不带颜色的（`NEUTRAL`：终端的 `dim`、引用、代码注释……）照它在原色表里的明度取这一套的中性色；
//! - 有含义的颜色（出错、增删、代码高亮……）色相不变、往主色靠一点（`Blend.harmonize`，最多转 15°），明度、彩度照原色表；
//! - 阴影、遮罩照原色表的样子，浅色的影换成这一套的字色；写成算式的照抄；吉祥物照抄。
//!
//! 用 `CONTENT` 不用 `TONAL_SPOT`：后者把底色也染上主色，头像取到肤色、金发时整页发棕发浑；`CONTENT` 的底色基本是中性灰，只有强调带颜色。

import { QuantizerCelebi, Score, Hct, SchemeContent, MaterialDynamicColors as D, Blend, argbFromRgb, argbFromHex, hexFromArgb } from './vendor/mcu.min.js';
import { DESIGN } from './design.js';

/** 取主色时最多挑多少种颜色（MD3 取壁纸色的做法） */
const QUANTIZE = 128;
/** 太透明的像素不算（头像的圆角外面、抠了图的背景） */
const MIN_ALPHA = 200;

/**
 * 页面那一组的每一格对应 MD3 的哪个角色：浅色、深色各一份（照「晨光」「tokyonight」的对应：浮起来的东西浅色里比底亮、深色里也比底亮一档）。
 * @type {Record<'light'|'dark', Record<string, string>>}
 */
const PAGE = {
  light: {
    surface: 'surface', sidebar_bg: 'surfaceContainer', surface_1: 'surfaceContainerLowest', surface_2: 'surfaceContainerHigh',
    surface_3: 'surfaceContainerHighest', sidebar_active: 'surfaceContainerHigh',
  },
  dark: {
    surface: 'surface', sidebar_bg: 'surfaceContainerLowest', surface_1: 'surfaceContainerLow', surface_2: 'surfaceContainer',
    surface_3: 'surfaceContainerHigh', sidebar_active: 'surfaceContainer',
  },
};
/**
 * 浅色、深色都一样的几格。主色的容器色照 `secondaryContainer`：`CONTENT` 的 `primaryContainer` 就是原色（饱和、浅色里也是深的），
 * `accent_soft` 是垫在正文字下面的淡底（提问卡片选中的那一项），要的是浅色里浅、深色里深的那一档。
 */
const COMMON = {
  text: 'onSurface', text_soft: 'onSurfaceVariant', line: 'outlineVariant', line_strong: 'outline', accent: 'primary',
  accent_soft: 'secondaryContainer', on_primary: 'onPrimary', on_primary_container: 'onSecondaryContainer', gold: 'secondary', ribbon: 'tertiary',
};
/** 终端那一组跟着主色的几格 */
const TUI = { accent: 'primary', workspace: 'primary' };
/** 链接照主色 */
const LINK = { link: 'primary' };
/** 不带颜色的几格（字、线、底一类）：照原色表的明度取中性色。原色表深色那一份是 tokyonight，这几格带着它的蓝，不能当有含义的颜色往主色靠 */
const NEUTRAL = {
  page: ['tok_c', 'tok_p'],
  tui: ['dim', 'hover', 'shade', 'md_bold', 'md_italic', 'md_quote', 'md_math', 'diagram_text', 'diagram_line', 'diagram_backdrop', 'code_comment', 'code_operator'],
};

/**
 * 图里最像主题色的几种，好的在前（第一种就是自动取的那一种；几种之间色相尽量隔开）：RGBA 的像素（`ImageData.data` 那样一格四个数），
 * 太透明的不算；灰的、一格都不剩的取不出，是空的。
 * @param {ArrayLike<number>} rgba
 * @param {number} [count]
 * @returns {number[]} ARGB
 */
export function seedsOf(rgba, count = 4) {
  const pixels = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < MIN_ALPHA) continue;
    pixels.push(argbFromRgb(rgba[i], rgba[i + 1], rgba[i + 2]));
  }
  if (!pixels.length) return [];
  // 一种都挑不出（全是灰的）时库交回兜底色：交 0（ARGB 的 0 是全透明，像素里不会有），滤掉
  return Score.score(QuantizerCelebi.quantize(pixels, QUANTIZE), { desired: count, fallbackColorARGB: 0 }).filter((c) => c !== 0);
}

/**
 * 自动取的那一种（`seedsOf` 的第一种）；取不出的是 `null`。
 * @param {ArrayLike<number>} rgba
 * @returns {number|null} ARGB
 */
export const seedOf = (rgba) => seedsOf(rgba, 1)[0] ?? null;

/**
 * 照主色生成一个主题的浅色或深色那一份：全部的格子（和原色表、默认主题一样多）。
 * @param {number|string} seed ARGB 或 `#rrggbb`（自选的主色）
 * @param {'light'|'dark'} scheme
 * @returns {{page: Record<string, string>, tui: Record<string, string>}}
 */
export function themeOf(seed, scheme) {
  const argb = typeof seed === 'string' ? argbFromHex(seed) : seed;
  const s = new SchemeContent(Hct.fromInt(argb), scheme === 'dark', 0);
  return build(scheme, (name) => hexFromArgb(/** @type {any} */ (D)[name].getArgb(s)), (tone) => hexFromArgb(s.neutralVariantPalette.tone(tone)), argb);
}

/**
 * 照 matugen 生成的那一份铺（蓝图「跟着人格的外观」第 5 条）：MD3 角色照它的（和桌面上别的软件一模一样），它没有的格子照上面的规矩
 * 生成：有含义的颜色往它的主色靠，不带颜色的照它 `surfaceVariant` 的色相、彩度取明度。
 * @param {Record<string, string>} roles 这一份的角色（`matugenOf` 认过的，驼峰的名字）
 * @param {string} source 主色 `#rrggbb`
 * @param {'light'|'dark'} scheme
 */
export function themeFromRoles(roles, source, scheme) {
  const nv = Hct.fromInt(argbFromHex(roles.surfaceVariant));
  return build(scheme, (name) => roles[name], (tone) => hexFromArgb(Hct.from(nv.hue, nv.chroma, tone).toInt()), argbFromHex(source));
}

/** 生成一份要的 MD3 角色（matugen 的模板照这一串写） */
export const ROLES = [...new Set([...Object.values(PAGE.light), ...Object.values(PAGE.dark), ...Object.values(COMMON), ...Object.values(TUI),
  ...Object.values(LINK), 'onSurface', 'surfaceVariant'])].sort();

/**
 * 认 matugen 生成的那一份（`package/matugen/miyu-web.json` 模板）：`{source, light: {角色: 颜色}, dark: {…}}`，角色是 matugen 的写法
 * （`surface_container_low`），换成驼峰；缺了哪个角色、颜色不是 `#rrggbb` 的是 `null`（当没有，回去自己取色）。
 * @param {any} json
 * @returns {{source: string, light: Record<string, string>, dark: Record<string, string>}|null}
 */
export function matugenOf(json) {
  const hex = (/** @type {any} */ v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  if (!json || !hex(json.source)) return null;
  /** @param {any} side */
  const side = (side) => {
    if (!side || typeof side !== 'object') return null;
    const out = /** @type {Record<string, string>} */ ({});
    for (const role of ROLES) {
      const v = side[role.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)];
      if (!hex(v)) return null;
      out[role] = v.toLowerCase();
    }
    return out;
  };
  const light = side(json.light);
  const dark = side(json.dark);
  return light && dark ? { source: json.source.toLowerCase(), light, dark } : null;
}

/**
 * 铺一份：角色从 `role` 来，不带颜色的从 `neutral(明度)` 来，有含义的颜色往 `source` 靠。
 * @param {'light'|'dark'} scheme @param {(name: string) => string} role @param {(tone: number) => string} neutral @param {number} source ARGB
 * @returns {{page: Record<string, string>, tui: Record<string, string>}}
 */
function build(scheme, role, neutral, source) {
  const roles = (/** @type {Record<string, string>} */ table) => Object.fromEntries(Object.entries(table).map(([k, name]) => [k, role(name)]));
  // 浅色的影用这一套的字色（原色表是暖黑），深色的照原色表（黑）
  const ink = argbFromHex(role('onSurface'));
  const shadow = scheme === 'light' ? `${(ink >> 16) & 255}, ${(ink >> 8) & 255}, ${ink & 255}` : null;
  const design = DESIGN[scheme];
  /** @param {Record<string, string>} from @param {string[]} quiet @param {(k: string) => boolean} keep */
  const derive = (from, quiet, keep) => Object.fromEntries(Object.entries(from).map(([k, v]) => {
    if (keep(k) || !/^#[0-9a-f]{6}$/i.test(v)) return [k, shadow && v.includes('rgba(') ? v.replace(/rgba\(\s*\d+,\s*\d+,\s*\d+,/g, `rgba(${shadow},`) : v];
    const hct = Hct.fromInt(argbFromHex(v));
    if (quiet.includes(k)) return [k, neutral(Math.round(hct.tone))];
    return [k, hexFromArgb(Blend.harmonize(hct.toInt(), source))];
  }));
  return {
    page: { ...derive(design.page, NEUTRAL.page, () => false), ...roles(PAGE[scheme]), ...roles(COMMON), ...roles(LINK) },
    tui: { ...derive(design.tui, NEUTRAL.tui, (k) => k.startsWith('mascot_')), ...roles(TUI) },
  };
}

/** ARGB 写成 `#rrggbb`（小写；存进人格、给人看、记缓存）。 @param {number} argb */
export const hexOf = (argb) => hexFromArgb(argb).toLowerCase();

/** 画在这个颜色上面的记号用深的还是浅的字色（MD3 的明度 60 以上的算浅色）。 @param {number|string} color ARGB 或 `#rrggbb` */
export function inkOf(color) {
  const argb = typeof color === 'string' ? argbFromHex(color) : color;
  return Hct.fromInt(argb).tone > 60 ? '#1a1b20' : '#ffffff';
}
