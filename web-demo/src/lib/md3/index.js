// @ts-check
//! 照一张图生成一套颜色（蓝图 `web.md`「主题」的「跟着人格的外观」第 2 条；软件包 `theme-persona`、`theme-wallpaper`，人格的编辑卡片的
//! 「主题色」那一行共用）：从像素取主色，照 MD3 `CONTENT`、对比度 0 生成浅色或深色一套，换成要盖在同深浅的那一套上面的几格。纯函数；
//! 读图在 `pixels.js`。
//!
//! 只盖中性色和强调色：出错的红、差异的红绿、链接、代码高亮、吉祥物的颜色照同深浅的那一套（语义色跟着图变了反而认不出）。用 `CONTENT` 不用
//! `TONAL_SPOT`：后者把底色也染上主色，头像取到肤色、金发时整页发棕发浑；`CONTENT` 的底色基本是中性灰，只有强调带颜色。

import { QuantizerCelebi, Score, Hct, SchemeContent, MaterialDynamicColors as D, argbFromRgb, argbFromHex, hexFromArgb } from './vendor/mcu.min.js';

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
 * 照主色生成一套要盖的颜色。
 * @param {number|string} seed ARGB 或 `#rrggbb`（自选的主色）
 * @param {'light'|'dark'} scheme 浅的还是深的
 * @returns {{page: Record<string, string>, tui: Record<string, string>}}
 */
export function cellsOf(seed, scheme) {
  const argb = typeof seed === 'string' ? argbFromHex(seed) : seed;
  const s = new SchemeContent(Hct.fromInt(argb), scheme === 'dark', 0);
  const pick = (/** @type {Record<string, string>} */ table) => Object.fromEntries(Object.entries(table).map(([k, role]) => [k, hexFromArgb(/** @type {any} */ (D)[role].getArgb(s))]));
  return { page: { ...pick(PAGE[scheme]), ...pick(COMMON) }, tui: pick(TUI) };
}

/** ARGB 写成 `#rrggbb`（小写；存进人格、给人看、记缓存）。 @param {number} argb */
export const hexOf = (argb) => hexFromArgb(argb).toLowerCase();

/** 画在这个颜色上面的记号用深的还是浅的字色（MD3 的明度 60 以上的算浅色）。 @param {number|string} color ARGB 或 `#rrggbb` */
export function inkOf(color) {
  const argb = typeof color === 'string' ? argbFromHex(color) : color;
  return Hct.fromInt(argb).tone > 60 ? '#1a1b20' : '#ffffff';
}
