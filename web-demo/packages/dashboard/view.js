// @ts-check
//! 仪表盘的样子（软件包 `dashboard`，蓝图 `web.md`「仪表盘」第 4、5 条）：四张卡（待办、后台任务、文件修改、展示文件，空的整张不出）的内容——
//! 外壳由挂载位 `side.cards`（`cards.js`）画，这里拿交来的 `card` 写头一行、内容（`attach`），关掉了的那张不画；
//! 点进去的两种（后台命令的输出、文件的差异）画好交给外面放进预览工作区的框（`present`，同展示文件，2026-10-24 项目主人：「都右栏 show 吧」）；
//! 子代理点了交给外面在主区打开，展示文件点了交给外面开预览工作区。数据变了才重画那张卡（在收的字每来一段都会来一次）；在跑的用时
//! 每 `tick_ms` 只改那几个字。

import { h, icon, replace } from '../../src/lib/dom.js';
import { unfold } from '../../src/lib/motion.js';
import { jobDuration } from '../../src/lib/format.js';
import { fuzzyFilter } from '../../src/lib/fuzzy.js';
import { rowsOf, counts, stoppable, todoView, splitPath, diffRows } from './model.js';

/** 四张卡的外壳上加的类（样式、脚本照它认哪一张） */
const CARD_CLASS = { todo: 'dash-todo', tasks: 'dash-tasks', files: 'dash-files', shown: 'dash-shown-card' };
/** JSON-RPC 的「没有这个方法」 */
const NO_METHOD = -32601;
/** 任务种类的图标 @type {Record<string, string>} */
const KIND_ICON = { agent: 'bot', command: 'square-terminal' };
/** 展示文件种类的图标 @type {Record<string, string>} */
const SHOWN_ICON = { image: 'image', pdf: 'file-text', html: 'globe', markdown: 'file-text', code: 'file-code', text: 'file-text' };

/**
 * @typedef {import('./cards.js').Card} Card
 * @typedef {import('./model.js').Node} Node
 * @typedef {import('./model.js').FileChange} FileChange
 * @typedef {{path: string, name: string, title: string|null, kind: string}} Shown 展示过的一样
 * @typedef {{
 *   stop: (owner: string, job: string) => Promise<void>,
 *   enter: (session: string) => void,
 *   read: (owner: string, job: string, after?: number) => Promise<any>,
 *   detail: (call: string) => Promise<any>,
 *   where: () => {workdir: string|null, home: string|null},
 *   present: (spec: {lead: Node[], actions: Node[], body: Node, leave: () => void}) => void,
 *   leave: () => void,
 *   show: (path: string) => void,
 *   panel: () => void,
 *   dismiss: (path: string) => void,
 * }} On 停一个任务、在主区打开子代理的会话、读后台命令的输出、取一次编辑的差异、工作区和家目录、把点进去的那一样放进预览工作区的框、
 *   从那里回到四张卡、预览工作区开一样展示文件、开面板、从右栏拿掉一样
 */

