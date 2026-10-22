// @ts-check
//! 上下文明细、累计按用途（蓝图 `web.md`「上下文明细、累计按用途」第 3、4 条）的纯逻辑：照核心 `session.context` 的回应摊数、
//! 横条一块多宽；照 `usage.query` 按 `use` 分的行排用途。界面在 `ui/context-pop.js`。

/**
 * @typedef {{part: string, label: string, tokens: number, children?: Part[]}} Part
 * @typedef {{window?: number, line?: number, used?: number, basis?: string, anchor?: number, estimated_total?: number, parts?: Part[]}} Context
 */

/** 顶层几块的颜色（CSS 变量名），别的照 `text-faint` */
export const PART_TONES = /** @type {Record<string, string>} */ ({
  system: 'accent', tools: 't-thought', demos: 'ribbon', summary: 'online', messages: 'gold',
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

/**
 * 按用途的几行：照 `use` 归好（不认得的归 `other`）、加起来，照 token 从多到少排，0 的不要。
 * @param {any[]} rows `usage.query` 的 `rows`
 * @returns {{use: string, tokens: number, amounts: {currency: string, amount: number}[]}[]}
 */
export function useRows(rows) {
  /** @type {Map<string, {use: string, tokens: number, amounts: Map<string, number>}>} */
  const by = new Map();
  for (const r of rows ?? []) {
    const use = USES.includes(r.use) ? r.use : 'other';
    const u = r.usage ?? {};
    const tokens = (u.uncached ?? 0) + (u.cache_read ?? 0) + (u.cache_write ?? 0) + (u.output ?? 0);
    const x = by.get(use) ?? { use, tokens: 0, amounts: new Map() };
    x.tokens += tokens;
    for (const a of r.amounts ?? []) x.amounts.set(a.currency, (x.amounts.get(a.currency) ?? 0) + a.amount);
    by.set(use, x);
  }
  return [...by.values()].filter((x) => x.tokens > 0).sort((a, b) => b.tokens - a.tokens)
    .map((x) => ({ use: x.use, tokens: x.tokens, amounts: [...x.amounts].map(([currency, amount]) => ({ currency, amount })) }));
}
