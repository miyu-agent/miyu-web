// @ts-check
//! 项目（核心 H-1，`docs/reference/projects.md`；蓝图 `web.md`「会话整理和项目」）：`subscribe {stream: "projects"}` 拿到整张表，之后照
//! `projects.changed` 整项换、删掉；掉了队（`resync`）重新订阅。旧核心没有这个流的（`unknown_stream` 这类）当没有项目，左栏不画「项目」
//! 那一栏（`supported` 是假）。

/**
 * 一个项目，和核心给的一样：没设的格不出现。`persona` 是 `null` 的是无人格，没有这一格是照配置的默认。
 * @typedef {{project: string, name: string, description?: string, color?: string, workspace?: string, persona?: string|null,
 *   preset?: string, prompt?: string, open?: boolean, created?: string}} Project
 */

export class ProjectList {
  /** @param {{request: (method: string, params: any) => Promise<any>, onPush: (fn: (method: string, params: any) => void) => void}} conn */
  constructor(conn) {
    this.conn = conn;
    /** 照造的先后 @type {Project[]} */
    this.list = [];
    /** 核心有项目（订阅成了） */
    this.supported = false;
    /** @type {Set<() => void>} */
    this.listeners = new Set();
    conn.onPush((method, params) => this.push(method, params));
  }

  /** @param {() => void} fn */
  on(fn) { this.listeners.add(fn); }

  /** @param {string|null|undefined} id */
  get(id) { return id ? this.list.find((p) => p.project === id) ?? null : null; }

  /** 订阅、拿到整张表（起来、掉了队、断线重连都走这里）。旧核心不认的当没有项目，不抛。 */
  async start() {
    try {
      const got = await this.conn.request('subscribe', { stream: 'projects' });
      this.list = Array.isArray(got?.projects) ? got.projects : [];
      this.supported = true;
    } catch (err) {
      console.error(`订阅不了项目，当没有项目：${/** @type {any} */ (err)?.message}`);
      this.list = [];
      this.supported = false;
    }
    this.emit();
  }

  /** @param {string} method @param {any} p */
  push(method, p) {
    if (method === 'resync' && p?.stream === 'projects') {
      this.start();
      return;
    }
    if (method !== 'projects.changed' || !p) return;
    const one = p.project;
    if (p.deleted) {
      const id = typeof one === 'string' ? one : one?.project;
      this.list = this.list.filter((x) => x.project !== id);
    } else if (one && typeof one === 'object' && one.project) {
      const at = this.list.findIndex((x) => x.project === one.project);
      this.list = at < 0 ? [...this.list, one] : this.list.map((x, i) => (i === at ? one : x));
    } else return;
    this.emit();
  }

  emit() { for (const fn of this.listeners) fn(); }
}