export class Dashboard {
  /**
   * @param {(path: string, fields?: any) => string} t 这个包的字
   * @param {{tick_ms: number, preview_lines: number}} config
   * @param {On} on
   */
  constructor(t, config, on) {
    this.t = t;
    this.config = config;
    this.on = on;
    /** 人收起的有子任务的那一行、展开的收起来的兄弟、展开了做完的顶层、展开了收起来的文件（这个标签页里记着） */
    this.collapsed = new Set();
    this.expanded = new Set();
    this.doneOpen = false;
    this.filesOpen = false;
    this.shownOpen = false;
    /** 待办：放不下的展开了、做完的列出来了 */
    this.todoOpen = false;
    this.todoDoneOpen = false;
    /** 点过停止、还没等到回报的；点了「全部停止」还没全停完 */
    this.stopping = new Set();
    this.stoppingAll = false;
    /** @type {Data} */
    this.data = { todos: [], tree: [], files: [], current: null, shown: [], panel: 0 };
    this.sigs = { todo: '', tasks: '', files: '', shown: '' };
    /** 挂载位交来的四张卡（关掉了的没有） @type {{todo?: Card, tasks?: Card, files?: Card, shown?: Card}} */
    this.cards = {};
    // 待办的内容分三块一直在：没做完的几行、「还有 N 项」「已完成 N 项」那两行、做完的那一组（展开那一层：列出、收回照展开的缓动，
    // 2026-10-24 项目主人：原来一下就出来；只换里面的行，不整块重建——刚插进去的节点不会过渡）
    this.todoParts = { rows: h('div.dash-todo-rows'), folds: h('div.dash-todo-folds'), done: h('div.unfold.dash-todo-done', h('div.unfold-inner')) };
    // 展示文件的搜索（2026-10-24 项目主人）：头一行右上角一个搜索图标，点了在「展示文件」右边换成搜索框；头一行这几样一直在、只切显示，
    // 不每次重画头一行（一边打字一边丢焦点）。失去焦点、没写字的收回成图标；有字的不收回（看得见是筛过的），`Esc` 清空、收回
    this.shownQuery = '';
    this.shownCount = h('span.dash-count');
    this.shownInput = /** @type {HTMLInputElement} */ (h('input.dash-search', {
      type: 'text', hidden: true, placeholder: t('search_files'), 'aria-label': t('search_files'), spellcheck: 'false', autocomplete: 'off',
      oninput: () => { this.shownQuery = this.shownInput.value; this.drawShown(); },
      onkeydown: (/** @type {KeyboardEvent} */ e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        this.closeSearch(true);
      },
      onblur: () => { if (!this.shownInput.value.trim()) this.closeSearch(true); },
    }));
    this.shownSearch = h('button.dash-icon-btn', { type: 'button', title: t('search'), 'aria-label': t('search'), onclick: () => this.openSearch() }, icon('search'));
    this.empty = h('div.dash-empty', { hidden: true }, t('empty'));
    this.list = h('div.dash-list', this.empty);
    this.el = h('div.dash', this.list);
    /** 点进去看着的那一样：`{kind: 'output', node}`、`{kind: 'diff', index}`；回来的是 `null` @type {any} */
    this.viewing = null;
    /** 读输出读到第几回：换了、回来了的晾着的回应丢掉 */
    this.run = 0;
    this.timer = 0;
  }

  /**
   * 新的一份数据（`current` 是主区正在看的会话，`shown` 预览工作区展示过的、`panel` 面板里挂着几件）：变了的卡重画，空的收起
   * @typedef {{todos: any[], tree: Node[], files: FileChange[], current?: string|null, shown?: Shown[], panel?: number}} Data
   * @param {Data} data
   */
  update(data) {
    this.data = data;
    const all = (/** @type {Node[]} */ xs) => xs.flatMap((x) => [x, ...all(x.kids)]);
    const live = new Set(all(data.tree).filter((x) => x.state === 'running' || x.state === 'paused').map((x) => x.key));
    for (const key of [...this.stopping]) if (!live.has(key)) this.stopping.delete(key);
    this.drawTodo();
    this.drawTasks();
    this.drawFiles();
    this.drawShown();
    // 看着的后台命令没了、文件没了：回到仪表盘
    if (this.viewing?.kind === 'diff' && !data.files[this.viewing.index]) this.back();
    this.syncTimer();
  }

  /**
   * 挂载位交来一张卡（`todo`、`tasks`、`files`、`shown`）：写上标题、照现在的数画一次；交回拿下来时怎么收拾
   * @param {'todo'|'tasks'|'files'|'shown'} id @param {Card} card
   */
  attach(id, card) {
    const t = this.t;
    this.cards[id] = card;
    card.el.classList.add(CARD_CLASS[id]);
    card.title(t(id));
    this.sigs[id] = '';
    if (id === 'todo') {
      card.body(this.todoParts.rows, this.todoParts.folds, this.todoParts.done);
      this.drawTodo();
    } else if (id === 'shown') {
      card.head(this.shownInput, this.shownCount, card.gap(), this.shownSearch);
      this.drawShown();
    }
    else if (id === 'tasks') this.drawTasks();
    else if (id === 'files') this.drawFiles();
    return () => {
      if (this.cards[id] === card) delete this.cards[id];
    };
  }

  /** 「什么都还没有」那一句：一张卡都没露的时候出 @param {boolean} any */
  setEmpty(any) {
    this.empty.hidden = any;
  }

