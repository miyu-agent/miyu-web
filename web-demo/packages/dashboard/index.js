// @ts-check
//! 仪表盘（软件包 `dashboard`，蓝图 `web.md`「仪表盘」）：右侧边栏。对话区右上角一个右栏开关（挂载位 `stage.tools`，同左栏开关），点了在
//! 右边那一栏（服务 `side`）打开一叠卡片：卡片是挂载位 `side.cards`（这个包声明、画外壳，`cards.js`），谁都能挂；这个包自己挂待办、后台任务、
//! 文件修改、展示文件四张（会话信息由 `setup` 挂）；子代理在主区打开，展示文件、后台命令的输出、文件的差异都开在
//! 预览工作区（`side.work`：要了它，返回箭头回到四张卡，自己的开关不露；输出、差异借它的框 `present`）。
//! 窗口够宽时做一栏推开正文，并广播 `dashboard.active {on: true}`（软件包 `jobs`、`todo` 照它不画输入框那边的）；不够宽的盖在上面。
//! 照对话区每画一次的事件 `view.changed` 画：画的是正在看的会话这一串最上面那个（主会话）的待办、后台任务、文件修改；点子代理在主区
//! 打开它，这一栏留着、照旧画主会话的，正在看的那一行高亮。子代理照它自己的会话状态往下挂（读进来了的）。

import { h, icon } from '../../src/lib/dom.js';
import { Dashboard } from './view.js';
import { Cards } from './cards.js';
import { cardsBlock } from './settings-cards.js';
import { taskTree, fileChanges, counts, badgeOf } from './model.js';

/** 人关过仪表盘的会话（这台设备、照账号记着，最多记这么多个） */
const CLOSED = 'dashboard.closed';
const CLOSED_MAX = 200;

