// @ts-check
//! 功能树（蓝图 `web.md`「人格、预设、工作区」第 8 条；核心设计 52「功能分组」第四节）：照 `preset.get`、`preset.set` 回应的 `sections`
//! 画，组怎么分、先后、名字核心都算好了，这里不翻译、不排序、不认编号。三处共用：设置页编辑预设（能改）、引导「自定义」（能改，改的是还没存的
//! 那一份，[`withChanges`]）、引导「查看功能」（只看）。
//!
//! - 一组：头一行组名、暗字「开了几项」；`package` 的多一个总开关（拨一下这几个功能全开、全关），别的只当标题（2026-10-27 项目主人：组一关
//!   就是二十个，误点代价大）。技能、脚本、MCP 三组空的写「还没有…」。
//! - 组下面直接是功能，带了几件工具的工具缩进一格；一直展开。两列，照行数摊匀、先后不变（[`split`]）。

import { h } from '../../src/lib/dom.js';

/**
 * @typedef {{id: string, name?: string, on?: boolean}} Tool
 * @typedef {{kind?: string, id: string, name?: string, summary?: string, on?: boolean, by?: string, tools?: Tool[]}} Item
 * @typedef {{id: string, kind: string, name?: string, on?: number, total?: number, items: Item[]}} Section
 * @typedef {{key: string, value?: boolean, unset?: true}} Change
 */

/** 空的时候写「还没有…」的三组 */
const EMPTY_KINDS = ['skills', 'scripts', 'mcp'];

/** 一组占几行：头一行，功能、工具各一行；空的组多一行「还没有…」。 @param {Section} sec */
export const rowsOf = (sec) => 1 + (sec.items.length || 1) + sec.items.reduce((n, f) => n + (f.tools?.length ?? 0), 0);

/**
 * 两列（设计 52：照行数摊匀、先后不变）：一组不拆开，找让高的那一列最矮的分点，前几组在左、剩下的在右。
 * @param {Section[]} sections @returns {[Section[], Section[]]}
 */
export function split(sections) {
  const rows = sections.map(rowsOf);
  const total = rows.reduce((a, b) => a + b, 0);
  let best = 0;
  let tallest = Infinity;
  let left = 0;
  for (let k = 0; k <= rows.length; k++) {
    const tall = Math.max(left, total - left);
    if (tall < tallest) {
      tallest = tall;
      best = k;
    }
    left += rows[k] ?? 0;
  }
  return [sections.slice(0, best), sections.slice(best)];
}

/**
 * 筛（设置页的搜索框）：照组名、功能名、工具名，不分大小写；组名对得上的整组留着，功能对得上的留它（连工具），只有工具对得上的留那几件和它的功能。
 * 一个都没剩的组不要。空的字是原样。
 * @param {Section[]} sections @param {string} query @returns {Section[]}
 */
export function filterTree(sections, query) {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  const hit = (/** @type {string|undefined} */ text) => !!text && text.toLowerCase().includes(q);
  return sections.flatMap((sec) => {
    if (hit(sec.name)) return [sec];
    const items = sec.items.flatMap((f) => {
      if (hit(f.name) || hit(f.id)) return [f];
      const tools = (f.tools ?? []).filter((tool) => hit(tool.name) || hit(tool.id));
      return tools.length ? [{ ...f, tools }] : [];
    });
    return items.length ? [{ ...sec, items, shown: true }] : [];
  });
}

/**
 * 旧核心不给 `sections` 的：照 `features` 拼一组（组名照给的）。没装的不列。
 * @param {any[]} features @param {string} name @returns {Section[]}
 */
export function fallbackSections(features, name) {
  const items = features.filter((f) => f.installed !== false).map((f) => ({ ...f, kind: 'feature' }));
  return [{ id: 'features', kind: 'group', name, on: items.filter((f) => f.on).length, total: items.length, items }];
}

/**
 * 照改动换一份（引导「自定义」改的是还没存的那一份）：`features.<编号>`、`tools.<编号>` 照写的换，组头的「开了几项」重算。
 * @param {Section[]} sections @param {Change[]} changes @returns {Section[]}
 */
export function withChanges(sections, changes) {
  const set = new Map(changes.map((c) => [c.key, c.value]));
  return sections.map((sec) => {
    const items = sec.items.map((f) => ({
      ...f,
      on: set.has(`features.${f.id}`) ? !!set.get(`features.${f.id}`) : f.on,
      tools: f.tools?.map((tool) => ({ ...tool, on: set.has(`tools.${tool.id}`) ? !!set.get(`tools.${tool.id}`) : tool.on })),
    }));
    return { ...sec, items, on: items.filter((f) => f.on).length, total: items.length };
  });
}