  /** 每 `tick_ms` 只改在跑的用时；没有在跑的不走 */
  syncTimer() {
    const running = counts(this.data.tree).running > 0;
    if (running && !this.timer) this.timer = window.setInterval(() => this.tick(), this.config.tick_ms);
    if (!running && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }

  tick() {
    const now = Date.now();
    for (const el of this.el.querySelectorAll('[data-since]')) {
      const since = Number(/** @type {HTMLElement} */ (el).dataset.since);
      if (Number.isFinite(since) && since > 0) el.textContent = jobDuration((now - since) / 1000);
    }
  }

  // ── 待办 ──

  drawTodo() {
    const t = this.t;
    // 露几项照这张卡最多露几行：留两行给「还有 N 项」「已完成 N 项」（2026-10-24：原来的「待办最多露几项」并进卡的行数）
    const v = todoView(this.data.todos, foldAt(this.cards.todo, 2), { open: this.todoOpen, doneOpen: this.todoDoneOpen });
    const sig = JSON.stringify([this.data.todos, this.todoOpen, this.todoDoneOpen]);
    const card = this.cards.todo;
    if (!card) return;
    card.show(v.total > 0);
    if (sig === this.sigs.todo) return;
    this.sigs.todo = sig;
    if (!v.total) return;
    const ratio = v.total ? v.done / v.total : 0;
    const row = (/** @type {any} */ x) => {
      const doing = x.status === 'in_progress';
      const done = x.status === 'completed';
      return h(`div.dash-todo-row${doing ? '.is-doing' : ''}${done ? '.is-finished' : ''}`,
        h('span.dash-todo-mark', doing ? icon('loader-circle') : done ? icon('check') : h('i.dash-todo-ring')), h('span.dash-todo-text', x.content));
    };
    // 放不下的「还有 N 项」（不打钩，2026-10-24 项目主人）、展开了的「收起」；做完的「✓ 已完成 N 项」自己就是开关
    const more = v.more ? foldRow('chevron-down', t('more_items', { count: v.more }), () => { this.todoOpen = true; this.drawTodo(); }, false)
      : v.fold ? foldRow('chevron-up', t('collapse'), () => { this.todoOpen = false; this.drawTodo(); }, true) : null;
    const done = v.done ? foldRow('check', t('done_items', { count: v.done }), () => { this.todoDoneOpen = !this.todoDoneOpen; this.drawTodo(); }, this.todoDoneOpen, 'is-done') : null;
    card.head(h('span.dash-count', `${v.done}/${v.total}`), card.gap(),
      h('span.dash-progress', h('span.dash-progress-bar', { style: `width: ${(ratio * 100).toFixed(1)}%` })));
    const parts = this.todoParts;
    replace(parts.rows, v.shown.map(row));
    replace(parts.folds, more, done);
    // 做完的那一组：收着的时候也照样画着（收回去的那一下要看得见），开合只切 `is-on`
    replace(/** @type {HTMLElement} */ (parts.done.firstChild), this.data.todos.filter((x) => x?.status === 'completed').map(row));
    unfold(parts.done, this.todoDoneOpen && v.done > 0);
    card.size(v.shown.length + (more ? 1 : 0) + (done ? 1 : 0) + v.finished.length);
  }

  // ── 后台任务 ──

  drawTasks() {
    const t = this.t;
    const tree = this.data.tree;
    const card = this.cards.tasks;
    if (!card) return;
    card.show(tree.length > 0);
    const rows = rowsOf(tree, { collapsed: this.collapsed, expanded: this.expanded, doneOpen: this.doneOpen });
    const n = counts(tree);
    const sig = JSON.stringify([rows.map((r) => (r.type === 'task' ? [r.node.key, r.node.state, r.node.title, r.node.attention, r.depth, r.last, r.guides, r.open, r.hasKids]
      : r.type === 'less' ? [r.type, r.parent] : [r.type, r.count, r.type === 'more' ? r.running : r.open])), n, [...this.stopping], this.stoppingAll, this.data.current]);
    if (sig === this.sigs.tasks) return;
    this.sigs.tasks = sig;
    if (!tree.length) return;
    const now = Date.now();
    const many = stoppable(tree).length > 1;
    card.head(
      n.running ? h('span.dash-count', t('running', { count: n.running })) : null,
      n.waiting ? h('span.dash-count.is-waiting', t('waiting', { count: n.waiting })) : null,
      card.gap(),
      // 点了以后到全都停完之前写「停止中」、灰着不能再点（2026-10-24 项目主人）
      many || this.stoppingAll ? h('button.dash-stop-all', { type: 'button', disabled: this.stoppingAll, onclick: () => this.stopAll() }, t(this.stoppingAll ? 'stopping_all' : 'stop_all')) : null);
    card.body(rows.map((r) => this.taskRow(r, now)));
    card.size(rows.length);
  }

  /** @param {import('./model.js').Row} r @param {number} now */
  taskRow(r, now) {
    const t = this.t;
    if (r.type === 'done') {
      // 「✓ 已完成（N）」（2026-10-24 项目主人：原来只写「✓ (N)」）；点了展开、再点收回
      return h('button.dash-row.dash-fold-row', { type: 'button', 'aria-expanded': String(r.open), onclick: () => { this.doneOpen = !this.doneOpen; this.drawTasks(); } },
        h('span.dash-state.is-done', icon('check')), h('span.dash-fold-count', t('done_tasks', { count: r.count })));
    }
    if (r.type === 'less') {
      return h('button.dash-row.dash-fold-row', { type: 'button', style: `--depth: ${r.depth}`, 'aria-expanded': 'true', onclick: () => { this.expanded.delete(r.parent); this.drawTasks(); } },
        lines(r.guides, r.depth, true), h('span.dash-state', icon('chevron-up')), h('span.dash-fold-count', t('collapse')));
    }
    if (r.type === 'more') {
      return h('button.dash-row.dash-fold-row', { type: 'button', style: `--depth: ${r.depth}`, 'aria-expanded': 'false', 'aria-label': t('more_tasks', { count: r.count }), onclick: () => { this.expanded.add(r.parent); this.drawTasks(); } },
        lines(r.guides, r.depth, true), h('span.dash-fold-count', `(${r.count})`), h(`span.dash-state${r.running ? '.is-running' : '.is-done'}`, icon(r.running ? 'loader-circle' : 'check')));
    }
    const x = r.node;
    const agent = x.what === 'agent';
    const running = x.state === 'running' || x.state === 'paused';
    const stateKey = x.attention ?? x.state;
    const label = t(`states.${stateKey}`);
    // 子代理、后台命令；别的（往后的 `miyu call` 这类）一律插头
    const kind = h('span.dash-kind', icon(KIND_ICON[x.what] ?? 'plug'));
    const twisty = r.hasKids
      ? h('button.dash-twisty', {
        type: 'button', 'aria-expanded': String(r.open), 'aria-label': t(r.open ? 'collapse' : 'expand'),
        onclick: (/** @type {MouseEvent} */ e) => { e.stopPropagation(); this.flip(x.key); },
      }, icon(r.open ? 'chevron-down' : 'chevron-right'))
      : null;
    const stop = running
      ? h('button.dash-stop', {
        type: 'button', title: t('stop'), 'aria-label': t('stop'), disabled: this.stopping.has(x.key),
        onclick: (/** @type {MouseEvent} */ e) => { e.stopPropagation(); this.halt(x); },
      }, h('span.dash-stop-mark'))
      : null;
    const elapsed = running ? (x.since != null ? jobDuration((now - x.since) / 1000) : '') : x.duration != null ? jobDuration(x.duration / 1000) : '';
    const open = () => {
      if (agent && x.session) this.on.enter(x.session);
      else if (!agent) this.showOutput(x);
    };
    // 主区正在看的那个子代理：浅底（点进子代理以后这一栏留着，方便换到别的）
    const current = agent && !!x.session && x.session === this.data.current;
    return h(`div.dash-row.dash-task${x.attention ? '.is-attention' : ''}${running ? '' : '.is-ended'}${r.hasKids ? '.has-kids' : ''}${current ? '.is-current' : ''}`, {
      role: 'button', tabindex: '0', style: `--depth: ${r.depth}`, title: agent ? t('enter') : t('open_output'), 'aria-current': current ? 'true' : null,
      onclick: open, onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') open(); },
    },
    lines(r.guides, r.depth, r.last),
    h('span.dash-lead', kind, twisty),
    // 有标题的写标题（正文字体），没有的才写等宽的命令行
    h('span.dash-name', agent || x.title ? h('span', x.title || x.job) : h('span.dash-command', x.command || x.job), h('span.dash-sep', ' · '), h('span.dash-id', x.job)),
    h(`span.dash-state.is-${stateKey}`, { role: 'img', 'aria-label': label, title: label }, stateIcon(stateKey)),
    h('span.dash-time', running && x.since != null ? { dataset: { since: String(x.since) } } : null, elapsed),
    stop);
  }

  /** 收起、展开一行的子任务 @param {string} key */
  flip(key) {
    if (this.collapsed.has(key)) this.collapsed.delete(key);
    else this.collapsed.add(key);
    this.drawTasks();
  }

  /** 停一个：记着在停，等回报 @param {Node} x */
  halt(x) {
    this.stopping.add(x.key);
    this.sigs.tasks = '';
    this.drawTasks();
    return this.on.stop(x.owner, x.job).finally(() => { this.sigs.tasks = ''; this.drawTasks(); });
  }

  /**
   * 全部停止：一下子全都发出去、全都标成停在半路（2026-10-24 项目主人：原来一个个等着停，慢）；停一个子代理连它派的一起停，下面的不单停
   * （`stoppable`）；等全都回了再重画一次。
   */
  stopAll() {
    const all = stoppable(this.data.tree).filter((x) => !this.stopping.has(x.key));
    if (!all.length || this.stoppingAll) return Promise.resolve();
    for (const x of all) this.stopping.add(x.key);
    this.stoppingAll = true;
    this.sigs.tasks = '';
    this.drawTasks();
    return Promise.allSettled(all.map((x) => this.on.stop(x.owner, x.job))).then(() => {
      this.stoppingAll = false;
      this.sigs.tasks = '';
      this.drawTasks();
    });
  }

  // ── 文件修改 ──

  drawFiles() {
    const t = this.t;
    const files = this.data.files;
    const card = this.cards.files;
    if (!card) return;
    card.show(files.length > 0);
    const sig = JSON.stringify([files, this.filesOpen, this.viewing?.kind === 'diff' ? this.viewing.index : -1]);
    if (sig === this.sigs.files) return;
    this.sigs.files = sig;
    if (!files.length) return;
    const where = this.on.where();
    const added = files.reduce((n, f) => n + f.added, 0);
    const removed = files.reduce((n, f) => n + f.removed, 0);
    // 露几个照这张卡最多露几行：留一行给「(N)」（原来的「文件修改最多露几个」并进卡的行数）
    const max = foldAt(card, 1);
    const shown = this.filesOpen || files.length <= max ? files : files.slice(0, max);
    const rest = files.length - shown.length;
    card.head(h('span.dash-count', t('files_count', { count: files.length })), card.gap(),
      h('span.dash-lines', h('span.dash-add', `+${added}`), ' ', h('span.dash-del', `−${removed}`)));
    card.body(
      shown.map((f, i) => {
        const { name, dir } = splitPath(f.path, where);
        return h(`button.dash-row.dash-file${f.created ? '.is-created' : ''}`, { type: 'button', title: f.path, onclick: () => this.showDiff(i) },
          h('span.dash-kind', icon(f.created ? 'file-plus' : 'file')), h('span.dash-file-name', name), dir ? h('span.dash-file-dir', dir) : null, h('span.dash-gap'),
          h('span.dash-lines', f.added ? h('span.dash-add', `+${f.added}`) : null, f.added && f.removed ? ' ' : null, f.removed ? h('span.dash-del', `−${f.removed}`) : null));
      }),
      rest > 0 ? foldRow('chevron-down', `(${rest})`, () => { this.filesOpen = true; this.drawFiles(); }, false)
        : this.filesOpen && files.length > max ? foldRow('chevron-up', t('collapse'), () => { this.filesOpen = false; this.drawFiles(); }, true) : null);
    card.size(shown.length + (rest > 0 || files.length > max ? 1 : 0));
  }

  // ── 展示文件 ──

  /** 预览工作区展示过的（最后展示的在前）：点了交给外面开工作区看它；悬停露出 ✕ 从右栏拿掉；面板挂着东西的最后一行「面板」 */
  drawShown() {
    const t = this.t;
    const all = this.data.shown ?? [];
    const panel = this.data.panel ?? 0;
    const card = this.cards.shown;
    if (!card) return;
    card.show(all.length > 0 || panel > 0);
    const query = this.shownQuery.trim();
    const sig = JSON.stringify([all, panel, this.shownOpen, query]);
    if (sig === this.sigs.shown) return;
    this.sigs.shown = sig;
    if (!all.length && !panel) return;
    const where = this.on.where();
    // 照标题、文件名、写出来的那截目录（`~/…`，不拿绝对路径：家目录里的字都对得上）模糊筛（`lib/fuzzy.js`），筛着的时候「(N)」照筛出来的算
    const list = fuzzyFilter(all, query, (a) => { const { name, dir } = splitPath(a.path, where); return [a.title ?? '', name, dir ?? '']; });
    // 露几个照这张卡最多露几行：留一行给「(N)」（原来的「文件修改最多露几个」并进卡的行数）
    const max = foldAt(card, 1);
    const rows = this.shownOpen || list.length <= max ? list : list.slice(0, max);
    const rest = list.length - rows.length;
    this.shownCount.textContent = all.length ? t('shown_count', { count: all.length }) : '';
    this.shownCount.hidden = !this.shownInput.hidden;
    card.body(
      query && !list.length ? h('div.dash-row.dash-fold-row.is-still', h('span.dash-fold-count', t('no_match'))) : null,
      rows.map((a) => {
        const { name, dir } = splitPath(a.path, where);
        const label = a.title || name;
        const open = () => this.on.show(a.path);
        return h('div.dash-row.dash-file.dash-shown', {
          role: 'button', tabindex: '0', title: a.path, onclick: open, onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') open(); },
        },
        h('span.dash-kind', icon(SHOWN_ICON[a.kind] ?? 'file')), h('span.dash-file-name', label), dir ? h('span.dash-file-dir', dir) : null, h('span.dash-gap'),
        h('button.dash-remove', {
          type: 'button', title: t('remove'), 'aria-label': t('remove_named', { name: label }),
          onclick: (/** @type {MouseEvent} */ e) => { e.stopPropagation(); this.on.dismiss(a.path); },
        }, icon('x')));
      }),
      rest > 0 ? foldRow('chevron-down', `(${rest})`, () => { this.shownOpen = true; this.drawShown(); }, false)
        : this.shownOpen && list.length > max ? foldRow('chevron-up', t('collapse'), () => { this.shownOpen = false; this.drawShown(); }, true) : null,
      panel > 0 ? h('button.dash-row.dash-file.dash-panel-row', { type: 'button', onclick: () => this.on.panel() }, h('span.dash-kind', icon('puzzle')), h('span.dash-file-name', t('panel'))) : null);
    card.size(rows.length + (rest > 0 || list.length > max ? 1 : 0) + (panel > 0 ? 1 : 0));
  }

  /** 点了搜索图标：换成搜索框、聚焦 */
  openSearch() {
    this.shownInput.hidden = false;
    this.shownSearch.hidden = true;
    this.shownCount.hidden = true;
    this.shownInput.focus();
  }

  /** 收回成图标；`clear` 的连字一起清掉、不再筛 @param {boolean} clear */
  closeSearch(clear) {
    if (clear) {
      this.shownInput.value = '';
      this.shownQuery = '';
    }
    this.shownInput.hidden = true;
    this.shownSearch.hidden = false;
    this.shownCount.hidden = false;
    this.drawShown();
  }

  // ── 点进去 ──

  /**
   * 画好的那一样放进预览工作区的框（头一行最左边的返回箭头是那个框的）：`lead` 接在返回箭头后面，`actions` 在右边最大化前面；交回去时
   * （回到四张卡、开了别的、收起）记着的这一样清掉。
   * @param {any} viewing @param {Node[]} lead @param {Node[]} actions @param {Node} body
   */
  present(viewing, lead, actions, body) {
    const run = ++this.run;
    this.viewing = viewing;
    this.on.present({
      lead, actions, body,
      leave: () => {
        if (run !== this.run) return;
        this.run++;
        const had = this.viewing;
        this.viewing = null;
        if (had?.kind === 'diff') {
          this.sigs.files = '';
          this.drawFiles();
        }
      },
    });
    return run;
  }

  /** 工作区头一行右边的一个小按钮（同工作区自己的那几个） @param {string} ic @param {string} label @param {() => void} onclick @param {boolean} [off] */
  action(ic, label, onclick, off = false) {
    return h('button.icon-button.artifact-action', { type: 'button', title: this.t(label), 'aria-label': this.t(label), disabled: off, onclick }, icon(ic));
  }

  /** 后台命令的输出：先读最后几行，跑着的带 `after`、`wait` 接着读；贴着底，往上翻停住 @param {Node} x */
  showOutput(x) {
    const t = this.t;
    const running = x.state === 'running' || x.state === 'paused';
    const out = h('pre.dash-output', t('loading'));
    const follow = h('div.dash-follow', h('i.dash-follow-dot'), t('follow'));
    const stop = running ? this.action('circle-stop', 'stop', () => this.halt(x)) : null;
    const run = this.present({ kind: 'output', node: x },
      [h('span.dash-kind', icon('square-terminal')), h('span.dash-name.is-split', { title: x.command || x.title || x.job }, h('span.dash-command', x.command || x.title || x.job), h('span.dash-sep', ' · '), h('span.dash-id', x.job))],
      stop ? [stop] : [], h('div.dash-present', out, follow));
    /** @type {string[]} */
    let kept = [];
    const keep = this.config.preview_lines;
    // 贴着底：记着，不每次现量（头几回画的时候工作区还在换宽、没露出来，量出来是 0，原来就此不贴底了）；人往上翻停住，翻回底接着贴；
    // 框换了大小（浮现完、拖宽度、最大化）照记着的贴回去
    let stick = true;
    const pin = () => { if (stick) out.scrollTop = out.scrollHeight; follow.hidden = !stick; };
    const draw = () => {
      out.textContent = kept.length ? kept.join('\n') : t('no_output');
      pin();
    };
    out.addEventListener('scroll', () => {
      if (!out.clientHeight) return;
      stick = out.scrollTop + out.clientHeight >= out.scrollHeight - 4;
      follow.hidden = !stick;
    }, { passive: true });
    const sized = new ResizeObserver(() => pin());
    sized.observe(out);
    const add = (/** @type {string} */ text) => {
      if (!text) return;
      const parts = text.split('\n');
      if (kept.length && parts.length) kept[kept.length - 1] += parts.shift();
      kept = [...kept, ...parts].slice(-keep);
    };
    (async () => {
      /** @type {number|null} */
      let size = null;
      try {
        for (;;) {
          const got = await this.on.read(x.owner, x.job, size === null ? undefined : size);
          if (run !== this.run) return sized.disconnect();
          if (size === null) kept = String(got?.output ?? '').split('\n').slice(-keep);
          else add(String(got?.output ?? ''));
          if (kept.length === 1 && kept[0] === '') kept = [];
          draw();
          if ((!got?.running && !got?.more) || typeof got?.size !== 'number') return;
          size = got.size;
        }
      } catch (err) {
        if (run !== this.run) return;
        const e = /** @type {any} */ (err);
        out.textContent = e?.code === NO_METHOD ? t('no_api') : e?.message ?? String(err);
      }
    })();
  }

  /** 一个文件的差异：每一次编辑的差异照先后接起来，中间一道细线；右边上一个、下一个文件 @param {number} index */
  async showDiff(index) {
    const t = this.t;
    const files = this.data.files;
    const f = files[index];
    if (!f) return;
    const { name, dir } = splitPath(f.path, this.on.where());
    const body = h('div.dash-diff', h('div.dash-diff-note', t('loading')));
    const run = this.present({ kind: 'diff', index },
      [h('span.dash-kind', icon(f.created ? 'file-plus' : 'file')), h('strong.dash-file-name', name), dir ? h('span.dash-file-dir', dir) : null,
        h('span.dash-lines', f.added ? h('span.dash-add', `+${f.added}`) : null, ' ', f.removed ? h('span.dash-del', `−${f.removed}`) : null)].filter((x) => x !== null),
      [this.action('arrow-up', 'prev', () => this.showDiff(index - 1), !files[index - 1]), this.action('arrow-down', 'next', () => this.showDiff(index + 1), !files[index + 1])],
      body);
    this.sigs.files = '';
    this.drawFiles();
    const parts = await Promise.all(f.calls.map((call) => this.on.detail(call).catch(() => null)));
    if (run !== this.run) return;
    const blocks = parts.map((got) => {
      const file = (got?.files ?? []).find((/** @type {any} */ x) => x?.path === f.path) ?? (got?.files ?? [])[0];
      if (!file) return h('div.dash-diff-note', t('no_detail'));
      if (file.skipped) return h('div.dash-diff-note', t(`skipped.${file.skipped}`));
      return h('div.dash-diff-block', diffRows(file.diff ?? []).map((l) => (l.kind === 'hunk'
        ? h('div.dash-diff-hunk', l.text)
        : h(`div.dash-diff-line.is-${l.kind}`, h('span.dash-diff-no', l.old ?? ''), h('span.dash-diff-no', l.now ?? ''),
          h('span.dash-diff-mark', l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '), h('span.dash-diff-text', l.text)))));
    });
    replace(body, blocks.length ? blocks : [h('div.dash-diff-note', t('no_detail'))]);
  }

  /** 回到四张卡（换了一串会话）：看着的那一样交回去，预览工作区让出这一栏 */
  back() {
    if (!this.viewing) return;
    this.on.leave();
  }

  /** 停用了：停掉计时 */
  destroy() {
    clearInterval(this.timer);
    this.timer = 0;
    this.run++;
  }
}

/**
 * 收起来的、展开了的那一行（第 4 条：「还有 N 项」「(N)」「收起」「✓ 已完成 N 项」）：小图标加暗字，点了展开、收回。
 * @param {string} ic @param {string} label @param {() => void} onclick @param {boolean} open 展开着 @param {string} [tone] 图标那一格的样子
 */
function foldRow(ic, label, onclick, open, tone = '') {
  return h('button.dash-row.dash-fold-row', { type: 'button', 'aria-expanded': String(open), onclick },
    h(`span.dash-state${tone ? `.${tone}` : ''}`, icon(ic)), h('span.dash-fold-count', label));
}

/**
 * 一张卡里露几项就收起：照它最多露几行，留 `spare` 行给收起来的那几行；没写行数的不收（照内容高）；至少 1 项。
 * @param {Card|undefined} card @param {number} spare
 */
function foldAt(card, spare) {
  const rows = card?.maxRows() ?? Infinity;
  return Number.isFinite(rows) ? Math.max(1, rows - spare) : Infinity;
}

/** 状态只用图标（第 4 条） @param {string} state */
function stateIcon(state) {
  if (state === 'running') return icon('loader-circle');
  if (state === 'confirm') return icon('circle-alert');
  if (state === 'ask' || state === 'paused') return icon('circle-help');
  if (state === 'done') return icon('check');
  if (state === 'failed') return icon('circle-x');
  return h('i.dash-ended-mark');
}

/**
 * 连接线（├ └ 那样的圆角线）：上面几层还没完的穿一道竖线，自己这一层一段竖线接到上一行、一小段横线接到图标，不是最后一个的再往下接。
 * @param {boolean[]} guides @param {number} depth @param {boolean} last
 */
function lines(guides, depth, last) {
  if (!depth) return null;
  // 第 c 道竖线接的是第 c + 1 层的那一个（顶层没有线）：它后面还有兄弟才穿过去
  return h('span.dash-lines-tree', { 'aria-hidden': 'true' },
    ...guides.slice(1, depth).map((on, i) => (on ? h('i.dash-guide', { style: `--level: ${i}` }) : null)),
    h('i.dash-elbow', { style: `--level: ${depth - 1}` }),
    last ? null : h('i.dash-guide.is-below', { style: `--level: ${depth - 1}` }));
}
