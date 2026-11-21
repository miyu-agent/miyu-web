// @ts-check
//! 正文的条目分块（蓝图 `web.md`「对话区」）：你的话一条一块；她的条目照回合连成一块，挂在一个头像下面；回报、压缩和清空
//! 那一行（`note`）自己一块，不挂在她的头下（「后台命令、子代理的回报」「压缩、清空」）；可夹在她同一轮中间的（她正在回答时来的
//! 回报），放进她那一块里，头不再画一次（2026-09-30 项目主人定）。插进她正在回答的一轮的话（你的、子代理的），前后照回合分成两块，
//! 后一块接着画、不再写头像和名字（`cont`，同一天项目主人定）。群里旁听的话先收成一串（`overheard.js`），一串一块（W-1221）。纯函数。

import { foldOverheard } from './overheard.js';

/**
 * @typedef {{key: string, kind: 'user'|'her'|'note'|'overheard', turn?: number|null, item?: any, items: any[], cont?: boolean, persona?: string|null}} Block
 *   `cont` 的是接着她同一轮的（中间插进来一句话），不再画头像和名字；`persona` 是她这一轮的回复条目带的人格（无人格 `null`），
 *   见 `personas`；不写的照会话现在的人格画
 */

/** @param {any[]} items @returns {Block[]} */
export function group(all) {
  const items = foldOverheard(all);
  /** @type {Block[]} */
  const out = [];
  // 编号照回合和这一轮的第几块：在收的回答落了盘换了编号，这一块照旧，头像不重画
  const seen = new Map();
  items.forEach((it, i) => {
    const last = out.at(-1);
    if (it.type === 'user' || it.type === 'overheard') out.push({ key: it.key, kind: it.type, item: it, items: [] });
    else if (it.type === 'note' && last?.kind === 'her' && inTurn(items, i, last)) last.items.push(it);
    else if (it.type === 'note') out.push({ key: it.key, kind: 'note', item: it, items: [] });
    else if (last?.kind === 'her' && last.turn === it.turn) last.items.push(it);
    else {
      const n = (seen.get(it.turn) ?? 0) + 1;
      seen.set(it.turn, n);
      // 中间插进来一句话、后面还是她这一轮的：接着画，不再画头像和名字（2026-09-30 项目主人定：每插一句头像名字又画一次，不好看）
      const cont = n > 1;
      out.push({ key: `h${it.turn}-${n}`, kind: 'her', turn: it.turn, items: [it], cont });
    }
  });
  personas(out);
  return out;
}

/**
 * 她每一块头上是谁（W-1250）：照这一轮的回复条目带的人格（核心 70d6ff7d），同一轮切成几块的都照它——原来一块一块找，前半块只有
 * 时间线、回复在后半块的，两块各画各的（一块有头像、一块没有，缩进对不上）。结束了的一轮里一条回复都没有的（只调了工具、只发了
 * 表情、决定不回的），照前面最近一轮回复的人格，前面没有的照后面最近的：那时候的人格多半就是它，免得夹在旧人格的回复中间单独
 * 画成现在的人格。还在进行的一轮、整个会话一条回复都没带人格的不写（照会话现在的人格画）。
 * @param {Block[]} blocks
 */
function personas(blocks) {
  const hers = blocks.filter((b) => b.kind === 'her');
  /** @type {Map<number|null|undefined, {persona?: string|null, ended: boolean}>} */
  const turns = new Map();
  for (const b of hers) {
    const turn = turns.get(b.turn) ?? { ended: false };
    const reply = b.items.find((x) => x.type === 'reply' && 'persona' in x);
    if (reply && !('persona' in turn)) turn.persona = reply.persona;
    if (b.items.some((x) => x.type === 'done')) turn.ended = true;
    turns.set(b.turn, turn);
  }
  const known = (/** @type {Block|undefined} */ b) => !!b && 'persona' in (turns.get(b.turn) ?? {});
  for (const [i, b] of hers.entries()) {
    const turn = turns.get(b.turn);
    if (!turn) continue;
    const near = known(b) ? b : turn.ended ? hers.slice(0, i).findLast(known) ?? hers.slice(i + 1).find(known) : undefined;
    if (near) b.persona = turns.get(near.turn)?.persona;
  }
}

/**
 * 第 `i` 条夹没夹在她这一轮中间：后面（跳过别的这种行）接着的是她这一轮的；后面还没有东西的，看她这一轮结束没有（那一块里还没有
 * 收尾那一行的是还在进行，回报刚来、她下一步还没来的那一刻也放进去，不先画成单独一块再挪）。
 */
function inTurn(items, i, block) {
  const next = items.slice(i + 1).find((x) => x.type !== 'note');
  if (next) return next.type !== 'user' && next.turn === block.turn;
  return !block.items.some((x) => x.type === 'done');
}
