// @ts-check
//! 头这边记着的会话：会话表（核心的会话列表流，`session-index.js`）、读进来的会话手里的条目和会话状态、限额、没看过的。
//! 不是每个会话都读：正在看的、在跑的、派过子代理的（左栏要画它下面那棵树）才读、订阅（蓝图 `web.md`「连核心」第 3 条）。
//!
//! 照条目画（蓝图 `web.md`「照条目画」，核心 9-8）：读一个会话就是订阅它的视图流（`subscribe {stream: "view"}`），回应是最新一页的
//! 条目和会话状态，之后照推送改（`view.js`）；往上翻读更早的一页（`view.page {view: true}`）。正文、状态都照它，网页不再自己从事件算。
//! 展开、滚到哪这些纯界面的状态不在这里（`04-核心协议.md` P3）。

import { res } from '../util/res.js';
import { SessionIndex } from './session-index.js';
import { ProjectList } from './projects.js';
import { ViewLog, VIEW_PUSHES } from './view.js';

/**
 * @typedef {{id: string, view: ViewLog, limits: any, todos: {content: string, status: string}[],
 *   model: {ref?: string, endpoint?: string, model?: string, effort?: {level: string, from: string}}|null,
 *   first: number|null, more: boolean, paged: boolean, older: boolean, base: Base|null, gone?: boolean}} Session
 *   `first` 读进来的最早一条的序号，`more` 还有更早的（`view.page`），`paged` 往前翻过，`older` 正在读更早的一页
 */
/**
 * @typedef {{upto: number, usage: any, permission: {level: string, read_only: boolean}|null, jobs: any[]|null, workspace: {cwd: string, dirs?: string[]}|null, defaultWorkspace: string|null, compactable?: boolean|null}} Base
 *   订阅回应里「这一刻的」：累计用量、权限级别、还在跑的任务、工作区（会话状态里也有，之后照 `view.status` 换）
 */

/** 一个刚知道、还没读的会话。 @param {string} id @returns {Session} */
export function emptySession(id) {
  return { id, view: new ViewLog(), limits: {}, model: null, todos: [], first: null, more: false, paged: false, older: false, base: null };
}

export class Store {
  /** @param {import('./connection.js').Connection} conn */
  constructor(conn) {
    this.conn = conn;
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
    /** 会话表：全部会话，照核心推的跟着变 */
    this.index = new SessionIndex(conn);
    /** 项目（核心 H-1）：左栏的「项目」那一栏、全部会话的「项目」那一页照它 */
    this.projects = new ProjectList(conn);
    /** 全部会话那一页开的老会话：最近活动排不进左栏的也列上 */
    this.extra = /** @type {Set<string>} */ (new Set());
    /** 没看过的：别的会话一轮结束了（读进来的照会话状态回到 `idle`，没读的照会话表里 `busy` 去掉了） */
    this.unread = /** @type {Set<string>} */ (new Set());
    /** 正在看的会话：别的会话一轮结束了才记成没看过。 */
    this.viewing = /** @type {string|null} */ (null);
    /** 别处删掉了一个读进来的会话（不是这一页删的）：界面收掉它 @type {(id: string) => void} */
    this.removed = () => {};
    /** 排着的话被退回了（视图流推到 `withdrawn` 的那一刻）：界面把字放回输入框 @type {(session: string, text: string) => void} */
    this.withdrawn = () => {};
    /** 后台开始提前压缩了（会话状态的 `preparing` 从没有变成有，核心 6-11 三补）：界面弹一句；重新订阅换上的不算 @type {(session: string) => void} */
    this.preparing = () => {};
    this.listeners = new Set();
    /** 要人留意的（系统通知照它，蓝图「系统通知」）：一轮做完了、她在问、要人确认 @type {Set<(session: string, what: 'done'|'ask'|'approve', detail: any) => void>} */
    this.attention = new Set();
    conn.onPush((method, params) => this.push(method, params));
    this.index.on((id, before, after) => this.entryChanged(id, before, after));
    this.projects.on(() => this.changed());
  }

