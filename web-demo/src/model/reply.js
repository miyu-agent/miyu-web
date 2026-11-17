// @ts-check
//! 一轮回答的正文（复制这一轮、朗读、自动朗读，蓝图 `web.md`「语音」第 3、4 条）：照正文的条目（`entries.js` 的 `itemsOf`）挑。纯的。

/**
 * `turn` 那一轮回答的全部正文（原文，被工具隔成几段的连起来、段与段之间空一行）；`turn` 不写的是最后有正文、写完了的那一轮。
 * 没有轮号的回答（老核心）只算它自己那一段，不和别的没轮号的连起来。
 * @param {any[]} items @param {number|undefined} [turn]
 * @returns {{turn: number|null, text: string}|null}
 */
export function replyOf(items, turn) {
  const replies = items.filter((it) => it.type === 'reply' && String(it.text ?? '').trim());
  const last = turn == null ? replies.filter((it) => !it.streaming).at(-1) : replies.findLast((it) => it.turn === turn);
  return last ? joined(replies, last) : null;
}

/**
 * 最新那一轮回答的正文（自动朗读：一轮答完就念这一轮）。最新的一轮没有正文的（只调了工具、出了错、被打断在开口前）交 `null`，
 * 不退回去念上一轮（todolist 第 14 条：每答完一轮都从头念起）。答完了才叫它，最后那一段还没收尾的也算。`last` 是最后那一段的
 * 条目编号：同一轮答完又报一次的照它认出来，不再念。
 * @param {any[]} items
 * @returns {{turn: number|null, text: string, last: string}|null}
 */
export function latestReply(items) {
  const turns = items.map((it) => it.turn).filter((n) => typeof n === 'number');
  const latest = turns.length ? Math.max(...turns) : null;
  const replies = items.filter((it) => it.type === 'reply' && String(it.text ?? '').trim());
  const last = replies.at(-1);
  if (!last || (latest != null && last.turn !== latest)) return null;
  return { ...joined(replies, last), last: String(last.key ?? '') };
}

/** `last` 那一轮的几段连起来；没有轮号的只要它自己。 @param {any[]} replies @param {any} last */
function joined(replies, last) {
  const parts = last.turn == null ? [last] : replies.filter((it) => it.turn === last.turn);
  return { turn: last.turn ?? null, text: parts.map((it) => String(it.text).trim()).join('\n\n') };
}
