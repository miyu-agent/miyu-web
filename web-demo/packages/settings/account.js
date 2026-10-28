// @ts-check
//! 设置的「访问」页（网页自己的页；蓝图 `web.md`「设置页」第 12c 条；核心 SU-1：只有主人一个人，2026-10-28 项目主人定）：你的头像、访问密码、
//! 允许局域网访问、退出这台设备 / 所有设备。原来的账号、邀请、成员、管理员后台都拿掉了。

import { h, icon } from '../../src/lib/dom.js';
import { confirmIn } from './confirm.js';
import { sectionKit } from './kit.js';

/** 「访问」页的几组。 @param {any} dialog */
export function drawAccount(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const host = dialog.ctx.host;
  const rows = [avatarRow(dialog)];
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

