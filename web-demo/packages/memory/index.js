// @ts-check
//! 记忆页（软件包 `memory`，蓝图 `web.md`「记忆页」；2026-10-19 项目主人看过样品定）：往设置页挂一页「记忆」（`settings.section`），
//! 一个人格一份、「无人格」也有一份，能列、搜、记、改内容和关键词、作废、找回、整理、清空（`page.js`）。`/memory` 直接打开。
//! 提供服务 `memory`：别的包（人格详情）跳到某个人格的那一份。停用了没有这一页、没有 `/memory`。

import { MemoryPage } from './page.js';

/** @param {any} ctx */
export function apply(ctx) {
  const page = new MemoryPage(ctx);
  ctx.slots.mount('settings.section', { id: 'memory', name: ctx.text('title'), render: (/** @type {any} */ kit) => page.render(kit) });
  /** 打开设置、到这一页；带了人格的换到那一份 @param {string|null} [persona] */
  const open = (persona) => {
    page.show(persona ?? null);
    ctx.settings?.open?.('memory');
  };
  ctx.commands.register({ name: 'memory', summary: ctx.text('command') }, () => open(null));
  ctx.provide('memory', { open });
}
