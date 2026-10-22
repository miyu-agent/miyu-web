// @ts-check
//! 出厂回答排版（软件包 `markdown-default`，蓝图 `web.md`「换画法」）：把原来的 Markdown 画法（`src/markdown/`）登记成职能
//! `render.markdown` 的提供者。高亮、公式跟着它。

import { renderMarkdown } from '../../src/markdown/render.js';

/** @param {any} ctx */
export function apply(ctx) {
  ctx.seams.provide('render.markdown', {
    id: 'default',
    name: ctx.text('name'),
    render: renderMarkdown,
  });
}
