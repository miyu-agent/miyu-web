// @ts-check
//! 左栏（蓝图 `web.md`「左栏」，照旧版 `web/index.html:52-95`、`styles.css:405-988`）：头像、名字和在线的状态、
//! 新会话、收起；会话表（头上一行「会话」，照旧版组头的样子）；底下换主题。
//!
//! 一项悬停时右边出竖着的三个点（照 Claude Code 的侧栏）：左边一段渐隐，标题淡出去；点开是会话的菜单，样子照旧版
//! （`app.js:2455-2540`）：复制编号、重命名、删除（点了就删，不再问）。
//!
//! 子代理的会话挂在派它的会话下面，一层层往下（「子代理的会话」，照 `model/tree.js` 排）：文件树那样的线画出从属；结束了的收成
//! 「已完成 N 个」；顶层会话的记号那一格是展开、收起整棵的箭头（在跑、没看过的照旧转圈、圆点，指针移上去换成箭头）；子代理下面还
//! 有的，标题前面写 `(N)`，指针移上去换成箭头，点了开、关；整棵收着、里面有在跑的，那一格转圈。记号：子代理是机器人，再往下是
//! 空心的圆（正在看的实心），停在半路的是暂停。顶层最多露 `sidebar_rows` 个，下面一行「查看全部」。
//!
//! 多选（「批量删除」）：「会话」那一行右边的按钮进多选，记号那一格换成勾选框，`Shift` 点连选；「会话」那一行换成已选几个和
//! 全选、删除、退出三个图标按钮，位置不动。
//!
//! 删除一点就开始收（往左淡出、同时收起高度），不等核心；没删成的画回来。
//!
//! 在跑的会话，记号那一格是盲文转圈：整个左栏一个定时器，只在有会话在跑时走（「空闲就是真的空闲」，
//! `00-设计理念.md` 第一节）；帧照墙上的钟取，重画了也接着转，不跳回第一帧。

import { h, icon, replace } from './dom.js';
import { leave } from '../lib/motion.js';
import { res, t } from '../util/res.js';
import { toggle, range } from '../model/select.js';
import { treeRows, capTops, pathOf } from '../model/tree.js';
import { TIME_GROUPS, byTime } from '../model/session.js';
import { SessionDrag } from './sidebar-drag.js';
import { projectBlock } from './sidebar-projects.js';
import { projectRows, colorOf } from '../model/project.js';

/**
 * @typedef {{session: string, title: string|null, running: boolean, unread: boolean}} Item
 * @typedef {{newSession: () => void, open: (id: string) => void, close: () => void,
 *   rename: (id: string, title: string) => Promise<void>, pin: (id: string, on: boolean) => Promise<void>, removeMany: (ids: string[]) => Promise<string[]>, dropped: (id: string) => void,
 *   kids: (id: string) => {session: string, title: string|null, running: boolean, paused?: boolean}[], viewAll: () => void,
 *   shown: (ids: string[]) => void, place: (id: string, patch: {pinned?: boolean, project?: string|null}) => Promise<void>,
 *   projects: () => {supported: boolean, list: import('../core/projects.js').Project[]}, viewProjects: () => void, editProject: (id: string|null) => void,
 *   openProject: (id: string) => void, newIn: (id: string) => void, deleteProject: (id: string) => void, parentOf?: (id: string) => string|null,
 *   prefs?: {get: (key: string, fallback: any) => any, set: (key: string, value: any) => void},
 *   theme: () => void, dark: () => boolean, copyId: (id: string) => void, notYet: (name: string) => void}} Handlers
 */

/** 这台设备上记着收起了哪几栏 */
const FOLDED = 'sidebar.folded';

/**
 * 一栏的头：名字，悬停露一个箭头（收着的朝右），右边这一栏的按钮；点头（不是点按钮）收起、展开。
 * @param {Sidebar} bar @param {string} key @param {HTMLElement} title @param {HTMLElement|null} tools
 */
function sectionHead(bar, key, title, tools) {
  const head = h('div.session-group-header.sb-head', {
    dataset: { key: `group:${key}` }, role: 'button', tabindex: '0',
    onclick: (/** @type {MouseEvent} */ e) => { if (!(/** @type {Element} */ (e.target)).closest('button')) bar.fold(key); },
    onkeydown: (/** @type {KeyboardEvent} */ e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === head) { e.preventDefault(); bar.fold(key); } },
  }, title, h('span.sb-chevron', { 'aria-hidden': 'true' }, icon('chevron-down')), tools);
  return head;
}

