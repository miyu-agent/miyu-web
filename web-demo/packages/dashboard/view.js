// @ts-check
//! 仪表盘的样子（软件包 `dashboard`，蓝图 `web.md`「仪表盘」第 4、5 条）：四张卡（待办、后台任务、文件修改、展示文件，空的整张不出），
//! 点进去的两种（后台命令的输出、文件的差异）；子代理点了交给外面在主区打开，展示文件点了交给外面开预览工作区。数据变了才重画那张卡（在收的字每来一段都会来一次）；在跑的用时
//! 每 `tick_ms` 只改那几个字。

import { h, icon, replace } from '../../src/lib/dom.js';
import { unfold } from '../../src/lib/motion.js';
import { jobDuration } from '../../src/lib/format.js';
import { rowsOf, counts, stoppable, todoView, splitPath, diffRows } from './model.js';

/** JSON-RPC 的「没有这个方法」 */
const NO_METHOD = -32601;
/** 任务种类的图标 @type {Record<string, string>} */
const KIND_ICON = { agent: 'bot', command: 'square-terminal' };
/** 展示文件种类的图标 @type {Record<string, string>} */
const SHOWN_ICON = { image: 'image', pdf: 'file-text', html: 'globe', markdown: 'file-text', code: 'file-code', text: 'file-text' };

/**
 * @typedef {import('./model.js').Node} Node
 * @typedef {import('./model.js').FileChange} FileChange
 * @typedef {{path: string, name: string, title: string|null, kind: string}} Shown 展示过的一样
 * @typedef {{
 *   stop: (owner: string, job: string) => Promise<void>,
 *   enter: (session: string) => void,
 *   read: (owner: string, job: string, after?: number) => Promise<any>,
 *   detail: (call: string) => Promise<any>,
 *   where: () => {workdir: string|null, home: string|null},
 *   focus: (wide: boolean) => void,
 *   show: (path: string) => void,
 *   panel: () => void,
 *   dismiss: (path: string) => void,
 * }} On 停一个任务、在主区打开子代理的会话、读后台命令的输出、取一次编辑的差异、工作区和家目录、点进去（变宽）和回来、
 *   预览工作区开一样展示文件、开面板、从右栏拿掉一样
 */

