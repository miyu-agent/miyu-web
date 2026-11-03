// @ts-check
//! 跳转条列哪几句（蓝图 `web.md`「右边的跳转条」第 4 条，W-1069）：核心 `session.prompts` 列的是这个会话里你问过的全部（没读进来的也在），
//! 对话区交来的是读进来、画出来了的。两份照序号拼成一份：核心列了的照它，画出来了的带上气泡那一块；刚说的、核心那一份还没列进去的接在后面。
//! 核心不认 `session.prompts`（旧核心）的只照画出来的。纯函数。

/** @typedef {{seq: number, text: string}} Asked 核心列的一句：序号、第一行 */
/** @typedef {{key: string, seq: number, text: string, node: HTMLElement, mine: boolean}} Shown 画出来的一句：编号、序号、原话、气泡那一块、是不是你说的 */
/** @typedef {{seq: number, text: string, node: HTMLElement|null}} Listed 跳转条上的一句：没读进来的没有 `node` */

/**
 * @param {Asked[]|null} asked 核心列的（问不到的是 `null`）
 * @param {Shown[]} shown 对话区画出来的，照先后
 * @returns {Listed[]}
 */
export function listed(asked, shown) {
  if (!asked) return shown.map((p) => ({ seq: p.seq, text: p.text, node: p.node }));
  const bySeq = new Map(shown.map((p) => [p.seq, p]));
  const out = asked.map((a) => {
    const p = bySeq.get(a.seq);
    // 画出来的照原话（核心的只有第一行、最多 100 个字）
    return { seq: a.seq, text: p ? p.text : a.text, node: p?.node ?? null };
  });
  // 刚说的：核心那一份是说之前问的，还没有它。别人说的、派它的会话发来的照核心不列
  const last = asked.at(-1)?.seq ?? 0;
  for (const p of shown) if (p.mine && p.seq > last) out.push({ seq: p.seq, text: p.text, node: p.node });
  return out;
}