export class Sidebar {
  /** @param {Handlers} on */
  constructor(on) {
    /** 正在改名的会话 */
    this.renaming = /** @type {string|null} */ (null);
    /** @type {HTMLInputElement|null} */
    this.renameInput = null;
    /** 多选：在不在多选、勾了哪些、上一次点的（`Shift` 连选从它起） */
    this.selecting = false;
    this.selected = /** @type {Set<string>} */ (new Set());
    this.anchor = /** @type {string|null} */ (null);
    /** 正在删的：不再画（在收的动画里）；还有几批在收（收的时候不重画） */
    this.removing = /** @type {Set<string>} */ (new Set());
    this.leaving = 0;
    /** 树：人点过的开关（会话 → 开着没有）、点开了「已完成 N 个」的会话；这个标签页里记着 */
    this.openTree = /** @type {Map<string, boolean>} */ (new Map());
    this.doneOpen = /** @type {Set<string>} */ (new Set());
    /** 项目：人点过的展开、收起（这个标签页里记着；没点过的照里面有没有在跑的）；刚点的那一个（画完缓过去）；菜单里点了一下「删除项目」的 */
    this.projectOpen = /** @type {Map<string, boolean>} */ (new Map());
    this.armed = /** @type {string|null} */ (null);
    /** 会话的菜单翻到了「移到项目」那一页 */
    this.moving = false;
    this.on = on;
    this.dot = h('i.status-dot.is-connecting');
    this.status = h('span', t('status.connecting'));
    this.items = h('div.session-items');
    /** 选中的那一块底：会话表里单独一层，换会话时从原来那一项滑过去（蓝图「左栏」的「选中的」） */
    this.pill = h('i.session-pill', { 'aria-hidden': 'true' });
    this.themeButton = h('button.icon-button', { type: 'button', onclick: on.theme });
    /** 底下一行换主题左边：挂载位 `sidebar.actions` 里挂的按钮（设置这类，`ui/app.js` 画进来） */
    this.actions = h('span.sidebar-slot');
    this.groupTitle = h('span', t('sidebar.sessions'));
    this.groupTools = h('span.session-group-tools');
    /** 收起了的几栏（置顶、项目、会话；这台设备上记着，2026-10-19 项目主人：三栏都能收起） @type {Set<string>} */
    this.folded = new Set([].concat(on.prefs?.get(FOLDED, []) ?? []).filter((x) => typeof x === 'string'));
    /** 三栏的头（栏头不带图标，2026-10-19 项目主人）：点了收起、展开，箭头悬停才露；「会话」那一栏的头多选时写「已选 N 个」、换成全选、删除、退出 */
    this.groupHeader = sectionHead(this, 'sessions', this.groupTitle, this.groupTools);
    this.pinnedHeader = sectionHead(this, 'pin', h('span', t('sidebar.pinned')), null);
    // 终端集成开的会话（核心 8-33 四补的 `origin: "terminal"`）：「会话」那一栏最后单成一组「终端集成」（2026-10-22 项目主人：放在「近 30 天」下面、
    // 「查看全部」上面，原来单开一栏；栏头同别的栏，悬停露箭头、点了收起）
    this.terminalHeader = sectionHead(this, 'terminal', h('span', t('sidebar.terminal')), null);
    this.projectsHeader = sectionHead(this, 'projects', h('span', t('sidebar.projects')), h('span.session-group-tools',
      h('button.icon-button.session-group-button.is-select', { type: 'button', title: t('sidebar.new_project'), 'aria-label': t('sidebar.new_project'), onclick: () => on.editProject(null) }, icon('plus'))));
    /** 「会话」那一栏里按时间分的几组的头（蓝图「会话整理和项目」第 2 条）：近 7 天、近 30 天、30 天前；「最近」那一组不另画头，就是「会话」那一栏的头 */
    this.timeHeaders = new Map(TIME_GROUPS.map((g) => [g, h('div.session-group-header.is-time', { dataset: { key: `group:${g}` } }, h('span', t(`sidebar.groups.${g}`)))]));
    /** 头上的交互区（2026-10-19 项目主人照 Claude 的左栏）：新建会话、全部会话、项目（核心有项目才有）；全部会话那一页开着时那一行亮着 */
    const navRow = (/** @type {string} */ name, /** @type {string} */ label, /** @type {() => void} */ run, /** @type {string} */ key) =>
      h('button.sidebar-nav-row', { type: 'button', dataset: { nav: key }, onclick: run }, icon(name), h('span', label));
    this.navProjects = navRow('folder', t('sidebar.projects'), () => on.viewProjects(), 'projects');
    this.nav = h('nav.sidebar-nav',
      navRow('plus', t('sidebar.new_session_nav'), () => on.newSession(), 'new'),
      navRow('messages-square', t('sidebar.all_sessions_nav'), () => on.viewAll(), 'sessions'),
      this.navProjects);
    /** 左上角的头像、名字：正在看的会话用的人格（`setLook`），点了打开这个人格的编辑页 */
    this.face = h('span.brand-face');
    this.name = h('strong');
    this.identity = h('button.brand-identity', { type: 'button', onclick: () => on.identity?.() },
      this.face, h('div', this.name, h('span', this.dot, this.status)));
    this.setLook(null);
    this.el = h('aside.sidebar',
      // 最左边给开关留的位置：开关只有一个，钉在整页左上角（`app.js` 的 `.sidebar-toggle`），左栏在它底下滑进滑出（2026-10-16 项目主人照 Claude）
      h('header.brand-row',
        h('span.brand-toggle-slot', { 'aria-hidden': 'true' }),
        this.identity,
        h('button.icon-button.sidebar-close', { type: 'button', title: t('sidebar.collapse'), onclick: on.close }, icon('x'))),
      this.nav,
      h('nav.session-list', h('div.session-track', this.pill, this.items)),
      h('footer.sidebar-footer', h('div.sidebar-actions', this.actions, this.themeButton)));
    this.timer = 0;
    /** 开着菜单的那个会话；没开是 `null`。 */
    this.menuFor = /** @type {string|null} */ (null);
    /** 上一次画的：一样的不重画（流式的字每来一段都会叫一次），开着的菜单、悬停不被打断。 */
    this.drawn = '';
    /** @type {[Item[], string|null]} */
    this.last = [[], null];
    this.drawThemeButton();
    this.drawGroup();
    // 左栏宽了窄了（窄屏的抽屉、改窗口）：那一块跟着这一项的宽
    new ResizeObserver(() => this.placePill()).observe(this.items);
    // 拖会话：放到置顶那一栏置顶，拖回下面取消置顶（`sidebar-drag.js`）
    this.list = /** @type {HTMLElement|null} */ (this.items.closest('.session-list'));
    new SessionDrag(this);
    // 点外面、按 Esc 关上菜单；没开菜单时 Esc 出多选
    document.addEventListener('click', (e) => {
      const target = /** @type {Element} */ (e.target);
      if (this.menuFor && !target.closest?.('.session-menu, .session-menu-button')) this.toggleMenu(null);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.menuFor) this.toggleMenu(null);
      else if (this.selecting) this.select(false);
    });
  }

  /** 全部会话那一页开着哪一页（`null` 是关着）：头上交互区那一行亮着。 @param {'sessions'|'projects'|null} view */
  setPage(view) {
    for (const row of this.nav.querySelectorAll('.sidebar-nav-row')) row.classList.toggle('is-on', /** @type {HTMLElement} */ (row).dataset.nav === view);
  }

  /** 连接的状态：在线、连接中、离线（圆点的颜色照它，蓝图「左栏」的「状态」）。 */
  /**
   * 左上角照会话用的人格画（2026-10-10 项目主人：和对话区她那一轮的头像同步，点了直接开编辑卡片）：有头像的画头像，没有的画名字的第一个
   * 字。无人格的会话不画头像，名称写「Miyu」（`resources/persona.json` 的名字），不能点（同一天项目主人选的）；人格还不知道的时候也这样。
   * @param {import('./chat.js').Look|null} look
   */
  setLook(look) {
    // 没有头像的人格只写名字（2026-10-20 项目主人：明明没设头像却有头像——原来画名字的第一个字）
    this.face.hidden = !look?.avatar;
    this.identity.disabled = !look;
    if (!look) {
      replace(this.face);
      this.name.textContent = res.persona.name;
      this.identity.removeAttribute('title');
      return;
    }
    replace(this.face, look.avatar ? h('img.brand-avatar', { src: look.avatar, alt: '' }) : null);
    this.name.textContent = look.name;
    this.identity.title = t('sidebar.edit_persona');
  }

  setStatus(status) {
    this.dot.className = `status-dot is-${status}`;
    this.status.textContent = t(`status.${status}`);
  }

  /** 换主题的按钮：深色时画太阳、浅色时画月亮（照旧版 `app.js:684`）。 */
  drawThemeButton() {
    const dark = this.on.dark();
    replace(this.themeButton, icon(dark ? 'sun' : 'moon'));
    this.themeButton.title = t(dark ? 'sidebar.theme_to_light' : 'sidebar.theme_to_dark');
  }

  /** 「会话」那一栏的头：平常右边一个多选按钮，指针移上去才露（全部会话在头上的交互区）；多选时换成「已选 N 个」和全选、删除、退出（位置不动）。 */
  drawGroup() {
    const button = (name, label, run, cls = '', disabled = false) =>
      h(`button.icon-button.session-group-button${cls}`, { type: 'button', title: label, 'aria-label': label, disabled, onclick: run }, icon(name));
    this.groupTitle.textContent = this.selecting ? t('sidebar.selected', { count: this.selected.size }) : t('sidebar.sessions');
    // 全选、删除照多选时能勾的（「会话」那一栏的：不在项目里、没置顶的）
    const known = new Set(this.on.projects().list.map((p) => p.project));
    const order = this.last[0].filter((it) => !it.pinned && !(this.on.projects().supported && it.project && known.has(it.project))).map((it) => it.session);
    replace(this.groupTools, this.selecting
      ? [button('check-check', t('sidebar.select_all'), () => { this.selected = new Set(order); this.render(...this.last); }),
        button('trash-2', t('sidebar.delete'), () => this.removeAll(order.filter((id) => this.selected.has(id))), '.is-danger', this.selected.size === 0),
        button('x', t('sidebar.select_exit'), () => this.select(false))]
      : [button('list-checks', t('sidebar.select'), () => this.select(true), '.is-select')]);
    this.el.classList.toggle('is-selecting', this.selecting);
  }

  /**
   * 画会话表。
   * @param {Item[]} items 顶层的会话，照先后，新的在前
   * @param {string|null} current 正在看的会话（可以是子代理的）
   */
  render(items, current) {
    this.last = [items, current];
    // 有行在收（删除的动画）：先记着，收完再画
    if (this.leaving) return;
    const kept = items.filter((it) => !this.removing.has(it.session));
    // 项目（核心有项目、有项目、不在多选时；2026-10-19 项目主人：没有项目时不显示「项目」那一栏）：项目里的会话在它的项目下面，不在下面「会话」那一栏里；
    // 不认得的项目（刚删掉的）的照不在项目里
    const projects = this.on.projects();
    const showProjects = projects.supported && projects.list.length > 0;
    const known = new Set(projects.list.map((p) => p.project));
    const inProject = (/** @type {any} */ it) => projects.supported && !!it.project && known.has(it.project);
    this.navProjects.hidden = !projects.supported;
    // 置顶的单开一栏、全部露出；别的顶层最多露几个，正在看的不在里面的排在最后照样露（多选时全列，才勾得到）。
    // 多选在原地（2026-10-19 项目主人）：「置顶」「项目」两栏照旧，只有「会话」那一栏的行换成勾选框（项目里的、置顶的不勾）
    const pinned = kept.filter((it) => it.pinned);
    const loose = kept.filter((it) => !it.pinned && !inProject(it));
    // 终端开的（置顶了的、移进项目的照人挪的）：下面「终端」那一栏，照最近活动、不分时间组，同样最多露几个
    const fromTerminal = (/** @type {any} */ it) => it.origin === 'terminal';
    const rest = loose.filter((it) => !fromTerminal(it));
    const terminal = loose.filter(fromTerminal);
    const cap = this.selecting ? { shown: rest, more: false } : capTops(rest, pinned.some((it) => it.session === current) ? null : current, res.layout.sidebar_rows);
    const termCap = capTops(terminal, current, res.layout.sidebar_rows);
    const perProject = showProjects ? projectRows(kept, projects.list) : new Map();
    const tops = [...pinned, ...[...perProject.values()].flat(), ...cap.shown, ...termCap.shown];
    if (this.menuFor && !this.menuFor.startsWith('project:') && !tops.some((it) => it.session === this.menuFor)) this.menuFor = null;
    if (this.menuFor?.startsWith('project:') && !known.has(this.menuFor.slice(8))) this.menuFor = null;
    if (!this.menuFor) this.moving = false;
    if (!this.menuFor?.startsWith('project:')) this.armed = null;
    // 别处删掉了的不再勾着
    for (const id of [...this.selected]) if (!tops.some((it) => it.session === id)) this.selected.delete(id);
    // 多选时只列顶层的；平常照树排
    const tree = (list) => treeRows(list, (id) => this.on.kids(id), { current, open: this.openTree, done: this.doneOpen });
    const pinnedRows = pinned.length ? tree(pinned) : [];
    // 一个项目一块：收着的、里面有在跑的写 `(N)`；默认有在跑的、正在看的在里面的展开（同子代理的树），人点过的照人点的
    const topOf = current ? pathOf(current, (id) => this.on.parentOf?.(id) ?? null)[0] : null;
    const blocks = showProjects ? projects.list.map((p) => {
      const list = perProject.get(p.project) ?? [];
      const count = list.reduce((n, it) => n + (it.running ? 1 : 0) + this.busyBelow(it.session), 0);
      const here = !!topOf && kept.some((it) => it.session === topOf && it.project === p.project);
      const open = this.projectOpen.get(p.project) ?? (count > 0 || here);
      // 收着的也画着里面的会话（藏在收起来的那一截里）：展开、收起只在原地换样子，高度缓过去，中途重画也不打断（2026-10-19 项目主人：收起动画有问题）
      return { project: p, open, count, rows: tree(list) };
    }) : [];
    // 「会话」那一栏照时间分组：「最近」那一组没有自己的头（就是这一栏的头），别的一组一个头，组里照树排；多选时只列顶层的、能勾
    const flat = (/** @type {any[]} */ list) => list.map((it) => ({ kind: /** @type {const} */ ('session'), session: it.session, depth: 0, item: it, hasKids: false, open: false, pick: true }));
    const groups = byTime(cap.shown, Date.now()).map((g) => ({ group: g.group, rows: this.selecting ? flat(g.rows) : tree(g.rows) }));
    const termRows = termCap.shown.length ? tree(termCap.shown) : [];
    const rows = [...pinnedRows, ...blocks.flatMap((b) => b.rows), ...groups.flatMap((g) => g.rows), ...termRows];
    const sig = JSON.stringify([rows, groups.map((g) => [g.group, g.rows.length]), blocks.map((b) => [b.project, b.count, b.rows.length]), showProjects,
      current, this.menuFor, this.moving, this.renaming, this.selecting, [...this.selected], cap.more, termCap.more, this.on.dark()]);
    if (sig !== this.drawn) {
      this.drawn = sig;
      const all = cap.more || termCap.more ? h('button.session-all', { type: 'button', onclick: () => this.on.viewAll() }, t('sidebar.view_all')) : null;
      const draw = (row) => (row.kind === 'session' ? this.item(row, row.session === current) : this.doneRow(row));
      const was = this.positions();
      const bar = {
        menuFor: this.menuFor, armed: this.armed, dark: this.on.dark(), draw, on: this.on,
        toggleMenu: (/** @type {string|null} */ key) => this.toggleMenu(key),
        flip: (/** @type {string} */ id, /** @type {boolean} */ open) => this.flipProject(id, open),
        // 删除项目点了：这个菜单收起，再弹出一个问一句的小菜单（2026-10-19 项目主人：要有第二个菜单当反馈，但要流畅地出来，原来像卡了）
        arm: (/** @type {string} */ id) => {
          const open = this.items.querySelector('.session-menu');
          const next = () => { this.armed = id; this.drawn = ''; this.render(...this.last); };
          if (open instanceof HTMLElement) leave(open, next);
          else next();
        },
      };
      // 一栏一块：头、下面收起来的那一截；整块是放得下会话的一块（拖会话，`sidebar-drag.js` 照 `data-zone`，亮的时候整块亮）
      const section = (/** @type {string} */ key, /** @type {HTMLElement} */ head, /** @type {(Node|null)[]} */ body, /** @type {string|null} */ zone) =>
        h(`div.sb-section${this.folded.has(key) && !(this.selecting && key === 'sessions') ? '.is-folded' : ''}`, { dataset: { section: key, ...(zone ? { zone } : {}) } },
          head, h('div.sb-section-body', h('div.sb-section-inner', body)));
      const sessionsBody = groups.length
        ? groups.flatMap((g) => [g.group === 'recent' ? null : this.timeHeaders.get(g.group) ?? null, ...g.rows.map(draw)])
        : rows.slice(pinnedRows.length + blocks.reduce((n, b) => n + b.rows.length, 0), rows.length - termRows.length).map(draw);
      replace(this.items, [
        pinned.length ? section('pin', this.pinnedHeader, pinnedRows.map(draw), 'pin') : null,
        showProjects ? section('projects', this.projectsHeader, blocks.map((b) => projectBlock(bar, b)), null) : null,
        section('sessions', this.groupHeader, [...sessionsBody, termRows.length ? section('terminal', this.terminalHeader, termRows.map(draw), null) : null, all], 'loose'),
      ]);
      this.slide(was);
      this.placeMenu();
      this.drawGroup();
      this.placePill();
      // 露出来的子代理：读进它们的会话，才知道下面还挂了几个
      this.on.shown(rows.flatMap((r) => (r.kind === 'session' && r.depth > 0 ? [r.session] : [])));
    }
    this.spin();
  }

  /**
   * 收起、展开一栏（点栏头）：当场换（高度缓过去，`.sb-section-body` 的 `grid-template-rows`），记在这台设备上。多选时不收。
   * @param {string} key
   */
  fold(key) {
    if (this.selecting && key === 'sessions') return;
    if (this.folded.has(key)) this.folded.delete(key);
    else this.folded.add(key);
    this.on.prefs?.set(FOLDED, [...this.folded]);
    const el = this.items.querySelector(`.sb-section[data-section="${key}"]`);
    if (el instanceof HTMLElement) foldAnim(el, /** @type {HTMLElement} */ (el.querySelector(':scope > .sb-section-body')), !this.folded.has(key), 'is-folded', true, this.list);
    // 选中的那一块跟着这一项露没露（重画时照 `folded` 画，不用另记）
    this.placePill(true);
    setTimeout(() => this.placePill(), res.layout.sidebar_move_ms + 20);
  }

  /**
   * 展开、收起一个项目（点那一行）：原地换样子，里面那一块的高度缓过去（`.project-kids` 的 `grid-template-rows`）；人点过的记着（这个标签页）。
   * @param {string} id @param {boolean} open
   */
  flipProject(id, open) {
    this.projectOpen.set(id, open);
    const el = this.items.querySelector(`.project[data-project="${CSS.escape(id)}"]`);
    if (!(el instanceof HTMLElement)) return this.render(...this.last);
    foldAnim(el, /** @type {HTMLElement} */ (el.querySelector(':scope > .project-kids')), open, 'is-open', false, this.list);
    el.querySelector('.project-row .session-item-main')?.setAttribute('aria-expanded', String(open));
    this.placePill(true);
    setTimeout(() => this.placePill(), res.layout.sidebar_move_ms + 20);
  }

  /** 一个会话下面（一层层往下）在跑的子代理有几个（项目收着时名字前面的 `(N)`）。 @param {string} id */
  busyBelow(id, seen = new Set([id])) {
    return this.on.kids(id).reduce((n, k) => {
      if (seen.has(k.session)) return n;
      seen.add(k.session);
      return n + (k.running ? 1 : 0) + this.busyBelow(k.session, seen);
    }, 0);
  }

  /** 表里每一行（会话、栏头、项目）现在在哪：换先后以前记下，画完照它滑。 */
  positions() {
    const out = new Map();
    for (const el of this.items.querySelectorAll('[data-session], [data-key]')) {
      const key = el instanceof HTMLElement ? el.dataset.session ?? el.dataset.key : null;
      if (key && !out.has(key)) out.set(key, /** @type {HTMLElement} */ (el).offsetTop);
    }
    return out;
  }

  /**
   * 换了先后（置顶、取消置顶、移进项目，照最近活动重排）：只有真换了位置的行从原来的位置滑到新位置（先后照旧、只是因为上面多了、少了一行才挪的
   * 不滑，直接到位：2026-10-19 项目主人：拖进置顶时项目里的会话也跟着动），新出来的淡入（「置顶」那一栏刚出来的栏头从上面落 3px）。减少动画的不滑。
   * @param {Map<string, number>} was
   */
  slide(was) {
    if (!was.size || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ms = res.layout.sidebar_move_ms;
    const easing = 'cubic-bezier(0.2, 0, 0, 1)';
    /** @type {[HTMLElement, string][]} */
    const now = [];
    const seen = new Set();
    for (const el of this.items.querySelectorAll('[data-session], [data-key]')) {
      if (!(el instanceof HTMLElement) || el.closest('.is-folded, .project:not(.is-open) .project-kids')) continue;
      const key = el.dataset.session ?? el.dataset.key;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      now.push([el, key]);
    }
    // 原来、现在都在的那些里，先后没变的最长一串不动
    const before = [...was.entries()].sort((x, y) => x[1] - y[1]).map(([k]) => k).filter((k) => seen.has(k));
    const after = now.map(([, k]) => k).filter((k) => was.has(k));
    const still = steady(before, after);
    for (const [el, key] of now) {
      const from = was.get(key);
      if (from == null) {
        el.animate(key === 'group:pin' ? [{ opacity: 0, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing });
      } else if (!still.has(key) && from !== el.offsetTop) {
        el.animate([{ transform: `translateY(${from - el.offsetTop}px)` }, { transform: 'none' }], { duration: ms, easing });
      }
    }
  }

  /**
   * 选中的那一块挪到正在看的那一项底下：原来就露着的滑过去，原来没露的直接放到位再淡入；正在看的不在表里的淡出。位置照
   * `offset*`（整页放大后的 CSS 像素），和这一项一样大。
   */
  placePill(instant = false) {
    const row = this.items.querySelector('.session-item.is-active');
    const pill = this.pill;
    // 收着的那一栏、收着的项目里的不露；刚收进去的当场拿掉，不在原地淡出（2026-10-19 项目主人：收起后原地留一块底）
    if (!(row instanceof HTMLElement) || this.selecting || row.closest('.is-folded, .project:not(.is-open)')) {
      if (instant) pill.classList.add('is-gone');
      pill.classList.remove('is-on');
      if (instant) requestAnimationFrame(() => pill.classList.remove('is-gone'));
      return;
    }
    const was = pill.classList.contains('is-on');
    pill.classList.toggle('is-moving', was);
    Object.assign(pill.style, { transform: `translate(${row.offsetLeft}px, ${row.offsetTop}px)`, width: `${row.offsetWidth}px`, height: `${row.offsetHeight}px` });
    pill.classList.add('is-on');
  }

  /**
   * 一项：记号、标题（改名时是一个输入框）；右边三个点，开着菜单的接着画菜单。子代理的缩进；顶层有子代理的，记号那一格上面
   * 一个展开的箭头；子代理下面还有的，标题前面一个 `(N)`（指针移上去换成箭头）。多选时记号那一格是勾选框。
   * @param {{session: string, depth: number, item: any, hasKids: boolean, open: boolean, kidCount?: number, busy?: boolean, last?: boolean, guides?: boolean[]}} row
   * @param {boolean} active
   */
  item(row, active) {
    const it = row.item;
    const id = it.session;
    const title = it.title ?? t('sidebar.untitled');
    const style = `--depth: ${row.depth}`;
    // 多选时「会话」那一栏的行换成勾选框（`pick`），「置顶」「项目」两栏的照常
    if (this.selecting && row.pick) {
      const on = this.selected.has(id);
      return h(`div.session-item.is-selecting${on ? '.is-selected' : ''}${active ? '.is-active' : ''}`, { dataset: { session: id } },
        h('button.session-item-main', { type: 'button', title, 'aria-pressed': String(on), onclick: (e) => this.pick(id, e.shiftKey) },
          h('span.session-lead.session-check', icon(on ? 'square-check' : 'square')),
          h('span.session-copy', h('strong', title))));
    }
    if (this.renaming === id) return this.renameRow(it, title, active, style);
    const open = this.menuFor === id;
    const flip = () => { this.openTree.set(id, !row.open); this.render(...this.last); };
    const foldLabel = t(row.open ? 'sidebar.fold' : 'sidebar.unfold');
    // 顶层：展开、收起整棵的箭头在记号那一格上面（在跑、没看过的照旧转圈、圆点，指针移上去才换成它）
    const fold = row.hasKids && !row.depth
      ? h(`button.session-fold${row.open ? '.is-open' : ''}`, { type: 'button', title: foldLabel, 'aria-expanded': String(row.open), onclick: flip }, icon('chevron-right'))
      : null;
    // 子代理下面还有的：标题前面 `(N)`（在跑的几个），指针移上去换成箭头（点它开、关，不进会话）；一个都没在跑的一直露着箭头
    const kids = row.hasKids && row.depth
      ? h(`span.session-kids${row.open ? '.is-open' : ''}${row.kidCount ? '' : '.is-bare'}`, {
        role: 'button', tabindex: '0', title: foldLabel, 'aria-expanded': String(row.open),
        onclick: (e) => { e.stopPropagation(); flip(); },
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); flip(); } },
      }, row.kidCount ? h('span.session-kids-count', t('sidebar.kids', { count: row.kidCount })) : null, h('span.session-kids-arrow', icon('chevron-right')))
      // 顶层收着的：只写个数（开关是记号那一格上的箭头）
      : row.kidCount ? h('span.session-count', t('sidebar.kids', { count: row.kidCount })) : null;
    const marker = row.busy && !it.running ? h('span.session-lead.session-run-spinner.is-kids', frameNow()) : row.depth ? childLead(it, row.depth, active) : lead(it);
    const quiet = !marker.childElementCount && !marker.textContent;
    const cls = `${active ? '.is-active' : ''}${open ? '.is-menu-open' : ''}${row.depth ? '.is-child' : ''}${row.hasKids ? '.has-kids' : ''}${row.open ? '.is-open' : ''}${quiet ? '.is-quiet' : ''}`;
    return h(`div.session-item${cls}`, { dataset: { session: id }, style },
      treeLines(row),
      fold,
      h('button.session-item-main', { type: 'button', title, onclick: () => { this.menuFor = null; this.on.open(id); } },
        marker,
        h('span.session-copy', kids, h('strong', title))),
      h('span.session-trailing',
        h('button.session-menu-button', {
          type: 'button', title: t('sidebar.menu'), 'aria-haspopup': 'menu', 'aria-expanded': String(open),
          onclick: () => this.toggleMenu(open ? null : id),
        }, icon('ellipsis-vertical'))),
      open ? (this.moving ? this.moveMenu(it) : menu([
        // 置顶只有顶层会话有（蓝图「左栏」菜单）
        ...(row.depth ? [] : [[t(it.pinned ? 'sidebar.unpin' : 'sidebar.pin'), false, () => this.on.pin(id, !it.pinned)]]),
        // 移到项目（核心有项目、有项目、顶层会话才有；蓝图「会话整理和项目」第 5 条）：翻到一个项目一行的那一页；在项目里的多「移出项目」
        ...(!row.depth && this.on.projects().supported && this.on.projects().list.length
          ? [[t('sidebar.move_to_project'), false, () => { this.moving = true; this.render(...this.last); }, true]] : []),
        ...(!row.depth && it.project && this.on.projects().supported ? [[t('sidebar.move_out'), false, () => this.on.place(id, { project: null })]] : []),
        [t('sidebar.copy_id'), false, () => this.on.copyId(id)],
        [t('sidebar.rename'), false, () => this.startRename(id)],
        [t('sidebar.delete'), true, () => this.removeAll([id])],
      ], () => this.toggleMenu(null))) : null);
  }

  /**
   * 会话的菜单翻到「移到项目」：顶上一行返回，下面一个项目一行（项目颜色的文件夹加名字），在的那个写「（在这里）」灰着。移进去同时取消置顶。
   * @param {any} it
   */
  moveMenu(it) {
    const back = h('button.session-menu-back', { type: 'button', onclick: () => { this.moving = false; this.render(...this.last); } }, icon('chevron-left'), h('span', t('sidebar.move_to_project')));
    const dark = this.on.dark();
    return h('div.session-menu.is-projects', { role: 'menu' }, back, this.on.projects().list.map((p) => {
      const here = it.project === p.project;
      const color = colorOf(p.color, dark);
      return h('button.session-menu-project', {
        type: 'button', role: 'menuitem', disabled: here, style: color ? `--project-color: ${color}` : null,
        onclick: () => { this.toggleMenu(null); this.on.place(it.session, { project: p.project, ...(it.pinned ? { pinned: false } : {}) }); },
      }, icon('folder'), h('span', here ? t('sidebar.here', { name: p.name }) : p.name));
    }));
  }

  /** 「已完成 N 个」：一层里结束了的收成这一行，点了列出来、再点收起。 */
  doneRow(row) {
    return h('div.session-done-row', { style: `--depth: ${row.depth}` },
      treeLines(row),
      h(`button.session-done${row.open ? '.is-open' : ''}`, {
        type: 'button', 'aria-expanded': String(row.open),
        onclick: () => {
          if (row.open) this.doneOpen.delete(row.parent);
          else this.doneOpen.add(row.parent);
          this.render(...this.last);
        },
      }, h('span.session-done-mark', icon('check')), t('sidebar.done_kids', { count: row.count }), h('span.session-done-arrow', icon('chevron-right'))));
  }

  /**
   * 改名那一项：标题换成一个输入框，原来的标题填好、全选。`Enter` 改（空着的是去掉标题），`Esc`、点别处不改
   * （蓝图「左栏」的「重命名」）。输入框跨重画留着同一个，打了一半的字不丢。
   */
  renameRow(it, title, active, style) {
    if (!this.renameInput || this.renameInput.dataset.session !== it.session) {
      const input = /** @type {HTMLInputElement} */ (h('input.session-rename', { type: 'text', value: it.title ?? '', 'aria-label': t('sidebar.rename'), dataset: { session: it.session } }));
      let done = false;
      const finish = (commit) => {
        if (done) return;
        done = true;
        this.renaming = null;
        this.renameInput = null;
        if (commit) this.on.rename(it.session, input.value);
        this.render(...this.last);
      };
      input.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      });
      input.addEventListener('blur', () => finish(false));
      this.renameInput = input;
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    }
    return h(`div.session-item.is-renaming${active ? '.is-active' : ''}`, { dataset: { session: it.session }, style },
      h('div.session-item-main', lead(it), this.renameInput));
  }

  /** 菜单里点「重命名」：标题换成输入框。 */
  startRename(id) {
    this.renaming = id;
    this.menuFor = null;
    this.render(...this.last);
  }

  /** 开、关菜单（`null` 是关）。 */
  toggleMenu(id) {
    const open = this.items.querySelector('.session-menu');
    this.menuFor = id;
    // 关上：往上收回、淡出，走完再重画（蓝图「动效」）；开另一个的直接换
    // 收完直接拿掉：这时候可能正在删会话、不重画（删除项目时菜单原来收完又露出来，抖一下）
    if (id === null && open instanceof HTMLElement) leave(open, () => { open.remove(); this.render(...this.last); });
    else this.render(...this.last);
  }

  /** 进、出多选：出来时勾的都清掉。 */
  select(on) {
    this.selecting = on;
    this.selected = new Set();
    this.anchor = null;
    this.menuFor = null;
    this.renaming = null;
    this.render(...this.last);
    this.drawGroup();
  }

  /** 点一项：勾上、去掉；`Shift` 点把上一次点的和这一项之间的都勾上。 */
  pick(id, shift) {
    const known = new Set(this.on.projects().list.map((p) => p.project));
    const order = this.last[0].filter((it) => !it.pinned && !(this.on.projects().supported && it.project && known.has(it.project))).map((it) => it.session);
    this.selected = shift ? range(this.selected, order, this.anchor, id) : toggle(this.selected, id);
    this.anchor = id;
    this.render(...this.last);
  }

  /**
   * 删（菜单里删一个、多选删几个）：不问，一点就开始收——这几项一起往左淡出、收起高度，同时照先后请核心删；动画走完直接
   * 拿掉。删成的从会话表里拿掉，没删成的画回来、仍勾着。多选时一个都不剩了退出多选。
   * @param {string[]} ids
   */
  async removeAll(ids) {
    if (!ids.length) return;
    if (this.menuFor) this.toggleMenu(null);
    // 多选时点删除：多选当场退出（勾选框换回记号），同时这几项开始收（蓝图「批量删除」）
    if (this.selecting) this.select(false);
    for (const id of ids) this.removing.add(id);
    // 收的这一会儿不重画（2026-10-19 项目主人：删会话的动画会闪、会卡）：原来菜单收起、推送来了都会整个重画，正在收的那一行当场没了，下面的跳上来
    this.leaving += 1;
    const gone = Promise.all(ids.map((id) => new Promise((resolve) => {
      const el = this.items.querySelector(`[data-session="${CSS.escape(id)}"]`);
      if (el instanceof HTMLElement) leave(collapsing(el), () => { el.remove(); resolve(undefined); });
      else resolve(undefined);
    })));
    const done = await this.on.removeMany(ids);
    await gone;
    this.leaving -= 1;
    for (const id of ids) this.removing.delete(id);
    for (const id of done) {
      this.selected.delete(id);
      this.on.dropped(id);
    }
    if (this.selecting && !this.selected.size) this.select(false);
    this.drawn = '';
    this.render(...this.last);
  }

  /**
   * 删项目（连里面的会话）的动画（2026-10-19 项目主人：确认删除以后菜单和项目那一块都没有动画）：菜单先收（`toggleMenu` 走完退场），再整块项目照删会话的样子
   * 往左淡出、收起高度；这期间 `run` 删会话、删项目，收的时候不重画，都完了再画。交回删成的会话。
   * @param {string} id @param {() => Promise<string[]>} run
   */
  async removeProject(id, run) {
    this.leaving += 1;
    let done = /** @type {string[]} */ ([]);
    try {
      const working = run();
      // 等菜单收完（退场 0.12 秒左右）再收项目那一块：一个接一个，不叠在一起
      await new Promise((r) => setTimeout(r, 140));
      // 删的是最后一个项目：「项目」那一栏整栏一起收（不然删完那一栏的头一下子没了）
      const block = this.items.querySelector(`.project[data-project="${CSS.escape(id)}"]`);
      const only = this.items.querySelectorAll('.project').length === 1;
      const el = only ? block?.closest('.sb-section') ?? block : block;
      const gone = new Promise((resolve) => {
        if (el instanceof HTMLElement) leave(collapsing(el), () => { el.remove(); resolve(undefined); });
        else resolve(undefined);
      });
      done = await working;
      await gone;
    } finally {
      this.leaving -= 1;
    }
    for (const sid of done) this.on.dropped(sid);
    this.drawn = '';
    this.render(...this.last);
    return done;
  }

  /** 会话表底下放不下的，菜单往上开（照旧版 `app.js:2466-2470`）。 */
  placeMenu() {
    const m = this.items.querySelector('.session-menu');
    const box = this.list ?? this.items.parentElement;
    if (!m || !box) return;
    // 下面放不下、上面放得下才往上开：左栏能滚的那一层顶上是交互区，往上开放不下的会被它盖住、点不到
    const r = m.getBoundingClientRect();
    const view = box.getBoundingClientRect();
    const row = /** @type {HTMLElement} */ (m.parentElement).getBoundingClientRect();
    if (r.bottom > view.bottom - 4 && row.top - r.height - 4 >= view.top) m.classList.add('open-up');
  }

  /** 有会话在跑就走表，没有就停。 */
  spin() {
    const running = this.items.querySelector('.session-run-spinner');
    if (running && !this.timer) this.timer = window.setInterval(() => this.tick(), res.layout.session_spinner_ms);
    if (!running && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
    this.tick();
  }

  tick() {
    const frame = frameNow();
    for (const el of this.items.querySelectorAll('.session-run-spinner')) el.textContent = frame;
  }
}

