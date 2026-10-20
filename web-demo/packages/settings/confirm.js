// @ts-check
//! 设置里删东西、清空之前问一句（蓝图 `web.md`「设置页」：删除、清空都弹窗确认，2026-10-20 项目主人：「点一下变确认删除」这种不好）：
//! 盖住设置框的一层，正中一张小卡片，一句话加「取消」「确认」；`Esc`、点外面、「取消」都是不做。焦点先在「确认」上（回车就是确认）。
//! 答了才往下：交回 `true`（确认）、`false`（不做）。设置框外面用的（没有 `.set-panel`，左栏打开的项目设置）盖在整页上。
//! 别的包经 `kit.confirm` 用（软件包之间不互相 import），设置页自己的直接 import。

import { h } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';

/**
 * @param {Element|null} from 点的那个按钮（找它所在的设置框）
 * @param {{text: string, yes: string, no: string}} ask
 * @returns {Promise<boolean>}
 */
export function confirmIn(from, ask) {
  const host = from?.closest('.set-panel') ?? document.body;
  host.querySelector(':scope > .set-ask')?.remove();
  const back = /** @type {HTMLElement|null} */ (document.activeElement);
  return new Promise((resolve) => {
    let done = false;
    const answer = (/** @type {boolean} */ yes) => {
      if (done) return;
      done = true;
      resolve(yes);
      leave(layer, () => layer.remove());
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
    const yes = h('button.set-btn.is-primary', { type: 'button', onclick: () => answer(true) }, ask.yes);
    const card = h('div.set-ask-card', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': ask.text },
      h('p.set-ask-text', ask.text),
      h('div.set-ask-foot', h('button.set-btn', { type: 'button', onclick: () => answer(false) }, ask.no), yes));
    const layer = h('div.set-ask', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) answer(false); } }, card);
    // 设置框的 `Esc` 先找开着的 `[data-set-dismiss]`，交到这里
    layer.addEventListener('set-dismiss', () => answer(false));
    // 框外面用的没有设置框接 `Esc`
    layer.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && host === document.body) { e.stopPropagation(); answer(false); }
    });
    host.append(layer);
    yes.focus({ preventScroll: true });
  });
}
