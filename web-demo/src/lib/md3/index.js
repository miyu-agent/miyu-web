// @ts-check
//! 照一张图生成一个主题（蓝图 `web.md`「主题」的「跟着人格的外观」第 2 条；软件包 `theme-persona`、`theme-wallpaper`，人格的编辑卡片的
//! 「主题色」那一行共用）：从像素取主色，照 MD3 `CONTENT`、对比度 0 生成五条色板（中性、中性变体、主色、次色、第三色），全部的格子（和默认
//! 主题一样多）。纯函数；读图在 `pixels.js`，原色表（默认主题：深色 tokyonight、浅色晨光）在 `design.js`。
//!
//! 每一格怎么来（2026-10-14 项目主人定，两个头同一套，终端的方案页「终端配色方案」）：
//! - 归了色板的（`KIND`）：照原色表里这一格的明度（HCT 的 tone），从那条色板取同一明度的颜色：明暗层次和默认主题一样，只换色相。
//!   底、正文、思考、粗体、行内代码一类归中性；暗字、线、斜体、引用、注释一类归中性变体；强调色、链接、表头归主色；`gold` 归次色；
//!   `ribbon`、图片归第三色；吉祥物头归中性、耳朵归中性变体、眼睛归主色、鳍归第三色（原来照抄）。不再用 MD3 的角色。
//! - 有含义的颜色（出错、增删、警告、代码着色……，没归色板的 `#rrggbb`）：色相往主色靠一点（`Blend.harmonize`，最多转 15°），明度、彩度照原色表。
//! - 阴影、遮罩照原色表的样子，浅色的影换成这一套的字色；写成算式的照抄。
//! 浅色那一份照晨光的明度（底色近白，项目主人 10-14 定；终端照 Tokyo Night Day），深色照 tokyonight（两个头一样）。
//!
//! 用 `CONTENT` 不用 `TONAL_SPOT`：后者把底色那条色板也染得很重，头像取到肤色、金发时整页发棕发浑。

import { QuantizerCelebi, Score, Hct, SchemeContent, Blend, argbFromRgb, argbFromHex, hexFromArgb } from './vendor/mcu.min.js';
import { DESIGN } from './design.js';

/** 取主色时最多挑多少种颜色（MD3 取壁纸色的做法） */
const QUANTIZE = 128;
/** 太透明的像素不算（头像的圆角外面、抠了图的背景） */
const MIN_ALPHA = 200;

/** 色板：中性、中性变体、主色、次色、第三色（`SchemeContent` 的五条） */
const PALETTES = { n: 'neutralPalette', nv: 'neutralVariantPalette', p: 'primaryPalette', s: 'secondaryPalette', t: 'tertiaryPalette' };

/**
 * 每一格归哪条色板（照终端方案页的归类对过来；网页独有的层次照它的用处归）。没写的 `#rrggbb` 是有含义的颜色，往主色偏。
 * @type {{page: Record<string, keyof typeof PALETTES>, tui: Record<string, keyof typeof PALETTES>}}
 */
const KIND = {
  page: {
    surface: 'n', sidebar_bg: 'n', surface_1: 'n', surface_2: 'n', surface_3: 'n', sidebar_active: 'n', text: 'n', on_primary: 'n', tok_p: 'n',
    text_soft: 'nv', line: 'nv', line_strong: 'nv', tok_c: 'nv', tok_o: 'nv',
    accent: 'p', accent_soft: 'p', on_primary_container: 'p', link: 'p',
    gold: 's', ribbon: 't',
  },
  tui: {
    thought: 'n', thought_hover: 'n', shade: 'n', md_bold: 'n', md_code: 'n', md_math: 'n', diagram_backdrop: 'n',
    mascot_head: 'n', mascot_head_shade: 'n', mascot_outline: 'n',
    dim: 'nv', hover: 'nv', md_italic: 'nv', md_quote: 'nv', diagram_text: 'nv', diagram_line: 'nv', code_comment: 'nv', code_operator: 'nv',
    mascot_ear: 'nv', mascot_ear_shade: 'nv',
    accent: 'p', workspace: 'p', md_link: 'p', md_url: 'p', md_table_head: 'p', mascot_eye: 'p',
    md_image: 't', mascot_fin: 't', mascot_fin_shade: 't',
  },
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
 * @param {number|string} seed ARGB 或 `#rrggbb`（自选的主色、matugen 给的 `source`）
 * @param {'light'|'dark'} scheme
 * @returns {{page: Record<string, string>, tui: Record<string, string>}}
 */
export function themeOf(seed, scheme) {
  const argb = typeof seed === 'string' ? argbFromHex(seed) : seed;
  const s = /** @type {any} */ (new SchemeContent(Hct.fromInt(argb), scheme === 'dark', 0));
  const design = DESIGN[scheme];
  /** 从一条色板取同一明度的颜色 @param {keyof typeof PALETTES} kind @param {string} like 原色表里的那一格 */
  const pick = (kind, like) => {
    const palette = s[PALETTES[kind]];
    return hexFromArgb(Hct.from(palette.hue, palette.chroma, Hct.fromInt(argbFromHex(like)).tone).toInt());
  };
  /** @param {Record<string, string>} from @param {Record<string, keyof typeof PALETTES>} kinds @param {string|null} shadow */
  const derive = (from, kinds, shadow) => Object.fromEntries(Object.entries(from).map(([k, v]) => {
    if (!/^#[0-9a-f]{6}$/i.test(v)) return [k, shadow && v.includes('rgba(') ? v.replace(/rgba\(\s*\d+,\s*\d+,\s*\d+,/g, `rgba(${shadow},`) : v];
    if (kinds[k]) return [k, pick(kinds[k], v)];
    return [k, hexFromArgb(Blend.harmonize(argbFromHex(v), argb))];
  }));
  // 浅色的影用这一套的字色（原色表是暖黑），深色的照原色表（黑）
  const ink = argbFromHex(pick('n', design.page.text));
  const shadow = scheme === 'light' ? `${(ink >> 16) & 255}, ${(ink >> 8) & 255}, ${ink & 255}` : null;
  return { page: derive(design.page, KIND.page, shadow), tui: derive(design.tui, KIND.tui, null) };
}

/**
 * 认 matugen 生成的那一份（`web/matugen/miyu-web.json` 模板）：只取 `source`（主色），再照 `themeOf` 那一套算（2026-10-14 两个头一样，
 * 不直接用 matugen 给的角色；旧模板生成的、带了角色的照样认）。`source` 不是 `#rrggbb` 的是 `null`。
 * @param {any} json
 * @returns {{source: string}|null}
 */
export function matugenOf(json) {
  const source = json?.source;
  return typeof source === 'string' && /^#[0-9a-f]{6}$/i.test(source) ? { source: source.toLowerCase() } : null;
}

/** ARGB 写成 `#rrggbb`（小写；存进人格、给人看、记缓存）。 @param {number} argb */
export const hexOf = (argb) => hexFromArgb(argb).toLowerCase();

/** 画在这个颜色上面的记号用深的还是浅的字色（MD3 的明度 60 以上的算浅色）。 @param {number|string} color ARGB 或 `#rrggbb` */
export function inkOf(color) {
  const argb = typeof color === 'string' ? argbFromHex(color) : color;
  return Hct.fromInt(argb).tone > 60 ? '#1a1b20' : '#ffffff';
}
