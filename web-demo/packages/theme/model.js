// @ts-check
//! 主题包用哪个主题、浅的还是深的、一个主题实际是什么颜色（蓝图 `web.md`「主题」）。纯函数；写变量、听系统在 `index.js`。
//!
//! 挂进来的一个主题是成对的一套：`render(scheme)` 交浅色或深色那一份的全部颜色，交不出的（「跟随人格」这时没有颜色可取）交 `null`，
//! 用第一个主题（默认）的那一份。

/**
 * @typedef {{page: Record<string, string>, tui: Record<string, string>}} Colors
 * @typedef {{id: string, name?: string, order?: number, render: (scheme: 'light'|'dark') => (Colors|null)}} Palette
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
 * 用哪个主题：人选过的（设置项 `palette`）照它；没选、选的没了的照 `fallback`（出厂是跟随人格，2026-10-20 项目主人：默认配色跟随人格，没有人格的
 * 那一套自己退回默认的颜色）；那个也没有（停用了跟随人格）的用第一个。
 * @param {Palette[]} all @param {string|null|undefined} wanted @param {string|null|undefined} [fallback]
 */
export const chosenOf = (all, wanted, fallback = null) => all.find((p) => p.id === wanted) ?? all.find((p) => p.id === fallback) ?? all[0] ?? null;

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
