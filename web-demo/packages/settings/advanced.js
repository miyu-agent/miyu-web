// @ts-check
//! 「高级」页（蓝图 `web.md`「设置页」；2026-10-19 项目主人：高级里不该平铺所有配置项，选了「一组一行，点进去看」，要有动画）：一组一行（模型目录、冷却、
//! 运行日志、软件源……），名字下面一行暗字写这一组前几项的名字，右边 ›，有出错的项名字后面一个红点；点一行照软件包的信息页那样滑进去（`subpage.js`），页头
//! 写组名、左上角箭头返回，里面是这一组的项（核心拉起的扩展的组照旧先是运行、权限两行）。搜索照旧平铺结果。

import { h, icon } from '../../src/lib/dom.js';
import { coreRow, groupBlock, banner } from './rows.js';

/** 说明里写前几项的名字 */
const PREVIEW = 3;

/** @param {any} dialog @param {any} page `buildPages` 的 `advanced` 页 */
export function drawAdvanced(dialog, page) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const rows = page.groups.map((/** @type {any} */ g) => {
    const names = g.items.map((/** @type {any} */ i) => i.name).filter(Boolean);
    const desc = names.length > PREVIEW ? t('advanced_more', { names: names.slice(0, PREVIEW).join('、') }) : names.join('、');
    const bad = g.items.some((/** @type {any} */ i) => i.problems.some((/** @type {any} */ x) => x.level === 'error'));
    return h('div.set-row.set-pkg.is-expandable', { onclick: () => dialog.openSub(g.name, () => groupPage(dialog, g.id)) },
      h('div.set-text', h('div.set-name', h('span', g.name), bad ? h('i.set-dot') : null), desc ? h('p.set-desc', desc) : null),
      h('span.set-pkg-arrow', icon('chevron-right')));
  });
  return [...page.problems.map((/** @type {any} */ p) => banner(p)), rows.length ? h('section.set-group', h('div.set-rows', rows)) : null];
}

/**
 * 一组点进去的那一层：照现在读到的（重读过的配置也照新的）画这一组的项。
 * @param {any} dialog @param {string} id
 */
function groupPage(dialog, id) {
  const g = dialog.pages.find((/** @type {any} */ p) => p.id === 'advanced')?.groups.find((/** @type {any} */ x) => x.id === id);
  if (!g) return [h('p.set-empty', dialog.ctx.text('pkg.gone'))];
  const rows = g.items.map((/** @type {any} */ item) => coreRow(dialog, item)).filter(Boolean);
  if (dialog.extensions.entries.has(g.id)) return [h('section.set-group', dialog.extensions.body(g.id, rows))];
  return [groupBlock(null, rows)];
}
