// @ts-check
//! 账户余额（核心 QU-2 的 `session.quota` 里的 `balance`，现在只有 DeepSeek 官方供应商）：2026-11-17 主人照 DeepSeek 官网改成
//! 额度那一段里一行「DeepSeek 余额：$x + ¥y + 赠送 ¥z」（W-1206，同终端；哪一家照会话的供应商的显示名写，第 36 条）：写充值的那部分，美元在前、人民币在后，别的币照核心的
//! 先后接后面；有赠送的一种币一截「赠送 ¥z」接在最后，没有的不写。官方说不能用的整行变红；不画条。一项都没有又不能用的写一行
//! 「DeepSeek 余额不足」，一项都没有能用的、没查到的不画。金额照官方的原样字符串，不换成数。纯的。

import { signOf } from './format.js';

/** 写记号的币种（主人定：人民币、美元），别的写代码加空格（`EUR 3.00`）。照官网美元在前、人民币在后。 */
const SIGNED = ['USD', 'CNY'];

/** 几截之间（主人定的「 + 」）。 */
const JOIN = ' + ';

/**
 * @typedef {{text: string, out: boolean}} BalanceRow
 */

/**
 * `session.quota` 回应里的余额画成一行（没有的交空的），开头写是哪一家（`provider`，会话这一刻的供应商的显示名，W-1206 第 36 条；不知道的只写「余额：」）：币种、总额不是字符串的那一项不画；没带 `balance` 的、`available` 不是布尔的交空的。
 * 没有 `topped_up` 的（老核心）写总额、不另写赠送（总额里已经含着）。
 * @param {any} reply @param {(key: string, fields?: Record<string, any>) => string} t @param {string|null} [provider]
 * @returns {BalanceRow[]}
 */
export function balanceRows(reply, t, provider = null) {
  const of = provider ? '_of' : '';
  const b = reply?.balance;
  if (!b || typeof b.available !== 'boolean') return [];
  const out = !b.available;
  const items = (Array.isArray(b.items) ? b.items : [])
    .filter((/** @type {any} */ i) => typeof i?.currency === 'string' && typeof i?.total === 'string');
  if (!items.length) return out ? [{ text: t(`context_pop.quota.balance_exhausted${of}`, { provider }), out }] : [];
  const rank = (/** @type {any} */ i) => { const n = SIGNED.indexOf(i.currency); return n < 0 ? SIGNED.length : n; };
  const sorted = items.map((/** @type {any} */ i, /** @type {number} */ n) => ({ i, n })).sort((a, b) => rank(a.i) - rank(b.i) || a.n - b.n).map((x) => x.i);
  const split = (/** @type {any} */ i) => typeof i.topped_up === 'string';
  const paid = sorted.map((/** @type {any} */ i) => balanceAmount(i.currency, split(i) ? i.topped_up : i.total));
  const granted = sorted.filter((/** @type {any} */ i) => split(i) && typeof i.granted === 'string' && Number(i.granted) > 0)
    .map((/** @type {any} */ i) => t('context_pop.quota.balance_granted', { amount: balanceAmount(i.currency, i.granted) }));
  return [{ text: t(`context_pop.quota.balance${of}`, { provider, amount: [...paid, ...granted].join(JOIN) }), out }];
}

/**
 * 一笔：人民币、美元写记号在前（`¥12.34`），别的写代码加空格（`EUR 3.00`）；金额照原样，负数的负号写在记号前面（照官网 `-$0.01`）。
 * @param {string} currency @param {string} amount
 */
export function balanceAmount(currency, amount) {
  const sign = SIGNED.includes(currency) ? signOf(currency) : null;
  if (!sign) return `${currency} ${amount}`;
  return amount.startsWith('-') ? `-${sign}${amount.slice(1)}` : `${sign}${amount}`;
}
