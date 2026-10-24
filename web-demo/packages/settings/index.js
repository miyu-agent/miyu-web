// @ts-check
//! 设置页（软件包 `settings`，蓝图 `web.md`「设置页」、`web/architecture.md`「设置页」）：页面正中的弹窗，核心的配置和网页自己的
//! 设置都在这里改。打开：左栏底下的齿轮、`/settings`、`/config`（直接到「模型」）、`/pkg`（直接到「软件包」）、`Ctrl+,`（macOS `⌘,`）。
//! 声明 `settings.section`（多一页：桌面端的设置以后挂这里；人格那一页由软件包 `setup` 挂）、`settings.editor`（keyed，照配置项的键：
//! `{options(): [{value, name}], hidden(): boolean}`，给这一项下拉的选项、没得选时藏了这一行；默认人格由软件包 `setup` 给）。

import { h, icon } from '../../src/lib/dom.js';
import { SettingsDialog } from './dialog.js';
import { ProviderFlow } from './onboard/flow.js';
import { sectionKit } from './kit.js';
import { memberLevels } from './model.js';
import { AdminPage, parseAdmin } from './admin.js';

/** @param {any} ctx */
export function apply(ctx) {
  ctx.slots.declare('settings.section', 'list');
  ctx.slots.declare('settings.editor', 'keyed');
  // 网页包的设置页里包自己画的一块（keyed，键是包编号；蓝图 web.md「设置页」第 13 条：右侧边栏的「卡片」）
  ctx.slots.declare('settings.package', 'keyed');
  /** @type {SettingsDialog|null} */
  let dialog = null;
  const open = (page) => {
    if (dialog?.isOpen) {
      if (page) dialog.show(page);
      return;
    }
    dialog = new SettingsDialog(ctx);
    dialog.open(page);
  };
  ctx.effect(() => () => dialog?.close());
  // 管理员后台（第 12d 条）：独立整页，走网页自己的路由 `#admin=<页>`，刷新还在原来那一页。是页面里点进去的（账号页的卡片）：「回到 Miyu」后退一步；
  // 一进来就带着网址的：把这一段去掉
  const nav = ctx.host.route;
  let pushed = false;
  const admin = new AdminPage(ctx, () => {
    if (pushed) {
      pushed = false;
      nav.back();
      return;
    }
    nav.replace('');
    syncAdmin();
  });
  const syncAdmin = () => {
    const page = parseAdmin(nav.current());
    if (page) admin.show(page);
    else {
      pushed = false;
      admin.close();
    }
  };
  ctx.effect(() => nav.watch(() => {
    if (!admin.el && parseAdmin(nav.current())) pushed = true;
    syncAdmin();
  }));
  syncAdmin();
  ctx.effect(() => () => admin.close());
  // 主题那几套换了（换了壁纸、人格的头像）：开着的设置页重画「主题」一组（卡片的小样、「主色」）
  ctx.slots.watch('theme.palettes', () => {
    if (dialog?.isOpen) dialog.refreshLook?.();
  });
  // 皮肤包来了、走了：「皮肤」那一行跟着变
  ctx.slots.watch('skin.packs', () => {
    if (dialog?.isOpen) dialog.refreshLook?.();
  });
  // 给第一次引导的（蓝图「第一次引导」第 12 条）：和设置页一个样子的控件、接一家供应商的几屏（设置页的「＋ 添加供应商」也是它）
  ctx.provide('settings', {
    /** 控件画在 `panel` 里（菜单开在它上面），提示交给 `toast`。 @param {HTMLElement} panel @param {(text: string) => void} toast */
    kit: (panel, toast) => sectionKit({ panel, ctx, toast }),
    /** @param {import('./onboard/flow.js').Host} host */
    providers: (host) => new ProviderFlow(ctx, host, 'welcome'),
    /** 打开设置、到某一页（别的包挂的页：记忆页的 `/memory`、人格详情的「记忆 N 条」） @param {string|null} [page] */
    open: (page) => open(page ?? null),
    /** 关上（记忆详情里点出处打开那个会话） */
    close: () => dialog?.close(),
  });
  // 「默认界面」（`ui.head`，核心 9-3）：下拉的选项照核心的软件包清单（界面包），名字照清单；成员读不到软件包，不露（2026-10-24 项目主人定）
  ctx.slots.mount('settings.editor', {
    id: 'settings-head',
    key: 'ui.head',
    hidden: () => !!ctx.host?.member,
    options: () => (dialog?.heads ?? []).map((p) => ({ value: p.package, name: p.name ?? p.package })),
  });
  // 「新会话的权限级别」：成员到不了开放权限（核心 Y-2下下上 起），下拉不列那一项；去掉以后只剩一项的整行不露（2026-10-24 项目主人定）
  if (ctx.host?.member) {
    const levels = () => memberLevels(dialog?.schema?.items?.find((/** @type {any} */ i) => i.key === 'permission.level')?.options ?? []);
    ctx.slots.mount('settings.editor', {
      id: 'settings-level',
      key: 'permission.level',
      hidden: () => levels().length <= 1,
      options: levels,
    });
  }

  ctx.commands.register({ name: 'settings', summary: ctx.text('command_settings') }, () => open(null));
  ctx.commands.register({ name: 'config', summary: ctx.text('command_config') }, () => open('models'));
  ctx.commands.register({ name: 'pkg', summary: ctx.text('command_pkg') }, () => open('packages'));
  ctx.commands.register({ name: 'market', summary: ctx.text('command_market') }, () => open('market'));

  ctx.slots.mount('sidebar.actions', {
    id: 'settings',
    order: 10,
    render: () => h('button.icon-button', { type: 'button', title: ctx.text('open'), 'aria-label': ctx.text('open'), onclick: () => open(null) }, icon('settings')),
  });

  // `Ctrl+,`（macOS `⌘,`）：照系统软件打开偏好设置的习惯；浏览器不占这个键
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== ',' || e.altKey || e.shiftKey) return;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    if (mac ? !e.metaKey : !e.ctrlKey) return;
    e.preventDefault();
    open(null);
  };
  ctx.effect(() => {
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
}
