// @ts-check
//! 人格详情的「后天」一行（核心 LF-11，设计 70 第六节）：AI 在推演人生里记下的自己的变化，这个人格的每个会话都带着。
//! 照 `memory.list {persona, class: "change"}` 读（不含作废的），一条一行、旧的在前，内容下面暗字写为什么；没有的写一行「还没有」。
//! 只看：作废、恢复在记忆页。读不到的（没装记忆、旧核心不认这一类）整行不出。

import { h, replace } from '../../src/lib/dom.js';
import { field } from './form.js';
import { acquiredOf } from './model.js';

/**
 * 画「后天」那一行：先放一个空的格子，读到了再填；读不到的拿掉。
 * @param {any} ctx `setup` 包的 ctx @param {string} id 人格编号
 * @returns {HTMLElement}
 */
export function acquiredField(ctx, id) {
  const t = (/** @type {string} */ key) => ctx.text(key);
  const box = h('div.setup-acquired');
  const row = field(t('edit.acquired'), box, t('edit.acquired_desc'));
  row.classList.add('setup-acquired-row');
  row.hidden = true;
  ctx.core.request('memory.list', { persona: id, class: 'change', limit: 50 }).then((/** @type {any} */ r) => {
    const notes = acquiredOf(r?.memories);
    replace(box, notes.length
      ? h('ol.setup-acquired-list', notes.map((n) => h('li', h('span.setup-acquired-text', n.text), n.why ? h('small.setup-acquired-why', n.why) : null)))
      : h('p.setup-acquired-empty', t('edit.acquired_none')));
    row.hidden = false;
  }, () => row.remove());
  return row;
}
