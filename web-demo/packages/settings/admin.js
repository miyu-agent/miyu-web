// @ts-check
//! 管理员后台（蓝图 `web.md`「设置页」第 12d 条；2026-10-22 项目主人看了三种样板选「独立整页」）：盖满整个窗口的一页，走网页自己的路由
//! `#admin=<页>`，刷新还在原来那一页。左边一栏深色（一页一行，最下面「回到 Miyu」），右边内容同设置页的组、行。现在两页：总览、账号与邀请
//! （「邀请」「成员」两组和 `account.js` 共用）；用量、模型与密钥、系统软件这些等核心给了再加。不是管理员的正中一张卡。

import { h, icon, replace } from '../../src/lib/dom.js';
import { stateOf, load, inviteGroup, memberGroup, inviteState } from './account.js';

/** 有哪几页（先后照左栏） */
export const PAGES = /** @type {const} */ (['overview', 'accounts']);
/** 左栏的图标 */
const ICONS = { overview: 'gauge', accounts: 'key-round' };

/**
 * 网址的 `#` 后面是不是管理员后台、哪一页：没有 `admin` 的是 `null`；页名不认得、没写的是总览。
 * @param {string} hash `location.hash`（带不带 `#` 都行）
 * @returns {typeof PAGES[number]|null}
 */
export function parseAdmin(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  if (!q.has('admin')) return null;
  const page = /** @type {any} */ (q.get('admin'));
  return PAGES.includes(page) ? page : 'overview';
}

/**
 * 总览的「最近」：谁用邀请注册了、生成了邀请、谁被停用了，照时刻倒着排（停用的核心不给时刻，排在最后）。
 * @param {{id: string, created?: string, used?: {account: string, at: string}}[]} invites
 * @param {{account: string, username?: string, disabled?: boolean}[]} accounts
 * @returns {{kind: 'joined'|'invited'|'disabled', who: string, at: string|null}[]}
 */
