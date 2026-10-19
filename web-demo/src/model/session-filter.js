// @ts-check
//! 全部会话那一页的筛、排、分组（蓝图 `web.md`「会话整理和项目」第 6、7 条）：一排筛选（全部、每个项目一个、不在项目里、在跑、没看过）、
//! 「按最近活动」「按创建时间」两种排法，照同样的时间分组；「项目」那一页一张卡片写几个会话、最近活动。纯函数。

import { uuidTime } from './ago.js';
import { byTime } from './session.js';

/**
 * 一行要的：会话表的一项加上读进来的状态。
 * @typedef {{session: string, title: string|null, project: string|null, active: number|null, running: boolean, unread: boolean}} Row
 * @typedef {'all'|'loose'|'running'|'unread'|`project:${string}`} Filter
 * @typedef {'active'|'created'} Sort
 */

/** 排序用的时刻：最近活动（不知道的照开的时刻）、开的时刻（编号里的时间）。 @param {Row} r @param {Sort} sort */
export const timeOf = (r, sort) => (sort === 'created' ? uuidTime(r.session) : r.active ?? uuidTime(r.session)) ?? 0;

/**
 * 照筛选、搜索的字留下的几行（搜标题，不分大小写）。不认得的项目（刚删了的）的会话照不在项目里算。
 * @param {Row[]} rows @param {Filter} filter @param {string} query @param {Set<string>} projects 现在有的项目
 */
export function filterRows(rows, filter, query, projects) {
  const q = query.trim().toLowerCase();
  const loose = (/** @type {Row} */ r) => !r.project || !projects.has(r.project);
  return rows.filter((r) => {
    if (q && !(r.title ?? '').toLowerCase().includes(q)) return false;
    if (filter === 'all') return true;
    if (filter === 'loose') return loose(r);
    if (filter === 'running') return r.running;
    if (filter === 'unread') return r.unread;
    return r.project === filter.slice('project:'.length) && !loose(r);
  });
}

/**
 * 排好、照时间分组（最近、近 7 天、近 30 天、30 天前；没有会话的组不出来）：新的在前。
 * @param {Row[]} rows @param {Sort} sort @param {number} now
 */
export function groupRows(rows, sort, now) {
  const sorted = [...rows].sort((a, b) => timeOf(b, sort) - timeOf(a, sort));
  return byTime(sorted.map((r) => ({ ...r, active: timeOf(r, sort) })), now);
}

/**
 * 「项目」那一页的卡片：每个项目几个会话、最近活动（照最近活动的那个会话；一个会话都没有的是 `null`）。
 * @param {Row[]} rows @param {{project: string}[]} projects
 * @returns {Map<string, {count: number, active: number|null}>}
 */
export function projectStats(rows, projects) {
  const out = new Map(projects.map((p) => [p.project, { count: 0, active: /** @type {number|null} */ (null) }]));
  for (const r of rows) {
    const s = r.project ? out.get(r.project) : null;
    if (!s) continue;
    s.count += 1;
    const at = timeOf(r, 'active');
    if (s.active == null || at > s.active) s.active = at;
  }
  return out;
}