  /**
   * 左栏列哪些（蓝图 `web.md`「左栏」）：顶层的会话（不是一次性的、不是子会话）照最近活动的几个（`layout.json` 的 `listed_sessions`），
   * 加上置顶的、项目里的（项目展开时全部列出来）、全部会话那一页开过的；先后由界面排（`rank`）。
   */
  get order() {
    const top = this.index.all().filter((e) => !e.oneshot && !e.parent);
    const at = (e) => Date.parse(e.last_active ?? '') || 0;
    const sorted = [...top].sort((a, b) => at(b) - at(a));
    // 项目里的会话不在下面按时间的那几组里（蓝图「会话整理和项目」第 4 条），不占那几个的数
    const recent = sorted.filter((e) => !e.project).slice(0, res.layout.listed_sessions).map((e) => e.session);
    const pinned = top.filter((e) => e.pinned).map((e) => e.session);
    const inProject = sorted.filter((e) => e.project && !e.pinned).map((e) => e.session);
    return [...new Set([...recent, ...pinned, ...inProject, ...this.extra])];
  }

  /**
   * 会话表里一项变了：一轮结束了（`busy` 去掉）、你没在看的记成没看过；开始跑的顶层会话读进来（在跑的才有时间线、子代理、后台命令）；
   * 别处删掉了读进来的、不是这一页删的，交给界面收掉。
   */
  entryChanged(id, before, after) {
    if (before?.busy && !after?.busy && id !== this.viewing) this.unread.add(id);
    if (after?.busy && !after.parent && !after.oneshot && !this.sessions.has(id)) this.follow(id);
    const s = this.sessions.get(id);
    if (!after) {
      this.unread.delete(id);
      this.extra.delete(id);
      if (s && !s.gone) this.removed(id);
    }
    this.changed();
  }

  /** 读进来一个会话，读不了的不留（原因记在控制台）。 */
  follow(id) {
    this.load(id).then(() => this.changed(), (err) => {
      console.error(`会话 ${id} 读不了：${err.message}`);
      this.sessions.delete(id);
      this.changed();
    });
  }

  /** 有变化就告诉界面。 */
  on(fn) { this.listeners.add(fn); }

  changed() { for (const fn of this.listeners) fn(); }

  /**
   * 起来：订阅会话表（在跑的会话由 `entryChanged` 读进来）；左栏里派过子代理的也读进来，好画它下面那棵树（蓝图 `web.md`「连核心」第 3 条）。
   *
   * # Errors
   * 核心拒绝列会话时抛出来；单个会话读不了的跳过。
   */
  async boot() {
    await Promise.all([this.index.start(), this.projects.start()]);
    this.followParents();
    this.changed();
  }

  /** 左栏里有子会话的（会话表里有谁的 `parent` 是它）还没读的，读进来。 */
  followParents() {
    const parents = new Set(this.index.all().map((e) => e.parent).filter(Boolean));
    for (const id of this.order) if (parents.has(id) && !this.sessions.has(id)) this.follow(id);
  }

  /** 读一个会话、订阅它的视图流：回应是最新一页的条目和会话状态，之后照推送改；更早的往上翻时再读（`older`）。 @param {string} id */
  async load(id) {
    const s = emptySession(id);
    this.sessions.set(id, s);
    await this.subscribeView(s);
  }

  /**
   * 往上翻：读更早的一页（`view.page {view: true}` 带 `before`，上一页的 `first`），拼在前面、照编号去重。没有更早的、正在读的不再读。
   * 交回读没读。
   * @param {string} id
   */
  async older(id) {
    const s = this.sessions.get(id);
    if (!s || !s.more || s.older || s.first == null) return false;
    s.older = true;
    this.changed();
    try {
      const page = await this.conn.request('view.page', { session: id, view: true, before: s.first });
      s.view.prepend(page);
      s.first = s.view.first;
      s.more = s.view.more;
      s.paged = true;
      return true;
    } finally {
      s.older = false;
      this.changed();
    }
  }

