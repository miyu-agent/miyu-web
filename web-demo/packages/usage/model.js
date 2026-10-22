// @ts-check
//! 用量页的纯逻辑（蓝图 `web.md`「用量页」）：照核心 `usage.query` 的行（分组的几格 + `requests`、`usage` 四项、`amounts`、`unpriced`）
//! 算输入、合计、花费怎么写，时间段从哪起、今天一小时一段，柱子照天还是照月，纵轴一格多少，名字照哪个字。界面在 `page.js`。

/**
 * @typedef {{uncached: number, cache_read: number, cache_write: number, output: number}} Usage
 * @typedef {{currency: string, amount: number}} Amount
 * @typedef {{requests: number, usage: Usage, amounts: Amount[], unpriced: number, [group: string]: any}} Row
 * @typedef {{key: string, label: string, title: string, row: Row|null, now?: boolean}} Bar
 */

/** 「全部」最早那天到今天超过几天改成照月画 */
export const MONTHLY_AFTER = 90;

const ZERO = () => ({ uncached: 0, cache_read: 0, cache_write: 0, output: 0 });

/** 输入（不算输出）：没命中的、命中的、写缓存的 @param {Usage} u */
export const input = (u) => (u.uncached ?? 0) + (u.cache_read ?? 0) + (u.cache_write ?? 0);
/** 输入加输出 @param {Usage} u */
export const total = (u) => input(u) + (u.output ?? 0);

/** 几行加成一行（照币种各加各的，先后照头一次出现的：核心给的先后已经是 `usage.currency` 排的） @param {Row[]} rows @returns {Row} */
export function sum(rows) {
  const usage = ZERO();
  /** @type {Map<string, number>} */
  const amounts = new Map();
  let requests = 0, unpriced = 0;
  for (const r of rows) {
    requests += r.requests ?? 0;
    unpriced += r.unpriced ?? 0;
    for (const k of /** @type {(keyof Usage)[]} */ (['uncached', 'cache_read', 'cache_write', 'output'])) usage[k] += r.usage?.[k] ?? 0;
    for (const a of r.amounts ?? []) amounts.set(a.currency, (amounts.get(a.currency) ?? 0) + a.amount);
  }
  return { requests, usage, amounts: [...amounts].map(([currency, amount]) => ({ currency, amount })), unpriced };
}

/** 一笔钱、几笔钱的写法挪到了 `src/lib/format.js`（框下面累计的浮窗也用），这里照旧交出去 */
export { amountText, money } from '../../src/lib/format.js';

/** 本地日期 `2026-10-20` @param {Date} d */
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 本地月份 `2026-10` @param {Date} d */
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

