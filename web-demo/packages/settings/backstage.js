// @ts-check
//! 「软件后台」页（蓝图 `web.md`「设置页」第 19 条；核心 F-6 中，`package-pages.md`；2026-10-10 项目主人：软件后台只列带自己页面的软件，
//! 照 AstrBot 的插件那样由软件自己带页面）：一个一行，点了跳到这个软件的独立整页（2026-10-15 项目主人定：页面不嵌在设置里，「软件后台」这一页
//! 列着、点了跳过去）。整页、框、框和网页之间的通道在软件包 `backstage`（服务 `backstage`）：一行是一个链接（`#package=<编号>`），按着 Ctrl、
//! 中键点开在新标签页；停用了那个包的，行照列、点不开。

import { h, icon, hasIcon } from '../../src/lib/dom.js';

/** 「软件后台」页：带后台页的软件一个一行；一个都没有的写一句。 @param {any} dialog */
export function drawBackstage(dialog) {
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  const list = (dialog.packages ?? []).filter((p) => p.page);
  if (!list.length) return [h('p.set-empty', t('backstage.none'))];
  return [h('section.set-group', h('div.set-rows', list.map((p) => {
    const state = p.status === 'running' || p.status === 'stopped' || p.status === 'program_missing' ? h(`span.set-pkg-status${p.status === 'running' ? '.is-on' : p.status === 'program_missing' ? '.is-bad' : ''}`, t(`pkg.status.${p.status}`)) : null;
    const href = dialog.ctx.backstage?.href(p.package);
    const parts = [
      h('span.set-pkg-face', icon(p.icon && hasIcon(p.icon) ? p.icon : 'package')),
      h('div.set-text', h('div.set-name', h('span', p.name ?? p.package)), p.summary ? h('p.set-desc', p.summary) : null),
      state, href ? h('span.set-pkg-arrow', icon('arrow-up-right')) : null,
    ];
    return href ? h('a.set-row.set-pkg.is-expandable.set-link', { href, onclick: (/** @type {MouseEvent} */ e) => openPage(dialog, p.package, e) }, ...parts) : h('div.set-row.set-pkg', ...parts);
  })))];
}

/**
 * 打开一个软件的独立整页：关了设置，交给服务 `backstage`（软件包信息页上的「打开页面」也走这里）。点的时候按着 Ctrl、⌘、Shift 的照浏览器的
 * 办（链接开在新标签页、新窗口）。
 * @param {any} dialog @param {string} id @param {MouseEvent} [e]
 */
export function openPage(dialog, id, e) {
  if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0)) return;
  e?.preventDefault();
  const pages = dialog.ctx.backstage;
  if (!pages) return;
  dialog.close();
  pages.open(id);
}
