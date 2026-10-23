// @ts-check
//! 了结以后留下的（蓝图 `web.md`「确认和提问」第 6 条）怎么画（`node`）：由正文那一层照日志排、经挂载位 `chat.item` 交给这里画
//! （`index.js`），夹在她这一轮里。留什么由 `model.js` 的 `report`、`reportOf` 算，这里只画。

import { h, icon } from '../../src/lib/dom.js';

export class Reports {
  /** @param {(key: string, fields?: Record<string, any>) => string} text */
  constructor(text) {
    this.text = text;
  }

  /** 提问当成时间线的一步（蓝图「确认和提问」第 6 条，2026-10-24 项目主人：不要卡片）：一道一行「短名：回答」，第一行前面一个图标；取消的照别的提示行，暗色一行。 @param {any} r @param {boolean} fresh */
  node(r, fresh) {
    const t = this.text;
    const cls = fresh ? '.is-fresh' : '';
    if (r.type === 'answered') {
      return h(`div.asking-report.asking-answered${cls}`, r.rows.map((/** @type {any} */ row, /** @type {number} */ i) => h('div.asked-line',
        h('span.asked-node', i === 0 ? icon('message-circle') : null),
        h('div.asked-text',
          h('span.asked-label', `${row.label}${t('answer_sep')}`),
          row.answer?.text ? h('span.asked-answer', row.answer.text) : row.answer ? null : h('span.asked-answer.is-missing', t('unanswered')),
          i === 0 && r.who ? h('span.asked-who', t('answered_who', { who: r.who })) : null,
          row.answer?.notes ? h('div.asked-notes', t('notes_line', { notes: row.answer.notes })) : null))));
    }
    return h(`div.asking-report.is-cancelled${cls}`, h('span.asking-dot', '●'), t(r.kind === 'ask' ? 'cancelled_question' : 'cancelled_approval'));
  }
}
