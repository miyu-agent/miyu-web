// @ts-check
//! 群里旁听的话收起的那一行（W-1221，蓝图 `web.md`「群里旁听的话」）：样子同能点开的提示行（`notes.js`）——「群里另有 N 条」，
//! 右边悬停露的小箭头；点开在下面照原来的样子一条条画气泡（上面一行写是谁），收放同提示行（高度从 0 长出来、收回去）。

import { h, icon } from './dom.js';
import { res, t } from '../util/res.js';

/**
 * @param {import('../model/overheard.js').Overheard} it
 * @param {{open: boolean, toggled: (open: boolean) => void, said: (item: any) => HTMLElement}} opts 开着没有（之后又来了一条重画时照旧开着）；
 *   点开、收起了告诉谁；一条画成什么（`said.js` 的 `userNode`，不是你说的）
 */
export function overheardNode(it, opts) {
  const line = h('div.note-line', h('span.note-text', t('overheard', { count: it.count })), h('span.tl-chevron', icon('chevron-right')));
  const list = h('div.overheard-list');
  const node = h('div.note.is-expandable.is-overheard', line, h('div.tl-fold', h('div.tl-fold-inner', list)));
  node.style.setProperty('--tl-step', `${res.timeline.step_ms}ms`);
  line.setAttribute('role', 'button');
  line.setAttribute('tabindex', '0');
  // 第一次点开才画那几条
  const set = (/** @type {boolean} */ open) => {
    if (open && !list.firstChild) list.append(...it.items.map(opts.said));
    node.classList.toggle('is-open', open);
    line.setAttribute('aria-expanded', String(open));
  };
  set(opts.open);
  const toggle = () => {
    // 被点的那一行钉在原地（`follow.js`，同时间线、提示行）
    line.dispatchEvent(new CustomEvent('tl-toggle', { bubbles: true }));
    const open = !node.classList.contains('is-open');
    set(open);
    opts.toggled(open);
  };
  line.addEventListener('click', toggle);
  line.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggle();
  });
  return node;
}
