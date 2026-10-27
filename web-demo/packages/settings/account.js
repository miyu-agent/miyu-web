// @ts-check
//! 「账号」页（蓝图 `web.md`「设置页」第 12c 条；核心 Y-1 上，设计 06 第八又补第 7 条；2026-10-22 项目主人定）：网页自己的页——管理员
//! 最上面一张「管理员后台」的入口卡片，下面「我的账号」（用户名、退出登录）。「邀请」（生成邀请：注册链接和邀请码只给这一次；列出邀请，
//! 没用的能撤）、「成员」（一个账号一行，停用、启用）两组画在管理员后台（`admin.js`，第 12d 条）。改了以后重读这两组。

import { h, icon } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { confirmIn } from './confirm.js';
import { toggle as switchOf } from './rows.js';
import { sectionKit } from './kit.js';

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

/** 「只看还能用的」记在浏览器里的名字 */
const OPEN_ONLY = 'admin_invites_open_only';

/** 能勾的邀请：还能用的（已注册、已过期的不能勾）。 @param {any} invite @param {number} now */
export const pickableInvite = (invite, now) => inviteState(invite, now) === 'open';

/** 能勾的账号：成员（机主、系统账号不能勾），不是自己。 @param {{account: string, kind: string}} a @param {string|null} self */
export const pickableAccount = (a, self) => a.kind === 'member' && a.account !== self;

/** 列哪些邀请：开着「只看还能用的」的只列还能用的。 @param {any[]} list @param {number} now @param {boolean} openOnly */
export const shownInvites = (list, now, openOnly) => (openOnly ? list.filter((i) => inviteState(i, now) === 'open') : list);

/**
 * 勾的成员里能做什么：开着的能停用、停着的能启用（照先后）。
 * @param {{account: string, disabled?: boolean}[]} accounts @param {Set<string>} picked
 * @returns {{disable: string[], enable: string[]}}
 */
export function accountMoves(accounts, picked) {
  const sel = accounts.filter((a) => picked.has(a.account));
  return { disable: sel.filter((a) => !a.disabled).map((a) => a.account), enable: sel.filter((a) => a.disabled).map((a) => a.account) };
}

/**
 * 点一行：勾上、去掉；`Shift` 点把上一次点的和这一行之间（照列表的先后、只算能勾的）都勾上。纯的，交回新的一份。
 * @param {Set<string>} picked @param {string[]} order 能勾的，照列表的先后 @param {string|null} anchor @param {string} id @param {boolean} shift
 */
