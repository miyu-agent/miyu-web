// @ts-check
//! 主题包选哪一套、一套实际是什么颜色（蓝图 `web.md`「主题」、「跟着人格的外观」第 1 条）。纯函数；写变量、听系统在 `index.js`。
//!
//! 挂进来的一套：定的（`scheme` 是 `light`、`dark`）`render()` 交整套；生成的（`scheme` 是 `auto`）浅深跟着系统，`render(scheme)` 交要盖在
//! 同深浅的第一套定的上面的那几格，交 `null` 的不盖。

/**
 * @typedef {{page: Record<string, string>, tui: Record<string, string>}} Colors
 * @typedef {{id: string, name?: string, scheme: 'light'|'dark'|'auto', render: (scheme?: 'light'|'dark') => (Colors|Partial<Colors>|null)}} Palette
 */

/** 一套是浅的还是深的：生成的跟着系统。 @param {Palette} p @param {'light'|'dark'} system @returns {'light'|'dark'} */
export const schemeOf = (p, system) => (p.scheme === 'auto' ? system : p.scheme);

/** 同深浅的第一套定的。 @param {Palette[]} all @param {'light'|'dark'} scheme */
export const baseOf = (all, scheme) => all.find((p) => p.scheme === scheme) ?? null;

/**
 * 现在用哪一套：设置项写了的（还在的）用它；没写的、写的没了的跟着系统（同深浅的第一套定的），再没有的用第一套定的、第一套。
 * @param {Palette[]} all @param {string|null|undefined} wanted 设置项 `palette` @param {'light'|'dark'} system
 */
export function chosenOf(all, wanted, system) {
  return all.find((p) => p.id === wanted) ?? baseOf(all, system) ?? all.find((p) => p.scheme !== 'auto') ?? all[0] ?? null;
}

/**
 * 一套这时实际的颜色：定的照它，生成的是同深浅的第一套定的盖上它交的那几格。
 * @param {Palette[]} all @param {Palette} p @param {'light'|'dark'} system
 * @returns {Colors}
 */
export function colorsOf(all, p, system) {
  if (p.scheme !== 'auto') return /** @type {Colors} */ (p.render());
  const base = /** @type {Colors|null} */ (baseOf(all, system)?.render() ?? null);
  const over = p.render(system);
  return { page: { ...base?.page, ...over?.page }, tui: { ...base?.tui, ...over?.tui } };
}
