// @ts-check
//! 吉祥物站在输入框右上沿时，框上面那一行（运行状态、循环的下次、长期目标）右边给它让出的那一格（蓝图 web.md「手机上」吉祥物那条、
//! 「定时任务」第 2b 条，2026-11-14 主人选手机上缩小站框上、那一行右边让一格）：宽写在 `html` 的 `--character-lane`，
//! `styles/dock.css` 照它多分一列空着。Deniro（软件包 `mascot`）和外观包挂的那一只（软件包 `character`）各报各的，取宽的那个。
//! 窄屏上缩几倍、让位多空几像素是这两个包的设置项 `narrow`（`{scale, gap}`），不写死。

/** 设置项 `narrow` 没写的照这个（主人 11-14 看预览选的六成） */
export const NARROW_DEFAULT = Object.freeze({ scale: 0.6, gap: 8 });
/** 和左栏变抽屉的是同一个宽 */
export const NARROW = '(max-width: 836px)';

/**
 * 设置项 `narrow` 照能用的读：`scale` 在 (0, 1] 里、`gap` 不小于 0，别的照出厂的。
 * @param {any} raw @returns {{scale: number, gap: number}}
 */
export function narrowOf(raw) {
  const scale = Number(raw?.scale);
  const gap = Number(raw?.gap);
  return {
    scale: Number.isFinite(scale) && scale > 0 && scale <= 1 ? scale : NARROW_DEFAULT.scale,
    gap: Number.isFinite(gap) && gap >= 0 ? gap : NARROW_DEFAULT.gap,
  };
}

/** 这一刻画多大：窄屏照设置项缩，宽屏原大小 @param {boolean} narrow @param {any} raw */
export const scaleOf = (narrow, raw) => (narrow ? narrowOf(raw).scale : 1);

/**
 * 那一格多宽：从输入框右边到吉祥物看得见的左边，再多空 `gap`。量不到的（没画、藏着）是 0。
 * @param {{left: number, width: number}|null|undefined} rect 吉祥物看得见的那一块（屏幕像素） @param {number} right 输入框右边 @param {number} gap
 */
export function laneOf(rect, right, gap) {
  if (!rect || !(rect.width > 0)) return 0;
  return Math.max(0, Math.round(right - rect.left + gap));
}

/**
 * Deniro 平常站的那一格（不跟着它走动变）：它的中心离输入框右边 `home.right`（`mascot` 的设置项 `home`），身子 `w` 缩 `scale` 倍。
 * @param {number} homeRight @param {number} w @param {number} scale @param {number} gap
 */
export const homeLaneOf = (homeRight, w, scale, gap) => laneOf({ left: -homeRight - (w * scale) / 2, width: w * scale }, 0, gap);

/** 谁报了多宽 @type {Map<string, number>} */
const owners = new Map();

/**
 * 报一格（`px` 是 0 的撤掉自己那一份）；写在 `html` 上的是几份里最宽的。
 * @param {string} owner @param {number} px @param {HTMLElement} [root]
 */
export function setLane(owner, px, root = document.documentElement) {
  if (px > 0) owners.set(owner, px);
  else owners.delete(owner);
  const wide = Math.max(0, ...owners.values());
  if (wide > 0) root.style.setProperty('--character-lane', `${wide}px`);
  else root.style.removeProperty('--character-lane');
}
