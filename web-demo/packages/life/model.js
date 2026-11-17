// @ts-check
//! 「推演人生」那一层列什么（软件包 `life`，蓝图 `web.md`「推演人生」第 3 条；W-1211「人生-归档」）：「正在过的」照 `life.list`（`lib/life.js` 的
//! `livesOf` 读），「已结束的人生」照会话表里结束了的人生会话，按人格分组。纯函数。

/**
 * @typedef {{session: string, persona?: string|null, last_active?: string, life?: boolean, life_ended?: boolean, title?: string, preview?: string}} Entry
 * @typedef {{session: string, title: string|null, at: string|null}} EndedRow
 * @typedef {{persona: string|null, name: string|null, rows: EndedRow[]}} EndedGroup
 */

/**
 * 已结束的人生（会话表那一项 `life`、`life_ended` 都是真的）按人格分组：组里新的在前（照最近活动，结束以后就不动了），最近结束的那一组在前；
 * 没有人格的（那时会话不带人格）另成一组排最后，名字是 `null`。标题照会话的标题，没有的照第一句，都没有的 `null`。
 * @param {Entry[]} entries @param {(persona: string) => string} nameOf @returns {EndedGroup[]}
 */
export function endedGroups(entries, nameOf) {
  /** @type {Map<string, EndedRow[]>} */
  const by = new Map();
  const ended = entries.filter((e) => e.life === true && e.life_ended === true)
    .map((e) => ({ key: e.persona ?? '', row: { session: e.session, title: e.title || e.preview || null, at: e.last_active ?? null } }))
    .sort((a, b) => (Date.parse(b.row.at ?? '') || 0) - (Date.parse(a.row.at ?? '') || 0));
  for (const { key, row } of ended) by.set(key, [...(by.get(key) ?? []), row]);
  const groups = [...by.entries()].map(([key, rows]) => ({ persona: key || null, name: key ? nameOf(key) : null, rows }));
  return [...groups.filter((g) => g.persona), ...groups.filter((g) => !g.persona)];
}

/**
 * 还没看过的那几段（核心 LF-14 的 `ended_unseen`，会话编号 → 那一项）照推来的变（W-1211）：推来 `life.ended`（哪种结束的都重问：核心只放她自己结束的）、
 * `notices` 流掉了队（`resync`）要重问 `life.list`；推来 `life.seen` 拿掉那一段（别的头收了、开了那个会话、删了会话）。别的不动。纯的。
 * @template T @param {Map<string, T>} unseen @param {string} method @param {any} params @returns {{reload: boolean, unseen: Map<string, T>}}
 */
export function unseenAfter(unseen, method, params) {
  if (method === 'resync' && params?.stream === 'notices') return { reload: true, unseen };
  if (method !== 'notice') return { reload: false, unseen };
  if (params?.kind === 'life.ended') return { reload: true, unseen };
  if (params?.kind === 'life.seen' && typeof params.session === 'string' && unseen.has(params.session)) {
    const next = new Map(unseen);
    next.delete(params.session);
    return { reload: false, unseen: next };
  }
  return { reload: false, unseen };
}
