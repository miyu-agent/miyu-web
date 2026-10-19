// @ts-check
//! 全部会话（蓝图 `web.md`「全部会话」「会话整理和项目」第 6、7 条，照 Claude 网页端的 Chats 页）：左栏「查看全部」、`/sessions` 打开，占对话区
//! 那一块（左栏照旧在）。核心有项目的，顶上切「会话」「项目」两页（分段切换，照模型菜单的），点一张项目卡片进那个项目的页（`projects-page.js`）。
//!
//! 「会话」那一页：大标题、搜索、多选、新会话；下面一排筛选（全部、每个项目一个、不在项目里、在跑、没看过），右边「按最近活动 ▾」点了换「按创建时间」；
//! 列表照左栏的时间分组（最近、近 7 天、近 30 天、30 天前），组头滚的时候贴在顶上。一个顶层会话一行：标题、项目的小标签（文件夹加名字）、派过几个
//! 子代理（在跑的写「N 个子代理在跑」）、有后台任务在跑的写几个、什么时候。全部照会话表取（核心 9-5），不读每个会话的日志；读过的会话标题、在不在跑
//! 照读到的。会话表、在跑、后台任务变了才重画（`refresh`）。多选照左栏：勾选框、`Shift` 连选、全选、删除（不问）、退出。`Esc` 关上（项目页先回
//! 「项目」那一页）。

import { h, icon, replace } from './dom.js';
import { show, hide, leave } from '../lib/motion.js';
import { t } from '../util/res.js';
import { toggle, range } from '../model/select.js';
import { ago } from '../model/ago.js';
import { filterRows, groupRows, timeOf } from '../model/session-filter.js';
import { projectCards, projectView } from './projects-page.js';

/**
 * @typedef {import('../model/session-filter.js').Row} Row
 * @typedef {{list: () => {session: string, title?: string, parent?: string|null, oneshot?: boolean, project?: string, last_active?: string}[],
 *   titleOf: (id: string) => string|null, active: (id: string) => number|null, running: (id: string) => boolean, unread: (id: string) => boolean,
 *   jobs: (id: string) => number, agents: (id: string) => number, agentsRunning: (id: string) => number,
 *   open: (id: string) => void, newSession: () => void, newIn: (id: string) => void, editProject: (id: string|null) => void,
 *   projects: () => {supported: boolean, list: import('../core/projects.js').Project[]}, color: (c: string|undefined) => string|null,
 *   personaName: (id: string) => string, presetName: (id: string) => string, defaultWorkdir: () => string,
 *   removeMany: (ids: string[]) => Promise<string[]>, dropped: (id: string) => void}} PageActions
 */

