// @ts-check
//! 群里旁听的话（W-1221，2026-11-19 项目主人定方案甲，蓝图 `web.md`「群里旁听的话」）：场所会话里平台上的人说了、没叫 AI 的，
//! 不一条条画成气泡，连着的几条收成一行「群里另有 N 条」，点开再一条条画。纯函数。
//!
//! 认法照视图（核心 `view.md`）：`from` 是 `external`、条目上没有 `turn`。开了一轮、并进一轮的话核心给它记上 `turn`；旁听记下的
//! 没有。不照日志里的 `venue.ambient` 认：im 经桥记下的话都带它，答哪一条另发 `session.respond`，视图里也不带这一格。

/**
 * @typedef {{type: 'overheard', key: string, count: number, items: any[]}} Overheard 收起的一串：编号照这一串的第一条
 *   （后面又来一条，那一行还是同一个，点开的不收回去）
 */

/** 正文的一条是不是旁听的话（`entries.js` 的 `user`）。 @param {any} it */
export const isOverheard = (it) => it.type === 'user' && it.speaker?.kind === 'external' && it.turn == null;

/**
 * 正文的条目（照显示的先后）里连着的旁听收成一条 `overheard`，放在它们后面那一轮前面：攒到下一句人话、下一轮的条目、不挂在她头下的
 * 那一行之前；她这一轮还没结束时来的不切开她的一轮，接着攒、挪到这一轮后面；末尾还攒着的放在最后。
 * @param {any[]} items @returns {any[]}
 */
export function foldOverheard(items) {
  /** @type {any[]} */
  const out = [];
  /** @type {any[]} */
  let run = [];
  /** 她正在画的那一轮（还没到收尾那一行）：它的条目、夹在中间的回报不打断攒着的 */
  let open = /** @type {number|null} */ (null);
  const flush = () => {
    if (!run.length) return;
    out.push(/** @type {Overheard} */ ({ type: 'overheard', key: `o${run[0].key}`, count: run.length, items: run }));
    run = [];
  };
  for (const it of items) {
    if (isOverheard(it)) {
      run.push(it);
      continue;
    }
    const inside = open != null && it.type !== 'user' && (it.turn === open || it.turn == null);
    if (!inside) flush();
    out.push(it);
    if (it.type !== 'user' && it.turn != null) open = it.type === 'done' ? null : it.turn;
  }
  flush();
  return out;
}
