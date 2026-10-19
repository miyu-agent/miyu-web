// @ts-check
//! 「软件后台」页（蓝图 `web.md`「设置页」第 19 条；核心 F-6 中，`package-pages.md`；2026-10-10 项目主人：软件后台只列带自己页面的软件，
//! 照 AstrBot 的插件那样由软件自己带页面）：一个一行，点了跳到这个软件的独立整页（2026-10-15 项目主人定：页面不嵌在设置里，「软件后台」这一页
//! 列着、点了跳过去）。整页、框、框和网页之间的通道在软件包 `backstage`（服务 `backstage`）：一行是一个链接（`#package=<编号>`），按着 Ctrl、
//! 中键点开在新标签页；停用了那个包的，行照列、点不开。扩展的界面块声明的整页（`package.list` 的 `widgets` 里位置是 `page` 的，核心
//! `widgets.md`）也列在这里，一页一行，写「软件名 · 标题」，链接另带 `widget`。有自己网页的软件（接入通讯平台的页面服务，`status` 问得到端口）只列一行，点了
//! 在新标签页开它的网页，它的界面块整页不另列（2026-10-19 项目主人：这一页只是汇在一起，点了跳到对应软件的后台，同软件包页、`/im`）。

import { h, icon, hasIcon } from '../../src/lib/dom.js';

/** 「软件后台」页：带后台页的软件一个一行；一个都没有的写一句。 @param {any} dialog */
export function drawBackstage(dialog) {
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  probeSites(dialog, dialog.packages ?? []);
  // 一页一行：后台页一个软件一行，界面块的整页一块一行（接在它的软件后面）；有自己网页的只一行
  const rows = (dialog.packages ?? []).flatMap((p) => [
    ...(p.page ? [{ p, widget: null, name: p.name ?? p.package, summary: p.summary }] : []),
    ...(dialog.sites?.get(p.package) ? [] : (p.widgets ?? []).filter((w) => w.place === 'page').map((w) => ({ p, widget: w.id, name: `${p.name ?? p.package} · ${w.title ?? w.id}`, summary: null }))),
  ]);
  if (!rows.length) return [h('p.set-empty', t('backstage.none'))];
  return [h('section.set-group', h('div.set-rows', rows.map(({ p, widget, name, summary }) => {
    const bad = p.status === 'program_missing' || p.status === 'depends_missing';
    const state = p.status === 'running' || p.status === 'stopped' || bad ? h(`span.set-pkg-status${p.status === 'running' ? '.is-on' : bad ? '.is-bad' : ''}`, t(`pkg.status.${p.status}`)) : null;
    const href = dialog.ctx.backstage?.href(p.package, widget);
    const parts = [
      h('span.set-pkg-face', icon(p.icon && hasIcon(p.icon) ? p.icon : 'package')),
      h('div.set-text', h('div.set-name', h('span', name)), summary ? h('p.set-desc', summary) : null),
      state, href ? h('span.set-pkg-arrow', icon('arrow-up-right')) : null,
    ];
    // 链接做的一行：不带链接的样式（原来带着 `.set-link`，行的上下留白、分隔线都被清掉了，挤在一起）
    const open = (/** @type {MouseEvent} */ e) => {
      if (widget || !dialog.sites?.get(p.package)) return openPage(dialog, p.package, e, widget);
      e.preventDefault();
      dialog.ctx.backstage.site.open(p.package).then((/** @type {string|null} */ why) => { if (why) dialog.toast(why); });
    };
    return href ? h('a.set-row.set-pkg.is-expandable.is-anchor', { href, onclick: open }, ...parts) : h('div.set-row.set-pkg', ...parts);
  })))];
}

/**
 * 打开一个软件的独立整页：关了设置，交给服务 `backstage`（软件包信息页上的「打开页面」也走这里）。点的时候按着 Ctrl、⌘、Shift 的照浏览器的
 * 办（链接开在新标签页、新窗口）。
 * @param {any} dialog @param {string} id @param {MouseEvent} [e] @param {string|null} [widget] 界面块的整页
 */
export function openPage(dialog, id, e, widget = null) {
  if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0)) return;
  e?.preventDefault();
  const pages = dialog.ctx.backstage;
  if (!pages) return;
  dialog.close();
  pages.open(id, widget);
}

/**
 * 哪些包有自己的网页（`status` 问得到端口，服务 `backstage` 的 `site`）：带后台页的问一次，记在 `dialog.sites`；问到了和原来不一样的重画（信息页照它决定
 * 「打开页面」开哪个、列不列设置项）。
 * @param {any} dialog @param {any[]} packages
 */
export function probeSites(dialog, packages) {
  const site = dialog.ctx.backstage?.site;
  if (!site) return;
  dialog.sites ??= new Map();
  for (const p of packages) {
    if (!p.page || dialog.sites.has(p.package)) continue;
    dialog.sites.set(p.package, false);
    site.port(p.package).then((/** @type {number|null} */ port) => {
      if (!port) return;
      dialog.sites.set(p.package, true);
      dialog.drawBody();
    });
  }
}
