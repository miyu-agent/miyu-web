// @ts-check
//! 推演人生（软件包 `life`，蓝图 `web.md`「推演人生」第 3 条；核心设计 70）：人生会话不进左栏和全部会话（2026-11-14 项目主人：「和别的
//! 会话混在一起的话，万一误删了不是很尴尬？」「还记得那个 webui 左侧边栏那个更多吗？可以放那里」）。左栏「更多」（挂载位
//! `sidebar.more`）挂一项「推演人生」，点了页面正中开一张卡：各人格的人生一个一行（`model.js` 排），点一行打开那个会话、收起卡片。
//! 一条都没有的写这是什么、怎么开，给一个按钮去人格设置。卡开着时会话表变了照新的重画、重问 `life.status`。
//! 停用这个包：「更多」里没有这一项，人生会话照样不进左栏（`/life` 照样能跳过去）。
//! 图标是 Lucide 的 `sprout`（嫩芽），在整套图标里（`icons.more`）。

import { h, icon, replace } from '../../src/lib/dom.js';
import { lifeState } from '../../src/lib/life.js';
import { lifeRows, lifePersonas, wakeText } from './model.js';

/** @param {any} ctx */
export function apply(ctx) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  /** 开着的那张卡；没开是 `null` @type {{layer: HTMLElement, body: HTMLElement}|null} */
  let open = null;
  /** 人格 → `life.status`（卡开着时问的） @type {Map<string, any>} */
  const statuses = new Map();

  const nameOf = (/** @type {string|null} */ persona) => (persona ? ctx.personas?.personaName?.(persona) ?? persona : '');

  const close = () => {
    if (!open) return;
    open.layer.remove();
    open = null;
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== 'Escape' || !open) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };

  const draw = () => {
    if (!open) return;
    const rows = lifeRows(ctx.sessions.index.all(), statuses);
    if (!rows.length) {
      replace(open.body,
        h('p.life-empty', t('empty')),
        ctx.settings?.open ? h('button.prefix-ask-btn.is-primary.life-go', { type: 'button', onclick: () => { close(); ctx.settings.open('personas'); } }, t('open_personas')) : null);
      return;
    }
    const now = new Date();
    replace(open.body, h('ul.life-list', rows.map((r) => {
      const side = r.state === 'running' && r.next ? `${t('states.running')} · ${t('next', { time: wakeText(r.next, now, t) })}` : t(`states.${r.state}`);
      return h('li', h(`button.life-row.is-${r.state}`, { type: 'button', onclick: () => { close(); ctx.chat.open(r.session); } },
        icon('sprout'),
        h('span.life-main',
          h('span.life-name', nameOf(r.persona) || r.title || r.session.slice(-8)),
          r.doing ? h('span.life-doing', r.doing) : null),
        h('span.life-state', side)));
    })));
  };

  /** 问各人格的 `life.status`（问回来一个画一次；问不到的照会话表画） */
  const refresh = () => {
    for (const persona of lifePersonas(ctx.sessions.index.all())) {
      ctx.core.request('life.status', { persona }).then((got) => {
        statuses.set(persona, lifeState(got));
        draw();
      }, () => {});
    }
  };

  const show = () => {
    if (open) return;
    const body = h('div.life-body');
    const card = h('div.prefix-ask-card.life-card', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('title') },
      h('div.life-head', h('p.prefix-ask-title', t('title')),
        h('button.icon-button.life-close', { type: 'button', title: t('close'), 'aria-label': t('close'), onclick: () => close() }, icon('x'))),
      body);
    const layer = h('div.prefix-ask.life-layer', { onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, card);
    open = { layer, body };
    document.addEventListener('keydown', onKey, true);
    document.body.append(layer);
    draw();
    refresh();
    // 嫩芽图标在整套图标里（`lucide-all.json`），没读过的读了再画一次
    Promise.resolve(ctx.icons?.more?.()).then(() => draw(), () => {});
  };

  // 会话表一项项推来（一次变好几项）：攒一下再画、再问
  let soon = 0;
  ctx.sessions.index.on(() => {
    if (!open) return;
    clearTimeout(soon);
    soon = setTimeout(() => { draw(); refresh(); }, 200);
  });
  ctx.effect(() => () => close());
  ctx.slots.mount('sidebar.more', { id: 'life', label: t('title'), icon: 'sprout', run: () => show() });
}