export class SessionsPage {
  /** @param {PageActions} on */
  constructor(on) {
    this.on = on;
    /** 哪一页：会话、项目、一个项目的页（`projectId`） @type {'sessions'|'projects'|'project'} */
    this.view = 'sessions';
    this.projectId = /** @type {string|null} */ (null);
    this.query = '';
    /** @type {import('../model/session-filter.js').Filter} */
    this.filter = 'all';
    /** @type {import('../model/session-filter.js').Sort} */
    this.sort = 'active';
    this.selecting = false;
    this.selected = /** @type {Set<string>} */ (new Set());
    /** 上一次画的（会话表、在不在跑、后台任务、项目）：变了才重画 */
    this.live = '';
    this.anchor = /** @type {string|null} */ (null);
    this.search = /** @type {HTMLInputElement} */ (h('input.sessions-search', { type: 'search', placeholder: t('sessions_page.search'), 'aria-label': t('sessions_page.search') }));
    // 边打边筛：输入法在选字时不筛，选定了（`compositionend`）再筛
    const filter = () => {
      this.query = this.search.value.trim().toLowerCase();
      this.draw();
    };
    this.search.addEventListener('input', (e) => { if (!/** @type {InputEvent} */ (e).isComposing) filter(); });
    this.search.addEventListener('compositionend', filter);
    this.tools = h('div.sessions-tools');
    this.title = h('h1.sessions-title', t('sessions_page.title'));
    this.head = h('header.sessions-head', this.title, this.tools);
    this.switcher = h('div.sessions-switch', { role: 'tablist' });
    this.bar = h('div.sessions-bar');
    this.list = h('div.sessions-list');
    this.inner = h('div.sessions-inner', this.head, this.switcher, this.bar, this.list);
    this.el = h('section.sessions-page', { hidden: true, 'aria-label': t('sessions_page.title') }, this.inner);
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('.setup-float-scrim')) return;
      if (this.selecting) this.select(false);
      else if (this.view === 'project') this.go('projects');
      else this.close();
    };
  }

  isOpen() {
    return !this.el.hidden && !this.el.classList.contains('is-leaving');
  }

  /** 打开（`projects` 是「项目」那一页）：画出来，「会话」那一页焦点给搜索框。 @param {'sessions'|'projects'} [view] */
  open(view = 'sessions') {
    this.select(false, false);
    this.search.value = '';
    this.query = '';
    this.filter = 'all';
    // 打开时那一排重画一次（界面语言换过的照新的）
    this.toolsMode = null;
    this.view = view === 'projects' && this.on.projects().supported ? 'projects' : 'sessions';
    this.projectId = null;
    show(this.el);
    document.addEventListener('keydown', this.onKey);
    this.draw();
    this.el.scrollTop = 0;
    if (this.view === 'sessions') this.search.focus();
  }

  /** 进一个项目的页（左栏项目的菜单「打开项目」、对话区顶上那一段项目名）。 @param {string} id */
  openProject(id) {
    if (!this.isOpen()) this.open('projects');
    this.go('project', id);
  }

  /** 换一页。 @param {'sessions'|'projects'|'project'} view @param {string|null} [id] */
  go(view, id = null) {
    this.view = view;
    this.projectId = id;
    this.select(false, false);
    this.toolsMode = null;
    this.draw();
    this.el.scrollTop = 0;
  }

  close() {
    document.removeEventListener('keydown', this.onKey);
    if (this.isOpen()) hide(this.el);
  }

  /** 进、出多选。 @param {boolean} on @param {boolean} [redraw] */
  select(on, redraw = true) {
    this.selecting = on;
    this.selected = new Set();
    this.anchor = null;
    this.toolsMode = null;
    if (redraw) this.draw();
  }

  /** 全部顶层会话（不是一次性的、不是子会话），带上在跑、没看过、项目。 @returns {Row[]} */
  rows() {
    return this.on.list().filter((s) => !s.oneshot && !s.parent).map((s) => ({
      session: s.session, title: s.title ?? this.on.titleOf(s.session), project: s.project ?? null,
      active: s.last_active ? Date.parse(s.last_active) : this.on.active(s.session),
      running: this.on.running(s.session), unread: this.on.unread(s.session),
    }));
  }

  /** 现在有的项目（核心没有项目的是空的） */
  projects() {
    const p = this.on.projects();
    return p.supported ? p.list : [];
  }

  /** 右上那一排：「会话」那一页平常搜索、多选、新会话，多选时「已选 N 个」和全选、删除、退出（位置不动）；「项目」那一页只有搜索。 */
  drawTools() {
    // 平常那一排画一次就留着：每打一个字重建会把搜索框拿下来再放回去，输入法选字就断了（中文只进得去一个字）
    const mode = this.view === 'project' ? 'project' : this.selecting ? 'select' : this.view;
    if (mode === this.toolsMode && mode !== 'select') return;
    this.toolsMode = mode;
    const icon_ = (name, label, run, cls = '', disabled = false) =>
      h(`button.icon-button.sessions-icon${cls}`, { type: 'button', title: label, 'aria-label': label, disabled, onclick: run }, icon(name));
    const search = h('label.sessions-search-box', icon('search'), this.search);
    replace(this.tools, mode === 'project' ? []
      : mode === 'select'
        ? [h('span.sessions-count', t('sidebar.selected', { count: this.selected.size })),
          icon_('check-check', t('sidebar.select_all'), () => { this.selected = new Set(this.shown().map((r) => r.session)); this.draw(); }),
          icon_('trash-2', t('sidebar.delete'), () => this.remove([...this.selected]), '.is-danger', this.selected.size === 0),
          icon_('x', t('sidebar.select_exit'), () => this.select(false))]
        : mode === 'projects'
          ? [search, h('button.sessions-button.is-primary', { type: 'button', onclick: () => this.on.editProject(null) }, icon('plus'), t('sidebar.new_project'))]
          : [search,
            h('button.sessions-button', { type: 'button', onclick: () => this.select(true) }, t('sessions_page.select')),
            h('button.sessions-button.is-primary', { type: 'button', onclick: () => { this.close(); this.on.newSession(); } }, icon('plus'), t('sessions_page.new'))]);
  }

  /** 「会话」「项目」两页的切换（核心有项目才有；项目页里不画）。 */
  drawSwitch() {
    const on = this.on.projects().supported && this.view !== 'project';
    this.switcher.hidden = !on;
    if (!on) return;
    const tab = (/** @type {'sessions'|'projects'} */ v) => h('button.sessions-tab', {
      type: 'button', role: 'tab', 'aria-selected': String(this.view === v), onclick: () => { if (this.view !== v) this.go(v); },
    }, t(`sessions_page.tab_${v}`));
    this.switcher.classList.toggle('on-projects', this.view === 'projects');
    replace(this.switcher, h('i.sessions-switch-thumb'), tab('sessions'), tab('projects'));
  }

  /** 「会话」那一页筛完搜完的（照列出来的先后） */
  shown() {
    const known = new Set(this.projects().map((p) => p.project));
    const kept = filterRows(this.rows(), this.filter, this.query, known);
    return groupRows(kept, this.sort, Date.now()).flatMap((g) => g.rows);
  }

  /** 开着时会话表、在跑、后台任务、项目变了：重画（没变的不动，对话区每来一段字都会叫一次）。 */
  refresh() {
    if (!this.isOpen()) return;
    if (this.liveSig() !== this.live) this.draw();
  }

  /** 画的东西拼成一串比 */
  liveSig() {
    const rows = this.rows().map((r) => [r.session, r.title, r.project, r.active, r.running, r.unread, this.on.jobs(r.session), this.on.agents(r.session), this.on.agentsRunning(r.session)]);
    return JSON.stringify([rows, this.on.projects()]);
  }

  draw() {
    this.live = this.liveSig();
    // 「项目」那一页、项目页不多选；要的项目没了（别处删了）回「项目」那一页
    if (this.view === 'project' && !this.projects().some((p) => p.project === this.projectId)) this.view = 'projects';
    if (this.view === 'projects' && !this.on.projects().supported) this.view = 'sessions';
    this.head.hidden = this.view === 'project';
    this.drawTools();
    this.drawSwitch();
    if (this.view === 'projects') {
      replace(this.bar);
      replace(this.list, projectCards(this, this.rows()));
      return;
    }
    if (this.view === 'project') {
      const p = /** @type {import('../core/projects.js').Project} */ (this.projects().find((x) => x.project === this.projectId));
      const rows = this.rows().filter((r) => r.project === p.project);
      replace(this.bar, projectView(this, p));
      replace(this.list, this.groups(rows, false));
      return;
    }
    replace(this.bar, this.filters());
    const known = new Set(this.projects().map((p) => p.project));
    replace(this.list, this.groups(filterRows(this.rows(), this.filter, this.query, known), true));
  }

  /** 一排筛选、右边的排法。 */
  filters() {
    const chip = (/** @type {import('../model/session-filter.js').Filter} */ f, /** @type {Node[]|string} */ label, /** @type {string|null} */ color = null) =>
      h(`button.sessions-chip${this.filter === f ? '.is-on' : ''}`, {
        type: 'button', 'aria-pressed': String(this.filter === f), style: color ? `--project-color: ${color}` : null,
        onclick: () => { this.filter = f; this.draw(); },
      }, label);
    const projects = this.projects();
    return h('div.sessions-filters',
      h('div.sessions-chips',
        chip('all', t('sessions_page.filter_all')),
        ...projects.map((p) => chip(`project:${p.project}`, [icon('folder'), h('span', p.name)], this.on.color(p.color))),
        projects.length ? chip('loose', t('sessions_page.filter_loose')) : null,
        chip('running', t('sessions_page.filter_running')),
        chip('unread', t('sessions_page.filter_unread'))),
      h('button.sessions-sort', { type: 'button', onclick: () => { this.sort = this.sort === 'active' ? 'created' : 'active'; this.draw(); } },
        h('span', t(`sessions_page.sort_${this.sort}`)), icon('chevron-down')));
  }

  /**
   * 照时间分组的列表：一组一个头（滚的时候贴在顶上），组里一个会话一行。
   * @param {Row[]} rows @param {boolean} tags 带不带项目的小标签（项目页里不带）
   */
  groups(rows, tags) {
    const now = Date.now();
    const groups = groupRows(rows, this.sort, now);
    const order = groups.flatMap((g) => g.rows.map((r) => r.session));
    const byId = new Map(this.projects().map((p) => [p.project, p]));
    if (!groups.length) return [h('div.sessions-empty', t(this.query || this.filter !== 'all' ? 'sessions_page.no_match' : 'sessions_page.empty'))];
    return groups.flatMap((g) => [
      h('div.sessions-group', t(`sidebar.groups.${g.group}`)),
      ...g.rows.map((r) => this.row(r, order, tags ? byId.get(r.project ?? '') ?? null : null, now)),
    ]);
  }

  /**
   * 一行：标题、项目的小标签、子代理、后台任务、什么时候；多选时前面一个勾选框。
   * @param {Row} r @param {string[]} order @param {import('../core/projects.js').Project|null} project @param {number} now
   */
  row(r, order, project, now) {
    const on = this.selected.has(r.session);
    const click = (/** @type {MouseEvent} */ e) => {
      if (this.selecting) {
        this.selected = e.shiftKey ? range(this.selected, order, this.anchor, r.session) : toggle(this.selected, r.session);
        this.anchor = r.session;
        this.draw();
        return;
      }
      this.close();
      this.on.open(r.session);
    };
    const color = project ? this.on.color(project.color) : null;
    return h(`button.sessions-row${on ? '.is-selected' : ''}`, { type: 'button', dataset: { session: r.session }, onclick: click },
      this.selecting ? h('span.sessions-check', icon(on ? 'square-check' : 'square')) : null,
      r.running ? h('span.session-run-spinner.sessions-run') : r.unread ? h('i.session-unread-dot.sessions-unread') : null,
      h(`span.sessions-name${r.title ? '' : '.is-untitled'}`, r.title ?? t('sessions_page.untitled')),
      project ? h('span.sessions-project', { style: color ? `--project-color: ${color}` : null }, icon('folder'), h('span', project.name)) : null,
      agents(this.on.agents(r.session), this.on.agentsRunning(r.session)),
      jobs(this.on.jobs(r.session)),
      h('span.sessions-when', ago(timeOf(r, this.sort), now)));
  }

  /** 删（多选时点删除）：不问，多选当场退出，这几行一起收掉；删成的从表里拿掉，没删成的留着。 */
  async remove(ids) {
    if (!ids.length) return;
    this.selecting = false;
    this.draw();
    const gone = Promise.all(ids.map((id) => new Promise((resolve) => {
      const el = this.list.querySelector(`[data-session="${CSS.escape(id)}"]`);
      if (el instanceof HTMLElement) {
        el.style.setProperty('--h', `${el.offsetHeight}px`);
        leave(el, () => { el.remove(); resolve(undefined); });
      } else resolve(undefined);
    })));
    const done = await this.on.removeMany(ids);
    await gone;
    for (const id of done) this.on.dropped(id);
    this.selected = new Set();
    this.draw();
  }
}

/** 派过子代理的：机器人加「N 个子代理」（一层层往下都算，跑完了的也算）；有在跑的写「N 个子代理在跑」（gold）；没有的不写。 */
function agents(count, running) {
  if (running) return h('span.sessions-agents.is-running', icon('bot'), t('sessions_page.agents_running', { count: running }));
  return count ? h('span.sessions-agents', icon('bot'), t('sessions_page.agents', { count })) : null;
}

/** 后台任务在跑的：一个呼吸的点加「N 个后台任务」（和框下面那一行一样）；没有的不写。 */
function jobs(count) {
  return count ? h('span.sessions-jobs', h('i.sessions-jobs-dot'), t('sessions_page.jobs', { count })) : null;
}
