// @ts-check
//! 她自己结束了、还没人看过的人生（核心 LF-14，W-1211；蓝图 `web.md`「推演人生」第 9 条）：`life.list` 的 `ended_unseen`，起来时、推来 `life.ended`、
//! `notices` 流掉了队、断了又连上时重问；推来 `life.seen`（别的头收了提示、有头开了那个会话、会话删了）拿掉那一段（`model.js` 的 `unseenAfter`）。
//! 有的时候对话区顶上一条提示（挂载位 `stage.top`）：「<名字> 的人生结束了」，「查看」打开那个会话（核心照 `session.viewing` 清掉、推 `life.seen`），
//! 「收起」调 `life.seen {session}`；左栏「推演人生」那一行带记号、推演人生那张卡里那一行带小圆点。遗言、第几轮都不写。

import { h, icon, replace } from '../../src/lib/dom.js';
import { endedUnseenOf } from '../../src/lib/life.js';
import { unseenAfter } from './model.js';

/**
 * @param {any} ctx `life` 包的 ctx
 * @returns {{has: () => boolean, sessions: () => Set<string>, onChange: (fn: () => void) => () => void}}
 */
export function watchUnseen(ctx) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  /** 会话编号 → 那一项 @type {Map<string, {session: string, persona: string|null, name: string|null, at: string|null}>} */
  let unseen = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();
  const bar = h('div.life-ended-bar', { hidden: true, role: 'status' });

  const draw = () => {
    bar.hidden = unseen.size === 0;
    replace(bar, [...unseen.values()].map((u) => {
      const name = u.name ?? (u.persona ? ctx.personas?.personaName?.(u.persona) ?? u.persona : null);
      return h('div.life-ended-line',
        icon('sprout'),
        h('span.life-ended-text', name ? t('ended_hint', { name }) : t('ended_hint_bare')),
        h('button.life-ended-btn', { type: 'button', onclick: () => ctx.chat.open(u.session) }, t('ended_open')),
        h('button.icon-button.life-ended-x', {
          type: 'button', title: t('ended_dismiss'), 'aria-label': t('ended_dismiss'),
          onclick: () => { ctx.core.request('life.seen', { session: u.session }).catch(() => {}); drop(u.session); },
        }, icon('x')));
    }));
    for (const fn of listeners) fn();
  };
  const drop = (/** @type {string} */ session) => {
    if (!unseen.has(session)) return;
    unseen = new Map(unseen);
    unseen.delete(session);
    draw();
  };
  const reload = () => {
    ctx.core.request('life.list', {}).then((/** @type {any} */ got) => {
      unseen = new Map(endedUnseenOf(got).map((u) => [u.session, u]));
      draw();
    }, () => {});
  };
  // 订 `notices`（同系统通知那个包：一个连接只一份，订两次一样；不退订，免得把它的也退了）
  const subscribe = () => ctx.core.request('subscribe', { stream: 'notices' }).catch(() => {});
  const onPush = (/** @type {string} */ method, /** @type {any} */ params) => {
    const next = unseenAfter(unseen, method, params);
    if (next.reload) {
      if (method === 'resync') subscribe();
      reload();
    } else if (next.unseen !== unseen) {
      unseen = next.unseen;
      draw();
    }
  };
  ctx.core.onPush(onPush);
  ctx.effect(() => () => ctx.core.pushes?.delete?.(onPush));
  ctx.effect(() => ctx.core.onRejoin?.(() => { subscribe(); reload(); }) ?? (() => {}));
  subscribe();
  reload();
  ctx.slots.mount('stage.top', { id: 'life-ended', order: 10, render: () => ({ el: bar }) });
  return {
    has: () => unseen.size > 0,
    sessions: () => new Set(unseen.keys()),
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
