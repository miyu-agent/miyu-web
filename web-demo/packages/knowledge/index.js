// @ts-check
//! 知识库页（软件包 `knowledge`，蓝图 `web.md`「知识库页」；2026-10-19 项目主人定，shorin-ee 转来）：往设置页挂一页「知识库」
//! （`settings.section`，排在「记忆」后面），能搜、看原文、新建空库、挂文件夹、加删文档、重建索引、删库（`page.js`）。
//! 停用了没有这一页。终端不做。

import { KnowledgePage } from './page.js';

/** @param {any} ctx */
export function apply(ctx) {
  const page = new KnowledgePage(ctx);
  ctx.slots.mount('settings.section', { id: 'knowledge', name: ctx.text('title'), render: (/** @type {any} */ kit) => page.render(kit) });
}
