// @ts-check
//! 定时任务（软件包 `schedules`，蓝图 `web.md`「定时任务」；2026-10-27 项目主人选「设置里一页 + 右侧栏卡片」）：往设置页挂一页「定时任务」
//! （`settings.section`，排在「知识库」后面，`page.js`），往右侧边栏挂一张卡（`side.cards`，`card.js`），往输入框右上方挂循环的下次
//! （`composer.above`，`loop-tag.js`，2026-11-14 主人），几处共用一份表（`store.js`）。起来时问一次核心有没有 `schedule.*`，旧核心没有的都不挂。
//! 停用了都没有。

import { ScheduleStore } from './store.js';
import { SchedulesPage } from './page.js';
import { scheduleCard } from './card.js';
import { loopTagLane } from './loop-tag.js';

/** @param {any} ctx */
export function apply(ctx) {
  const store = new ScheduleStore(ctx.core);
  ctx.effect(() => () => ctx.core.pushes?.delete?.(store.onPush));
  const page = new SchedulesPage(ctx, store);
  ctx.effect(() => () => page.letGo());
  /** 主区正在看的会话；卡片列的是它这一串最上面那个（同右侧边栏别的卡） @type {string|null} */
  let current = ctx.chat?.current?.() ?? null;
  const top = () => (current ? ctx.chat?.topOf?.(current) ?? current : null);
  /** 输入框上面那一截看的会话：看着子会话时不写（同终端、同长期目标） */
  const own = () => (current && top() === current ? current : null);
  /** @type {Set<() => void>} */
  const watchers = new Set();
  ctx.on('view.changed', (/** @type {any} */ v) => {
    const next = v?.session ?? null;
    if (next === current) return;
    current = next;
    for (const fn of watchers) fn();
  });
  const onSessionChange = (/** @type {() => void} */ fn) => { watchers.add(fn); return () => watchers.delete(fn); };
  store.probe().then((ok) => {
    if (!ok) return;
    ctx.slots.mount('composer.above', { id: 'schedules-loop', order: 29, render: () => loopTagLane(ctx, store, own, onSessionChange) });
    ctx.slots.mount('settings.section', { id: 'schedules', name: ctx.text('title'), render: (/** @type {any} */ kit) => page.render(kit) });
    ctx.slots.mount('side.cards', {
      id: 'schedules', order: 60, name: ctx.text('title'),
      render: scheduleCard(ctx, store, top, onSessionChange, () => {
        page.from = top();
        ctx.settings?.open?.('schedules');
      }),
    });
  });
}