/** 这一刻该是哪一帧：照墙上的钟算，所有转圈同一帧。 */
function frameNow() {
  const frames = res.layout.session_spinner;
  return frames[Math.floor(Date.now() / res.layout.session_spinner_ms) % frames.length];
}

/**
 * 会话的菜单：一项一个按钮，危险的红；点了先关菜单再做。
 * @param {[string, boolean, () => void, boolean?][]} actions 字、是不是危险的、做什么、点了留着菜单
 */
function menu(actions, close) {
  // 第四格是真的：点了不关菜单（翻到下一页）
  return h('div.session-menu', { role: 'menu' }, actions.map(([label, danger, run, keep]) =>
    h(`button${danger ? '.is-danger' : ''}`, { type: 'button', role: 'menuitem', onclick: (e) => { if (keep) { e.stopPropagation(); run(); return; } close(); run(); } }, label)));
}

/** 要收掉的一项：记下它现在多高，退场动画照它把高度收成 0（`sidebar.css` 的 `item-out`，蓝图「动效」）。 */
function collapsing(el) {
  el.style.setProperty('--h', `${el.offsetHeight}px`);
  return el;
}

/** 记号那一格：在跑的转圈，没看过的一个圆点，别的空着（在跑的优先）。 */
function lead(it) {
  if (it.running) return h('span.session-lead.session-run-spinner', frameNow());
  if (it.unread) return h('span.session-lead', h('i.session-unread-dot'));
  return h('span.session-lead');
}

