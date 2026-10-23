// @ts-check
//! 用量页（软件包 `usage`，蓝图 `web.md`「用量页」；2026-10-20 项目主人看过样板定）：往设置页挂一页「用量」（`settings.section`，
//! 排在「模型」后面），照核心的 `usage.query` 画花费、请求、token、缓存命中，每天（今天每小时）的柱子，按模型、会话、用途、场所的表（`page.js`）。
//! 停用了没有这一页。终端不做。

import { UsagePage } from './page.js';

/** @param {any} ctx */
export function apply(ctx) {
  const page = new UsagePage(ctx);
  ctx.slots.mount('settings.section', { id: 'usage', name: ctx.text('title'), render: (/** @type {any} */ kit) => page.render(kit) });
  // 框下面累计浮窗的「在用量页看」（蓝图「上下文明细、累计按用途」第 4 条）：时间段全部、按会话，弹这个会话的细则
  ctx.on('usage.show', (/** @type {{session: string}} */ e) => {
    page.focus(e.session);
    ctx.settings?.open?.('usage');
  });
}
