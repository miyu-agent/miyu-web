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
