// @ts-check
//! 人生卡（「人生-卡」，2026-11-17 项目主人本机验收第 23 条，核心 LF-13；W-1211；蓝图 `web.md`「推演人生」第 8 条）：定时表里人生那一行（`loop` 是 `life`）
//! 点开的不是定时任务那张，是这一张。输入框右上方的循环标记、右侧栏卡片、设置页「定时任务」那一页点人生那一行都开它。样子同定时任务的详情
//! （设置框正中、没开设置框的在页面正中一张卡、淡遮罩）：头一行「推演人生」，下面人格名，再下面名目在左、值在右的几行（`model.js` 的 `lifeCard`），
//! 底下「结束人生」（点一下变「确认结束」、下面一行说清后果，再点才结束）、暂停/继续。通用的定时方法对这一行回 `life_schedule`，这里只调 `life.*`。
//! 表变了当场重画；这一行没了（结束了）收起。

import { h, icon, replace } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { lifeCard, lifePersona } from './model.js';
import { escDismisses } from './dismiss.js';

/**
 * 人生那一行的人格和名字：行里带的，没带的照会话的人格（`chat.persona`）；名字照人格列表（没读到的写编号）。
 * @param {any} ctx @param {import('./model.js').Schedule} s @returns {{persona: string|null, name: string}}
 */
export function lifeWho(ctx, s) {
  const persona = lifePersona(s, (session) => ctx.chat?.persona?.(session) ?? null);
  return { persona, name: persona ? ctx.personas?.personaName?.(persona) ?? persona : '' };
}

/**
 * @param {any} ctx `schedules` 包的 ctx @param {import('./store.js').ScheduleStore} store @param {string} id 人生那一行的编号
 * @param {{toast: (text: string) => void}} opts
 */
export function openLifeCard(ctx, store, id, opts) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  document.querySelector('.sch-detail')?.remove();
  const head = h('strong');
  const body = h('div.sch-detail-body');
  const foot = h('div.set-tool-pop-foot.sch-detail-foot');
  const pop = h('div.set-tool-pop.sch-pop.sch-life', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('life.title') },
    h('div.set-tool-pop-head', head,
      h('button.icon-button', { type: 'button', title: t('form.close'), 'aria-label': t('form.close'), onclick: () => close() }, icon('x'))),
    body, foot);
  const modal = h('div.set-tool-modal.sch-modal.sch-detail', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, pop);
  /** 「结束人生」点了一下：再点一下才结束 */
  let arming = false;

  const act = async (/** @type {'pause'|'resume'|'kill'} */ what, /** @type {import('./model.js').Schedule} */ s) => {
    const { persona } = lifeWho(ctx, s);
    if (!persona) return;
    try {
      await store.life(what, s.id, persona);
    } catch (err) {
      opts.toast(/** @type {any} */ (err)?.message ?? String(err));
    }
  };

  const draw = () => {
    const s = store.list.find((x) => x.id === id);
    if (!s) return close();
    const { name } = lifeWho(ctx, s);
    const card = lifeCard(s, name, new Date(), t);
    head.textContent = card.title;
    replace(body,
      card.name ? h('p.sch-detail-prompt.sch-life-name', card.name) : null,
      card.rows.map(([k, v]) => h('div.sch-detail-row', h('span.sch-detail-k', k), h('span.sch-detail-v', v))),
      arming ? h('p.sch-life-warn', t('life.kill_hint')) : null);
    const toggle = h('button.set-btn', { type: 'button', onclick: () => act(s.paused ? 'resume' : 'pause', s) }, icon(s.paused ? 'play' : 'pause'), t(s.paused ? 'life.resume' : 'life.pause'));
    const kill = h(`button.set-btn.sch-detail-remove${arming ? '.is-armed' : ''}`, {
      type: 'button',
      onclick: () => {
        if (!arming) {
          arming = true;
          draw();
          return;
        }
        close();
        act('kill', s);
      },
    }, icon('square'), t(arming ? 'life.kill_sure' : 'life.kill'));
    replace(foot, kill, h('span.dash-gap'), toggle);
  };
  const off = store.on(draw);
  const close = () => {
    off();
    unEsc();
    if (modal.isConnected && !modal.classList.contains('is-leaving')) leave(modal, () => modal.remove());
  };
  modal.addEventListener('set-dismiss', close);
  const unEsc = escDismisses(modal);
  draw();
  (document.querySelector('.set-panel') ?? document.body).append(modal);
}
