// @ts-check
//! 输入框右上方的循环标记（挂载位 `composer.above`，蓝图 `web.md`「定时任务」第 2b 条；2026-11-14 主人：照终端 `loop_tag.rs` 补上）：
//! 看着的会话挂着循环时，和运行状态行、长期目标共用紧挨着框的那一行，靠右、有长期目标时排在它左边（`.dock-beside`，`styles/dock.css`），
//! 写「(时钟) 13:07」、「已暂停」，还没定下一次的只画图标。点它开这个循环的详情（`detail.js`）。放不下时先只画图标，再放不下不画。

import { h, icon } from '../../src/lib/dom.js';
import { unfold } from '../../src/lib/motion.js';
import { cardText, fitOf, loopOn, loopTag } from './model.js';
import { openDetail } from './detail.js';

/**
 * @param {any} ctx `schedules` 包的 ctx @param {import('./store.js').ScheduleStore} store
 * @param {() => string|null} session 看着的会话；看着子会话的是 `null`（同终端、同长期目标，不写）
 * @param {(fn: () => void) => () => void} onSessionChange 看着的会话换了叫
 * @returns {{el: HTMLElement, dispose: () => void}}
 */
export function loopTagLane(ctx, store, session, onSessionChange) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  const title = (/** @type {string} */ id) => ctx.chat?.title?.(id) ?? ctx.sessions?.index?.get?.(id)?.title ?? null;
  const mark = h('span.loop-mark', icon('clock'));
  const text = h('span.loop-text');
  /** 这一刻写的是哪一项（点了开它的详情） @type {string|null} */
  let shown = null;
  const pill = /** @type {HTMLButtonElement} */ (h('button.loop-pill', {
    type: 'button',
    onclick: () => { if (shown) openDetail(ctx, store, shown, { title, toast: (/** @type {string} */ s) => ctx.composer?.say?.(s) }); },
  }, mark, text));
  const body = h('div.loop-body', pill);
  const el = h('div.dock-loop.dock-lane.dock-beside.unfold', h('div.unfold-inner', body));
  unfold(el, false);

  /** 照这一格的宽挑整截、只有图标、不画（宽度变了重量） */
  const fit = () => {
    if (!shown) return;
    pill.dataset.fit = 'full';
    const style = getComputedStyle(body);
    const room = body.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    pill.dataset.fit = fitOf(room, pill.scrollWidth, mark.getBoundingClientRect().width);
  };
  const draw = () => {
    const now = new Date();
    const s = loopOn(store.list, session());
    shown = s?.id ?? null;
    // 收起时字留着（收的动画里还看得到）
    unfold(el, !!s);
    if (!s) return;
    const tag = loopTag(s, now, t);
    text.textContent = tag.text;
    pill.dataset.state = tag.state;
    pill.title = `${s.prompt}\n${cardText(s, now, t)}`;
    pill.setAttribute('aria-label', tag.text ? `${t('loop_tag')} ${tag.text}` : t('loop_tag'));
    fit();
  };
  const release = store.hold();
  const off = store.on(draw);
  const offSession = onSessionChange(draw);
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  resize?.observe(body);
  // 今天、明天跟着钟走：一分钟重画一次
  const tick = setInterval(draw, 60_000);
  draw();
  return {
    el,
    dispose: () => {
      off();
      offSession();
      resize?.disconnect();
      clearInterval(tick);
      release();
    },
  };
}
