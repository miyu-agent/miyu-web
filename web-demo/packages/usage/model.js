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

const SIGNS = /** @type {Record<string, string>} */ ({ USD: '$', CNY: '¥', EUR: '€', GBP: '£' });

/** 一笔钱：一分钱以下的四位小数，别的两位；认得的币种写记号，别的写代码加空格。 @param {Amount} a */
export function amountText(a) {
  const n = a.amount > 0 && a.amount < 0.01 ? a.amount.toFixed(4) : a.amount.toFixed(2);
  const sign = SIGNS[a.currency];
  return sign ? `${sign}${n}` : `${a.currency} ${n}`;
}

/** 花费：照币种各写各的，用 ` + ` 接起来；一个都没有是空的。 @param {Amount[]} amounts */
export const money = (amounts) => (amounts ?? []).map(amountText).join(' + ');

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

/**
 * 时间段从哪起（`from`，核心认的时刻）：今天是今天 0 点，7 天、30 天是往前第 6、29 天的 0 点，全部不写。
 * @param {'1'|'7'|'30'|'all'} range @param {Date} now @returns {string|null}
 */
export function fromOf(range, now) {
  if (range === 'all') return null;
  return midnight(now, Number(range) - 1).toISOString();
}

/** 今天一小时一段（本地整点），24 段：`{from, until}` 照核心的时刻写 @param {Date} now */
export function hours(now) {
  const base = midnight(now);
  return Array.from({ length: 24 }, (_, i) => {
    const from = new Date(base.getFullYear(), base.getMonth(), base.getDate(), i);
    const until = new Date(base.getFullYear(), base.getMonth(), base.getDate(), i + 1);
    return { from: from.toISOString(), until: until.toISOString(), hour: i };
  });
}

/**
 * 今天的柱子：一小时一根；现在这一小时标出来，之后的空着。
 * @param {(Row|null)[]} rows 24 个，照 `hours` 的先后 @param {Date} now @param {(key: string, fields?: any) => string} t @returns {Bar[]}
 */
export function hourBars(rows, now, t) {
  return rows.map((row, i) => ({
    key: String(i),
    label: i % 6 === 0 ? t('axis.hour', { hour: i }) : '',
    title: t('tip.hour', { hour: i }),
    row: i > now.getHours() || !row || !row.requests ? null : row,
    now: i === now.getHours(),
  }));
}

/**
 * 照天的柱子：`n` 天，最后一根是今天；横轴每隔几天写一个，最后一根写「今天」。
 * @param {Row[]} rows `group: ["day"]` 的行 @param {number} n @param {Date} now @param {(key: string, fields?: any) => string} t @returns {Bar[]}
 */
export function dayBars(rows, n, now, t) {
  const by = new Map(rows.map((r) => [r.day, r]));
  const every = n <= 7 ? 1 : n <= 31 ? 5 : 15;
  return Array.from({ length: n }, (_, i) => {
    const d = midnight(now, n - 1 - i);
    const key = dayKey(d);
    const last = i === n - 1;
    return {
      key,
      label: last ? t('axis.today') : (n - 1 - i) % every === 0 ? t('axis.day', { month: d.getMonth() + 1, day: d.getDate() }) : '',
      title: t('tip.day', { month: d.getMonth() + 1, day: d.getDate() }),
      row: by.get(key) ?? null,
      now: last,
    };
  });
}

/**
 * 照月的柱子：最早有请求的那个月到这个月，天加成月；最后一根写「本月」。
 * @param {Row[]} rows `group: ["day"]` 的行 @param {Date} now @param {(key: string, fields?: any) => string} t @returns {Bar[]}
 */
export function monthBars(rows, now, t) {
  /** @type {Map<string, Row[]>} */
  const by = new Map();
  for (const r of rows) {
    if (typeof r.day !== 'string') continue;
    const k = r.day.slice(0, 7);
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const first = [...by.keys()].sort()[0] ?? monthKey(now);
  const [y0, m0] = first.split('-').map(Number);
  const bars = [];
  for (let d = new Date(y0, m0 - 1, 1); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const key = monthKey(d);
    const list = by.get(key);
    bars.push({ key, label: '', title: t('tip.month', { year: d.getFullYear(), month: d.getMonth() + 1 }), row: list ? sum(list) : null, now: key === monthKey(now) });
  }
  const every = Math.max(1, Math.ceil(bars.length / 8));
  bars.forEach((b, i) => {
    const last = i === bars.length - 1;
    const [y, m] = b.key.split('-').map(Number);
    if (last) b.label = t('axis.this_month');
    else if ((bars.length - 1 - i) % every === 0) b.label = t('axis.month', { year: y, month: m });
  });
  return bars;
}

/**
 * 「全部」照天还是照月：最早有请求的那天到今天不超过 90 天照天，超过的照月。一天都没有的是空的。
 * @param {Row[]} rows `group: ["day"]` 的行 @param {Date} now @param {(key: string, fields?: any) => string} t
 * @returns {{monthly: boolean, bars: Bar[]}}
 */
export function allBars(rows, now, t) {
  const days = rows.map((r) => r.day).filter((d) => typeof d === 'string').sort();
  if (!days.length) return { monthly: false, bars: [] };
  const [y, m, d] = days[0].split('-').map(Number);
  const span = Math.round((midnight(now).getTime() - new Date(y, m - 1, d).getTime()) / 86400000) + 1;
  if (span > MONTHLY_AFTER) return { monthly: true, bars: monthBars(rows, now, t) };
  return { monthly: false, bars: dayBars(rows, Math.max(span, 7), now, t) };
}

/** 纵轴四格，一格多少：1、2、2.5、5 乘十的几次方里，四格盖得住最高那根的最小的（至少 1）。 @param {number} max */
export function niceStep(max) {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max / 4));
  // token 是整数：一格至少 1
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p * 4 >= max) return Math.max(1, m * p);
  return Math.max(1, 10 * p);
}

/** 照 token 或请求从大到小排；一样的照名字（分组那一格）排，`null` 在后 @param {Row[]} rows @param {'tokens'|'requests'} by @param {string} group */
export function sorted(rows, by, group) {
  const v = (/** @type {Row} */ r) => (by === 'requests' ? r.requests : total(r.usage));
  return [...rows].sort((a, b) => v(b) - v(a) || (a[group] === null ? 1 : b[group] === null ? -1 : String(a[group]).localeCompare(String(b[group]))));
}

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