export function pickOne(picked, order, anchor, id, shift) {
  const next = new Set(picked);
  const a = anchor == null ? -1 : order.indexOf(anchor);
  const b = order.indexOf(id);
  if (shift && a >= 0 && b >= 0) {
    for (const x of order.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x);
    return next;
  }
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * 一个个做（照先后，一个没成不停）：交回成了的、没成的和原因。
 * @param {string[]} ids @param {(id: string) => Promise<unknown>} run
 * @returns {Promise<{done: string[], failed: {id: string, why: string}[]}>}
 */
export async function runEach(ids, run) {
  const done = [];
  const failed = [];
  for (const id of ids) {
    try {
      await run(id);
      done.push(id);
    } catch (err) {
      failed.push({ id, why: /** @type {any} */ (err)?.message ?? String(err) });
    }
  }
  return { done, failed };
}

/** 时刻：本地的「10月22日 15:30」 @param {string|undefined} at */
function when(at) {
  const d = new Date(at ?? '');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * 画在哪：设置框的「账号」页，或者管理员后台（`admin.js`）。`state` 是这一处记的东西（设置框关了、后台关了清掉），`redraw` 读完以后重画这一处。
 * @typedef {{ctx: any, panel: HTMLElement, toast: (text: string) => void, redraw: () => void, state: any}} View
 */

/** 这一处记的东西 @param {View} view */
export const stateOf = (view) => (view.state.accounts ??= { loading: false, loaded: false, admin: false, locked: false, invites: [], accounts: [], error: null, days: 7,
  /** 多选（2026-10-27 项目主人）：在选的那一组勾了哪些，没在选的是 `null`；`anchor` 是上一次点的 */
  pick: { invites: null, accounts: null, anchor: null } });

/** 退出多选（`Esc`、取消、做完）。交回原来在不在选。 @param {View} view */
export function stopPicking(view) {
  const p = stateOf(view).pick;
  const was = !!(p.invites || p.accounts);
  Object.assign(p, { invites: null, accounts: null, anchor: null });
  return was;
}

/**
 * 组头上的「选择」（同左栏的多选按钮）。 @param {View} view @param {'invites'|'accounts'} which
 */
function pickButton(view, which) {
  const t = (/** @type {string} */ k) => view.ctx.text(k);
  return h('button.icon-button.acc-pick-btn', { type: 'button', title: t('account.select'), 'aria-label': t('account.select'), onclick: () => {
    const p = stateOf(view).pick;
    const on = !p[which];
    Object.assign(p, { invites: null, accounts: null, anchor: null });
    if (on) p[which] = new Set();
    view.redraw();
  } }, icon('list-checks'));
}

/**
 * 勾选框那一格，点了勾上、去掉（`Shift` 连着勾）。 @param {View} view @param {'invites'|'accounts'} which @param {string} id @param {string[]} order
 */
function checkBox(view, which, id, order) {
  const on = !!stateOf(view).pick[which]?.has(id);
  return h('button.acc-check', { type: 'button', 'aria-pressed': String(on), onclick: (/** @type {MouseEvent} */ e) => { e.stopPropagation(); flipPick(view, which, id, order, e.shiftKey); } },
    icon(on ? 'square-check' : 'square'));
}

/** 勾上、去掉一行（点勾选框、点这一行都是它）。 @param {View} view @param {'invites'|'accounts'} which @param {string} id @param {string[]} order @param {boolean} shift */
function flipPick(view, which, id, order, shift) {
  const p = stateOf(view).pick;
  p[which] = pickOne(p[which] ?? new Set(), order, p.anchor, id, shift);
  p.anchor = id;
  view.redraw();
}

/** 在选的时候点一行（按钮以外）：勾上、去掉 @param {View} view @param {'invites'|'accounts'} which @param {string} id @param {string[]} order */
const rowPick = (view, which, id, order) => (/** @type {MouseEvent} */ e) => {
  if (/** @type {Element} */ (e.target).closest('button, a, input')) return;
  flipPick(view, which, id, order, e.shiftKey);
};

/**
 * 组底下钉着的一条：「已选 N 个」、取消、动作（每个动作先问一句，确认了一个个做，做完退出选择、重读，没成的提示）。
 * @param {View} view @param {number} n @param {{label: string, ask: string, ids: string[], run: (id: string) => Promise<unknown>, danger?: boolean}[]} moves
 */
function pickBar(view, n, moves) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => view.ctx.text(k, f);
  const st = stateOf(view);
  return h('div.acc-pick-bar',
    h('span.acc-pick-count', t('account.selected', { n })),
    h('span.acc-pick-gap'),
    h('button.set-btn.is-small', { type: 'button', onclick: () => { stopPicking(view); view.redraw(); } }, t('account.cancel')),
    ...moves.filter((m) => m.ids.length).map((m) => h(`button.set-btn.is-small${m.danger ? '.is-danger' : '.is-primary'}`, { type: 'button', onclick: async (/** @type {Event} */ e) => {
      if (!(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: m.ask, yes: m.label, no: t('account.cancel') }))) return;
      const got = await runEach(m.ids, m.run);
      stopPicking(view);
      if (got.failed.length) view.toast(t('account.some_failed', { n: got.failed.length, why: got.failed[0].why }));
      st.loaded = false;
      load(view);
    } }, m.label)));
}