  /**
   * 订阅视图流（核心 9-8 下）：回应是最新一页的条目和会话状态，换上手里的（掉了队、断了又连上也照这样重来一遍）；限额、模型、待办、
   * 「这一刻的」底数照回应记下（会话状态里也有，之后照 `view.status` 换）。
   * @param {Session} s
   */
  async subscribeView(s) {
    const r = await this.conn.request('subscribe', { session: s.id, stream: 'view' });
    s.view.reset(r);
    s.first = s.view.first;
    s.more = s.view.more;
    s.limits = r.limits ?? s.limits ?? {};
    s.model = r.status?.model ?? r.model ?? null;
    s.todos = r.status?.todos ?? r.todos ?? [];
    s.base = { upto: r.last ?? 0, usage: r.usage ?? null, permission: r.permission ?? null, jobs: r.jobs ?? null, workspace: r.workspace ?? null,
      // 这个会话自己的默认工作区（核心 5-14 中：没选目录的会话一个会话一个子目录）：`cwd` 和它一样的写「默认工作区」
      defaultWorkspace: typeof r.default_workspace === 'string' ? r.default_workspace : null,
      // 这时压缩有没有东西可压（核心 86097c26：判法同 `session.compact` 回不回 `nothing_to_compact`；旧核心没有是 `null`）
      compactable: typeof r.compactable === 'boolean' ? r.compactable : null };
  }

  /**
   * 开一个会话，排在最前面（蓝图 `web.md`「连核心」第 5 条：第一句话发出去时才开）。`model` 是还没开时在换模型的菜单里选的引用。
   *
   * # Errors
   * 核心拒绝时抛出来。
   */
  async create(cwd, model = null, persona = null, preset = null, chosen = false, project = null) {
    // 还没开的新会话里选过模型（核心施工 8-8）、人格（P-1）、预设（P-2）的，开的时候带上；不写的核心照默认（预设的默认人格、配置项）。
    // 人格是 `false` 的是明着不用人格，发 `null`（核心：不看预设、默认人格；2026-10-08 项目主人：人格可以留空）。
    // 目录是人选的（或者照上一次会话预选上的）带 `chosen`：太宽也照用，回应带 `wide`（核心 9-7 补，2026-10-09 项目主人：手动选的别自动切）
    // 在项目里开的带 `project`（核心 H-2）：没写的人格、预设核心照项目的
    const who = persona === false ? { persona: null } : persona ? { persona } : {};
    const { session, wide, unguarded, cwd: used } = await this.conn.request('session.create', {
      cwd, ...(model ? { model } : {}), ...who, ...(preset ? { preset } : {}), ...(chosen ? { chosen: true } : {}), ...(project ? { project } : {}),
    });
    /** 刚开的这个会话的目录太宽（照人选的用着）、护不住 Miyu 自己的数据（核心 5-14 改中 `unguarded`）：外面照它提醒一句 */
    this.createdWarn = wide === true || typeof unguarded === 'string' ? { session, wide: wide === true, unguarded: typeof unguarded === 'string' ? unguarded : null } : null;
    // 推送还没到时先记上，左栏当场有它
    // 没选目录的核心另给这个会话一个子目录（核心 5-14 上），照回应的记
    this.index.seed(session, { cwd: typeof used === 'string' ? used : cwd, ...(project ? { project } : {}) });
    await this.load(session);
    this.changed();
    return session;
  }

  /** 要删这个会话了（`on` 为 false 是没删成）：这期间推来的 `resync` 不去补（它是因为删才停的）。 */
  leaving(id, on = true) {
    const s = this.sessions.get(id);
    if (s) s.gone = on;
  }

  /** 删了的会话：从表里拿掉，不再列。 */
  drop(id) {
    this.sessions.delete(id);
    this.extra.delete(id);
    this.unread.delete(id);
    this.changed();
  }

  /** 说一句话；`extra` 是跟着发的（附件 `{attachments}`、在哪个目录干活 `{cwd}`），合进参数；交回核心的回应（`cwd` 是实际在哪干活）。 */
  send(id, text, extra = {}) { return this.conn.request('session.send', { session: id, text, ...extra }); }

  /**
   * 左栏的一项：标题、置顶、最近活动、哪儿开的照会话表（没标题的照 `preview`，整个会话的第一句话）；在不在跑读进来了的照会话状态，没读的照会话表。
   * @param {string} id
   */
  summary(id) {
    const s = this.sessions.get(id);
    const e = this.index.get(id);
    const listed = Date.parse(e?.last_active ?? '');
    const state = s?.view.status?.state;
    return { session: id, title: e?.title ?? e?.preview ?? null, running: state ? state !== 'idle' : !!e?.busy, created: null, pinned: !!e?.pinned, active: Number.isNaN(listed) ? null : listed, unread: this.unread.has(id), project: e?.project ?? null,
      // 哪儿开的（核心 8-33 四补：终端集成开的是 `terminal`，左栏单开一栏）
      origin: e?.origin ?? null };
  }

