// @ts-check
//! 记忆页（软件包 `memory`，蓝图 `web.md`「记忆页」；2026-10-19 项目主人看过样品定）：往设置页挂一页「记忆」（`settings.section`），
//! 一个人格一份、「无人格」也有一份，能列、搜、记、改内容和关键词、作废、找回、整理、清空（`page.js`）。`/memory` 直接打开。
//! `/dream` 是网页自己的（第 13 条）：整理这个会话的记忆，正文末尾（`chat.tail`）挂那一块看着它整理（`dream.js`）。
//! 提供服务 `memory`：别的包（人格详情）跳到某个人格的那一份。停用了没有这一页、没有 `/memory`，`/dream` 退回核心的。

import { MemoryPage, NO_PERSONA } from './page.js';
import { DreamCard } from './dream.js';

/** `/dream` 合完以后那一块留几秒再收起 */
const KEEP_MS = 4000;

/** @param {any} ctx */
export function apply(ctx) {
  const page = new MemoryPage(ctx);
  ctx.slots.mount('settings.section', { id: 'memory', name: ctx.text('title'), render: (/** @type {any} */ kit) => page.render(kit) });
  /** 打开设置、到这一页；带了人格的换到那一份 @param {string|null} [persona] */
  const open = (persona) => {
    page.show(persona ?? null);
    ctx.settings?.open?.('memory');
  };
  ctx.commands.register({ name: 'memory', summary: ctx.text('command') }, () => open(null));
  ctx.commands.register({ name: 'dream', summary: ctx.text('dream_command') }, () => dream(ctx));
  ctx.provide('memory', { open });
}

/** 正在 `/dream` 的那一次（同时只一个） */
let running = false;

/**
 * `/dream`：有会话的整理这个会话（核心先把它还没抽的抽了），空会话照新会话选的人格。订 `memory` 流，正文末尾挂那一块，
 * 只在发起的那个会话里露出来；合完天亮、提示结果，4 秒后收起。
 * @param {any} ctx
 */
async function dream(ctx) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  const say = (/** @type {string} */ text, good = false) => ctx.composer?.say?.(text, good);
  if (running) {
    say(t('dream_busy'));
    return;
  }
  const session = ctx.chat?.current?.() ?? null;
  // 空会话：新会话选的人格（`false` 是无人格；没选的照默认人格）
  let persona = null;
  if (!session) {
    const picked = ctx.chat?.draft?.()?.persona;
    persona = picked === false ? NO_PERSONA : typeof picked === 'string' ? picked
      : (await ctx.core.request('config.get', { keys: ['persona.default'] }).catch(() => null))?.items?.['persona.default']?.value ?? NO_PERSONA;
  }
  const where = session ? { session } : { persona };
  running = true;
  const card = new DreamCard(ctx, new Map());
  const mine = (/** @type {any} */ p) => (session ? p?.session === session : p?.persona === persona);
  const onPush = (/** @type {string} */ method, /** @type {any} */ params) => {
    if ((method === 'memory.event' || method === 'memory.dreaming') && mine(params)) card.push(method, params);
  };
  ctx.core.onPush(onPush);
  // 只在发起的那个会话里露出来（换到别的会话藏起来，换回来接着看）
  const shown = () => { card.el.hidden = (ctx.chat?.current?.() ?? null) !== session; };
  const watch = setInterval(shown, 300);
  const unmount = ctx.slots.mount('chat.tail', { id: 'memory-dream', render: () => card.el });
  shown();
  ctx.chat?.reveal?.();
  const subscribed = await ctx.core.request('subscribe', { stream: 'memory', ...where }).then(() => true, () => false);
  // 滚动区照编号写正文：读一份这一份记忆（会话的照它的人格，核心认 `session`）
  ctx.core.request('memory.list', { ...where, forgotten: true, limit: 500 }).then((/** @type {any} */ got) => {
    for (const m of got?.memories ?? []) card.texts.set(m.id, m.text);
  }, () => {});
  const done = () => {
    clearInterval(watch);
    unmount?.();
    card.dispose();
    ctx.core.pushes?.delete?.(onPush);
    if (subscribed) ctx.core.request('unsubscribe', { stream: 'memory', ...where }).catch(() => {});
    running = false;
  };
  try {
    const got = await ctx.core.request('memory.dream', where);
    const n = (got?.given ?? 0) + (got?.retired ?? 0) + (got?.revised ?? 0);
    if (!n && !got?.summary) {
      done();
      say(t('dream_none'));
      return;
    }
    card.finish(got);
    say(t('dreamed', { given: got?.given ?? 0, revised: got?.revised ?? 0, retired: got?.retired ?? 0 }), true);
    setTimeout(done, KEEP_MS);
  } catch (err) {
    done();
    const why = /** @type {any} */ (err)?.data?.reason;
    say(why === 'memory_busy' ? t('dream_busy') : /** @type {any} */ (err)?.data?.message ?? /** @type {any} */ (err)?.message ?? String(err));
  }
}