/** 读邀请、账号表；不是管理员的（`not_permitted`）不算出错。读完重画。 @param {View} view */
export async function load(view) {
  const st = stateOf(view);
  if (st.loading) return;
  // 管理员平时（没开管理员模式）：邀请、账号表是系统那一层（核心 Y-12下上），不读，两组写「仅管理员可以修改」（蓝图「管理员模式」第 4 条）
  if (view.ctx.admin?.locked) {
    Object.assign(st, { admin: true, locked: true, loaded: true, error: null });
    view.redraw();
    return;
  }
  st.locked = false;
  st.loading = true;
  try {
    const [invites, list] = await Promise.all([view.ctx.core.request('account.invites', {}), view.ctx.core.request('account.list', {})]);
    st.invites = Array.isArray(invites?.invites) ? invites.invites : [];
    st.accounts = Array.isArray(list?.accounts) ? list.accounts : [];
    st.admin = true;
    st.error = null;
  } catch (err) {
    st.admin = false;
    // 不是管理员、旧核心没有这几个方法：不算出错
    const reason = /** @type {any} */ (err)?.reason;
    st.error = reason === 'not_permitted' || /** @type {any} */ (err)?.code === -32601 ? null : /** @type {any} */ (err)?.message ?? String(err);
  } finally {
    st.loading = false;
    st.loaded = true;
    view.redraw();
  }
}

/** 设置框里的那一处 @param {any} dialog @returns {View} */
const dialogView = (dialog) => ({
  ctx: dialog.ctx, panel: dialog.panel, toast: (text) => dialog.toast(text), state: dialog,
  redraw: () => { if (dialog.isOpen && dialog.current === 'account') dialog.drawBody(); },
});

/** 「账号」页：管理员最上面一张「管理员后台」的卡片（点了关上设置、开后台，第 12d 条），下面「我的账号」。 @param {any} dialog */
export function drawAccount(dialog) {
  const view = dialogView(dialog);
  const st = stateOf(view);
  if (!st.loaded) load(view);
  const t = (/** @type {string} */ k) => dialog.ctx.text(k);
  const enter = st.admin ? h('section.set-group', h('div.acc-enter',
    h('div.set-text', h('div.set-name', h('span', t('account.admin_title'))), h('p.set-desc', t('account.admin_desc'))),
    h('button.set-btn.is-primary.acc-enter-btn', { type: 'button', onclick: () => { dialog.close(); dialog.ctx.host.route.go('#admin=overview'); } }, t('account.admin_enter'), icon('chevron-right')))) : null;
  return [enter, mine(dialog), st.error ? h('p.set-error', st.error) : null];
}