export function recentEvents(invites, accounts) {
  /** @type {{kind: 'joined'|'invited'|'disabled', who: string, at: string|null}[]} */
  const out = [];
  for (const inv of invites) {
    if (inv.used) out.push({ kind: 'joined', who: inv.used.account, at: inv.used.at });
    out.push({ kind: 'invited', who: String(inv.id).slice(0, 8), at: inv.created ?? null });
  }
  for (const a of accounts) if (a.disabled) out.push({ kind: 'disabled', who: a.username ?? a.account, at: null });
  return out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

/** 时刻：本地的「10月22日 15:30」 @param {string|null} at */
function when(at) {
  const d = new Date(at ?? '');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export class AdminPage {
  /**
   * @param {any} ctx 设置包的上下文（`core`、`host`、`text`）
   * @param {() => void} back 点了「回到 Miyu」
   */
  constructor(ctx, back) {
    this.ctx = ctx;
    this.back = back;
    /** @type {HTMLElement|null} */
    this.el = null;
    /** @type {HTMLElement|null} */
    this.nav = null;
    /** @type {HTMLElement|null} */
    this.body = null;
    /** @type {typeof PAGES[number]} */
    this.page = 'overview';
    /** 这一页记的东西（关了清掉） @type {any} */
    this.state = {};
    this.title = '';
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape' || document.querySelector('.set-tool-modal, body > .set-ask')) return;
      e.preventDefault();
      this.back();
    };
  }

  /** 给 `account.js` 的那一处 @returns {import('./account.js').View} */
  view() {
    return { ctx: this.ctx, panel: /** @type {HTMLElement} */ (this.el), toast: (text) => this.toast(text), redraw: () => this.draw(), state: this.state };
  }

  /** 开到某一页（已经开着的换页）。 @param {typeof PAGES[number]} page */
  show(page) {
    this.page = page;
    if (!this.el) {
      this.nav = h('nav.adm-nav');
      this.body = h('div.adm-body');
      this.el = h('div.adm-page', { role: 'main', 'aria-label': this.ctx.text('admin.title') }, this.nav, this.body);
      document.body.append(this.el);
      // 带着网址刷新进来的：内核先藏着主界面（`is-admin-route`），后台出来了露回去（关的时候底下就是主界面）
      document.documentElement.classList.remove('is-admin-route');
      document.addEventListener('keydown', this.onKey);
      this.title = document.title;
      document.title = this.ctx.text('admin.tab_title');
    }
    const st = stateOf(this.view());
    if (!st.loaded) load(this.view());
    this.draw();
  }

  /** 关掉：标题换回来、记的东西清掉。 */
  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    document.removeEventListener('keydown', this.onKey);
    if (this.title) document.title = this.title;
    this.title = '';
    this.state = {};
  }

  /** @param {string} text */
  toast(text) {
    this.el?.querySelector('.set-toast')?.remove();
    const el = h('div.set-toast.adm-toast', { role: 'status' }, text);
    this.el?.append(el);
    setTimeout(() => el.remove(), 2000);
  }

  draw() {
    if (!this.el || !this.nav || !this.body) return;
    const t = (/** @type {string} */ k, /** @type {any} */ f) => this.ctx.text(k, f);
    const st = stateOf(this.view());
    const route = this.ctx.host.route;
    replace(this.nav,
      h('div.adm-brand', icon('shield'), t('admin.title')),
      ...PAGES.map((p) => h(`a.adm-nav-item${p === this.page ? '.is-on' : ''}`, { href: `#admin=${p}`, onclick: (/** @type {MouseEvent} */ e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        route.replace(`#admin=${p}`);
        this.show(p);
      } }, icon(ICONS[p]), h('span', t(`admin.pages.${p}`)))),
      h('button.adm-nav-item.adm-exit', { type: 'button', onclick: () => this.back() }, icon('chevron-left'), h('span', t('admin.exit'))));
    if (st.loaded && !st.admin) {
      replace(this.body, h('div.adm-denied', h('p', t(st.error ? 'admin.failed' : 'admin.denied')), st.error ? h('p.set-desc', st.error) : null,
        h('button.set-btn', { type: 'button', onclick: () => this.back() }, t('admin.exit'))));
      return;
    }
    const view = this.view();
    const kids = !st.loaded ? [h('p.set-empty', t('admin.loading'))]
      : this.page === 'accounts' ? [inviteGroup(view), memberGroup(view)]
        : this.overview();
    replace(this.body, h('div.adm-inner', h('h2.adm-title', t(`admin.pages.${this.page}`)), ...kids, st.error ? h('p.set-error', st.error) : null));
  }

  /** 总览：一排数，下面「最近」。 */
  overview() {
    const t = (/** @type {string} */ k, /** @type {any} */ f) => this.ctx.text(k, f);
    const st = stateOf(this.view());
    const now = Date.now();
    const off = st.accounts.filter((/** @type {any} */ a) => a.disabled).length;
    const people = st.accounts.filter((/** @type {any} */ a) => a.kind !== 'system').length;
    const open = st.invites.filter((/** @type {any} */ i) => inviteState(i, now) === 'open').length;
    const stat = (/** @type {string|number} */ n, /** @type {string} */ label) => h('div.adm-stat', h('b', String(n)), h('span', label));
    const events = recentEvents(st.invites, st.accounts).slice(0, 8);
    return [
      h('div.adm-stats',
        stat(people, off ? t('admin.stat_accounts_off', { n: off }) : t('admin.stat_accounts')),
        stat(open, t('admin.stat_invites'))),
      h('section.set-group', h('h3.set-group-name', t('admin.recent')),
        events.length ? h('div.set-rows', events.map((e) => h('div.set-row',
          h('div.set-text', h('div.set-name', h('span', t(`admin.event.${e.kind}`, { who: e.who }))), e.at ? h('p.set-desc', when(e.at)) : null))))
          : h('p.set-empty', t('admin.no_recent'))),
    ];
  }
}
