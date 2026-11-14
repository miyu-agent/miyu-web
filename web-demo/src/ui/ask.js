// @ts-check
//! 发之前问一句（设置框外面的：斜杠命令里结束人生这类找不回来的，蓝图 `web.md`「推演人生」第 4 条）：页面正中一张卡、后面淡遮罩，
//! 标题、一段说明、「取消」「确认」（找不回来的确认是红的，同设置页的删除确认）。`Esc`、点遮罩、「取消」都是不做；焦点先在「取消」上，
//! 回车不会顺手做掉。样子借前缀要变那一张（`prefix-ask.js`）。

import { h } from '../lib/dom.js';
import { t } from '../util/res.js';

/**
 * @param {{title: string, text: string, yes: string, danger?: boolean}} ask
 * @returns {Promise<boolean>} 确认了是 `true`
 */
export function askFirst(ask) {
  return new Promise((resolve) => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const done = (/** @type {boolean} */ yes) => {
      document.removeEventListener('keydown', onKey, true);
      layer.remove();
      back?.focus();
      resolve(yes);
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      done(false);
    };
    const no = h('button.prefix-ask-btn', { type: 'button', onclick: () => done(false) }, t('ask.cancel'));
    const card = h('div.prefix-ask-card', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': ask.title },
      h('p.prefix-ask-title', ask.title),
      h('p.prefix-ask-text', ask.text),
      h('div.prefix-ask-foot', no, h(`button.prefix-ask-btn.is-primary${ask.danger ? '.is-danger' : ''}`, { type: 'button', onclick: () => done(true) }, ask.yes)));
    const layer = h('div.prefix-ask', { onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) done(false); } }, card);
    document.addEventListener('keydown', onKey, true);
    document.body.append(layer);
    no.focus();
  });
}
