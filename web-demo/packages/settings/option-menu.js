// @ts-check
//! 下拉的选项（蓝图 `web.md`「设置页」第 5 条「选项的暗字和提示」，核心设计 72，W-1228）：核心 `config.schema` 一项的 `options`
//! 换成菜单的一项项。`description` 写在名字下面，核心查得出的 `note`（「需要密钥」这类）接在名字后面，`available: false` 的
//! 暗着、点不了；带 `notice` 的选了以后弹一句提示。不认键名、不认值，哪一项带了都一样。

/** @typedef {{value: any, name: string, desc?: string, note?: string, off: boolean, notice?: string}} MenuOption */

/** 有字的才算：空的、只有空白的当没有。 */
const said = (/** @type {unknown} */ text) => (typeof text === 'string' && text.trim() ? text : undefined);

/**
 * @param {any[]|undefined} options `config.schema` 一项的 `options`
 * @returns {MenuOption[]}
 */
export const menuOptions = (options) => (options ?? []).map((o) => ({
  value: o.value,
  name: o.name,
  desc: said(o.description),
  note: said(o.note),
  off: o.available === false,
  notice: said(o.notice),
}));

/**
 * 选了 `value` 要弹的那一句；没有的是 `null`。
 * @param {MenuOption[]} options @param {any} value
 */
export const noticeFor = (options, value) =>
  options.find((o) => JSON.stringify(o.value) === JSON.stringify(value))?.notice ?? null;
