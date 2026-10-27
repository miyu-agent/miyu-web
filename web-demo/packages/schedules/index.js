// @ts-check
//! 定时任务（软件包 `schedules`，蓝图 `web.md`「定时任务」；2026-10-27 项目主人选「设置里一页 + 右侧栏卡片」）：往设置页挂一页「定时任务」
//! （`settings.section`，排在「知识库」后面，`page.js`），表在 `store.js`。
//! 起来时问一次核心有没有 `schedule.*`，旧核心没有的两处都不挂。停用了都没有。

import { ScheduleStore } from './store.js';
import { SchedulesPage } from './page.js';

/** @param {any} ctx */
export function apply(ctx) {
  const store = new ScheduleStore(ctx.core);
  ctx.effect(() => () => ctx.core.pushes?.delete?.(store.onPush));
  const page = new SchedulesPage(ctx, store);
  ctx.effect(() => () => page.letGo());
  store.probe().then((ok) => {
    if (!ok) return;
    ctx.slots.mount('settings.section', { id: 'schedules', name: ctx.text('title'), render: (/** @type {any} */ kit) => page.render(kit) });
  });
}