/** 子代理的记号：在跑的转圈，停在半路的暂停；别的第一层是机器人，再往下是空心的圆（正在看的实心）。 */
function childLead(it, depth, active) {
  if (it.running) return h('span.session-lead.session-run-spinner', frameNow());
  if (it.paused) return h('span.session-lead.session-paused', { title: t('sidebar.paused') }, icon('circle-pause'));
  if (depth > 1) return h('span.session-lead.session-node', h(`i${active ? '.is-on' : ''}`));
  return h('span.session-lead.session-bot', icon('bot'));
}

/**
 * 文件树那样的线（蓝图「子代理的会话」）：上面几层还没完的，各画一根竖线穿过这一行；自己这一层一段竖线接到上一行，再一小段横线
 * 接到记号，是这一层最后一个的竖线只画到中间（`└`），不是的画到底（`├`）。顶层不画。
 */
function treeLines(row) {
  if (!row.depth) return null;
  const guides = (row.guides ?? []).map((on, i) => (on ? h('i.tree-guide', { style: `--level: ${i + 1}` }) : null));
  return h('span.tree-lines', { 'aria-hidden': 'true' }, ...guides, h(`i.tree-elbow${row.last ? '.is-last' : ''}`, { style: `--level: ${row.depth}` }));
}

/**
 * 两串编号里先后没变的最长一串（最长公共子序列），换先后时这些行不滑。
 * @param {string[]} a @param {string[]} b @returns {Set<string>}
 */
