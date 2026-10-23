// @ts-check
//! 仪表盘（软件包 `dashboard`，蓝图 `web.md`「仪表盘」）：对话区右上角预览工作区开关旁边一个按钮（挂载位 `stage.tools`），点了在右边
//! 那一栏（服务 `side`，和预览工作区互斥）打开三张卡：待办、后台任务、文件修改；点进去看后台命令的输出、文件的差异，子代理在主区打开。
//! 窗口够宽时做一栏推开正文，并广播 `dashboard.active {on: true}`（软件包 `jobs`、`todo` 照它不画输入框那边的）；不够宽的盖在上面。
//! 照对话区每画一次的事件 `view.changed`（条目、会话状态、待办）画；子代理照它自己的会话状态往下挂（读进来了的）。

import { h, icon } from '../../src/lib/dom.js';
import { Dashboard } from './view.js';
import { taskTree, fileChanges, counts } from './model.js';

/** 人关过仪表盘的会话（这台设备、照账号记着，最多记这么多个） */
const CLOSED = 'dashboard.closed';
const CLOSED_MAX = 200;

/** @param {any} ctx */
export function apply(ctx) {
  const t = (/** @type {string} */ path, /** @type {any} */ fields) => ctx.text(path, fields);
  const side = ctx.side;
  /** @type {string|null} */
  let session = ctx.chat.current();
  /** 上一次对话区带来的 @type {{todos: any[], entries: any[], status: any}} */
  let last = { todos: [], entries: [], status: null };
  /** 这个标签页里自己开过的会话（头一回有东西才自己开） */
  const opened = new Set();
  const statusOf = (/** @type {string} */ id) => ctx.sessions.sessions.get(id)?.view.status ?? null;

  const dash = new Dashboard(t, ctx.config, {
    stop: async (owner, job) => {
      try {
        await ctx.core.request('job.stop', { session: owner, job });
      } catch (err) {
        const e = /** @type {any} */ (err);
        ctx.composer.say(e?.message ?? String(err));
      }
    },
    enter: (id) => ctx.chat.open(id),
    read: (owner, job, after) => ctx.core.request('job.output', after === undefined
      ? { session: owner, job, tail: ctx.config.preview_lines }
      : { session: owner, job, after, wait: true }),
    detail: (call) => ctx.core.request('view.detail', { session, call }),
    where: () => ({ workdir: ctx.chat.workdir() ?? null, home: ctx.chat.home() ?? null }),
    // 点进去变宽、回来变窄；盖在上面的、收起了的不动
    focus: (wide) => {
      const mode = side.mode();
      if (mode === 'narrow' || mode === 'wide') side.open(wide ? 'wide' : 'narrow');
    },
  });
  ctx.effect(() => () => dash.destroy());
  ctx.effect(() => side.mount(dash.el));

  // 按钮：不铺底，开着时强调色；关着时有在跑的转圈小点、有等人的橙色小点
  const badge = h('span.dash-badge', { hidden: true });
  const button = h('button.icon-button.dash-toggle', { type: 'button', title: t('toggle'), 'aria-label': t('toggle'), onclick: () => toggle() }, icon('gauge'), badge);
  ctx.slots.mount('stage.tools', { id: 'dashboard', order: 10, render: () => button });

  const closedMap = () => {
    const got = ctx.storage.get(CLOSED, {});
    return got && typeof got === 'object' && !Array.isArray(got) ? got : {};
  };
  /** 人关了这个会话的：记下，不再自己开 */
  const rememberClosed = () => {
    if (!session) return;
    const map = closedMap();
    delete map[session];
    map[session] = true;
    const keys = Object.keys(map);
    for (const k of keys.slice(0, Math.max(0, keys.length - CLOSED_MAX))) delete map[k];
    ctx.storage.set(CLOSED, map);
  };

  const toggle = () => {
    if (side.mode()) {
      rememberClosed();
      side.close();
    } else {
      if (dash.viewing) dash.back();
      side.open(side.fits() ? 'narrow' : 'overlay');
    }
  };

  /** 广播的上一份：变了才发 */
  let active = null;
  const announce = (/** @type {boolean} */ on) => {
    if (active === on) return;
    active = on;
    ctx.publish('dashboard.active', { on });
  };

  const syncButton = () => {
    const open = !!side.mode();
    button.classList.toggle('is-active', open);
    button.setAttribute('aria-pressed', String(open));
    const n = counts(session ? taskTree(session, last.status, statusOf) : []);
    badge.hidden = open || (!n.running && !n.waiting);
    badge.classList.toggle('is-waiting', n.waiting > 0);
    badge.classList.toggle('is-running', n.waiting === 0 && n.running > 0);
  };

  const redraw = () => {
    const tree = session ? taskTree(session, last.status, statusOf) : [];
    const todos = Array.isArray(last.todos) ? last.todos : [];
    dash.update({ todos, tree, files: fileChanges(last.entries) });
    // 窗口够宽时，一个会话里头一回有后台任务或待办就自己打开；人关过的不开、预览工作区开着的不挤掉它（第 3 条）
    if (session && !side.mode() && side.fits() && side.free() && (tree.length || todos.length) && !opened.has(session) && !closedMap()[session]) {
      opened.add(session);
      side.open('narrow');
    }
    syncButton();
  };

  /** 窗口拉窄时收起的：拉宽回来再开 */
  let shrunk = false;
  ctx.effect(() => side.onChange((/** @type {{mode: string|null, fits: boolean, why: string}} */ s) => {
    // 窗口拉窄了放不下一栏：收起（输入框那边的照旧画）；拉宽了：输入框那边的不画，拉窄时收起的再开
    if ((s.mode === 'narrow' || s.mode === 'wide') && !s.fits) {
      shrunk = true;
      side.close('narrow');
    } else if (s.fits && ((shrunk && !s.mode) || s.mode === 'overlay')) {
      // 盖在上面的那一层，窗口拉宽到放得下了：换成一栏
      shrunk = false;
      side.open('narrow');
    } else if (s.why !== 'narrow' && s.why !== 'resize') shrunk = false;
    announce(s.fits);
    if (!side.mode() && dash.viewing) dash.back();
    syncButton();
  }));
  announce(side.fits());
  ctx.effect(() => () => {
    side.close();
    ctx.publish('dashboard.active', { on: false });
  });

  ctx.on('view.changed', (/** @type {any} */ v) => {
    if (v.session !== session) {
      session = v.session ?? null;
      if (dash.viewing) dash.back();
    }
    last = { todos: v.todos ?? [], entries: v.entries ?? [], status: v.status ?? null };
    redraw();
  });
  redraw();
}
