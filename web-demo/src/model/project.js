// @ts-check
//! 项目的几样纯逻辑（蓝图 `web.md`「会话整理和项目」；核心 H-1、H-2，`docs/reference/projects.md`）：十二种颜色、左栏里一个项目露哪几个会话、
//! 在项目里开的新会话先选上什么。新建、项目设置那一张表在软件包 `setup`（`project-form.js`），颜色经服务 `chat` 交过去。

/**
 * 十二种颜色（第 8 条，2026-10-19 项目主人看过样品：「可选颜色不够多」以后加到十二种）：存进项目的是浅色那一种，深色里画成同一种颜色亮一档的
 * （照样品的两套）。先后照样品的那一排。
 */
export const PALETTE = /** @type {const} */ ([
  ['#c0603f', '#e08a6a'], ['#d0782a', '#f0a060'], ['#b8892f', '#e0af68'], ['#4f8f3a', '#8fcf6a'],
  ['#3a8a7a', '#6cc4b0'], ['#2f8fb0', '#6ccbe8'], ['#3a63c9', '#7aa2f7'], ['#7a5cc0', '#b39af0'],
  ['#c2417a', '#f07fae'], ['#8a5a3c', '#c8957a'], ['#5d6b8a', '#9aa8cc'], ['#8a8a80', '#9aa0b0'],
]);

/**
 * 画出来的颜色：十二种里的照深浅换一套，自选的照原样，没设的交 `null`（照默认的暗字色画）。
 * @param {string|undefined|null} color @param {boolean} dark
 */
export function colorOf(color, dark) {
  if (!color) return null;
  const hit = PALETTE.find(([light]) => light === color.toLowerCase());
  return hit ? hit[dark ? 1 : 0] : color;
}

/** 新建项目先选哪个颜色：照已经有几个项目轮着来（样品的做法）。 @param {number} count */
export const nextColor = (count) => PALETTE[count % PALETTE.length][0];

/**
 * 左栏里每个项目露的会话（第 3、4 条）：照排好的先后（`rank`），不算置顶的（置顶的项目会话在「置顶」里），全部（2026-10-19 项目主人选的：展开就列
 * 全部，原来只露最近 5 个、更多的要进项目页）；没有的项目交空的。
 * @template {{session: string, pinned?: boolean, project?: string|null}} T
 * @param {T[]} ranked @param {{project: string}[]} projects
 * @returns {Map<string, T[]>}
 */
export function projectRows(ranked, projects) {
  /** @type {Map<string, T[]>} */
  const out = new Map(projects.map((p) => [p.project, []]));
  for (const r of ranked) {
    const list = r.project && !r.pinned ? out.get(r.project) : null;
    if (list) list.push(r);
  }
  return out;
}

/**
 * 在项目里开的新会话先选上什么（第 9 条）：人格、预设、工作区照项目的（没写的照默认，人照样能改），发第一句时带 `project`。人格 `false` 是明着
 * 不用人格（同整页的 `draft`），`null` 是照默认。
 * @param {import('../core/projects.js').Project} p
 * @returns {{persona: string|false|null, preset: string|null, cwd: string|null, project: string}}
 */
export function draftOf(p) {
  return {
    persona: !('persona' in p) ? null : p.persona === null ? false : p.persona ?? null,
    preset: p.preset ?? null,
    cwd: p.workspace ?? null,
    project: p.project,
  };
}