/** 此刻的时区，写成核心认的 `+09:00` @param {Date} d */
export function offsetOf(d) {
  const m = -d.getTimezoneOffset();
  const a = Math.abs(m);
  return `${m < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** 本地 0 点，往前挪几天 @param {Date} now @param {number} back */
export function midnight(now, back = 0) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
}

/** `2026-10-20` 读成本地那一天的 0 点；写法不对的是 `null` @param {string} text */
export function parseDay(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dayKey(d) === text ? d : null;
}

/** 两天之间几天（连头带尾） @param {Date} a @param {Date} b */
export const daysBetween = (a, b) => Math.round((midnight(b).getTime() - midnight(a).getTime()) / 86400000) + 1;

/** 往后挪几天 @param {Date} d @param {number} n */
const shift = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * 时间段：从哪天 0 点起、到哪天 0 点止（不含）。今天、7 天、30 天到明天 0 点（以后的也没有）；全部两头都不写；自定义照选的两天，
 * 选反了的对调，晚于今天的当今天。
 * @param {'1'|'7'|'30'|'all'|'custom'} range @param {Date} now @param {{from: string, to: string}|null} [custom]
 * @returns {{from: Date|null, until: Date|null}}
 */
export function spanOf(range, now, custom = null) {
  if (range === 'all') return { from: null, until: null };
  if (range === 'custom') {
    const today = midnight(now);
    let a = parseDay(custom?.from ?? '') ?? today;
    let b = parseDay(custom?.to ?? '') ?? today;
    if (a > b) [a, b] = [b, a];
    if (b > today) b = today;
    if (a > b) a = b;
    return { from: a, until: shift(b, 1) };
  }
  return { from: midnight(now, Number(range) - 1), until: null };
}

/** 照时间段写进请求的那两格（核心认的时刻）；没有的不写 @param {{from: Date|null, until: Date|null}} span */
export function spanParams(span) {
  return { ...(span.from ? { from: span.from.toISOString() } : {}), ...(span.until ? { until: span.until.toISOString() } : {}) };
}

/** 一天一小时一段（本地整点），24 段：`{from, until}` 照核心的时刻写 @param {Date} day */
export function hours(day) {
  const base = midnight(day);
  return Array.from({ length: 24 }, (_, i) => {
    const from = new Date(base.getFullYear(), base.getMonth(), base.getDate(), i);
    const until = new Date(base.getFullYear(), base.getMonth(), base.getDate(), i + 1);
    return { from: from.toISOString(), until: until.toISOString(), hour: i };
  });
}

/**
 * 一天的柱子：一小时一根；是今天的，现在这一小时标出来，之后的空着。悬停写「15:00～16:00」。
 * @param {(Row|null)[]} rows 24 个，照 `hours` 的先后 @param {Date} day @param {Date} now @param {(key: string, fields?: any) => string} t @returns {Bar[]}
 */
export function hourBars(rows, day, now, t) {
  const today = dayKey(day) === dayKey(now);
  return rows.map((row, i) => ({
    key: String(i),
    label: i % 6 === 0 ? t('axis.hour', { hour: i }) : '',
    title: t('tip.hour', { from: `${pad(i)}:00`, to: `${pad(i + 1)}:00` }),
    row: (today && i > now.getHours()) || !row || !row.requests ? null : row,
    now: today && i === now.getHours(),
  }));
}

/**
 * 照天的柱子：从 `start` 起 `n` 天；横轴每隔几天写一个，最后一根总写，今天写「今天」。
 * @param {Row[]} rows `group: ["day"]` 的行 @param {Date} start @param {number} n @param {Date} now @param {(key: string, fields?: any) => string} t @returns {Bar[]}
 */
export function dayBars(rows, start, n, now, t) {
  const by = new Map(rows.map((r) => [r.day, r]));
  const every = n <= 7 ? 1 : n <= 31 ? 5 : 15;
  const today = dayKey(now);
  return Array.from({ length: n }, (_, i) => {
    const d = shift(start, i);
    const key = dayKey(d);
    const labelled = (n - 1 - i) % every === 0;
    return {
      key,
      label: labelled ? (key === today ? t('axis.today') : t('axis.day', { month: d.getMonth() + 1, day: d.getDate() })) : '',
      title: t('tip.day', { month: d.getMonth() + 1, day: d.getDate() }),
      row: by.get(key) ?? null,
      now: key === today,
    };
  });
}

/**
 * 照月的柱子：从 `start` 那个月（没写的照最早有请求的那个月）到 `end` 那个月，天加成月；这个月写「本月」。
 * @param {Row[]} rows `group: ["day"]` 的行 @param {Date|null} start @param {Date} end @param {Date} now @param {(key: string, fields?: any) => string} t @returns {Bar[]}
 */
export function monthBars(rows, start, end, now, t) {
  /** @type {Map<string, Row[]>} */
  const by = new Map();
  for (const r of rows) {
    if (typeof r.day !== 'string') continue;
    const k = r.day.slice(0, 7);
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const first = start ? monthKey(start) : [...by.keys()].sort()[0] ?? monthKey(end);
  const [y0, m0] = first.split('-').map(Number);
  const last = monthKey(end);
  const bars = [];
  for (let d = new Date(y0, m0 - 1, 1); monthKey(d) <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const key = monthKey(d);
    const list = by.get(key);
    bars.push({ key, label: '', title: t('tip.month', { year: d.getFullYear(), month: d.getMonth() + 1 }), row: list ? sum(list) : null, now: key === monthKey(now) });
  }
  const every = Math.max(1, Math.ceil(bars.length / 8));
  bars.forEach((b, i) => {
    const [y, m] = b.key.split('-').map(Number);
    if ((bars.length - 1 - i) % every === 0) b.label = b.now ? t('axis.this_month') : t('axis.month', { year: y, month: m });
  });
  return bars;
}

/**
 * 「全部」照天还是照月：最早有请求的那天到今天不超过 90 天照天（至少 7 根），超过的照月。一天都没有的是空的。
 * @param {Row[]} rows `group: ["day"]` 的行 @param {Date} now @param {(key: string, fields?: any) => string} t
 * @returns {{monthly: boolean, bars: Bar[]}}
 */
export function allBars(rows, now, t) {
  const days = rows.map((r) => r.day).filter((d) => typeof d === 'string').sort();
  if (!days.length) return { monthly: false, bars: [] };
  const first = /** @type {Date} */ (parseDay(days[0]));
  const span = daysBetween(first, now);
  if (span > MONTHLY_AFTER) return { monthly: true, bars: monthBars(rows, null, now, now, t) };
  const n = Math.max(span, 7);
  return { monthly: false, bars: dayBars(rows, midnight(now, n - 1), n, now, t) };
}

/**
 * 自定义的两天之间（一天的另照小时画）：不超过 90 天照天，超过的照月。
 * @param {Row[]} rows `group: ["day"]` 的行 @param {Date} from @param {Date} to 最后一天（含） @param {Date} now @param {(key: string, fields?: any) => string} t
 * @returns {{monthly: boolean, bars: Bar[]}}
 */
export function rangeBars(rows, from, to, now, t) {
  const n = daysBetween(from, to);
  if (n > MONTHLY_AFTER) return { monthly: true, bars: monthBars(rows, from, to, now, t) };
  return { monthly: false, bars: dayBars(rows, from, n, now, t) };
}

/** 纵轴四格，一格多少：1、2、2.5、5 乘十的几次方里，四格盖得住最高那根的最小的（至少 1）。 @param {number} max */
export function niceStep(max) {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max / 4));
  // token 是整数：一格至少 1
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p * 4 >= max) return Math.max(1, m * p);
  return Math.max(1, 10 * p);
}

/**
 * 表的排法：照哪一列、正着还是倒着。数的那几列（请求、token、命中率、输出、花费）倒着是从大到小，名字照 `nameOf` 的字；
 * 花费照币种的先后（`order`，核心给的合计里的先后）一种一种比，只有没价格的最小。一样的照名字，`null` 那一行总在最后。
 * @typedef {'name'|'requests'|'tokens'|'hit'|'output'|'cost'} Column
 * @param {Row[]} rows @param {{by: Column, desc: boolean}} sort @param {string} group @param {string[]} [order] @param {(r: Row) => string} [nameOf]
 */
export function sorted(rows, sort, group, order = [], nameOf = (r) => String(r[group])) {
  const costs = (/** @type {Row} */ r) => {
    if (!r.amounts?.length) return [-1];
    const all = [...order, ...r.amounts.map((a) => a.currency).filter((c) => !order.includes(c))];
    return all.map((c) => r.amounts.find((a) => a.currency === c)?.amount ?? 0);
  };
  /** @type {(r: Row) => number|number[]} */
  const value = {
    requests: (/** @type {Row} */ r) => r.requests,
    tokens: (/** @type {Row} */ r) => total(r.usage),
    hit: (/** @type {Row} */ r) => (input(r.usage) ? r.usage.cache_read / input(r.usage) : 0),
    output: (/** @type {Row} */ r) => r.usage.output ?? 0,
    cost: costs,
    name: () => 0,
  }[sort.by];
  const byName = (/** @type {Row} */ a, /** @type {Row} */ b) => nameOf(a).localeCompare(nameOf(b), 'zh');
  const cmp = (/** @type {Row} */ a, /** @type {Row} */ b) => {
    if (sort.by === 'name') return byName(a, b);
    const va = value(a), vb = value(b);
    if (Array.isArray(va) && Array.isArray(vb)) {
      for (let i = 0; i < Math.max(va.length, vb.length); i++) if ((va[i] ?? 0) !== (vb[i] ?? 0)) return (va[i] ?? 0) - (vb[i] ?? 0);
      return 0;
    }
    return /** @type {number} */ (va) - /** @type {number} */ (vb);
  };
  return [...rows].sort((a, b) => {
    if ((a[group] === null) !== (b[group] === null)) return a[group] === null ? 1 : -1;
    return (sort.desc ? -cmp(a, b) : cmp(a, b)) || byName(a, b);
  });
}

/** 展开一行时照什么拆开：模型拆成用途、会话拆成模型和用途、用途拆成模型、场所拆成模型 @param {string} group @returns {string[]} */
export const splitsOf = (group) => ({ model: ['purpose'], session: ['model', 'purpose'], purpose: ['model'], venue: ['model'] })[group] ?? [];

/** 精确的数（千分位） @param {number} n */
export const exact = (n) => Math.round(n).toLocaleString('en-US');

/** 用途写成什么（文字表里的键）：`null` 是对话；认得的照它；别的交回 `null`，照原样写 @param {string|null} purpose */
export function purposeKey(purpose) {
  if (purpose === null || purpose === undefined) return 'chat';
  return ['recap', 'title', 'vision', 'memory', 'embedding'].includes(purpose) ? purpose : null;
}

/**
 * 场所写成什么：`local` 本机，`qq:group:<号>` QQ 群，`qq:private:<号>` QQ 私聊，别的照原样；`null` 是其他。
 * @param {string|null} venue @returns {{key: string, fields?: any}|{raw: string}}
 */
export function venueOf(venue) {
  if (venue === null || venue === undefined) return { key: 'other' };
  if (venue === 'local') return { key: 'venue.local' };
  const m = /^qq:(group|private):(.+)$/.exec(venue);
  if (m) return { key: `venue.qq_${m[1]}`, fields: { id: m[2] } };
  return { raw: venue };
}

/** `供应商/模型` 拆开；没有 `/` 的供应商是空的 @param {string} model */
export function splitModel(model) {
  const i = String(model).indexOf('/');
  return i < 0 ? { provider: '', name: String(model) } : { provider: model.slice(0, i), name: model.slice(i + 1) };
}
