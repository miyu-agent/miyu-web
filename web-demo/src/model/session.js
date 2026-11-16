// @ts-check
//! 会话的先后、打开页面时进哪个会话（蓝图 `web.md`「左栏」「连核心」第 4 条）。左栏的一项照核心的会话表（9-5，
//! `core/session-index.js`）、读进来了的会话状态，由 `Store.summary` 合起来；置顶、最近活动也照它，左栏照它们排（`rank`）。

import { uuidTime } from './ago.js';

/**
 * 左栏、会话列表排先后的时刻（蓝图 `web.md`「左栏」，2026-11-16 项目主人）：人最后一次发话（核心 SX-1 的 `last_spoken`），只切进去不挪，
 * 循环、定时任务、人生自己醒这些没人说话的轮不算；没人说过话的照开的时刻（编号里的时间），不照最近活动：没人理的人生会话每醒一次就会跳到最上面。
 * @param {{session: string, spoken?: number|null}} r
 */
export const spokenAt = (r) => r.spoken ?? uuidTime(r.session) ?? 0;

/** 会话表那一项的 `last_spoken`（毫秒）；还没人说过话的、读不出来的是 `null`。 @param {{last_spoken?: string}|undefined} e */
export function spokenOf(e) {
  const at = Date.parse(e?.last_spoken ?? '');
  return Number.isNaN(at) ? null : at;
}

/** 最近活动的时刻，不知道的照开的时刻：打开页面进哪个会话、删了正在看的切到哪个照它（同终端）。 @param {{session: string, active?: number|null}} r */
export const activeAt = (r) => r.active ?? uuidTime(r.session) ?? 0;

/**
 * 会话的先后（蓝图 `web.md`「左栏」组头、「会话列表」）：置顶的在最前，别的照 `at` 从近到远，出厂照人最后一次发话（`spokenAt`）。
 * @template {{session: string, pinned?: boolean, active?: number|null, spoken?: number|null}} T
 * @param {T[]} rows
 * @param {(r: T) => number} [at]
 * @returns {T[]}
 */
export function rank(rows, at = spokenAt) {
  return [...rows].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || at(b) - at(a));
}

/**
 * 打开页面时进哪个会话（蓝图「连核心」第 4 条）：共用的配置项 `ui.startup` 是 `recent` 的进最近动静的那个（一个都没有的是新会话），
 * 别的（出厂的 `new`、读不出来的）是一个空的新会话。
 * @param {any} reply `config.get {keys: ["ui.startup"]}` 的回应；读不出来的是 `null`
 * @param {string[]} ranked 会话照最近动静排好的
 * @returns {string|null} 会话编号，`null` 是新会话
 */
export function startupSession(reply, ranked) {
  return reply?.items?.['ui.startup']?.value === 'recent' ? ranked[0] ?? null : null;
}

/** 左栏、全部会话按时间分的几组（蓝图 `web.md`「会话整理和项目」第 2 条），先后照这个 */
export const TIME_GROUPS = /** @type {const} */ (['recent', 'week', 'month', 'older']);

/** 本地时间的那一天从几点开始（毫秒） @param {number} ms */
const dayOf = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * 一个时刻在哪一组：今天、昨天的「最近」，7 天以内的「近 7 天」，30 天以内的「近 30 天」，更早的「30 天前」（照本地时间的日子数）。
 * @param {number} at @param {number} now
 * @returns {typeof TIME_GROUPS[number]}
 */
export function timeGroup(at, now) {
  const days = Math.round((dayOf(now) - dayOf(at)) / 86400000);
  if (days < 2) return 'recent';
  if (days < 7) return 'week';
  if (days < 30) return 'month';
  return 'older';
}

/**
 * 导进来的只读存档那一段（核心 SE-1 下，设计 58 第三节第 4 条，W-1094）：左栏、全部会话都排在按时间的几组后面，段里照进来的先后，
 * 不再按最近、近 7 天细分。
 */
export const ARCHIVE_GROUP = /** @type {const} */ ('archived');

/**
 * 照时间分组（顺序照原来的，排好的进来、排好的出去；没有会话的组不出来）。时刻照 `at`，出厂照最近活动，不知道的照开的时刻；左栏传
 * `spokenAt`，和它排的先后一致。
 * 存档（会话表那一项带 `archived: true`）不进时间的几组，单成最后一段 `archived`，有存档才出来。
 * @template {{session: string, active?: number|null, spoken?: number|null, archived?: boolean}} T
 * @param {T[]} rows @param {number} now @param {(r: T) => number} [at]
 * @returns {{group: typeof TIME_GROUPS[number] | typeof ARCHIVE_GROUP, rows: T[]}[]}
 */
export function byTime(rows, now, at = activeAt) {
  /** @type {Map<string, T[]>} */
  const out = new Map(TIME_GROUPS.map((g) => [g, []]));
  /** @type {T[]} */
  const archived = [];
  for (const r of rows) {
    if (r.archived) archived.push(r);
    else out.get(timeGroup(at(r), now))?.push(r);
  }
  /** @type {{group: typeof TIME_GROUPS[number] | typeof ARCHIVE_GROUP, rows: T[]}[]} */
  const groups = TIME_GROUPS.map((group) => ({ group, rows: out.get(group) ?? [] })).filter((g) => g.rows.length);
  return archived.length ? [...groups, { group: ARCHIVE_GROUP, rows: archived }] : groups;
}

/**
 * 存档挪到最后（别的先后不动）：左栏「会话」那一栏只露前几个，存档不占在聊的会话的位置（W-1094）。
 * @template {{archived?: boolean}} T @param {T[]} rows @returns {T[]}
 */
export function archiveLast(rows) {
  return [...rows.filter((r) => !r.archived), ...rows.filter((r) => r.archived)];
}
