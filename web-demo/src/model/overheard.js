// @ts-check
//! 群里旁听的话（W-1221，2026-11-19 项目主人定方案甲，蓝图 `web.md`「群里旁听的话」）：场所会话里平台上的人说了、没叫 AI 的，
//! 不一条条画成气泡，连着的几条收成一行「群里另有 N 条」，点开再一条条画。纯函数。
//!
//! 认法照视图（核心 `view.md`）：`from` 是 `external`，没进任何一轮（条目上没有 `turn`），或者和别的群消息一起被同一轮收走。
//! 只看有没有 `turn` 不够（W-1250）：im 隔一阵让 AI 看一眼群，那一轮收走攒着的全部群消息，核心给收走的每一条都记上那一轮，
//! 真群里几乎每一条都带 `turn`——照原来的认法全画成气泡，她正在答别人时来的还把她的一轮切成两块。叫她的话 im 一条开一轮，
//! 所以一轮开头只收了一条的才算叫她的；视图里没有「这一条是叫她的」这一格，等核心给了照它认。
//! 不照日志里的 `venue.ambient` 认：im 经桥记下的话都带它，答哪一条另发 `session.respond`，视图里也不带这一格。

/**
 * @typedef {{type: 'overheard', key: string, count: number, items: any[]}} Overheard 收起的一串：编号照这一串的第一条
 *   （后面又来一条，那一行还是同一个，点开的不收回去）
 */

/** 正文的一条是不是平台上的人说的（`entries.js` 的 `user`）。 @param {any} it */
const external = (it) => it.type === 'user' && it.speaker?.kind === 'external';

/** AI 这一轮的条目（时间线、回答、收尾、发的图……）：不是人说的话、不是提示行，带着是哪一轮。 @param {any} it */
const hers = (it) => it.type !== 'user' && it.type !== 'note' && it.turn != null;

/**
 * 每一轮开头收了几条群消息：只数这一轮第一条 AI 的条目以前的（这一轮开始以后并进来的不算，那是排进这一轮的话）。
 * @param {any[]} items @returns {Map<number, number>}
 */
function taken(items) {
  /** @type {Map<number, number>} */
  const count = new Map();
  const begun = new Set();
  for (const it of items) {
    if (hers(it)) begun.add(it.turn);
    else if (external(it) && it.turn != null && !begun.has(it.turn)) count.set(it.turn, (count.get(it.turn) ?? 0) + 1);
  }
  return count;
}

/**
 * 正文的条目（照显示的先后）里连着的旁听收成一条 `overheard`，放在它们后面那一轮前面：攒到下一句她要答的话、下一轮的条目、不挂在她
 * 头下的那一行之前；末尾还攒着的放在最后。她这一轮还没结束时来的、不是并进这一轮的话不切开她的一轮，挪到这一轮后面：旁听的接着攒，
 * 排着等她后面单独答的照先后画成气泡。
 * @param {any[]} items @returns {any[]}
 */
export function foldOverheard(items) {
  /** @type {any[]} */
  const out = [];
  /** @type {Array<{it: any, heard: boolean}>} 攒着还没放的：旁听的，和她忙着时排进来、后面单独答的 */
  let held = [];
  /** 她正在画的那一轮（还没到收尾那一行）：它的条目、夹在中间的回报不打断攒着的 */
  let open = /** @type {number|null} */ (null);
  const flush = () => {
    /** @type {any[]} */
    let run = [];
    const fold = () => {
      if (run.length) out.push(/** @type {Overheard} */ ({ type: 'overheard', key: `o${run[0].key}`, count: run.length, items: run }));
      run = [];
    };
    for (const { it, heard } of held) {
      if (!heard) run.push(it);
      else {
        fold();
        out.push(it);
      }
    }
    fold();
    held = [];
  };
  const count = taken(items);
  /** 刚画了叫她的那一句、她的第一步还没来的那一轮 */
  let asked = /** @type {number|null} */ (null);
  for (const it of items) {
    if (external(it)) {
      // 叫她的那一句后面、她的第一步以前来的别的话：这一轮已经开了（轮的编号是它开头那一条的序号），同夹在中间的，挪到这一轮后面，
      // 不隔在那一句和她的回答中间
      if (open == null && asked != null && it.turn !== asked && it.seq > asked) open = asked;
      // 叫她的：这一轮开头只收了这一条；这一轮开始以后并进来的（不在数里）照排进这一轮的话画
      const heard = it.turn != null && (it.turn === open || (count.get(it.turn) ?? 0) <= 1);
      // 她正在答别的一轮：不切开那一轮，挪到它后面
      const busy = open != null && it.turn !== open;
      if (!heard || busy) {
        held.push({ it, heard });
        continue;
      }
      asked = it.turn;
    } else if (hers(it)) asked = null;
    const inside = open != null && it.type !== 'user' && (it.turn === open || it.turn == null);
    if (!inside) flush();
    out.push(it);
    if (it.type !== 'user' && it.turn != null) open = it.type === 'done' ? null : it.turn;
  }
  flush();
  return out;
}
