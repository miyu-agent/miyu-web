// @ts-check
//! 脚本里调的工具（蓝图 `web.md`「时间线」的「脚本里调的工具」；核心 M-5 上，`view.md` 的 `nested`）：她在命令里用 `miyu call` 调的工具。
//! 条目上只有个数和最近一个（`{count, last}`），点开照 `view.detail` 要整份。这里是纯的：那一行后面接的字、一个的状态怎么写、
//! 接着要来的怎么拼（纯的，`lib/`：软件包 `jobs` 也用）。状态的字、画法在 `ui/nested.js`。


/**
 * @typedef {{n: number, name: string, title?: {name?: string, object?: string}|null, state: string, started?: string,
 *   args?: string, took_ms?: number, reason?: string, result?: {blob: string, bytes?: number}}} Call 一个（`view.detail` 的 `nested` 一项）
 * @typedef {{count: number, last: Call}} Nested 条目上的那一格
 */

/** 出错、被拒（`danger`）；要确认、脚本里没问的（`warn`）；别的不上色。 @param {string|undefined} state */
export function toneOf(state) {
  if (state === 'error' || state === 'denied') return 'danger';
  if (state === 'needs_approval') return 'warn';
  return null;
}

/** 显示名：核心照连接的语言写好的；没有的照工具名。 @param {Call} c */
export const nameOf = (c) => c?.title?.name || c?.name || '';

/**
 * 那一行后面接的（执行命令、后台命令）：`#12 翻记忆`，最近那一个出错、被拒、要确认的带上颜色。没调过的（没有这一格、认不出的）是 `null`。
 * @param {any} nested 条目、任务表那一项的 `nested`
 * @returns {{text: string, tone: string|null}|null}
 */
export function nestedTail(nested) {
  const last = nested?.last;
  if (!last || !Number.isFinite(last.n)) return null;
  return { text: `#${last.n} ${nameOf(last)}`.trim(), tone: toneOf(last.state) };
}

/**
 * 接着要来的拼上去：照序号，同一个序号的换成新的（在跑的了结了）。交回新的一份，照序号排。
 * @param {Call[]} had @param {Call[]|null|undefined} got
 */
export function mergeNested(had, got) {
  const by = new Map(had.map((c) => [c.n, c]));
  for (const c of got ?? []) if (c && Number.isFinite(c.n)) by.set(c.n, c);
  return [...by.values()].sort((a, b) => a.n - b.n);
}

/**
 * 下一次带的 `nested_after`：已经有的里头最大的序号；一个都没有的不带（`null`，要整份）。核心照它交比它大的，加上它和以前还在跑的。
 * @param {Call[]} had
 */
export function afterOf(had) {
  return had.length ? Math.max(...had.map((c) => c.n)) : null;
}

/** 条目上那一格的样子（变了才再要）。 @param {any} nested */
export const nestedSig = (nested) => (nested?.last ? `${nested.count}:${nested.last.n}:${nested.last.state}` : '');

/** 参数原文写成一行一个 `键: 值`（同点开一步，嵌套的压成一行 JSON）；读不懂的照原文。 @param {string|undefined} args */
export function argLines(args) {
  if (!args) return '';
  let v;
  try {
    v = JSON.parse(args);
  } catch {
    return args.trim();
  }
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v, null, 2);
  return Object.entries(v).map(([k, raw]) => `${k}: ${raw == null ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)}`).join('\n');
}
