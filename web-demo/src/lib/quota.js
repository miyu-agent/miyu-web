// @ts-check
//! 供应商的额度（核心 QU-1 的 `session.quota`，现在只有 opencode Go；2026-11-14 主人定的样子）：一行一个窗口，名字、带框的条、
//! 百分比、多久后重置同一行；用到 80% 变黄、满了变红；24 小时内写「x 小时后重置」，再远写日期时刻。纯的，时刻从外面给。

/** 用到这么多（百分比）起变黄。 */
export const QUOTA_WARN = 80;

/**
 * @typedef {{id: string, label: string, percent: number, tone: 'ok'|'warn'|'full', reset: string|null}} QuotaRow
 */

/**
 * `session.quota` 的回应画成几行：照核心交的先后（rolling、weekly、monthly，没报的不交），`percent` 不是数的、没有名字的不画；
 * 没额度（`{}`、`null`）交空的。
 * @param {any} reply @param {Date} now @param {(key: string, fields?: Record<string, any>) => string} t
 * @returns {QuotaRow[]}
 */
export function quotaRows(reply, now, t) {
  const windows = Array.isArray(reply?.windows) ? reply.windows : [];
  return windows
    .filter((w) => typeof w?.label === 'string' && w.label && typeof w.percent === 'number' && Number.isFinite(w.percent))
    .map((w) => ({
      id: String(w.id ?? ''),
      label: w.label,
      percent: w.percent,
      tone: w.percent >= 100 ? 'full' : w.percent >= QUOTA_WARN ? 'warn' : 'ok',
      reset: resetText(w.resets_at, now, t),
    }));
}

/**
 * 额度那一段的头：有窗口的写「{供应商} 额度情况」（会话这一刻的供应商的显示名，2026-11-17 主人验收第 6、36 条，W-1206），不知道是哪一家
 * 的、只有余额的写「额度」（余额那一行自己写着是哪一家）。
 * @param {QuotaRow[]} rows @param {(key: string, fields?: Record<string, any>) => string} t @param {string|null} [provider]
 */
export const quotaTitle = (rows, t, provider = null) => (rows.length && provider ? t('context_pop.quota.title_of', { provider }) : t('context_pop.quota.title'));

/** 百分比的写法：整数照写，带小数的留一位（`4%`、`4.3%`）。 @param {number} p */
export const percentText = (p) => `${Number.isInteger(p) ? p : Math.round(p * 10) / 10}%`;

/**
 * 多久后重置：24 小时内「x 小时后重置」（不到一小时「x 分钟后重置」），再远写本地的日期时刻；读不出、已经过了的是 `null`（不写）。
 * @param {any} at @param {Date} now @param {(key: string, fields?: Record<string, any>) => string} t
 * @returns {string|null}
 */
export function resetText(at, now, t) {
  const when = typeof at === 'string' ? new Date(at) : null;
  if (!when || Number.isNaN(when.getTime())) return null;
  const ms = when.getTime() - now.getTime();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  if (ms < 24 * 3_600_000) {
    return hours >= 1 ? t('context_pop.quota.in_hours', { n: hours }) : t('context_pop.quota.in_minutes', { n: Math.max(1, Math.ceil(ms / 60_000)) });
  }
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return t('context_pop.quota.at', { month: when.getMonth() + 1, day: when.getDate(), time: `${pad(when.getHours())}:${pad(when.getMinutes())}` });
}
