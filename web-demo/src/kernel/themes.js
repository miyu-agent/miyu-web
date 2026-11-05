// @ts-check
//! 外观包（蓝图 `web/architecture.md`「外观包」；核心 TH-1）：核心装着的外观包带了网页外观（`package.list` 那一项的 `theme.web`）的，
//! 照内置的包那样加载：根是网页软件给的 `/t/<票据>/<包>/`（`POST /theme` 换的），里面同 `packages/<编号>/` 一个写法（`manifest.json`、
//! `index.js`、样式和别的文件照相对地址取）。编号就是核心的包编号；脚本同源跑、不设限、不问（2026-11-02 项目主人定）。
//!
//! 内核起完发行版的包以后订 `packages`（回应同 `package.list`），照它对一遍；之后跟着推来的 `package.changed`：装了新的当场加载，卸了的
//! 当场撤回；升级了的、这一页加载过又装回来的，浏览器还拿着原来那份脚本（ES 模块同一个地址只取一次），只说一句刷新页面后生效。
//! 一个外观包起不来（换不到票据、清单坏了、脚本抛错）只它故障，照别的包一样写在设置页「软件包」里；能照别的可选包停用。

import { foldReply, shadowed } from '../lib/packages.js';

/** 包编号的写法（同网页软件的 `valid_package`：放进地址里不用转义） */
const PACKAGE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * `package.list`（订 `packages` 的回应同它）里带网页外观的包的编号，照先后。编号写法不对的、和发行版的包撞了编号的不认，控制台写一句。
 * @param {any} listed `{packages: [...]}`
 * @param {Set<string>} taken 发行版里的包
 * @returns {string[]}
 */
export function themeIds(listed, taken) {
  const rows = Array.isArray(listed?.packages) ? listed.packages : [];
  /** @type {string[]} */
  const ids = [];
  for (const row of rows) {
    const id = row?.package;
    if (typeof id !== 'string' || typeof row?.theme?.web?.dir !== 'string') continue;
    if (!PACKAGE.test(id)) {
      console.error(`外观包 ${id} 的编号放不进地址，不加载`);
      continue;
    }
    if (taken.has(id)) {
      console.error(`外观包 ${id} 和网页自带的包撞了编号，不加载`);
      continue;
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * 外观包的清单：编号照核心的包编号（写别的也照它），种类一律 `optional`（总停得了）。不是 JSON 对象的抛错。
 * @param {any} raw @param {string} id
 */
export function themeManifest(raw, id) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`外观包 ${id} 的清单不是 JSON 对象`);
  return { ...raw, id, kind: 'optional' };
}

/**
 * @typedef {{
 *   request: (method: string, params: any) => Promise<any>,
 *   open: (id: string) => Promise<string|null>,
 *   taken: Set<string>,
 *   changed: () => Promise<unknown>,
 *   say: (name: string) => void,
 * }} Deps 问核心；换票据（交回根的地址，换不到的 `null`）；发行版里的包；列表变了（内核照新的列表对账）；说一句「刷新页面后生效」
 */

/** 装着的外观包：列表、每个的根，跟着核心装卸。 */
export class Themes {
  /** @param {Deps} deps */
  constructor(deps) {
    this.deps = deps;
    /** @type {string[]} 现在列着的，照核心的先后 */
    this.ids = [];
    /** @type {Map<string, string|null>} 每个的根（`/t/<票据>/<包>/`）；换不到票据的是 `null` */
    this.bases = new Map();
    /** @type {Set<string>} 这一页取过脚本的 */
    this.imported = new Set();
    /** 一件件来：对账、推送不交错 */
    this.queue = Promise.resolve();
  }

  /** 给加载器的几行（排在发行版的后面）。 */
  rows() {
    return this.ids.map((id) => ({ id }));
  }

  /** @param {string} id */
  has(id) {
    return this.ids.includes(id);
  }

  /** 这个包的根；换不到票据的抛错（加载器记成这个包故障）。 @param {string} id */
  base(id) {
    const url = this.bases.get(id);
    if (!url) throw new Error(`拿不到外观包 ${id} 的文件（网页软件没给票据）`);
    return url;
  }

  /** 取过它的脚本了。 @param {string} id */
  loaded(id) {
    this.imported.add(id);
  }

  /**
   * 订 `packages`、照回应对一遍（起来时、重连以后、掉了队）；订不上的（旧核心没有这个流）照 `package.list` 读一次，不跟推送。
   * @returns {Promise<void>}
   */
  follow() {
    return this.serial(async () => {
      const listed = await this.deps.request('subscribe', { stream: 'packages' })
        .catch(() => this.deps.request('package.list', {}))
        .catch((/** @type {any} */ err) => {
          console.error(`读不到装着的外观包：${err?.message ?? err}`);
          return null;
        });
      if (listed) await this.reconcile(themeIds(foldReply(listed), this.deps.taken), null);
    });
  }

  /**
   * 推送：`package.changed` 照那一项增减，`resync`（`packages` 掉了队）重新订。交回认不认得。
   * @param {string} method @param {any} params
   */
  push(method, params) {
    if (method === 'resync' && params?.stream === 'packages') {
      this.follow();
      return true;
    }
    if (method !== 'package.changed' || typeof params?.package !== 'string') return false;
    const id = params.package;
    const entry = params.entry ?? null;
    // 被上面一层盖住的那份（核心 SD-1）不加载，推来了也不管
    if (shadowed(entry)) return true;
    this.serial(async () => {
      const carries = themeIds({ packages: entry ? [entry] : [] }, this.deps.taken).includes(id);
      if (carries && this.has(id)) {
        // 升级、重装：浏览器还拿着原来那份脚本
        this.deps.say(typeof entry?.name === 'string' && entry.name ? entry.name : id);
        return;
      }
      const next = carries ? [...this.ids, id] : this.ids.filter((x) => x !== id);
      await this.reconcile(next, entry);
    });
    return true;
  }

  /**
   * 换成 `next` 这一列：新的换票据，没了的丢掉根；这一页取过脚本、又装回来的不加载，说一句。变了的叫内核对账。
   * @param {string[]} next @param {any} entry 推来的那一项（起来时、重订时是 `null`）
   */
  async reconcile(next, entry) {
    const added = next.filter((id) => !this.has(id));
    const removed = this.ids.filter((id) => !next.includes(id));
    const stale = added.filter((id) => this.imported.has(id));
    await Promise.all(added.filter((id) => !stale.includes(id)).map(async (id) => {
      const url = await this.deps.open(id).catch(() => null);
      this.bases.set(id, url);
    }));
    for (const id of removed) this.bases.delete(id);
    this.ids = next.filter((id) => !stale.includes(id));
    if (added.length > stale.length || removed.length) await this.deps.changed();
    for (const id of stale) this.deps.say(entry?.package === id && typeof entry?.name === 'string' && entry.name ? entry.name : id);
  }

  /** 排在前面的做完再做这件；一件出错不耽误后面的。 @param {() => Promise<void>} fn */
  serial(fn) {
    const run = this.queue.then(fn).catch((err) => console.error('外观包对账出错了', err));
    this.queue = run;
    return run;
  }
}
