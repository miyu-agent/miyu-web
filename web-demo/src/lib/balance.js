// @ts-check
//! 账户余额（核心 QU-2 的 `session.quota` 里的 `balance`，现在只有 DeepSeek 官方供应商；2026-11-16 主人定的样子）：额度那一段里
//! 一种币一行「余额 ¥12.34」，有赠送的后面暗字「含赠送 ¥2.00」；官方说不能用的整行变红；不画条。一项都没有又不能用的写一行
//! 「余额不足」，一项都没有能用的、没查到的不画。金额照官方的原样字符串，不换成数。纯的。

import { signOf } from './format.js';

/** 写记号的币种（主人定：人民币、美元），别的写代码加空格（`EUR 3.00`）。 */
const SIGNED = ['CNY', 'USD'];

/**
 * @typedef {{text: string, granted: string|null, out: boolean}} BalanceRow
 */

/**
 * `session.quota` 回应里的余额画成几行：照核心交的先后一种币一行；币种、总额不是字符串的那一项不画；没带 `balance` 的、
 * `available` 不是布尔的交空的。
 * @param {any} reply @param {(key: string, fields?: Record<string, any>) => string} t
 * @returns {BalanceRow[]}
 */
export function balanceRows(reply, t) {
  const b = reply?.balance;
  if (!b || typeof b.available !== 'boolean') return [];
  const out = !b.available;
  const items = (Array.isArray(b.items) ? b.items : [])
    .filter((/** @type {any} */ i) => typeof i?.currency === 'string' && typeof i?.total === 'string');
  if (!items.length) return out ? [{ text: t('context_pop.quota.balance_exhausted'), granted: null, out }] : [];
  return items.map((/** @type {any} */ i) => ({
    text: t('context_pop.quota.balance', { amount: balanceAmount(i.currency, i.total) }),
    granted: Number(i.granted) > 0 ? t('context_pop.quota.balance_granted', { amount: balanceAmount(i.currency, i.granted) }) : null,
    out,
  }));
}

/** 一笔：人民币、美元写记号在前（`¥12.34`），别的写代码加空格（`EUR 3.00`）；金额照原样。 @param {string} currency @param {string} amount */
export function balanceAmount(currency, amount) {
  const sign = SIGNED.includes(currency) ? signOf(currency) : null;
  return sign ? `${sign}${amount}` : `${currency} ${amount}`;
}
