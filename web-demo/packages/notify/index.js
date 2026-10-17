// @ts-check
//! 系统通知（软件包 `notify`，蓝图 `web.md`「系统通知」；2026-10-17 项目主人问网页能不能发通知）：一轮做完了、有问题等回答、要人确认（时机照
//! 终端），这个标签页不在前台时弹一条浏览器的通知，点了回到那个会话。要人留意的照会话仓库的 `onAttention`（读进来了的会话推来的
//! 会话状态）；子会话、一次性的会话不弹。权限：第一次在输入框里发话（回车、点发送）的那一下问（Firefox 只认人点了、按了键那一下里
//! 问的），问过的这个浏览器记着不再问；人拒了的不再问。标签页关了以后的推送先不做。停用了什么都不弹。

import { noteOf } from './model.js';

/** 问过权限，记在这个浏览器里的名字 */
const ASKED = 'notify_asked';
/** 没有人格头像的会话用 Miyu 的图标（同页面的图标） */
const MIYU = new URL('resources/assets/miyu-avatar.png', location.href).href;

/** @param {any} ctx */
export function apply(ctx) {
  const t = (/** @type {string} */ path, /** @type {any} */ fields) => ctx.text(path, fields);
  const host = ctx.host.notify;
  if (!host) return;
  // 第一次在输入框里发话的那一下问权限
  const ask = (/** @type {Event} */ e) => {
    if (host.permission() !== 'default' || ctx.storage.get(ASKED, false)) return;
    const target = /** @type {Element|null} */ (e.target);
    const send = e.type === 'keydown'
      ? /** @type {KeyboardEvent} */ (e).key === 'Enter' && !/** @type {KeyboardEvent} */ (e).shiftKey && !!target?.closest?.('.composer-input')
      : !!target?.closest?.('.composer-send, .send-button');
    if (!send) return;
    ctx.storage.set(ASKED, true);
    host.request().catch((/** @type {Error} */ err) => console.error(`要不到通知的权限：${err.message}`));
  };
  ctx.effect(() => {
    document.addEventListener('keydown', ask, true);
    document.addEventListener('click', ask, true);
    return () => {
      document.removeEventListener('keydown', ask, true);
      document.removeEventListener('click', ask, true);
    };
  });
  ctx.effect(() => ctx.sessions.onAttention((/** @type {string} */ id, /** @type {'done'|'ask'|'approve'} */ what) => {
    if (host.permission() !== 'granted' || !host.away()) return;
    const note = noteOf(what, ctx.sessions.index.get(id), ctx.chat.lookOf?.(id), MIYU, t);
    if (!note) return;
    host.show({ ...note, tag: `${id}:${what}`, onclick: () => ctx.chat.open(id) });
  }));
}
