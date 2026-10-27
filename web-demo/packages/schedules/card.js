// @ts-check
//! 右侧边栏的「定时任务」卡（挂载位 `side.cards`，蓝图 `web.md`「定时任务」第 2 条）：只列跑在这一串主会话上的（连 `/loop`）；没有的整张不出。
//! 一行：时钟图标、「什么时候 · 下次」（悬停看那句话），悬停露出停/续、删除（不再问，同展示文件的 ✕）。点标题字进设置页那一页。

import { h, icon } from '../../src/lib/dom.js';
import { cardText, onSession, nextShort } from './model.js';

/**
 * @param {any} ctx `schedules` 包的 ctx @param {import('./store.js').ScheduleStore} store
 * @param {() => string|null} session 这一串主会话 @param {(fn: () => void) => () => void} onSessionChange 主会话换了叫
 * @param {() => void} openPage 进设置页那一页
 * @returns {(card: any) => () => void}
 */
export function scheduleCard(ctx, store, session, onSessionChange, openPage) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  return (card) => {
    const release = store.hold();
    const count = h('span.dash-count');
    card.title(t('title'));
    card.head(count);
    card.link(openPage);
    const act = async (/** @type {string} */ method, /** @type {string} */ id) => {
      try {
        await store.act(/** @type {any} */ (method), { id });
      } catch (err) {
        const e = /** @type {any} */ (err);
        ctx.composer?.say?.(e?.data?.problem === 'past' ? t('past') : e?.message ?? String(err));
      }
    };
    const draw = () => {
      const now = new Date();
      const list = onSession(store.list, session());
      count.textContent = list.length ? t('count', { n: list.length }) : '';
      // 一行：左边那句话，右边下次的时刻（循环的前面一个循环的记号），什么时候、在哪放进悬停（2026-10-27 项目主人选「话在左、下次时刻靠右」）；
      // 悬停时右边换成停/续和删除
      card.body(list.map((s) => h(`div.dash-row.dash-file.sch-card-row${s.paused ? '.is-paused' : ''}`, { title: `${s.prompt}\n${cardText(s, now, t)}` },
        h('span.dash-kind', icon('clock')),
        h('span.dash-file-name.sch-card-text', s.prompt),
        h('span.dash-gap'),
        h('span.sch-card-next', s.loop && !s.paused ? icon('rotate-cw') : null, nextShort(s, now, t)),
        h('button.dash-remove.sch-card-act', {
          type: 'button', title: t(s.paused ? 'resume' : 'pause'), 'aria-label': t(s.paused ? 'resume' : 'pause'),
          onclick: () => act(s.paused ? 'schedule.resume' : 'schedule.pause', s.id),
        }, icon(s.paused ? 'play' : 'pause')),
        h('button.dash-remove.sch-card-act', { type: 'button', title: t('remove'), 'aria-label': t('remove'), onclick: () => act('schedule.cancel', s.id) }, icon('x')))));
      card.show(list.length > 0);
      card.size(list.length);
    };
    const off = store.on(draw);
    const offSession = onSessionChange(draw);
    // 「下次」里的今天、明天跟着钟走：一分钟重画一次
    const tick = setInterval(draw, 60_000);
    draw();
    return () => {
      off();
      offSession();
      clearInterval(tick);
      release();
    };
  };
}