export class Dashboard {
  /**
   * @param {(path: string, fields?: any) => string} t 这个包的字
   * @param {{tick_ms: number, todo_rows: number, file_rows: number, preview_lines: number}} config
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
    /** 点过停止、还没等到回报的 */
    this.stopping = new Set();
    /** @type {Data} */
    this.data = { todos: [], tree: [], files: [], current: null, shown: [], panel: 0 };
    this.sigs = { todo: '', tasks: '', files: '', shown: '' };
    this.todoCard = h('section.dash-card.dash-todo', { 'aria-label': t('todo') });
    this.taskCard = h('section.dash-card.dash-tasks', { 'aria-label': t('tasks') });
    this.fileCard = h('section.dash-card.dash-files', { 'aria-label': t('files') });
    this.shownCard = h('section.dash-card.dash-shown-card', { 'aria-label': t('shown') });
    const wrap = (/** @type {HTMLElement} */ card) => h('div.unfold.dash-slot', h('div.unfold-inner', card));
    this.slots = { todo: wrap(this.todoCard), tasks: wrap(this.taskCard), files: wrap(this.fileCard), shown: wrap(this.shownCard) };
    this.empty = h('div.dash-empty', { hidden: true }, t('empty'));
    this.list = h('div.dash-list', this.slots.todo, this.slots.tasks, this.slots.files, this.slots.shown, this.empty);
    this.detail = h('div.dash-detail', { hidden: true });
    this.el = h('div.dash', this.list, this.detail);
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
    const any = data.todos.length > 0 || data.tree.length > 0 || data.files.length > 0 || (data.shown?.length ?? 0) > 0 || (data.panel ?? 0) > 0;
    this.empty.hidden = any;
    // 看着的后台命令没了、文件没了：回到仪表盘
    if (this.viewing?.kind === 'diff' && !data.files[this.viewing.index]) this.back();
    this.syncTimer();
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
    const v = todoView(this.data.todos, this.config.todo_rows);
    const sig = JSON.stringify(this.data.todos);
    unfold(this.slots.todo, v.total > 0);
    if (sig === this.sigs.todo) return;
    this.sigs.todo = sig;
    if (!v.total) return;
    const ratio = v.total ? v.done / v.total : 0;
    const row = (/** @type {any} */ x) => {
      const doing = x.status === 'in_progress';
      return h(`div.dash-todo-row${doing ? '.is-doing' : ''}`, h('span.dash-todo-mark', doing ? icon('loader-circle') : h('i.dash-todo-ring')), h('span.dash-todo-text', x.content));
    };
    const tail = v.done || v.more
      ? h('div.dash-todo-row.is-done', h('span.dash-todo-mark', icon('check')),
        h('span.dash-todo-text', [v.done ? t('done_items', { count: v.done }) : null, v.more ? t('more_items', { count: v.more }) : null].filter(Boolean).join(' · ')))
      : null;
    replace(this.todoCard,
      h('div.dash-head', h('strong.dash-title', t('todo')), h('span.dash-count', `${v.done}/${v.total}`), h('span.dash-gap'),
        h('span.dash-progress', h('span.dash-progress-bar', { style: `width: ${(ratio * 100).toFixed(1)}%` }))),
      v.shown.map(row), tail);
  }

  // ── 后台任务 ──

  drawTasks() {
    const t = this.t;
    const tree = this.data.tree;
    unfold(this.slots.tasks, tree.length > 0);
    const rows = rowsOf(tree, { collapsed: this.collapsed, expanded: this.expanded, doneOpen: this.doneOpen });
    const n = counts(tree);
    const sig = JSON.stringify([rows.map((r) => (r.type === 'task' ? [r.node.key, r.node.state, r.node.title, r.node.attention, r.depth, r.last, r.guides, r.open, r.hasKids] : [r.type, r.count, r.type === 'more' ? r.running : r.open])), n, [...this.stopping], this.data.current]);
    if (sig === this.sigs.tasks) return;
    this.sigs.tasks = sig;
    if (!tree.length) return;
    const now = Date.now();
    const many = stoppable(tree).length > 1;
    replace(this.taskCard,
      h('div.dash-head.is-sticky', h('strong.dash-title', t('tasks')),
        n.running ? h('span.dash-count', t('running', { count: n.running })) : null,
        n.waiting ? h('span.dash-count.is-waiting', t('waiting', { count: n.waiting })) : null,
        h('span.dash-gap'),
        many ? h('button.dash-stop-all', { type: 'button', onclick: () => this.stopAll() }, t('stop_all')) : null),
      rows.map((r) => this.taskRow(r, now)));
  }

  /** @param {import('./model.js').Row} r @param {number} now */
  taskRow(r, now) {
    const t = this.t;
    if (r.type === 'done') {
      return h('button.dash-row.dash-fold-row', { type: 'button', 'aria-expanded': String(r.open), onclick: () => { this.doneOpen = !this.doneOpen; this.drawTasks(); } },
        h('span.dash-state.is-done', icon('check')), h('span.dash-fold-count', `(${r.count})`));
    }
    if (r.type === 'more') {
      return h('button.dash-row.dash-fold-row', { type: 'button', style: `--depth: ${r.depth}`, 'aria-label': t('more_tasks', { count: r.count }), onclick: () => { this.expanded.add(r.parent); this.drawTasks(); } },
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

  /** 全部停止：照先后一个个停（停一个子代理连它派的一起停） */
  async stopAll() {
    for (const x of stoppable(this.data.tree)) if (!this.stopping.has(x.key)) await this.halt(x);
  }

  // ── 文件修改 ──

  drawFiles() {
    const t = this.t;
    const files = this.data.files;
    unfold(this.slots.files, files.length > 0);
    const sig = JSON.stringify([files, this.filesOpen, this.viewing?.kind === 'diff' ? this.viewing.index : -1]);
    if (sig === this.sigs.files) return;
    this.sigs.files = sig;
    if (!files.length) return;
    const where = this.on.where();
    const added = files.reduce((n, f) => n + f.added, 0);
    const removed = files.reduce((n, f) => n + f.removed, 0);
    const max = this.config.file_rows;
    const shown = this.filesOpen || files.length <= max ? files : files.slice(0, max);
    const rest = files.length - shown.length;
    replace(this.fileCard,
      h('div.dash-head', h('strong.dash-title', t('files')), h('span.dash-count', t('files_count', { count: files.length })), h('span.dash-gap'),
        h('span.dash-lines', h('span.dash-add', `+${added}`), ' ', h('span.dash-del', `−${removed}`))),
      shown.map((f, i) => {
        const { name, dir } = splitPath(f.path, where);
        return h(`button.dash-row.dash-file${f.created ? '.is-created' : ''}`, { type: 'button', title: f.path, onclick: () => this.showDiff(i) },
          h('span.dash-kind', icon(f.created ? 'file-plus' : 'file')), h('span.dash-file-name', name), dir ? h('span.dash-file-dir', dir) : null, h('span.dash-gap'),
          h('span.dash-lines', f.added ? h('span.dash-add', `+${f.added}`) : null, f.added && f.removed ? ' ' : null, f.removed ? h('span.dash-del', `−${f.removed}`) : null));
      }),
      rest > 0 ? h('button.dash-row.dash-fold-row', { type: 'button', onclick: () => { this.filesOpen = true; this.drawFiles(); } }, icon('chevron-down'), h('span.dash-fold-count', `(${rest})`)) : null);
  }

  // ── 展示文件 ──

  /** 预览工作区展示过的（最后展示的在前）：点了交给外面开工作区看它；悬停露出 ✕ 从右栏拿掉；面板挂着东西的最后一行「面板」 */
  drawShown() {
    const t = this.t;
    const list = this.data.shown ?? [];
    const panel = this.data.panel ?? 0;
    unfold(this.slots.shown, list.length > 0 || panel > 0);
    const sig = JSON.stringify([list, panel, this.shownOpen]);
    if (sig === this.sigs.shown) return;
    this.sigs.shown = sig;
    if (!list.length && !panel) return;
    const where = this.on.where();
    const max = this.config.file_rows;
    const rows = this.shownOpen || list.length <= max ? list : list.slice(0, max);
    const rest = list.length - rows.length;
    replace(this.shownCard,
      h('div.dash-head', h('strong.dash-title', t('shown')), list.length ? h('span.dash-count', t('shown_count', { count: list.length })) : null),
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
      rest > 0 ? h('button.dash-row.dash-fold-row', { type: 'button', onclick: () => { this.shownOpen = true; this.drawShown(); } }, icon('chevron-down'), h('span.dash-fold-count', `(${rest})`)) : null,
      panel > 0 ? h('button.dash-row.dash-file.dash-panel-row', { type: 'button', onclick: () => this.on.panel() }, h('span.dash-kind', icon('puzzle')), h('span.dash-file-name', t('panel'))) : null);
  }

  // ── 点进去 ──

  /** 头一行：返回箭头（不写字、不铺底），接着的几样，右边的按钮 @param {any[]} middle @param {any[]} right */
  head(middle, right) {
    return h('div.dash-detail-head',
      h('button.dash-back', { type: 'button', title: this.t('back'), 'aria-label': this.t('back'), onclick: () => this.back() }, icon('chevron-left')),
      ...middle, h('span.dash-gap'), ...right);
  }

  /** 后台命令的输出：先读最后几行，跑着的带 `after`、`wait` 接着读；贴着底，往上翻停住 @param {Node} x */
  showOutput(x) {
    const t = this.t;
    const run = ++this.run;
    this.viewing = { kind: 'output', node: x };
    const running = x.state === 'running' || x.state === 'paused';
    const out = h('pre.dash-output', t('loading'));
    const follow = h('div.dash-follow', h('i.dash-follow-dot'), t('follow'));
    const stop = running ? h('button.dash-stop', { type: 'button', title: t('stop'), 'aria-label': t('stop'), onclick: () => this.halt(x) }, h('span.dash-stop-mark')) : null;
    replace(this.detail,
      this.head([h('span.dash-kind', icon('square-terminal')), h('span.dash-name.is-split', { title: x.command || x.title || x.job }, h('span.dash-command', x.command || x.title || x.job), h('span.dash-sep', ' · '), h('span.dash-id', x.job))], [stop]),
      out, follow);
    this.enter();
    /** @type {string[]} */
    let kept = [];
    const keep = this.config.preview_lines;
    const draw = () => {
      const stick = out.scrollTop + out.clientHeight >= out.scrollHeight - 4;
      out.textContent = kept.length ? kept.join('\n') : t('no_output');
      if (stick) out.scrollTop = out.scrollHeight;
      follow.hidden = !stick;
    };
    out.addEventListener('scroll', () => { follow.hidden = out.scrollTop + out.clientHeight < out.scrollHeight - 4; }, { passive: true });
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
          if (run !== this.run) return;
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

  /** 一个文件的差异：每一次编辑的差异照先后接起来，中间一道细线 @param {number} index */
  async showDiff(index) {
    const t = this.t;
    const files = this.data.files;
    const f = files[index];
    if (!f) return;
    const run = ++this.run;
    this.viewing = { kind: 'diff', index };
    this.sigs.files = '';
    this.drawFiles();
    const { name, dir } = splitPath(f.path, this.on.where());
    const body = h('div.dash-diff', h('div.dash-diff-note', t('loading')));
    const nav = (/** @type {number} */ step, /** @type {string} */ ic, /** @type {string} */ label) => h('button.dash-icon', {
      type: 'button', title: t(label), 'aria-label': t(label), disabled: !files[index + step], onclick: () => this.showDiff(index + step),
    }, icon(ic));
    replace(this.detail,
      this.head([h('span.dash-kind', icon(f.created ? 'file-plus' : 'file')), h('strong.dash-file-name', name), dir ? h('span.dash-file-dir', dir) : null,
        h('span.dash-lines', f.added ? h('span.dash-add', `+${f.added}`) : null, ' ', f.removed ? h('span.dash-del', `−${f.removed}`) : null)],
      [nav(-1, 'arrow-up', 'prev'), nav(1, 'arrow-down', 'next')]),
      body);
    this.enter();
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

  /** 换成点进去的那一样：这一栏变宽 */
  enter() {
    this.list.hidden = true;
    this.detail.hidden = false;
    this.on.focus(true);
  }

  /** 回到仪表盘 */
  back() {
    this.run++;
    const had = this.viewing;
    this.viewing = null;
    this.detail.hidden = true;
    replace(this.detail);
    this.list.hidden = false;
    if (had?.kind === 'diff') {
      this.sigs.files = '';
      this.drawFiles();
    }
    this.on.focus(false);
  }

  /** 停用了：停掉计时 */
  destroy() {
    clearInterval(this.timer);
    this.timer = 0;
    this.run++;
  }
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
