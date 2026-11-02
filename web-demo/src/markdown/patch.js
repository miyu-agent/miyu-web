// @ts-check
//! 重画时留着没变的块（蓝图 `web.md`「点开思考」，W-1075）：在收的回答、思考每来一段字整段重画，整个换掉的话，拖着选字时选区的
//! 起点被换走，选区从最上面开始、松手就没了。开头和原来一样的块留着原来的节点，只换从第一块不一样的起往后的。

/** 滚动预览往后挪开头时，原来开头最多挪掉几块还认得出来。 */
const SHIFT = 16;

/**
 * 把 `fresh` 里的几块换进 `container`：开头和原来一样的（`isEqualNode`）留着原来的节点，从第一块不一样的起换成新的。原来的开头被
 * 挪掉了几块的（思考的滚动预览往后挪了开头），先去掉挪掉的那几块再比。留下来的都和新的一样，所以画出来和整个换掉一样。
 * @param {{childNodes: ArrayLike<any>, append: (...nodes: any[]) => void}} container @param {{childNodes: ArrayLike<any>}} fresh
 */
export function patch(container, fresh) {
  const next = Array.from(fresh.childNodes);
  const old = Array.from(container.childNodes);
  let skip = 0;
  if (next.length && old.length && !old[0].isEqualNode(next[0])) {
    const k = old.slice(1, SHIFT + 1).findIndex((n) => n.isEqualNode(next[0]));
    if (k >= 0) skip = k + 1;
  }
  let same = 0;
  while (same < next.length && skip + same < old.length && old[skip + same].isEqualNode(next[same])) same += 1;
  for (const n of old.slice(0, skip)) n.remove();
  for (const n of old.slice(skip + same)) n.remove();
  container.append(...next.slice(same));
}
