// @ts-check
//! 人格的背景图铺成什么样（蓝图 `web.md`「跟着人格的外观」第 6 条，核心 P-7）：透明度（图露出多少）换成盖在上面的底色多浓，焦点换成 CSS
//! 的位置。纯函数；铺在 `index.js`。

/** 一个数在 0–100 之间（整数） @param {any} v */
const percent = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100;

/**
 * 盖在图上的底色多浓（百分数）：人格设了透明度的是 100 减它；没设的、写错的照设置项 `veil`（0–1）。
 * @param {number|null|undefined} opacity 图露出多少，0–100 @param {number} fallback 设置项 `veil`
 */
export function veilOf(opacity, fallback) {
  return percent(opacity) ? 100 - /** @type {number} */ (opacity) : Math.round(fallback * 100);
}

/**
 * 焦点换成 CSS 的 `background-position`：`[x, y]`（0–100）是 `x% y%`；没设的、写错的居中。
 * @param {any} focus
 */
export function positionOf(focus) {
  return Array.isArray(focus) && focus.length === 2 && focus.every(percent) ? `${focus[0]}% ${focus[1]}%` : 'center';
}

/** 预先糊图时缩到的长边（拖滑杆预览时用一半，快） */
export const BLUR_SIDE = 960;
/** 模糊半径是糊的那张宽的多少（程度 100 时） */
const BLUR_SHARE = 0.04;

/** 模糊程度有没有设、设得对不对：1–100 的整数；别的（没设、0、写错）是不模糊 @param {any} v */
export const blurOn = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 100;

/**
 * 糊的那张多大：长边缩到 `side`（本来就小的不放大）。
 * @param {number} width @param {number} height @param {number} [side]
 */
export function bakeSize(width, height, side = BLUR_SIDE) {
  const scale = Math.min(1, side / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * 在糊的那张上的模糊半径（像素）：宽的 4% 乘程度的百分数，最少 1；不模糊的 0。
 * @param {any} amount 模糊程度 @param {number} width 糊的那张的宽
 */
export function blurRadius(amount, width) {
  return blurOn(amount) ? Math.max(1, Math.round(width * BLUR_SHARE * amount / 100)) : 0;
}

/**
 * 铺满窗口以后，背景在屏幕上已经糊掉多少像素（照 cover：图放大到盖满窗口的那个倍数）。左栏、输入框的磨砂减去这么多。
 * @param {any} amount @param {{width: number, height: number}} image 原图多大 @param {{width: number, height: number}} view 窗口多大
 */
export function screenBlur(amount, image, view) {
  if (!blurOn(amount)) return 0;
  const cover = Math.max(view.width / Math.max(image.width, 1), view.height / Math.max(image.height, 1));
  return Math.round(BLUR_SHARE * amount / 100 * image.width * cover);
}