/** 「我的账号」：用户名；拿登录令牌连的多「退出登录」「退出所有设备」。 @param {any} dialog */
function mine(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const host = dialog.ctx.host;
  const account = host?.account ?? 'admin';
  const rows = [avatarRow(dialog, account), h('div.set-row', h('div.set-text', h('div.set-name', h('span', t('account.username')))),
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

/**
 * 「头像」一行（核心 AV-1；蓝图第 12c 条第 2 款）：左边圆的头像（有图的画图，没有的画首字），右边「更换头像」（选图、不是正方形的先裁、缩小、传上去、
 * `account.set_avatar`）、有头像的「移除」。走桥的（没有登录的账号）、人格那一套不在的不出「更换头像」。
 * @param {any} dialog @param {string} account
 */
function avatarRow(dialog, account) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const me = dialog.ctx.host?.avatar ?? null;
  if (!me) return null;
  const face = () => {
    const img = me.get();
    return img ? h('span.acc-avatar.is-pic', h('img', { src: img, alt: '' })) : h('span.acc-avatar', ([...account.trim()][0] ?? '?').toUpperCase());
  };
  const holder = h('span.acc-avatar-slot', face());
  const say = (/** @type {any} */ err) => {
    const why = err?.reason === 'avatar_not_image' ? t('account.avatar_not_image') : err?.reason === 'avatar_too_big' ? t('account.avatar_too_big')
      : err?.reason === 'avatar_conflict' ? t('account.avatar_conflict') : err?.message ?? String(err);
    dialog.toast(why);
  };
  /** 设成这张（`null` 是移除）：成了记下、当场换；别处刚改过的照新的取一次 @param {{blob: string, image: Blob}|null} got */
  const apply = async (got) => {
    try {
      const done = await dialog.ctx.core.request('account.set_avatar', { ...(got ? { blob: got.blob } : { unset: true }), expect: me.version() });
      await me.set(done?.avatar ?? null, got?.image ?? null);
    } catch (err) {
      if (/** @type {any} */ (err)?.reason === 'avatar_conflict') {
        const now = await dialog.ctx.core.request('account.avatar', {}).catch(() => null);
        await me.set(now?.avatar ?? null, now?.data ? new Blob([Uint8Array.from(atob(now.data), (c) => c.charCodeAt(0))], { type: now.media_type ?? 'image/png' }) : null);
      }
      say(err);
    }
  };
  const picker = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, onchange: async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    try {
      const got = await dialog.ctx.personas.avatarUpload(sectionKit(dialog), holder, file);
      if (got) await apply(got);
    } catch (err) {
      say(err);
    }
  } }));
  const canPick = typeof dialog.ctx.personas?.avatarUpload === 'function';
  const actions = h('div.acc-actions');
  const drawActions = () => actions.replaceChildren(...[
    canPick ? h('button.set-btn', { type: 'button', onclick: () => picker.click() }, t('account.avatar_change')) : null,
    me.get() ? h('button.set-btn', { type: 'button', onclick: () => apply(null) }, t('account.avatar_remove')) : null,
    picker,
  ].filter((x) => x !== null));
  drawActions();
  const stop = me.watch(() => {
    if (!holder.isConnected) return stop();
    holder.replaceChildren(face());
    drawActions();
  });
  return h('div.set-row.acc-avatar-row', h('div.set-text', h('div.set-name', h('span', t('account.avatar')))), h('div.acc-avatar-control', holder, actions));
}

/** 「邀请」：有效期、生成邀请；一个邀请一行。 @param {View} view */
/** 平时锁着的一组：组名，下面「仅管理员可以修改」，隔开一点「进入管理员模式」（只有管理员看得到这一组） @param {View} view @param {string} name */
export function lockedGroup(view, name) {
  return h('section.set-group', h('h3.set-group-name', name), h('p.set-locked', h('span', view.ctx.text('admin_mode.locked')),
    h('button.set-link', { type: 'button', onclick: () => view.ctx.admin?.set(true) }, view.ctx.text('admin_mode.enter'))));
}

