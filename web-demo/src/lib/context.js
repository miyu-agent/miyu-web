// @ts-check
//! 上下文明细、累计按用途（蓝图 `web.md`「上下文明细、累计按用途」第 3、4 条）的纯逻辑：照核心 `session.context` 的回应摊数、
//! 横条一块多宽；照 `usage.query` 按 `use` 分的行排用途。界面在 `ui/context-pop.js`；右侧边栏的「会话信息」卡（软件包 `setup`）也照它画上下文的横条，所以放在 `lib`（软件包只能用 `lib`）。

/**
 * @typedef {{part: string, label: string, tokens: number, tone?: string, children?: Part[]}} Part
 *   `tone` 是自己定的颜色（累计那一个里的用途），不写的照 `part` 认
 * @typedef {{window?: number, line?: number, used?: number, basis?: string, anchor?: number, estimated_total?: number, parts?: Part[]}} Context
 */

/** 顶层几块的颜色（CSS 变量名），别的照 `text-faint` */
export const PART_TONES = /** @type {Record<string, string>} */ ({
  system: 'accent', tools: 't-thought', demos: 'ribbon', summary: 'online', messages: 'gold', output: 'ctx-output',
});

/** 认得的用途，照这几样写名字；别的归「其他」 */
export const USES = ['main', 'compaction', 'subagent', 'recap', 'title', 'memory', 'other'];

/**
 * 摊好的几块：给了 `used` 的照 `used / 顶层原值之和` 摊（连子项），顶层加起来就是 `used`；顶层原值已经等于 `used`（核心摊好了）、
 * 没给 `used` 的照原值。摊完四舍五入成整数。
 * @param {Context} c
 * @returns {Part[]}
 */
export function scaledParts(c) {
  const parts = c?.parts ?? [];
  const raw = parts.reduce((n, p) => n + (p.tokens ?? 0), 0);
  const k = c?.used != null && raw > 0 && raw !== c.used ? c.used / raw : 1;
  /** @param {Part} p @returns {Part} */
  const scale = (p) => ({ ...p, tokens: Math.round((p.tokens ?? 0) * k), children: p.children?.length ? p.children.map(scale) : undefined });
  return parts.filter((p) => (p.tokens ?? 0) > 0).map(scale);
}

/**
 * 子代理的各部分（蓝图「上下文明细、累计按用途」第 4 条）：连子代理的（`session.usage_parts` 的 `tree: true`）照块的编号逐块减去主会话
 * 自己的（`tree: false`），子项一样；减完是 0 的、减成负的（两次问之间又多了请求）不要。
 * @param {Part[]} all @param {Part[]} own
 * @returns {Part[]}
 */
export function partsMinus(all, own) {
  const mine = new Map((own ?? []).map((p) => [p.part, p]));
  return (all ?? []).map((p) => {
    const o = mine.get(p.part);
    const kids = partsMinus(p.children ?? [], o?.children ?? []);
    return { ...p, tokens: Math.max(0, (p.tokens ?? 0) - (o?.tokens ?? 0)), children: kids.length ? kids : undefined };
  }).filter((p) => p.tokens > 0);
}

/**
 * 横条：顶层一块一段，宽是占「满格」的几成（满格是窗口，没窗口的是用了多少）；压缩线的位置（没窗口、没线的是 `null`）。
 * @param {Context} c @param {Part[]} parts 摊好的
 * @returns {{full: number, segments: {part: string, ratio: number}[], line: number|null}}
 */
export function bar(c, parts) {
  const used = parts.reduce((n, p) => n + p.tokens, 0);
  const full = c?.window || used || 1;
  const segments = parts.map((p) => ({ part: p.part, ratio: Math.min(1, p.tokens / full) }));
  const line = c?.window && c?.line ? Math.min(1, c.line / c.window) : null;
  return { full, segments, line };
}

/** 一块占满格的百分比，一位小数（`35.3`）；不到 0.1 的写 `<0.1` @param {number} tokens @param {number} full */
export function share(tokens, full) {
  if (!full) return '';
  const p = (tokens * 100) / full;
  if (p > 0 && p < 0.1) return '<0.1';
  return (Math.round(p * 10) / 10).toFixed(1);
}

/** 顶层那一块的颜色名（子项照它的上一级） @param {string} part */
export function toneOf(part) {
  return PART_TONES[part.split('.')[0]] ?? 'text-faint';
}

/** 用途的颜色（CSS 变量名） */
export const USE_TONES = /** @type {Record<string, string>} */ ({
  main: 'accent', compaction: 't-code-type', subagent: 'ribbon', recap: 'online', title: 'ctx-title', memory: 'text-soft', other: 'text-faint',
});

/**
 * @typedef {{uncached: number, cache_read: number, cache_write: number, output: number}} Usage
 * @typedef {{use: string, tokens: number, requests: number, unpriced: number, usage: Usage, amounts: {currency: string, amount: number}[]}} UseRow
 */

/**
 * 按用途的几行：照 `use` 归好（不认得的归 `other`）、加起来（请求、四项用量、没价格的次数、花费照币种），照 token 从多到少排，0 的不要。
 * @param {any[]} rows `usage.query` 的 `rows`
 * @returns {UseRow[]}
 */
export function useRows(rows) {
  /** @type {Map<string, {use: string, requests: number, unpriced: number, usage: Usage, amounts: Map<string, number>}>} */
  const by = new Map();
  for (const r of rows ?? []) {
    const use = USES.includes(r.use) ? r.use : 'other';
    const x = by.get(use) ?? { use, requests: 0, unpriced: 0, usage: { uncached: 0, cache_read: 0, cache_write: 0, output: 0 }, amounts: new Map() };
    x.requests += r.requests ?? 0;
    x.unpriced += r.unpriced ?? 0;
    for (const k of /** @type {(keyof Usage)[]} */ (['uncached', 'cache_read', 'cache_write', 'output'])) x.usage[k] += r.usage?.[k] ?? 0;
    for (const a of r.amounts ?? []) x.amounts.set(a.currency, (x.amounts.get(a.currency) ?? 0) + a.amount);
    by.set(use, x);
  }
  return [...by.values()]
    .map((x) => ({ use: x.use, tokens: inputOf(x.usage) + x.usage.output, requests: x.requests, unpriced: x.unpriced, usage: x.usage,
      amounts: [...x.amounts].map(([currency, amount]) => ({ currency, amount })) }))
    .filter((x) => x.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
}

/** 输入：没命中的、命中的、写缓存的 @param {Usage} u */
export const inputOf = (u) => u.uncached + u.cache_read + u.cache_write;

/** 几行的花费照币种加起来 @param {UseRow[]} rows */
export function costOf(rows) {
  /** @type {Map<string, number>} */
  const all = new Map();
  for (const x of rows) for (const a of x.amounts) all.set(a.currency, (all.get(a.currency) ?? 0) + a.amount);
  return [...all].map(([currency, amount]) => ({ currency, amount }));
}