  /**
   * 一个还没读的会话：读进来、订阅上。子代理的（挂在派它的会话下面）不进会话表的顶层；`listed` 的（全部会话那一页开的老会话）
   * 进，排在最后。读过的不再读。
   */
  async ensure(id, listed = false) {
    if (listed) this.extra.add(id);
    if (this.sessions.has(id)) {
      if (listed) this.changed();
      return;
    }
    await this.load(id);
    this.changed();
  }

  /** 看这个会话：没看过的记号去掉。 */
  view(id) {
    this.viewing = id;
    if (id) this.unread.delete(id);
    this.changed();
  }

  push(method, p) {
    const s = p?.session ? this.sessions.get(p.session) : null;
    if (!s) return;
    if (method === 'resync') {
      if (s.gone) return;
      this.catchUp(s).catch((err) => console.error(`会话 ${s.id} 掉队以后补不上：${err.message}`));
      return;
    }
    if (!VIEW_PUSHES.has(method)) return;
    this.viewPush(s, method, p);
    this.changed();
  }

  /**
   * 视图流的一条推送：照它改手里的条目；会话状态换了的，待办、模型跟着换，一轮做完了、你没在看的记成没看过；排着的话被退回的
   * （`withdrawn`）告诉界面放回输入框。
   * @param {Session} s @param {string} method @param {any} p
   */
  viewPush(s, method, p) {
    const log = s.view;
    const was = log.status?.state ?? 'idle';
    /** 这一下之前就在等的（照工具调用的编号）：新冒出来的才算她在问、要人确认 */
    const waited = new Set((log.status?.waiting ?? []).map((/** @type {any} */ w) => w.call));
    const wasPreparing = !!log.status?.preparing;
    if (method === 'view.update' && p.entry?.withdrawn && !log.list.find((e) => e.id === p.entry.id)?.withdrawn) this.withdrawn(s.id, p.entry.text ?? '');
    log.apply(method, p);
    if (method !== 'view.status') return;
    const status = log.status ?? {};
    // 待办：全做完了、清空了待办那一块当场收（2026-10-17 项目主人在终端定的），清空前那一份（`todos_done`）不用
    s.todos = status.todos ?? [];
    if (status.model) s.model = status.model;
    if (was !== 'idle' && status.state === 'idle' && s.id !== this.viewing) this.unread.add(s.id);
    if (!wasPreparing && status.preparing) this.preparing(s.id);
    // 要人留意的：重新订阅换上的那一份不走这里（`subscribeView`），读进来、重连时不会把旧的再报一遍
    if (was !== 'idle' && status.state === 'idle') this.notice(s.id, 'done', null);
    for (const w of status.waiting ?? []) if (!waited.has(w.call)) this.notice(s.id, w.what === 'approve' ? 'approve' : 'ask', w);
  }

  /** 听要人留意的；交回怎么不听。 @param {(session: string, what: 'done'|'ask'|'approve', detail: any) => void} fn */
  onAttention(fn) {
    this.attention.add(fn);
    return () => { this.attention.delete(fn); };
  }

  /** 告诉听着的（一个出了错不影响别的）。 @param {string} id @param {'done'|'ask'|'approve'} what @param {any} detail */
  notice(id, what, detail) {
    for (const fn of this.attention) {
      try {
        fn(id, what, detail);
      } catch (err) {
        console.error(`要人留意的那一下出了错：${/** @type {Error} */ (err).message}`);
      }
    }
  }

  /**
   * 断了又连上了（蓝图 `web.md`「连核心」第 1 条）：读进来了的会话一个个重新订阅（和掉了队一样）；会话表重新订阅，断着时别处开的、
   * 改的、删的照它跟上。单个会话补不上的跳过，原因记在控制台。
   */
  async resume() {
    for (const s of this.sessions.values()) {
      if (s.gone) continue;
      await this.catchUp(s).catch((err) => console.error(`会话 ${s.id} 重连以后补不上：${err.message}`));
    }
    await Promise.all([this.index.start(), this.projects.start()]);
    this.followParents();
    this.changed();
  }

  /** 掉了队、断线重连：重新订阅视图流，换上最新的一页（`04-核心协议.md` 第七节）。 @param {Session} s */
  async catchUp(s) {
    await this.subscribeView(s);
    this.changed();
  }
}
