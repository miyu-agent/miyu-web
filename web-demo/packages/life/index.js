// @ts-check
//! 推演人生（软件包 `life`，蓝图 `web.md`「推演人生」第 3 条；核心设计 70）：人生会话不进左栏和全部会话（2026-11-14 项目主人：「和别的
//! 会话混在一起的话，万一误删了不是很尴尬？」「还记得那个 webui 左侧边栏那个更多吗？可以放那里」）。左栏头上交互区（挂载位 `sidebar.nav`；
//! 2026-11-17 项目主人本机验收第 31 条：从「更多」拿出来，和别的主入口同一级，W-1211）挂一项「推演人生」，点了页面正中开一张卡：各人格的人生一个一行
//! （`model.js` 排），点一行打开那个会话、收起卡片。
//! 卡里两栏（`card.js`）：「正在过的」照 `life.list`，「已结束的人生」按人格分组（W-1211「人生-归档」）；一条都没有的写这是什么、怎么开，
//! 给一个按钮去人格设置。卡开着时会话表变了重问、重画。
//! 停用这个包：左栏没有这一项，人生会话照样不进左栏（`/life` 照样能跳过去）。
//! 图标是 Lucide 的 `sprout`（嫩芽），在整套图标里（`icons.more`）。

import { h, icon } from '../../src/lib/dom.js';
import { isLife } from '../../src/lib/life.js';
import { lifeWindow } from './card.js';
import { watchUnseen } from './unseen.js';

/** @param {any} ctx */
export function apply(ctx) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  /** 开着的那张卡；没开是 `null` @type {{layer: HTMLElement, view: ReturnType<typeof lifeWindow>}|null} */
  let open = null;
  /** 她自己结束了、还没人看过的人生（核心 LF-14）：顶上的提示、左栏的记号、卡里的小圆点 */
  const unseen = watchUnseen(ctx);

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

  const show = () => {
    if (open) return;
    const view = lifeWindow(ctx, { close, unseen: () => unseen.sessions() });
    const card = h('div.prefix-ask-card.life-card', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('title') },
      h('div.life-head', h('p.prefix-ask-title', t('title')),
        h('button.icon-button.life-close', { type: 'button', title: t('close'), 'aria-label': t('close'), onclick: () => close() }, icon('x'))),
      view.el);
    const layer = h('div.prefix-ask.life-layer', { onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, card);
    open = { layer, view };
    document.addEventListener('keydown', onKey, true);
    document.body.append(layer);
    view.draw();
    view.refresh();
  };

  // 会话表一项项推来（一次变好几项）：攒一下再画、再问
  let soon = 0;
  ctx.sessions.index.on(() => {
    if (!open) return;
    clearTimeout(soon);
    soon = setTimeout(() => open?.view.refresh(), 200);
  });
  ctx.effect(() => () => close());
  // 左栏头上交互区的主入口（2026-11-17 项目主人本机验收第 31 条：从「更多」拿出来，W-1211）：看着人生会话时这一行亮着。嫩芽图标在整套图标里，
  // 读到了叫左栏重画这一行；有她自己结束了、还没看过的人生时带记号（核心 LF-14），变了重画；卡开着的跟着重画小圆点
  /** @type {Set<() => void>} */
  const redraw = new Set();
  const onChange = (/** @type {() => void} */ fn) => { redraw.add(fn); return () => redraw.delete(fn); };
  Promise.resolve(ctx.icons?.more?.()).then(() => { for (const fn of redraw) fn(); }, () => {});
  unseen.onChange(() => { for (const fn of redraw) fn(); open?.view.draw(); });
  ctx.slots.mount('sidebar.nav', { id: 'life', label: t('title'), icon: 'sprout', run: () => show(), owns: isLife, mark: () => unseen.has(), onChange });
}