export function inviteGroup(view) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => view.ctx.text(k, f);
  const st = stateOf(view);
  if (st.locked) return lockedGroup(view, t('account.invites'));
  const days = /** @type {HTMLSelectElement} */ (h('select.set-select.acc-days', { 'aria-label': t('account.days_label'), onchange: () => { st.days = Number(days.value); } },
    DAYS.map((d) => h('option', { value: String(d), selected: d === st.days }, t('account.days', { n: d })))));
  // 等核心回的时候按钮写「正在生成…」；小窗开着时不重读列表（2026-10-22 项目主人：偶尔点了没弹窗，点一下别处才出来——小窗刚出来下面整页就重画），
  // 收起小窗再重读
  const make = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: async () => {
    make.disabled = true;
    make.replaceChildren(icon('loader-circle'), t('account.making'));
    make.classList.add('is-busy');
    try {
      const got = await view.ctx.core.request('account.invite', { days: st.days });
      showInvite(view, got, () => { st.loaded = false; load(view); });
    } catch (err) {
      view.toast(/** @type {any} */ (err)?.message ?? String(err));
    } finally {
      make.disabled = false;
      make.classList.remove('is-busy');
      make.replaceChildren(icon('plus'), t('account.invite'));
    }
  } }, icon('plus'), t('account.invite')));
  const now = Date.now();
  const openOnly = !!view.ctx.storage?.get?.(OPEN_ONLY, false);
  const list = shownInvites([...st.invites].sort((a, b) => String(b.created ?? '').localeCompare(String(a.created ?? ''))), now, openOnly);
  const picked = st.pick.invites;
  const order = list.filter((inv) => pickableInvite(inv, now)).map((inv) => inv.id);
  const rows = list.map((inv) => {
    const state = inviteState(inv, now);
    const check = picked ? (pickableInvite(inv, now) ? checkBox(view, 'invites', inv.id, order) : h('span.acc-check.is-blank')) : null;
    const status = state === 'used' ? h('span.acc-invite-state', t('account.invite_used', { account: inv.used.account, at: when(inv.used.at) }))
      : state === 'expired' ? h('span.acc-invite-state.is-faint', t('account.invite_expired'))
        : h('span.acc-invite-state', t('account.invite_open', { at: when(inv.expires) }));
    const revoke = state === 'open' && !picked ? h('button.set-btn.is-small.acc-revoke', { type: 'button', onclick: async (/** @type {Event} */ e) => {
      if (!(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('account.revoke_ask'), yes: t('account.revoke'), no: t('account.cancel') }))) return;
      try {
        await view.ctx.core.request('account.invite_revoke', { id: inv.id });
      } catch (err) {
        view.toast(/** @type {any} */ (err)?.message ?? String(err));
      }
      st.loaded = false;
      load(view);
    } }, t('account.revoke')) : null;
    return h(`div.set-row.acc-invite${state === 'open' ? '' : '.is-done'}${picked ? '.is-picking' : ''}${picked?.has(inv.id) ? '.is-picked' : ''}`,
      { onclick: picked && pickableInvite(inv, now) ? rowPick(view, 'invites', inv.id, order) : null },
      check,
      h('div.set-text', h('div.set-name', h('code.acc-id', String(inv.id).slice(0, 8))), h('p.set-desc', t('account.invite_created', { at: when(inv.created) }))),
      status, revoke);
  });
  // 「只看还能用的」（收起已注册、已过期的），记在浏览器里
  const only = h('label.acc-open-only', switchOf(openOnly, (on) => { view.ctx.storage?.set?.(OPEN_ONLY, on); view.redraw(); return true; }), h('span', t('account.open_only')));
  const bar = picked ? pickBar(view, picked.size, [{ label: t('account.revoke_picked'), ask: t('account.revoke_picked_ask', { n: picked.size }), ids: order.filter((id) => picked.has(id)), danger: true,
    run: (id) => view.ctx.core.request('account.invite_revoke', { id }) }]) : null;
  return h(`section.set-group${picked ? '.is-picking' : ''}`,
    h('div.set-group-head', h('h3.set-group-name', t('account.invites')), h('div.acc-make', only, pickButton(view, 'invites'), days, make)),
    rows.length ? h('div.set-rows', rows) : h('p.set-empty', t('account.no_invites')), bar);
}

/**
 * 生成好的邀请：小窗里写注册链接（走桥的不给）和邀请码，各一个「复制」；码只显示这一次。
 * @param {View} view @param {{code: string, id: string, expires: string}} got @param {() => void} closed 收起以后（重读列表）
 */
