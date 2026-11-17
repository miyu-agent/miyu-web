// @ts-check
//! 「推演人生」那张卡（软件包 `life`，蓝图 `web.md`「推演人生」第 3 条；W-1211「人生-归档」）：页面正中一张卡，两栏——
//! 「正在过的」照 `life.list`：一行人格头像、名字、在干嘛，右边状态（`lifeSide`：不写第几轮），悬停露暂停/继续、结束人生（点一下变「确认结束」、
//! 下面一行红字说后果，再点才结束；同人生卡，调 `life.*`）；点一行打开那个会话。
//! 「已结束的人生」照会话表里结束了的人生会话（`endedGroups`），按人格分组，组头头像加名字，一行标题、结束的日子；点了打开（结束了的会话只读）。
//! 不显示遗言。两栏都空的写它是什么、怎么开，一个按钮去人格设置。

import { h, icon, replace } from '../../src/lib/dom.js';
import { livesOf, lifeSide } from '../../src/lib/life.js';
import { endedGroups } from './model.js';

/**
 * @param {any} ctx `life` 包的 ctx
 * @param {{close: () => void, unseen: () => Set<string>}} opts 收起这张卡；还没看过的（她自己结束的，下一步画记号）
 */
export function lifeWindow(ctx, opts) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  const body = h('div.life-body');
  /** @type {import('../../src/lib/life.js').Life[]} */
  let lives = [];
  /** 「结束人生」点了一下的那一行（人格）：再点一下才结束 @type {string|null} */
  let arming = null;
  /** 问过一次 `life.list` 了（问回来之前「正在过的」不画，免得先闪一下空的） */
  let loaded = false;

  const nameOf = (/** @type {string} */ persona) => ctx.personas?.personaName?.(persona) ?? persona;
  /** 人格的小头像：有图的画图，没有的画名字第一个字 @param {string|null} persona @param {string} name */
  const face = (persona, name) => {
    const url = persona ? ctx.personas?.look?.(persona)?.avatar ?? null : null;
    return h('span.life-face', { 'aria-hidden': 'true' }, url ? h('img', { src: url, alt: '' }) : [...(name || '?')][0]);
  };
  const go = (/** @type {string} */ session) => { opts.close(); ctx.chat.open(session); };

  const act = async (/** @type {'pause'|'resume'|'kill'} */ what, /** @type {string} */ persona) => {
    arming = null;
    try {
      await ctx.core.request(`life.${what}`, { persona });
    } catch (err) {
      ctx.composer?.say?.(/** @type {any} */ (err)?.message ?? String(err));
    }
    refresh();
  };

  const livingRow = (/** @type {import('../../src/lib/life.js').Life} */ l, /** @type {Date} */ now) => {
    const armed = arming === l.persona;
    const stop = (/** @type {Event} */ e) => e.stopPropagation();
    return h('li', h(`div.life-row.is-${l.state}${armed ? '.is-armed' : ''}`, {
      role: 'button', tabindex: '0', onclick: () => go(l.session),
      onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(l.session); } },
    },
      face(l.persona, l.name),
      h('span.life-main', h('span.life-name', l.name), armed ? h('span.life-warn', t('kill_hint')) : l.doing ? h('span.life-doing', l.doing) : null),
      h('span.life-state', lifeSide(l, now, (/** @type {string} */ k, /** @type {any} */ f) => t(`side.${k}`, f))),
      h('span.life-acts',
        h('button.icon-button.life-act', {
          type: 'button', title: t(l.state === 'paused' ? 'resume' : 'pause'), 'aria-label': t(l.state === 'paused' ? 'resume' : 'pause'),
          onclick: (/** @type {Event} */ e) => { stop(e); act(l.state === 'paused' ? 'resume' : 'pause', l.persona); },
        }, icon(l.state === 'paused' ? 'play' : 'pause')),
        h(`button.life-act.life-kill${armed ? '.is-armed' : ''}`, {
          type: 'button', title: t(armed ? 'kill_sure' : 'kill'), 'aria-label': t(armed ? 'kill_sure' : 'kill'),
          onclick: (/** @type {Event} */ e) => {
            stop(e);
            if (!armed) { arming = l.persona; draw(); return; }
            act('kill', l.persona);
          },
        }, armed ? t('kill_sure') : icon('square')))));
  };

  const endedPart = () => {
    const unseen = opts.unseen();
    const groups = endedGroups(ctx.sessions.index.all(), nameOf);
    if (!groups.length) return null;
    const day = (/** @type {string|null} */ at) => (at ? new Date(at).toLocaleDateString() : '');
    return h('section.life-part',
      h('h4.life-part-head', t('ended')),
      groups.map((g) => h('div.life-group',
        h('div.life-group-head', face(g.persona, g.name ?? t('no_persona')), h('span', g.name ?? t('no_persona'))),
        h('ul.life-list', g.rows.map((r) => h('li', h('button.life-row.is-ended', { type: 'button', onclick: () => go(r.session) },
          h('span.life-main', h('span.life-name', r.title ?? r.session.slice(-8))),
          unseen.has(r.session) ? h('i.life-unseen', { 'aria-hidden': 'true' }) : null,
          h('span.life-state', day(r.at)))))))));
  };

  const draw = () => {
    const now = new Date();
    const ended = endedPart();
    if (loaded && !lives.length && !ended) {
      replace(body,
        h('p.life-empty', t('empty')),
        ctx.settings?.open ? h('button.prefix-ask-btn.is-primary.life-go', { type: 'button', onclick: () => { opts.close(); ctx.settings.open('personas'); } }, t('open_personas')) : null);
      return;
    }
    replace(body,
      lives.length ? h('section.life-part', h('h4.life-part-head', t('living')), h('ul.life-list', lives.map((l) => livingRow(l, now)))) : null,
      ended);
  };

  /** 重问 `life.list`（开卡时、会话表变了、做完一件事）；问不到的照上一次的 */
  const refresh = () => {
    ctx.core.request('life.list', {}).then((/** @type {any} */ got) => {
      lives = livesOf(got);
      loaded = true;
      draw();
    }, () => { loaded = true; draw(); });
  };

  return { el: body, draw, refresh };
}
