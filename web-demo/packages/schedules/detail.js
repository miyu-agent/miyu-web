// @ts-check
//! 一个定时任务的详情（蓝图 `web.md`「定时任务」第 2a 条，2026-11-02 项目主人：右侧栏卡片「只有悬停才能看详情，点击没效果却能点击」、
//! 「没法修改时间」）：右侧栏卡片点一行、设置页那一页点名字都开它。样子同新建浮窗（设置框正中、没开设置框的在页面正中一张卡、淡遮罩）：
//! 头一行那句话（全文），下面名目在左、值在右的几行（什么时候、下次、上次、在哪跑、谁建的），底下「修改」、停/续、「删除」。
//! 表变了（推来的、自己改的）当场重画；这一项没了（删了、到点跑完的一次性）收起。

import { h, icon, replace } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { whenText, whereText, dayText, skipText } from './model.js';
import { openForm } from './form.js';

/**
 * @param {any} ctx `schedules` 包的 ctx @param {import('./store.js').ScheduleStore} store @param {string} id 哪一项
 * @param {{kit?: any, title: (id: string) => string|null, toast: (text: string) => void}} opts `kit` 设置页的控件（右侧栏卡片的没有，照设置服务另要一份）
 */
export function openDetail(ctx, store, id, opts) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  document.querySelector('.sch-detail')?.remove();
  const body = h('div.sch-detail-body');
  const foot = h('div.set-tool-pop-foot.sch-detail-foot');
  const pop = h('div.set-tool-pop.sch-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('detail.title') },
    h('div.set-tool-pop-head', h('strong', t('detail.title')),
      h('button.icon-button', { type: 'button', title: t('form.close'), 'aria-label': t('form.close'), onclick: () => close() }, icon('x'))),
    body, foot);
  const modal = h('div.set-tool-modal.sch-modal.sch-detail', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, pop);
  /** 设置页交来的控件；右侧栏卡片的照设置服务要一份（菜单开在这张卡上） */
  const kit = opts.kit ?? ctx.settings?.kit?.(pop, opts.toast) ?? null;
  /** 「删除」点了一下：再点一下才删 */
  let arming = false;

  const act = async (/** @type {string} */ method) => {
    try {
      await store.act(/** @type {any} */ (method), { id });
    } catch (err) {
      const e = /** @type {any} */ (err);
      opts.toast(e?.data?.problem === 'past' ? t('past') : e?.message ?? String(err));
    }
  };

  const draw = () => {
    const s = store.list.find((x) => x.id === id);
    if (!s) return close();
    const now = new Date();
    const row = (/** @type {string} */ name, /** @type {string} */ value) => (value ? h('div.sch-detail-row', h('span.sch-detail-k', name), h('span.sch-detail-v', value)) : null);
    const next = s.paused ? t('paused') : s.next ? dayText(s.next, now, t) : '';
    const result = s.last ? (skipText(s, t) ?? t(`detail.result.${s.last.result}`)) : '';
    const by = s.by?.kind === 'model' ? t('detail.by_model') : s.by?.kind === 'package' ? t('detail.by_package', { id: s.by.package ?? '' }) : t('detail.by_person');
    replace(body,
      h('p.sch-detail-prompt', s.prompt),
      row(t('detail.when'), whenText(s, now, t)),
      row(t('detail.next'), next),
      row(t('detail.last'), s.last ? `${dayText(s.last.at, now, t)} · ${result}` : ''),
      row(t('detail.where'), whereText(s, opts.title, t)),
      row(t('detail.by'), by));
    const noUpdate = store.noUpdate || !kit;
    const edit = h('button.set-btn', {
      type: 'button', disabled: noUpdate, title: noUpdate ? t('form.no_update') : null,
      onclick: () => { close(); openForm(ctx, kit, store, { session: null, edit: s, done: () => {} }); },
    }, icon('pencil'), t('detail.edit'));
    const toggle = h('button.set-btn', { type: 'button', onclick: () => act(s.paused ? 'schedule.resume' : 'schedule.pause') }, icon(s.paused ? 'play' : 'pause'), t(s.paused ? 'resume' : 'pause'));
    const remove = h(`button.set-btn.sch-detail-remove${arming ? '.is-armed' : ''}`, {
      type: 'button',
      onclick: () => {
        if (!arming) {
          arming = true;
          draw();
          return;
        }
        close();
        act('schedule.cancel');
      },
    }, icon('trash-2'), t(arming ? 'detail.remove_sure' : 'delete'));
    replace(foot, remove, h('span.dash-gap'), toggle, edit);
  };
  const off = store.on(draw);
  const close = () => {
    off();
    if (modal.isConnected && !modal.classList.contains('is-leaving')) leave(modal, () => modal.remove());
  };
  modal.addEventListener('set-dismiss', close);
  draw();
  (document.querySelector('.set-panel') ?? document.body).append(modal);
}
