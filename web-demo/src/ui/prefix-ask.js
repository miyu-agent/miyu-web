// @ts-check
//! 文件改了、前缀要变时发送前问一声（蓝图 `web.md`「连核心」第 6a 条；核心 OV-1 下；2026-10-26 项目主人定的话和三个选项）：页面正中一张卡、后面淡遮罩，
//! 列改了的文件，「压缩上下文并发送」「直接发送」「取消」；`Esc`、点遮罩是取消。交回 `compact`、`keep`、`null`。

import { h } from '../lib/dom.js';
import { t } from '../util/res.js';

/** 正开着的那一张（同时只问一次：几处一起被拒的，排在同一个回答后面） @type {Promise<'keep'|'compact'|null>|null} */
let showing = null;

/**
 * 问一声。`data` 是核心拒绝带的 `{files, more?}`。
 * @param {{files?: string[], more?: number}} data
 * @returns {Promise<'keep'|'compact'|null>}
 */
export function askPrefix(data) {
  if (showing) return showing;
  showing = new Promise((resolve) => {
    const files = Array.isArray(data?.files) ? data.files.filter((f) => typeof f === 'string') : [];
    const more = typeof data?.more === 'number' && data.more > 0 ? data.more : 0;
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const done = (/** @type {'keep'|'compact'|null} */ choice) => {
      document.removeEventListener('keydown', onKey, true);
      layer.remove();
      showing = null;
      back?.focus();
      resolve(choice);
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      done(null);
    };
    const compact = h('button.prefix-ask-btn.is-primary', { type: 'button', onclick: () => done('compact') }, t('prefix_ask.compact'));
    const card = h('div.prefix-ask-card', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': t('prefix_ask.title') },
      h('p.prefix-ask-title', t('prefix_ask.title')),
      h('ul.prefix-ask-files', files.map((f) => h('li', f)), more ? h('li.is-more', t('prefix_ask.more', { n: more })) : null),
      h('p.prefix-ask-text', t('prefix_ask.text')),
      h('div.prefix-ask-foot',
        h('button.prefix-ask-btn', { type: 'button', onclick: () => done(null) }, t('prefix_ask.cancel')),
        h('button.prefix-ask-btn', { type: 'button', onclick: () => done('keep') }, t('prefix_ask.keep')),
        compact));
    const layer = h('div.prefix-ask', { onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) done(null); } }, card);
    document.addEventListener('keydown', onKey, true);
    document.body.append(layer);
    compact.focus();
  });
  return showing;
}
