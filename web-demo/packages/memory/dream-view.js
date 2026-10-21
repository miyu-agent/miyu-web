// @ts-check
//! 整理会话里的一批，在对话区画（蓝图 `web.md`「记忆页」第 13a 条第 3 条）：挂载位 `chat.item` 的 `dream.batch`（记忆模块交来的那一句）、
//! `dream.answer`（她回的那一段 JSON）。两样都收成几行，右边「原文」点开看全文。数据照 `dream-session-model.js`。

import { h } from '../../src/lib/dom.js';
import { requestOf, answerOf, decisionsOf } from './dream-session-model.js';

/** @typedef {(key: string, fields?: any) => string} Text */

/**
 * 「原文」：一个小按钮，点了在下面展开、收起全文（等宽，里面滚）。
 * @param {Text} t @param {string} text
 */
function rawToggle(t, text) {
  const box = h('pre.dream-raw', { hidden: true }, text);
  const btn = h('button.dream-raw-btn', {
    type: 'button', 'aria-expanded': 'false',
    onclick: () => {
      box.hidden = !box.hidden;
      btn.setAttribute('aria-expanded', String(!box.hidden));
      btn.classList.toggle('is-on', !box.hidden);
    },
  }, t('dream.view.raw'));
  return { btn, box };
}

/**
 * 记忆模块交来的一批：一行「记忆模块 · 第 N 批：N 条新记的、N 条相关的、N 条重看」，数不出来的只写第几批。
 * @param {Text} t @param {{batch: number, text: string}} it
 */
export function batchNode(t, it) {
  const { counts } = requestOf(it.text);
  const parts = counts ? [
    counts.fresh ? t('dream.view.fresh', { n: counts.fresh }) : null,
    counts.related ? t('dream.view.related', { n: counts.related }) : null,
    counts.review ? t('dream.view.review', { n: counts.review }) : null,
  ].filter(Boolean).join(t('dream.view.sep')) : '';
  const raw = rawToggle(t, it.text);
  return h('div.dream-batch-row',
    h('div.dream-batch-head', h('span.dream-batch-who', parts ? t('dream.view.batch_counts', { n: it.batch, parts }) : t('dream.view.batch', { n: it.batch })), raw.btn),
    raw.box);
}

/**
 * 她的回答：一条条决定（同卡片里的写法）；还在写的写「正在写… N 字」；读不成的照原文画。
 * @param {Text} t @param {{text: string, streaming: boolean, request: string}} it
 */
export function answerNode(t, it) {
  const tag = (/** @type {string} */ kind) => h(`span.dream-k.is-${kind}`, t(`dream.k.${kind}`));
  const raw = rawToggle(t, it.text);
  const answer = it.streaming ? null : answerOf(it.text);
  /** @type {Node[]} */
  let lines;
  if (it.streaming) lines = [h('div.dream-line.is-read', h('span.dream-t', t('dream.view.writing', { n: [...it.text].length })))];
  else if (!answer) lines = [h('div.dream-line.is-read', h('span.dream-t', t('dream.view.unreadable')))];
  else {
    const decided = decisionsOf(answer, requestOf(it.request).texts);
    lines = decided.length ? decided.map((d) => {
      if (d.kind === 'revised') return h('div.dream-line', tag('new'), h('span.dream-t', h('s', d.from), ' → ', d.to));
      if (d.kind === 'retired') {
        const label = d.retire && ['outdated', 'repeat', 'worthless'].includes(d.retire) ? t(`dream.retire.${d.retire}`) : null;
        const why = [label, d.why && d.why !== label ? d.why : null].filter(Boolean).join(' · ');
        return h('div.dream-line', tag('del'), h('span.dream-t', h('s', d.what), why ? h('span.dream-why', ` · ${why}`) : null));
      }
      // 摘要：点开看写了什么
      const body = h('p.dream-summary-text', { hidden: true }, d.text);
      return h('div.dream-summary',
        h('button.dream-line.dream-summary-btn', { type: 'button', onclick: () => { body.hidden = !body.hidden; } }, tag('sum'), h('span.dream-t', t('dream.summary_done'))),
        body);
    }) : [h('div.dream-line.is-read', h('span.dream-t', t('dream.view.nothing')))];
  }
  return h('div.dream-answer', h('div.dream-answer-lines', lines), h('div.dream-answer-foot', raw.btn), raw.box);
}
