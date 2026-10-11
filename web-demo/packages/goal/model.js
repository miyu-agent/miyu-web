// @ts-check
//! 长期目标在框下面那一行写成什么（软件包 `goal`，蓝图 `web.md`「长期目标」）：照会话状态的 `goal`（`view.md` 会话状态那一格：
//! `{text, limit?, state, reason?, round}`）。纯的。

/** 认得的状态；别的照跑着写 */
const STATES = ['running', 'waiting', 'paused', 'blocked'];

/**
 * 一行要写的：目标原文、后面那一截（跑着的写第几轮，别的写状态）、状态（定颜色）、悬停看的整句。没有目标、完成了的交回 `null`
 * （完成了的核心照最后的样子留着，这一行不再占地方；`/goal` 照样看得到）。
 * @param {any} goal 会话状态的 `goal`
 * @param {(path: string, fields?: Record<string, unknown>) => string} t 这个包的字
 * @returns {{text: string, tail: string, state: string, title: string}|null}
 */
export function goalLine(goal, t) {
  if (!goal || typeof goal.text !== 'string' || !goal.text.trim() || goal.state === 'completed') return null;
  const state = STATES.includes(goal.state) ? goal.state : 'running';
  const round = Number.isInteger(goal.round) && goal.round > 0 ? goal.round : 0;
  const rounds = round ? (Number.isInteger(goal.limit) && goal.limit > 0 ? t('rounds_limited', { round, limit: goal.limit }) : t('rounds', { round })) : '';
  const reason = state === 'blocked' && typeof goal.reason === 'string' && goal.reason.trim() ? goal.reason.trim() : '';
  const label = reason ? t('blocked_why', { reason }) : t(`states.${state}`);
  const tail = state === 'running' ? rounds || label : label;
  return { text: goal.text.trim(), tail, state, title: [goal.text.trim(), label, rounds].filter(Boolean).join(' · ') };
}
