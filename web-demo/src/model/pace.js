// @ts-check
//! 画得过来吗（施工 YC-11，2026-11-10 压测报告 O21：一条 2 MB 的回复涌进来时主线程卡 1.19 秒，5 秒里每 50ms 的定时器只跑了 15 次）：
//! 整页一帧画一次（`requestAnimationFrame`），平常一次几毫秒；大回复越长，每画一次要重排的越多，一次上百毫秒时一帧接一帧画，
//! 主线程全被占着，人点、滚、打字都没反应。上一次画得超过 `BUDGET_MS` 的，下一次先歇上一次两倍那么久（最多 `MAX_REST_MS`），
//! 中间来的推送合在一起画：画的时间至多占三分之一，字照样一段段出来。纯的。

/** 一次画在这以内的不歇（一帧半） */
export const BUDGET_MS = 24;

/** 最多歇多久：再长人就觉得字不动了 */
export const MAX_REST_MS = 600;

/**
 * 下一次画之前还要歇多久（毫秒，0 是不用歇）。
 * @param {number} took 上一次画用了多久 @param {number} since 上一次画完到现在多久
 */
export function restBefore(took, since) {
  if (!(took > BUDGET_MS)) return 0;
  return Math.max(0, Math.min(took * 2, MAX_REST_MS) - since);
}
