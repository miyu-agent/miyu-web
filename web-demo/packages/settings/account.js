// @ts-check
//! 「账号」页（蓝图 `web.md`「设置页」第 12c 条；核心 Y-1 上，设计 06 第八又补第 7 条；2026-10-22 项目主人定）：网页自己的页，三组——
//! 「我的账号」（用户名、退出登录）、「邀请」（生成邀请：注册链接和邀请码只给这一次；列出邀请，没用的能撤）、「成员」（一个账号一行，
//! 停用、启用）。后两组只有管理员有：`account.invites` 回 `not_permitted` 的不画。改了以后重读这两组。

import { h, icon } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { confirmIn } from './confirm.js';

/** 邀请的有效期能选几天（核心 1 到 30，默认 7） */
export const DAYS = [1, 3, 7, 14, 30];

/**
 * 一个邀请现在是什么样：用掉了、过期了、还能用。
 * @param {{expires?: string, used?: {account: string, at: string}}} invite @param {number} now
 * @returns {'used'|'expired'|'open'}
 */
export function inviteState(invite, now) {
  if (invite.used) return 'used';
  const end = Date.parse(invite.expires ?? '');
  return Number.isFinite(end) && end <= now ? 'expired' : 'open';
}

/**
 * 成员表的先后：管理员、成员、系统账号；同一种照注册的先后。
 * @param {{account: string, kind: string, created?: string}[]} accounts
 */
export function sortAccounts(accounts) {
  const rank = (/** @type {string} */ kind) => ({ admin: 0, member: 1, system: 2 })[kind] ?? 3;
  return [...accounts].sort((a, b) => rank(a.kind) - rank(b.kind) || String(a.created ?? '').localeCompare(String(b.created ?? '')) || a.account.localeCompare(b.account));
}

/** 时刻：本地的「10月22日 15:30」 @param {string|undefined} at */
function when(at) {
  const d = new Date(at ?? '');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 这一页记的东西（设置框关了清掉） @param {any} dialog */
const stateOf = (dialog) => (dialog.accounts ??= { loading: false, loaded: false, admin: false, invites: [], accounts: [], error: null, days: 7 });

/** 读邀请、账号表；不是管理员的（`not_permitted`）只画「我的账号」。读完重画。 @param {any} dialog */
async function load(dialog) {
  const st = stateOf(dialog);
  if (st.loading) return;
  st.loading = true;
  try {
    const [invites, list] = await Promise.all([dialog.ctx.core.request('account.invites', {}), dialog.ctx.core.request('account.list', {})]);
    st.invites = Array.isArray(invites?.invites) ? invites.invites : [];
    st.accounts = Array.isArray(list?.accounts) ? list.accounts : [];
    st.admin = true;
    st.error = null;
  } catch (err) {
    st.admin = false;
    // 不是管理员、旧核心没有这几个方法：只画「我的账号」，不算出错
    const reason = /** @type {any} */ (err)?.reason;
    st.error = reason === 'not_permitted' || /** @type {any} */ (err)?.code === -32601 ? null : /** @type {any} */ (err)?.message ?? String(err);
  } finally {
    st.loading = false;
    st.loaded = true;
    if (dialog.isOpen && dialog.current === 'account') dialog.drawBody();
  }
}

/** 「账号」页。 @param {any} dialog */
export function drawAccount(dialog) {
  const st = stateOf(dialog);
  if (!st.loaded) load(dialog);
  return [mine(dialog), ...(st.admin ? [inviteGroup(dialog), memberGroup(dialog)] : []), st.error ? h('p.set-error', st.error) : null];
}

/** 「我的账号」：用户名；拿登录令牌连的多「退出登录」「退出所有设备」。 @param {any} dialog */
function mine(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const host = dialog.ctx.host;
  const account = host?.account ?? 'admin';
  const rows = [h('div.set-row', h('div.set-text', h('div.set-name', h('span', t('account.username')))),
    h('span.acc-value', account === 'admin' && host?.kind !== 'served' ? t('account.local_admin') : account))];
  if (host?.signOut) {
    const out = async (/** @type {boolean} */ all, /** @type {Event} */ e) => {
      if (all && !(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('account.logout_all_ask'), yes: t('account.logout_all'), no: t('account.cancel') }))) return;
      await dialog.ctx.core.request('account.logout', all ? { all: true } : {}).catch(() => null);
      host.signOut();
    };
    rows.push(h('div.set-row', h('div.set-text', h('div.set-name', h('span', t('account.logout'))), h('p.set-desc', t('account.logout_desc'))),
      h('div.acc-actions',
        h('button.set-btn', { type: 'button', onclick: (/** @type {Event} */ e) => out(true, e) }, t('account.logout_all')),
        h('button.set-btn', { type: 'button', onclick: (/** @type {Event} */ e) => out(false, e) }, t('account.logout')))));
  }
  return h('section.set-group', h('h3.set-group-name', t('account.mine')), h('div.set-rows', rows));
}