function steady(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = new Set();
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) {
      out.add(a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/**
 * 一栏、一个项目展开、收起的动画（2026-10-19 项目主人：「会话」那一栏和「置顶」的动画完全不一样）：高度只缓看得见的那一截（从它的顶到左栏底边，
 * 比窗口还长的那一栏原来大半截在窗口外面缓，看着像先停一下再一下子收掉），看不见的直接到位。缓的时候裁着（`is-folding`）。减少动画的直接换。
 * @param {HTMLElement} host 收起、展开的那一块 @param {HTMLElement} body 里面那一截 @param {boolean} open 展开
 * @param {string} cls 照它换样子的类 @param {boolean} clsMeansFolded 这个类是收着（`is-folded`）还是开着（`is-open`）
 * @param {HTMLElement|null} list 左栏能滚的那一层
 */
function foldAnim(host, body, open, cls, clsMeansFolded, list) {
  const apply = () => host.classList.toggle(cls, clsMeansFolded ? !open : open);
  if (!body || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
  // 展开的先换成开着的样子再量（收着的时候里面那一截高是 0，原来量成 0，展开时先停一下再一下子开：2026-10-19 项目主人）；收起的先量再换。
  // 量完再裁（裁着量多出里面的外边距，缓完会跳一下）
  if (open) apply();
  // 高照 CSS 像素（`offsetHeight`）：整页放大着（`--ui-scale`），`getBoundingClientRect` 量的是放大以后的，照它缓到头会多出一截、再缩回去
  const rect = body.getBoundingClientRect();
  const full = body.offsetHeight;
  const scale = full ? rect.height / full : 1;
  const bottom = list ? list.getBoundingClientRect().bottom : innerHeight;
  const visible = Math.max(0, Math.min(full, (bottom - rect.top) / (scale || 1)));
  host.classList.add('is-folding');
  if (!open) apply();
  // 走多久照看得见的那一截多高：一大截照原来的时长缓，看着像一下子收掉（2026-10-22 项目主人：会话收起没有动画了）；曲线也缓一些，不在头几帧走完大半
  const ms = Math.min(res.layout.sidebar_move_ms * 2, Math.max(res.layout.sidebar_move_ms, visible * 0.6));
  const anim = body.animate(open ? [{ height: '0px' }, { height: `${visible}px` }] : [{ height: `${visible}px` }, { height: '0px' }],
    { duration: ms, easing: 'cubic-bezier(0.33, 0, 0.2, 1)' });
  anim.onfinish = anim.oncancel = () => host.classList.remove('is-folding');
}
