// @ts-check
//! 照条目和会话状态算的几样（蓝图 `web.md`「照条目画」第 3、4 条）：压缩的进度那一行、在跑的这一轮她做没做事（两下 `Esc` 撤不撤）、
//! 这一轮结束没有、开到第几轮、预览工作区里的文件。纯函数。

import { seqOf } from './entries.js';

/**
 * @typedef {{seen: number, since: number, written: number, expected: number|null, trigger: string}} Compacting
 *   压缩的进度那一行（`ui/compacting.js`）：从哪一条起、什么时候起、写了多少、估计多少、谁要压的（`auto` 自动、`overflow` 放不下了停下来压、`manual` 手动 `/compact`）
 */

/**
 * 压缩的进度：会话状态在压（`doing.compacting`）的照它写了多少、估计多少；不在压的是 `null`。
 * @param {any[]} entries @param {any} status
 * @returns {Compacting|null}
 */
export function compactingOf(entries, status) {
  const d = status?.doing;
  if (d?.what !== 'compacting') return null;
  const e = entries.find((x) => x.id === d.entry);
  // 谁要压的：会话状态给了的照它（核心 6-11 补给 `compaction.progress` 加的 `trigger`），没给的照那一条旁白的
  const trigger = d.trigger ?? e?.trigger ?? 'manual';
  return { seen: seqOf(d.entry), since: e?.at ? Date.parse(e.at) : Date.now(), written: d.written ?? 0, expected: d.expected ?? null, trigger };
}

/** 最后一条带 `turn` 的条目的回合（开到第几轮）；一条都没有的是 0。 @param {any[]} entries */
export function lastTurn(entries) {
  return entries.reduce((n, e) => (e.turn != null && e.turn > n ? e.turn : n), 0);
}

/** 这一轮结束了没有（有它的 `end`）。 @param {any[]} entries @param {number} turn */
export function turnEnded(entries, turn) {
  return entries.some((e) => e.kind === 'end' && e.turn === turn);
}

/**
 * 在跑的这一轮她还没开始做事（同 `model/session.js` 的 `untouchedTurn`）：交回这一轮的编号；没在跑、写了正文、调了工具的交 `null`。
 * @param {any[]} entries @param {any} status
 */
export function untouchedTurnOf(entries, status) {
  if (!status || status.state === 'idle') return null;
  const turn = lastTurn(entries);
  if (!turn || turnEnded(entries, turn)) return null;
  const touched = entries.some((e) => e.turn === turn && ((e.kind === 'reply' && (e.text ?? '').trim()) || e.kind === 'tool'));
  return touched ? null : turn;
}