function showInvite(view, got, closed) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => view.ctx.text(k, f);
  const link = view.ctx.host?.inviteLink?.(got.code) ?? null;
  const copyRow = (/** @type {string} */ label, /** @type {string} */ text) => {
    const value = h('code.acc-copy-value', text);
    const btn = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-small', { type: 'button', onclick: async () => {
      try {
        await view.ctx.host.clipboard.write(text);
        btn.textContent = t('account.copied');
        setTimeout(() => { btn.textContent = t('account.copy'); }, 1000);
      } catch {
        // 浏览器不让写剪贴板（不是 https 也不是本机）：选中那一段，让人自己按 Ctrl+C
        const range = document.createRange();
        range.selectNodeContents(value);
        const sel = getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        view.toast(t('account.copy_by_hand'));
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
  const close = () => leave(modal, () => { modal.remove(); closed(); });
  modal.addEventListener('set-dismiss', close);
  view.panel.append(modal);
}

/** 「成员」：一个账号一行，成员能停用、启用。 @param {View} view */
export function memberGroup(view) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => view.ctx.text(k, f);
  const st = stateOf(view);
  if (st.locked) return lockedGroup(view, t('account.members'));
  const self = view.ctx.host?.account ?? null;
  const picked = st.pick.accounts;
  const sorted = sortAccounts(st.accounts);
  const order = sorted.filter((a) => pickableAccount(a, self)).map((a) => a.account);
  const rows = sorted.map((a) => {
    const name = a.username ?? a.account;
    const check = picked ? (pickableAccount(a, self) ? checkBox(view, 'accounts', a.account, order) : h('span.acc-check.is-blank')) : null;
    const toggle = a.kind === 'member' && !picked ? h(`button.set-btn.is-small${a.disabled ? '' : '.acc-disable'}`, { type: 'button', onclick: async (/** @type {Event} */ e) => {
      if (!a.disabled && !(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('account.disable_ask', { name }), yes: t('account.disable'), no: t('account.cancel') }))) return;
      try {
        await view.ctx.core.request(a.disabled ? 'account.enable' : 'account.disable', { account: a.account });
      } catch (err) {
        view.toast(/** @type {any} */ (err)?.message ?? String(err));
      }
      st.loaded = false;
      load(view);
    } }, t(a.disabled ? 'account.enable' : 'account.disable')) : null;
    // 设成、撤掉管理员（核心 Y-12中下）：只有成员那几行有，机主恒是管理员；设之前问一句，撤掉不问；停用了的照核心原话（`member_disabled`）
    const role = a.kind === 'member' && !picked ? h('button.set-btn.is-small.acc-role', { type: 'button', onclick: async (/** @type {Event} */ e) => {
      if (!a.admin && !(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('account.make_admin_ask', { name }), yes: t('account.make_admin'), no: t('account.cancel') }))) return;
      try {
        await view.ctx.core.request('account.set_admin', { account: a.account, admin: !a.admin });
      } catch (err) {
        view.toast(/** @type {any} */ (err)?.message ?? String(err));
        return;
      }
      st.loaded = false;
      load(view);
    } }, t(a.admin ? 'account.drop_admin' : 'account.make_admin')) : null;
    return h(`div.set-row.acc-member${a.disabled ? '.is-disabled' : ''}${picked ? '.is-picking' : ''}${picked?.has(a.account) ? '.is-picked' : ''}`,
      { onclick: picked && pickableAccount(a, self) ? rowPick(view, 'accounts', a.account, order) : null },
      check,
      h('div.set-text', h('div.set-name', h('span.acc-name', name),
        h(`span.acc-kind.is-${a.kind}`, t(`account.kind.${a.kind}`)),
        a.kind === 'member' && a.admin ? h('span.acc-kind.is-admin', t('account.role_admin')) : null,
        a.disabled ? h('span.acc-kind.is-off', t('account.disabled')) : null),
      a.created ? h('p.set-desc', t('account.created', { at: when(a.created) })) : null),
      role || toggle ? h('div.acc-actions', role, toggle) : null);
  });
  const moves = picked ? accountMoves(sorted, picked) : null;
  const bar = picked && moves ? pickBar(view, picked.size, [
    { label: t('account.disable_picked'), ask: t('account.disable_picked_ask', { n: moves.disable.length }), ids: moves.disable, danger: true, run: (account) => view.ctx.core.request('account.disable', { account }) },
    { label: t('account.enable_picked'), ask: t('account.enable_picked_ask', { n: moves.enable.length }), ids: moves.enable, run: (account) => view.ctx.core.request('account.enable', { account }) },
  ]) : null;
  return h(`section.set-group${picked ? '.is-picking' : ''}`,
    h('div.set-group-head', h('h3.set-group-name', t('account.members')), order.length ? pickButton(view, 'accounts') : null),
    h('div.set-rows', rows), bar);
}
