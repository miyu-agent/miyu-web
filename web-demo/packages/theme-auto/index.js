// @ts-check
//! 主题「自动」（软件包 `theme-auto`，蓝图 `web.md`「主题」，2026-11-02 项目主人定成出厂）：往主题包的 `theme.palettes` 挂一套，颜色借别的
//! 两套：这个会话的人格有主色的照「跟随人格」，没有的照「跟随壁纸」，都交不出的交 `null`（主题包用默认那一份，不吭声）。借哪一套每次照这一刻
//! 算（`model.js`），不另记：那两套换了颜色会重挂，主题包、设置页看着 `theme.palettes` 当场重画，自动跟着变。设置页、引导的「主色」那一行照
//! `seeds()`（这时借的那一套的），`source()` 交借的是哪一套。停用了这个包就没有「自动」这一张。

import { sourceOf } from './model.js';

/** 排在「默认」后面、「跟随人格」前面 */
const ORDER = 1;

/** @param {any} ctx */
export function apply(ctx) {
  const system = matchMedia('(prefers-color-scheme: dark)');
  /** 这时借哪一套：照页面这时的浅深（主题包的「明暗」，没有主题包的照系统） */
  const now = () => sourceOf(ctx.slots.list('theme.palettes'), (ctx.theme?.dark?.() ?? system.matches) ? 'dark' : 'light');
  const undo = ctx.slots.mount('theme.palettes', {
    id: 'auto', name: ctx.text('name'), order: ORDER,
    render: (/** @type {'light'|'dark'} */ scheme) => sourceOf(ctx.slots.list('theme.palettes'), scheme)?.render(scheme) ?? null,
    seeds: () => now()?.seeds?.() ?? null,
    source: () => now()?.id ?? null,
  });
  ctx.effect(() => undo);
}