/** @param {any} ctx */
export function apply(ctx) {
  const t = (/** @type {string} */ path, /** @type {any} */ fields) => ctx.text(path, fields);
  const side = ctx.side;
  const work = side.work;
  /** 主区正在看的会话、它这一串最上面那个（仪表盘画的是它的） @type {string|null} */
  let current = ctx.chat.current();
  const topOf = (/** @type {string|null} */ id) => (id ? ctx.chat.topOf(id) : null);
  let session = topOf(current);
  /** 主会话的待办、条目、会话状态：正在看的就是它的照对话区带来的，看着子代理的照读进来了的 @type {{todos: any[], entries: any[], status: any}} */
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
    // 后台命令的输出、文件的差异：借预览工作区的框看（同展示文件，返回回到四张卡）
    present: (spec) => work.present(spec),
    leave: () => backToCards(),
    // 展示文件：预览工作区占过这一栏看它（返回回到四张卡）；面板那一页；从右栏拿掉
    show: (path) => work.open(path),
    panel: () => work.panel(),
    dismiss: (path) => work.dismiss(path),
  });
  ctx.effect(() => () => dash.destroy());
  ctx.effect(() => side.mount(dash.el));

  // 卡片：挂载位 `side.cards`（蓝图「仪表盘」第 4 条），外壳照这个包的设置排先后、关掉、最多露几行；自己的四张也经它挂
  ctx.slots.declare('side.cards', 'list');
  const cards = new Cards(dash.list, ctx.slots, ctx.config, (owner, reason) => h('div.slot-failed', t('card_failed', { owner, reason })), () => dash.setEmpty(cards.any()));
  ctx.effect(() => cards.start());
  /** @type {Array<{id: 'todo'|'tasks'|'files'|'shown', order: number, keep: number, shrink: number}>} */
  const own = [
    { id: 'todo', order: 20, keep: 3, shrink: 4 },
    { id: 'tasks', order: 30, keep: 5, shrink: 1 },
    { id: 'files', order: 40, keep: 3, shrink: 4 },
    { id: 'shown', order: 50, keep: 3, shrink: 4 },
  ];
  for (const c of own) ctx.slots.mount('side.cards', { ...c, name: t(c.id), render: (/** @type {any} */ card) => dash.attach(c.id, card) });
  // 设置页「软件包」→「右侧边栏」里一块「卡片」（挂载位 `settings.package`）：拖着排先后、每张的行数、开关；这几项是 `live`，改了当场照新的排
  let config = ctx.config;
  ctx.watchConfig((/** @type {any} */ next) => {
    config = next;
    cards.reconfigure(next);
    dash.refresh();
  });
  ctx.slots.mount('settings.package', {
    id: 'dashboard-cards', key: 'dashboard', keys: ['cards', 'cards_off', 'card_rows', 'card_rows_default'],
    render: (/** @type {any} */ kit) => cardsBlock(ctx, kit, () => config, (id) => cards.nameOf(id)),
  });

  // 右栏开关：同左栏开关（不铺底，开着也不变色）；关着时一个提醒点：等人的橙色、来了新展示的 accent、在跑的转圈
  const badge = h('span.dash-badge', { hidden: true });
  const button = h('button.icon-button.dash-toggle', { type: 'button', onclick: () => toggle() }, icon('panel-right'), badge);
  ctx.slots.mount('stage.tools', { id: 'dashboard', order: 10, render: () => button });
  /** 从预览工作区回到四张卡（窗口窄的回到盖着的那一层） */
  function backToCards() {
    if (side.fits()) side.open('narrow');
    else {
      work.close();
      side.open('overlay');
    }
  }
  // 预览工作区换成右侧边栏点进去的样子：返回箭头回到四张卡
  ctx.effect(() => work.claim(() => backToCards()));
  ctx.effect(() => work.onChange(() => redraw()));

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

  /** 右边开着没有：右侧边栏，或者它点进去的预览工作区 */
  const isOpen = () => !!side.mode() || work.state().open;
  const toggle = () => {
    if (isOpen()) {
      rememberClosed();
      if (side.mode()) side.close();
      if (work.state().open) work.close();
    } else side.open(side.fits() ? 'narrow' : 'overlay');
  };

  /** 广播的上一份：变了才发 */
  let active = null;
  const announce = (/** @type {boolean} */ on) => {
    if (active === on) return;
    active = on;
    ctx.publish('dashboard.active', { on });
  };

  const syncButton = () => {
    const open = isOpen();
    const label = t(open ? 'toggle_close' : 'toggle_open');
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-expanded', String(open));
    // 开着时平常不露，指针移过来才露（`style.css`）
    button.classList.toggle('is-open', open);
    const n = counts(session ? taskTree(session, last.status, statusOf) : []);
    const mark = badgeOf(n, { open, fresh: work.state().fresh });
    badge.hidden = !mark;
    for (const c of ['waiting', 'new', 'running']) badge.classList.toggle(`is-${c}`, c === mark);
  };

  const redraw = () => {
    const tree = session ? taskTree(session, last.status, statusOf) : [];
    const todos = Array.isArray(last.todos) ? last.todos : [];
    const shown = work.state();
    dash.update({ todos, tree, files: fileChanges(last.entries), current, shown: shown.list, panel: shown.panel });
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
    // 右侧边栏开着：展示文件卡里列着，来了新的算看过了
    if (s.mode) work.seen();
    syncButton();
  }));
  announce(side.fits());
  ctx.effect(() => () => {
    side.close();
    ctx.publish('dashboard.active', { on: false });
  });

  ctx.on('view.changed', (/** @type {any} */ v) => {
    current = v.session ?? null;
    const top = topOf(current);
    // 换到别的一串：回到仪表盘、画那一串的；在同一串里进出子代理不动
    if (top !== session) {
      session = top;
      if (dash.viewing) dash.back();
    }
    const own = session && session !== current ? ctx.sessions.sessions.get(session) : null;
    last = own
      ? { todos: own.todos ?? [], entries: own.view?.list ?? [], status: own.view?.status ?? null }
      : { todos: v.todos ?? [], entries: v.entries ?? [], status: v.status ?? null };
    redraw();
  });
  redraw();
}
