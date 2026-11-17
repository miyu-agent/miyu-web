// @ts-check
//! 存成了、核心又接了一句警告的（核心 CK-1：`config.set` 改的几项里指着现在没有的人格、预设、知识库，照收，回应多一格
//! `problems`，话已经照这条连接的语言说好了）：记在那一项上，重画出来的那一行下面照别的问题的样子写一行黄字。核心的 `config.get`
//! 不报这一种，所以要网页自己记着：这一次开着设置时一直在，同一项再存一次照新的回应换掉，关了设置就忘。

/**
 * 问题落在哪一项上：键是那一项、或者那一项里的一格（`<项>[n]…`、`<项>.…`）；对不上的算在头一项上（只改了一项的最常见）。
 * @param {string[]} keys 这一次改的几项 @param {any} problem
 * @returns {string|null}
 */
function keyOf(keys, problem) {
  const key = typeof problem?.key === 'string' ? problem.key : '';
  return keys.find((k) => key === k || key.startsWith(`${k}[`) || key.startsWith(`${k}.`)) ?? keys[0] ?? null;
}

/**
 * 这一次存成了以后记着的警告：`before` 里这一次改的几项先拿掉（新的回应说了算，没带 `problems` 的就是没有了），再照回应的
 * `problems` 挂上；别的项的照旧。交回新的一份，不改 `before`。
 * @param {Map<string, {level: string, message: string}[]>|null|undefined} before
 * @param {{key: string}[]} changes 这一次的 `config.set` 改的几项
 * @param {any} reply `config.set` 的回应
 * @returns {Map<string, {level: string, message: string}[]>}
 */
export function savedWarnings(before, changes, reply) {
  const next = new Map(before ?? []);
  const keys = changes.map((c) => c.key);
  for (const key of keys) next.delete(key);
  const problems = Array.isArray(reply?.problems) ? reply.problems : [];
  for (const problem of problems) {
    const message = typeof problem?.message === 'string' ? problem.message : '';
    const owner = keyOf(keys, problem);
    if (!message || owner === null) continue;
    next.set(owner, [...(next.get(owner) ?? []), { level: problem.level === 'error' ? 'error' : 'warn', message }]);
  }
  return next;
}
