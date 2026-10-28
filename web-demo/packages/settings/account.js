// @ts-check
//! 设置的「访问」页（网页自己的页；蓝图 `web.md`「设置页」第 12c 条；核心 SU-1：只有主人一个人，2026-10-28 项目主人定）：你的头像、访问密码、
//! 允许局域网访问、退出这台设备 / 所有设备。原来的账号、邀请、成员、管理员后台都拿掉了。

import { h, icon } from '../../src/lib/dom.js';
import { confirmIn } from './confirm.js';
import { sectionKit } from './kit.js';
import { toggle } from './rows.js';
import { plainItem } from './model.js';

/** 「访问」页的几组。 @param {any} dialog */
export function drawAccount(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const host = dialog.ctx.host;
  const rows = [avatarRow(dialog), ...passwordRows(dialog), lanRow(dialog)];
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
  const shown = rows.filter(Boolean);
  return shown.length ? [h('section.set-group', h('div.set-rows', shown))] : [h('p.set-empty', t('account.nothing'))];
}

/**
 * 「头像」一行（核心 AV-1，只有你那一张；蓝图第 12c 条）：左边圆的头像（有图的画图，没有的画一个人的图标），右边「更换头像」（选图、不是正方形的先裁、
 * 缩小、传上去、`account.set_avatar`）、有头像的「移除」。走桥的（宿主不记头像）、人格那一套不在的不出「更换头像」。
 * @param {any} dialog
 */
function avatarRow(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const me = dialog.ctx.host?.avatar ?? null;
  if (!me) return null;
  const face = () => {
    const img = me.get();
    return img ? h('span.acc-avatar.is-pic', h('img', { src: img, alt: '' })) : h('span.acc-avatar', icon('user-round'));
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


/**
 * 「访问密码」一行（核心 SU-1 补；蓝图第 12c 条第 2 款）：设没设、右边「设置」或「修改」；点了下面展开几格（改的、拿设备令牌连的多「当前访问密码」）、
 * 「确定」「取消」。成了收起、写「已设置」、局域网那一行跟着能开。旧核心握手不说设没设的不出。
 * @param {any} dialog @returns {HTMLElement[]}
 */
function passwordRows(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const access = dialog.ctx.host?.access;
  if (!access || access.set() === null) return [];
  const form = h('div.set-form.acc-password-form', { hidden: true });
  const desc = h('p.set-desc');
  const button = h('button.set-btn', { type: 'button', onclick: () => open() });
  const label = () => {
    desc.textContent = t(access.set() ? 'account.password_is_set' : 'account.password_unset');
    button.textContent = t(access.set() ? 'account.password_change' : 'account.password_set');
  };
  label();
  const close = () => { form.hidden = true; form.replaceChildren(); button.hidden = false; };
  const open = () => {
    const field = (/** @type {string} */ name, /** @type {string} */ auto) => /** @type {HTMLInputElement} */ (h('input.set-input', { type: 'password', placeholder: t(name), 'aria-label': t(name), autocomplete: auto, spellcheck: 'false' }));
    const old = access.needsOld() ? field('account.password_old', 'current-password') : null;
    const fresh = field('account.password_new', 'new-password');
    const again = field('account.password_again', 'new-password');
    const error = h('p.set-error', { hidden: true });
    const ok = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: () => submit() }, t('account.ok')));
    const fail = (/** @type {string} */ why) => { error.textContent = why; error.hidden = false; };
    const submit = async () => {
      const why = access.problem(fresh.value, again.value);
      if (why) return fail(why);
      ok.disabled = true;
      const refused = await access.change(fresh.value, old ? old.value : null);
      ok.disabled = false;
      if (refused) return fail(refused);
      close();
      label();
      dialog.toast(t('account.password_done'));
      // 局域网那一行照「设没设」灰着：重画这一页
      dialog.drawBody?.();
    };
    for (const input of [old, fresh, again]) input?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) submit(); });
    form.replaceChildren(h('div.set-form-keyrow', old, fresh, again), error,
      h('div.set-form-buttons', h('button.set-btn', { type: 'button', onclick: close }, t('account.cancel')), ok));
    form.hidden = false;
    button.hidden = true;
    (old ?? fresh).focus();
  };
  return [h('div.set-row', h('div.set-text', h('div.set-name', h('span', t('account.password'))), desc), h('div.acc-actions', button)), form];
}

/** 写的地址是不是只有这台电脑（回环）：`127.*`、`::1`、`localhost`；别的（`0.0.0.0`、这台电脑的某一个地址）算听局域网。 @param {unknown} value */
export const loopbackOnly = (value) => {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return v === '' || v === 'localhost' || v === '::1' || v === '[::1]' || /^127\./.test(v);
};

/**
 * 「允许局域网访问」一行（网页软件的 `web.listen`，蓝图第 12c 条第 3 款）：开是 `0.0.0.0`、关是 `127.0.0.1`，改了重启网页软件生效。没设访问密码、
 * 现在关着的灰着，暗字换成「先设访问密码」。清单里没有这一项的（网页软件没装）不出。
 * @param {any} dialog
 */
function lanRow(dialog) {
  const t = (/** @type {string} */ k) => dialog.ctx.text(k);
  const item = dialog.schema ? plainItem(dialog.schema, dialog.got ?? {}, 'web.listen') : null;
  if (!item) return null;
  const on = !loopbackOnly(item.entry?.value ?? item.default);
  const locked = !on && dialog.ctx.host?.access?.set() === false;
  const sw = toggle(on, async (/** @type {boolean} */ next) => {
    const why = await dialog.save(item, { value: next ? '0.0.0.0' : '127.0.0.1' });
    if (why) dialog.toast(why);
    return !why;
  });
  if (locked) sw.setAttribute('disabled', '');
  return h('div.set-row', h('div.set-text', h('div.set-name', h('span', t('account.lan'))), h('p.set-desc', t(locked ? 'account.lan_needs_password' : 'account.lan_desc'))), sw);
}
