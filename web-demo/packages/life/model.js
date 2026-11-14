// @ts-check
//! 「推演人生」那一层列什么（软件包 `life`，蓝图 `web.md`「推演人生」第 3 条）：会话表里的人生会话一个一行。还在的那一条照 `life.status`
//! 写状态、下次几点醒、她在干嘛；以前结束了留着当档案的写「已结束」。先在跑的、暂停的，再结束了的；同一档照最近活动，新的在前。纯函数。

/**
 * @typedef {{session: string, persona?: string|null, last_active?: string, life?: boolean, life_ended?: boolean, title?: string, preview?: string}} Entry
 * @typedef {{state: 'none'|'running'|'paused'|'ended', session: string|null, next: Date|null, doing: string|null}} Status
 * @typedef {{session: string, persona: string|null, title: string|null, state: 'running'|'paused'|'ended', next: Date|null, doing: string|null}} Row
 */

const RANK = { running: 0, paused: 1, ended: 2 };

/**
 * @param {Entry[]} entries 会话表的全部 @param {Map<string, Status>} statuses 人格 → `life.status`（还没问回来的没有）
 * @returns {Row[]}
 */
export function lifeRows(entries, statuses) {
  const rows = entries.filter((e) => e.life === true).map((e) => {
    const persona = e.persona ?? null;
    const now = persona ? statuses.get(persona) : undefined;
    // 这个人格眼下那一条：照 `life.status`（暂停、在跑会话表不写）；别的都是结束了的
    const mine = now?.session === e.session && now.state !== 'none';
    const state = e.life_ended ? 'ended' : mine ? now.state : 'paused';
    return {
      session: e.session, persona, title: e.title ?? e.preview ?? null,
      state: /** @type {Row['state']} */ (state === 'none' ? 'paused' : state),
      next: mine && state === 'running' ? now.next : null,
      doing: mine && state !== 'ended' ? now.doing : null,
      active: Date.parse(e.last_active ?? '') || 0,
    };
  });
  rows.sort((a, b) => RANK[a.state] - RANK[b.state] || b.active - a.active);
  return rows.map(({ active, ...r }) => r);
}

/** 会话表里人生会话的人格（去重），拿去问 `life.status`。 @param {Entry[]} entries @returns {string[]} */
export const lifePersonas = (entries) => [...new Set(entries.filter((e) => e.life === true && e.persona).map((e) => /** @type {string} */ (e.persona)))];

/**
 * 下次醒的时刻：今天的只写「14:05」，明天「明天 14:05」，再往后「11/16 14:05」（浏览器本地时区）。
 * @param {Date} at @param {Date} now @param {(key: string, fields?: any) => string} t
 */
export function wakeText(at, now, t) {
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const day = (/** @type {Date} */ d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(at) - day(now)) / 86400000);
  if (diff <= 0) return hm;
  if (diff === 1) return t('tomorrow', { time: hm });
  return `${at.getMonth() + 1}/${at.getDate()} ${hm}`;
}
