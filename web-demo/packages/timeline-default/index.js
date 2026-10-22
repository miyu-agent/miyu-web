// @ts-check
//! 出厂时间线（软件包 `timeline-default`，蓝图 `web.md`「换画法」）：把原来的画法（`src/ui/timeline.js`、`steps.js`）登记成职能
//! `render.timeline` 的提供者。代码留在原处：回报那一行照它的样子画、样式在 `styles/timeline.css`。

import { SegmentView } from '../../src/ui/timeline.js';

/** @param {any} ctx */
export function apply(ctx) {
  ctx.seams.provide('render.timeline', {
    id: 'default',
    name: ctx.text('name'),
    segment: (/** @type {any} */ env) => new SegmentView(env.where, env.fresh),
  });
}
