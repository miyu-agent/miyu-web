// @ts-check
//! 花费怎么写（蓝图 `web.md`「用量页」第 6 条，核心 UC-1，2026-10-26 项目主人）：`usage.query` 的一行、会话状态的 `usage` 有 `converted`
//! （每一笔照那天的汇率换成 `usage.currency` 加起来的一个数）的写它，没换成的（`rest`）照币种接在后面「¥12.30 + $0.40」；一笔都没换成的
//! （没有 `converted`，旧核心也是）照旧照 `amounts` 各写各的。几行加起来（合计、按用途归到一起）时换算成的加在一起，没换成的并在后面。
//! 用到兜底汇率源的带 `rates`（来源、链接），界面照它注明来源。纯函数：用量页、框下面累计的浮窗共用。

import { money } from './format.js';

/**
 * @typedef {{currency: string, amount: number}} Amount
 * @typedef {{source: string, url: string}} Rate 汇率的来源（只有用到兜底源时核心才写）
 * @typedef {{currency: string, amount: number, rest?: Amount[], rates?: Rate[]}} Converted
 * @typedef {{amounts?: Amount[], converted?: Converted|null}} Priced 有金额的一行
 */

/** 照币种并起来，先后照头一次出现的 @param {Amount[][]} lists @returns {Amount[]} */
function merge(lists) {
  /** @type {Map<string, number>} */
  const by = new Map();
  for (const list of lists) for (const a of list ?? []) by.set(a.currency, (by.get(a.currency) ?? 0) + a.amount);
  return [...by].map(([currency, amount]) => ({ currency, amount }));
}

/** 来源去重（照链接） @param {(Rate[]|undefined)[]} lists @returns {Rate[]} */
export function uniqueRates(lists) {
  /** @type {Map<string, Rate>} */
  const by = new Map();
  for (const list of lists) for (const r of list ?? []) if (r && typeof r.url === 'string') by.set(r.url, r);
  return [...by.values()];
}

/**
 * 一行要写的那几笔：换算成的一笔在前、没换成的照币种接在后面；没有 `converted` 的照 `amounts`。
 * @param {Priced|null|undefined} row @returns {Amount[]}
 */
export function costParts(row) {
  const c = row?.converted;
  if (c && typeof c.amount === 'number' && c.currency) return [{ currency: c.currency, amount: c.amount }, ...(c.rest ?? [])];
  return row?.amounts ?? [];
}

/** 一行的花费写成字：「¥12.30」「¥12.30 + $0.40」「$1.27 + ¥12.92」；一笔都没有是空的 @param {Priced|null|undefined} row */
export const costText = (row) => money(costParts(row));

/**
 * 几行加成一份：`amounts` 照币种各加各的（同原来）；有一行换算过就有 `converted`：换成同一个币种的加起来，别的（换成别的币种的、
 * 没换成的 `rest`、整行没换算的 `amounts`）照币种并进 `rest`；来源去重。一行都没换算过的没有 `converted`。
 * @param {Priced[]} rows @returns {{amounts: Amount[], converted?: Converted}}
 */
export function addCosts(rows) {
  const amounts = merge(rows.map((r) => r.amounts ?? []));
  const target = rows.find((r) => r.converted?.currency)?.converted?.currency;
  if (!target) return { amounts };
  let amount = 0;
  /** @type {Amount[][]} */
  const rest = [];
  for (const r of rows) {
    const c = r.converted;
    if (c?.currency === target) {
      amount += c.amount;
      rest.push(c.rest ?? []);
    } else if (c?.currency) rest.push([{ currency: c.currency, amount: c.amount }, ...(c.rest ?? [])]);
    else rest.push(r.amounts ?? []);
  }
  const left = merge(rest).filter((a) => a.amount !== 0);
  const rates = uniqueRates(rows.map((r) => r.converted?.rates));
  /** @type {Converted} */
  const converted = { currency: target, amount };
  if (left.length) converted.rest = left;
  if (rates.length) converted.rates = rates;
  return { amounts, converted };
}

/**
 * 照花费排的数（从前往后一个一个比）：换算过的先比换成的那个数，再照 `order` 比没换成的；没换算的照 `order` 的币种一种一种比；
 * 没有价格的是 `[-1]`，排最后。
 * @param {Priced} row @param {string[]} [order] 币种的先后（`usage.currency` 在前）
 * @returns {number[]}
 */
export function costKey(row, order = []) {
  const byOrder = (/** @type {Amount[]} */ list) => {
    const all = [...order, ...list.map((a) => a.currency).filter((c) => !order.includes(c))];
    return all.map((c) => list.find((a) => a.currency === c)?.amount ?? 0);
  };
  const c = row.converted;
  if (c && typeof c.amount === 'number') return [c.amount, ...byOrder(c.rest ?? [])];
  if (!row.amounts?.length) return [-1];
  return byOrder(row.amounts);
}

/**
 * 一次回应里用到的汇率来源：顶上的 `rates`，连每一行 `converted` 里带的，去重。
 * @param {{rates?: Rate[], rows?: Priced[]}|null|undefined} reply @returns {Rate[]}
 */
export const ratesOf = (reply) => uniqueRates([reply?.rates, ...(reply?.rows ?? []).map((r) => r.converted?.rates)]);

/** 来源的名字：open.er-api.com 写它的牌子 ExchangeRate-API（署名照它的条款），别的照原样 @param {Rate} r */
export const rateName = (r) => (r.source === 'open.er-api.com' ? 'ExchangeRate-API' : r.source);
