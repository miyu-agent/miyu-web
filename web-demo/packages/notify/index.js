// @ts-check
//! 系统通知（软件包 `notify`，蓝图 `web.md`「系统通知」；2026-10-17 项目主人问网页能不能发通知）：一轮做完了、有问题等回答、要人确认（时机照
//! 终端），这个标签页不在前台时弹一条浏览器的通知，点了回到那个会话。要人留意的照会话仓库的 `onAttention`（读进来了的会话推来的
//! 会话状态）；子会话、一次性的会话不弹。权限：第一次在输入框里发话（回车、点发送）的那一下问（Firefox 只认人点了、按了键那一下里
//! 问的），问过的这个浏览器记着不再问；人拒了的不再问。标签页关了以后的推送先不做。停用了什么都不弹。
//! 账号级的提醒（核心 J-3 中的 `notices` 流，蓝图第 6 条）：每次新开会话的定时跑完了照同样的规矩弹（tag 同「回答完了」，互相换掉）；
//! 定时任务的记录坏了（`schedules.reset`）不管前台后台都在输入框上面提示一句，后台再弹。

import { noteOf, noticeNote } from './model.js';

/** 问过权限，记在这个浏览器里的名字 */
const ASKED = 'notify_asked';
/** 没有标题的会话等核心起的标题最多多久（毫秒） */
const TITLE_WAIT_MS = 5000;
/** 没有人格头像的会话用 Miyu 的图标（同页面的图标） */
const MIYU = new URL('resources/assets/logo.png', location.href).href;

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
  /** 还没有标题、在等核心起的标题的：`会话:哪一种` → 发出去的那一下（等到了标题、或者到点了） @type {Map<string, {id: string, send: () => void}>} */
  const waiting = new Map();
  // 会话表里一项变了：这个会话等着的有了标题就发
  ctx.sessions.index.on?.((/** @type {string} */ id, /** @type {any} */ _before, /** @type {any} */ after) => {
    if (!after?.title) return;
    for (const w of [...waiting.values()]) if (w.id === id) w.send();
  });
  ctx.effect(() => ctx.sessions.onAttention((/** @type {string} */ id, /** @type {'done'|'ask'|'approve'} */ what) => {
    if (host.permission() !== 'granted' || !host.away()) return;
    const tag = `${id}:${what}`;
    const show = () => {
      const note = noteOf(what, ctx.sessions.index.get(id), ctx.chat.lookOf?.(id), MIYU, t);
      if (note) host.show({ ...note, tag, onclick: () => ctx.chat.open(id) });
    };
    // 新会话第一轮做完时核心起的标题多半还没到（2026-10-31 项目主人：通知写的是第一句话）：等它最多 TITLE_WAIT_MS，到了照标题写
    if (ctx.sessions.index.get(id)?.title) return show();
    if (waiting.has(tag)) return;
    const timer = setTimeout(() => waiting.get(tag)?.send(), TITLE_WAIT_MS);
    waiting.set(tag, { id, send: () => { clearTimeout(timer); waiting.delete(tag); show(); } });
  }));

  // 账号级的提醒：订 `notices`（掉队、断了又连上重订；旧核心没有这个流的不报错）
  const subscribe = () => { ctx.core?.request('subscribe', { stream: 'notices' }).catch(() => {}); };
  /** 定时任务那句话（会话表里还没有那个会话时当标题）：照 `schedule.list` 找 @param {string} id */
  const promptOf = (id) => ctx.core.request('schedule.list', {}).then((/** @type {any} */ r) => (r?.schedules ?? []).find((/** @type {any} */ s) => s.id === id)?.prompt ?? null, () => null);
  const onPush = async (/** @type {string} */ method, /** @type {any} */ params) => {
    if (method === 'resync' && params?.stream === 'notices') return subscribe();
    if (method !== 'notice') return;
    const entry = typeof params?.session === 'string' ? ctx.sessions.index.get(params.session) : null;
    const prompt = params?.kind === 'schedule.ran' && !entry?.title && !entry?.preview && typeof params.schedule === 'string' ? await promptOf(params.schedule) : null;
    const note = noticeNote(params, entry, params?.session ? ctx.chat.lookOf?.(params.session) : null, prompt, MIYU, t);
    if (!note) return;
    if (note.say) ctx.composer?.say?.(note.say, false);
    if (host.permission() !== 'granted' || !host.away()) return;
    const session = note.session;
    host.show({ title: note.title, body: note.body, icon: note.icon, tag: note.tag, onclick: () => (session ? ctx.chat.open(session) : window.focus()) });
  };
  if (ctx.core) {
    ctx.core.onPush(onPush);
    ctx.effect(() => () => { ctx.core.pushes?.delete(onPush); ctx.core.request('unsubscribe', { stream: 'notices' }).catch(() => {}); });
    ctx.effect(() => ctx.core.onRejoin?.(subscribe) ?? (() => {}));
    subscribe();
  }
}
