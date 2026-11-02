// @ts-check
//! 主题包用哪个主题、浅的还是深的、一个主题实际是什么颜色（蓝图 `web.md`「主题」）。纯函数；写变量、听系统在 `index.js`。
//!
//! 挂进来的一个主题是成对的一套：`render(scheme)` 交浅色或深色那一份的全部颜色，交不出的（「跟随人格」这时没有颜色可取）交 `null`，
//! 用第一个主题（默认）的那一份。

/**
 * @typedef {{page: Record<string, string>, tui: Record<string, string>}} Colors
 * @typedef {{id: string, name?: string, order?: number, hidden?: boolean, render: (scheme: 'light'|'dark') => (Colors|null)}} Palette
 * `hidden`：不出卡片、设置项选不到，只当兜底（默认那一套，2026-11-02 项目主人：有了自动之后就不需要默认了）。
 */

/**
 * 浅的还是深的：设置项「明暗」定了的照它，跟随系统（`auto`、没写、写错的）照系统。
 * @param {string|null|undefined} setting @param {'light'|'dark'} system @returns {'light'|'dark'}
 */
export const schemeOf = (setting, system) => (setting === 'light' || setting === 'dark' ? setting : system);

/**
 * 用哪个主题：设置项写了的（还在的）用它；没写、写的没了的用第一个。
 * @param {Palette[]} all @param {string|null|undefined} wanted
 */
/**
 * 用哪个主题：人选过的（设置项 `palette`）照它；没选、选的没了的照 `fallback`（出厂是自动，2026-11-02 项目主人：人格有主色的跟随人格，没有的
 * 跟随壁纸，都没有的自己退回默认的颜色；原来 10-20 起是跟随人格）；那个也没有（停用了自动）的用第一个。
 * @param {Palette[]} all @param {string|null|undefined} wanted @param {string|null|undefined} [fallback]
 */
export const chosenOf = (all, wanted, fallback = null) => {
  const pick = (/** @type {string|null|undefined} */ id) => all.find((p) => p.id === id && !p.hidden);
  return pick(wanted) ?? pick(fallback) ?? all[0] ?? null;
};

/**
 * 出卡片的那几套（设置页、引导）：不带 `hidden` 的、这一刻交得出颜色的（人格没头像、没自选主色的没有「跟随人格」，2026-11-02 项目主人）；
 * 正选着的那一套照旧出（不然一张都没勾）。
 * @param {Palette[]} all @param {string|null|undefined} chosen @param {'light'|'dark'} scheme
 */
export const choicesOf = (all, chosen, scheme) => all.filter((p) => !p.hidden && (p.id === chosen || !!p.render(scheme)));

/**
 * 一个主题这时的颜色：交不出的用第一个主题的那一份；都交不出的是 `null`。
 * @param {Palette[]} all @param {Palette} p @param {'light'|'dark'} scheme
 * @returns {Colors|null}
 */
export function colorsOf(all, p, scheme) {
  const own = p.render(scheme);
  if (own) return own;
  const first = all[0];
  return first && first !== p ? first.render(scheme) : null;
}