/** 「邀请」：有效期、生成邀请；一个邀请一行。 @param {any} dialog */
function inviteGroup(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const st = stateOf(dialog);
  const days = /** @type {HTMLSelectElement} */ (h('select.set-select.acc-days', { 'aria-label': t('account.days_label'), onchange: () => { st.days = Number(days.value); } },
    DAYS.map((d) => h('option', { value: String(d), selected: d === st.days }, t('account.days', { n: d })))));
  const make = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: async () => {
    make.disabled = true;
    try {
      const got = await dialog.ctx.core.request('account.invite', { days: st.days });
      showInvite(dialog, got);
      st.loaded = false;
      load(dialog);
    } catch (err) {
      dialog.toast(/** @type {any} */ (err)?.message ?? String(err));
    } finally {
      make.disabled = false;
    }
  } }, icon('plus'), t('account.invite')));
  const now = Date.now();
  const list = [...st.invites].sort((a, b) => String(b.created ?? '').localeCompare(String(a.created ?? '')));
  const rows = list.map((inv) => {
    const state = inviteState(inv, now);
    const status = state === 'used' ? h('span.acc-invite-state', t('account.invite_used', { account: inv.used.account, at: when(inv.used.at) }))
      : state === 'expired' ? h('span.acc-invite-state.is-faint', t('account.invite_expired'))
        : h('span.acc-invite-state', t('account.invite_open', { at: when(inv.expires) }));
    const revoke = state === 'open' ? h('button.set-btn.is-small.acc-revoke', { type: 'button', onclick: async (/** @type {Event} */ e) => {
      if (!(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('account.revoke_ask'), yes: t('account.revoke'), no: t('account.cancel') }))) return;
      try {
        await dialog.ctx.core.request('account.invite_revoke', { id: inv.id });
      } catch (err) {
        dialog.toast(/** @type {any} */ (err)?.message ?? String(err));
      }
      st.loaded = false;
      load(dialog);
    } }, t('account.revoke')) : null;
    return h(`div.set-row.acc-invite${state === 'open' ? '' : '.is-done'}`,
      h('div.set-text', h('div.set-name', h('code.acc-id', String(inv.id).slice(0, 8))), h('p.set-desc', t('account.invite_created', { at: when(inv.created) }))),
      status, revoke);
  });
  return h('section.set-group',
    h('div.set-group-head', h('h3.set-group-name', t('account.invites')), h('div.acc-make', days, make)),
    rows.length ? h('div.set-rows', rows) : h('p.set-empty', t('account.no_invites')));
}

/**
 * 生成好的邀请：小窗里写注册链接（走桥的不给）和邀请码，各一个「复制」；码只显示这一次。
 * @param {any} dialog @param {{code: string, id: string, expires: string}} got
 */
function showInvite(dialog, got) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const link = dialog.ctx.host?.inviteLink?.(got.code) ?? null;
  const copyRow = (/** @type {string} */ label, /** @type {string} */ text) => {
    const value = h('code.acc-copy-value', text);
    const btn = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-small', { type: 'button', onclick: async () => {
      try {
        await dialog.ctx.host.clipboard.write(text);
        btn.textContent = t('account.copied');
        setTimeout(() => { btn.textContent = t('account.copy'); }, 1000);
      } catch {
        // 浏览器不让写剪贴板（不是 https 也不是本机）：选中那一段，让人自己按 Ctrl+C
        const range = document.createRange();
        range.selectNodeContents(value);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        dialog.toast(t('account.copy_by_hand'));
      }
    } }, t('account.copy')));
    return h('div.acc-copy', h('span.acc-copy-label', label), value, btn);
  };
  const pop = h('div.set-tool-pop.acc-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('account.made_title') },
    h('div.set-tool-pop-head', h('strong', t('account.made_title')),
      h('button.icon-button', { type: 'button', title: t('close'), 'aria-label': t('close'), onclick: () => close() }, icon('x'))),
    h('p.set-desc', t(link ? 'account.made_link' : 'account.made_code', { at: when(got.expires) })),
    link ? copyRow(t('account.link'), link) : null,
    copyRow(t('account.code'), got.code),
    h('div.set-tool-pop-foot', h('button.set-btn.is-primary', { type: 'button', onclick: () => close() }, t('account.done'))));
  const modal = h('div.set-tool-modal', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, pop);
  const close = () => leave(modal, () => modal.remove());
  modal.addEventListener('set-dismiss', close);
  dialog.panel.append(modal);
}

/** 「成员」：一个账号一行，成员能停用、启用。 @param {any} dialog */
function memberGroup(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const st = stateOf(dialog);
  const rows = sortAccounts(st.accounts).map((a) => {
    const name = a.username ?? a.account;
    const toggle = a.kind === 'member' ? h(`button.set-btn.is-small${a.disabled ? '' : '.acc-disable'}`, { type: 'button', onclick: async (/** @type {Event} */ e) => {
      if (!a.disabled && !(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('account.disable_ask', { name }), yes: t('account.disable'), no: t('account.cancel') }))) return;
      try {
        await dialog.ctx.core.request(a.disabled ? 'account.enable' : 'account.disable', { account: a.account });
      } catch (err) {
        dialog.toast(/** @type {any} */ (err)?.message ?? String(err));
      }
      st.loaded = false;
      load(dialog);
    } }, t(a.disabled ? 'account.enable' : 'account.disable')) : null;
    return h(`div.set-row.acc-member${a.disabled ? '.is-disabled' : ''}`,
      h('div.set-text', h('div.set-name', h('span.acc-name', name),
        h(`span.acc-kind.is-${a.kind}`, t(`account.kind.${a.kind}`)),
        a.disabled ? h('span.acc-kind.is-off', t('account.disabled')) : null),
      a.created ? h('p.set-desc', t('account.created', { at: when(a.created) })) : null),
      toggle);
  });
  return h('section.set-group', h('h3.set-group-name', t('account.members')), h('div.set-rows', rows));
}