/**
 * 画功能树。能改的（给了 `toggle`、`set`）开关照 `set` 写（成了交 `true`）；只看的（没给）开着的前面 ✓、关着的 — 暗着。`unlisted` 是 `on`
 * 的预设里预设明写了的功能多一个「跟随全局默认」。
 * @param {{sections: Section[], t: (key: string, fields?: any) => string, toggle?: (on: boolean, change: (on: boolean) => any) => HTMLElement,
 *   set?: (changes: Change[]) => any, unlisted?: string|null}} o
 * @returns {HTMLElement}
 */
export function featureTree(o) {
  const cols = split(o.sections).filter((col) => col.length);
  return h('div.setup-tree', cols.map((col) => h('div.setup-tree-col', col.map((sec) => section(o, sec)))));
}

/** 一组。 @param {Parameters<typeof featureTree>[0]} o @param {Section} sec */
function section(o, sec) {
  const live = sec.items;
  const count = `${sec.on ?? live.filter((f) => f.on).length}/${sec.total ?? live.length}`;
  const all = o.toggle && o.set && sec.kind === 'package' && live.length
    ? o.toggle(live.some((f) => f.on), (next) => {
      const changes = live.filter((f) => !!f.on !== next).map((f) => ({ key: `features.${f.id}`, value: next }));
      return changes.length ? o.set?.(changes) : true;
    })
    : null;
  const head = h('div.setup-feature.is-head', h('span.setup-feature-name', sec.name ?? sec.id), h('span.setup-fold-count', count), all);
  const empty = !live.length && EMPTY_KINDS.includes(sec.kind) ? h('p.setup-tree-empty', o.t(`edit.tree_empty.${sec.kind}`)) : null;
  return h('section.setup-feature-block', head, empty, live.length ? h('div.setup-feature-kids', live.map((f) => feature(o, f, sec.kind))) : null);
}

/** 一个功能（带工具的工具缩进一格）。`kind` 是它那一组的。 @param {Parameters<typeof featureTree>[0]} o @param {Item} f @param {string} kind */
function feature(o, f, kind) {
  const name = h('span.setup-feature-name', { title: f.summary ?? null }, f.name ?? f.id);
  const tools = f.tools ?? [];
  if (!o.toggle || !o.set) {
    const row = h(`div.setup-feature.is-kid${f.on ? '' : '.is-off'}`, h('span.setup-feature-mark', f.on ? '✓' : '—'), name);
    if (!tools.length) return row;
    return h('div', row, h('div.setup-tools', tools.map((tool) => h(`div.setup-tool${f.on && tool.on ? '' : '.is-off'}`,
      h('span.setup-feature-mark', f.on && tool.on ? '✓' : '—'), h('span', tool.name ?? tool.id)))));
  }
  const set = o.set;
  const toggle = o.toggle(!!f.on, (on) => set([{ key: `features.${f.id}`, value: on }]));
  const row = h('div.setup-feature.is-kid', name, ...(EMPTY_KINDS.includes(kind) ? marks(o, f) : []), toggle);
  if (!tools.length) return row;
  return h('div', row, h(`div.setup-tools${f.on ? '' : '.is-off'}`, tools.map((tool) => {
    const one = o.toggle?.(!!tool.on, (on) => set([{ key: `tools.${tool.id}`, value: on }])) ?? null;
    if (!f.on) one?.setAttribute('disabled', '');
    return h('div.setup-tool', h('span', tool.name ?? tool.id), one);
  })));
}

/**
 * 谁定的（设计 52 的 `by`；2026-10-20 项目主人）：`global` 写「跟随全局」；`preset` 在 `unlisted` 是 `on` 的预设里给「跟随全局默认」（删掉预设里写的那一项）；
 * `group`、`default` 不写。只有技能、脚本、MCP 三组的功能接全局开关，别的组不写。
 * @param {Parameters<typeof featureTree>[0]} o @param {Item} f
 */
function marks(o, f) {
  if (f.by === 'global') return [h('span.setup-feature-by', o.t('edit.by_global'))];
  if (f.by !== 'preset' || o.unlisted !== 'on') return [];
  const set = o.set;
  return [h('button.setup-feature-back', { type: 'button', onclick: () => set?.([{ key: `features.${f.id}`, unset: true }]) }, o.t('edit.follow_global'))];
}
