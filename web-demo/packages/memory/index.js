// @ts-check
//! 记忆页（软件包 `memory`，蓝图 `web.md`「记忆页」；2026-10-19 项目主人看过样品定）：往设置页挂一页「记忆」（`settings.section`），
//! 一个人格一份、「无人格」也有一份，能列、搜、记、改内容和关键词、作废、找回、整理、清空（`page.js`）。`/memory` 直接打开。
//! `/dream` 是网页自己的（第 13 条）：整理这个会话的记忆，正文末尾（`chat.tail`）挂那一块看着它整理（`dream.js`）；`/dream stop` 叫停（核心 R-22）。
//! 提供服务 `memory`：别的包（人格详情）跳到某个人格的那一份。停用了没有这一页、没有 `/memory`，`/dream` 退回核心的。

import { h } from '../../src/lib/dom.js';
import { unfold, leave } from '../../src/lib/motion.js';
import { MemoryPage } from './page.js';
import { DreamCard, SETTLE_MS } from './dream.js';
import { batchNode, answerNode } from './dream-view.js';

/** 核心多久还没回才把那一块挂出来（没有要整理的很快就回，不闪一下；真开始合了当场挂） */
const SHOW_AFTER_MS = 500;
/** 收回去要多久（`--motion-collapse` 0.26 秒，多留一点） */
const FOLD_MS = 300;

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
  ctx.commands.register({ name: 'dream', summary: ctx.text('dream_command'), args: true, argument: '[stop]' }, (/** @type {string|null|undefined} */ words) => dream(ctx, words));
  // 整理时人说了话：把她叫醒，那一块收起，整理转到后台跑完（2026-10-20 项目主人：「做梦中还能回复我的消息，这不合理」）
  ctx.on('message.sent', (/** @type {any} */ e) => {
    if (running && running.session === e?.session) running.background();
  });
  // 整理会话里的一批（蓝图「记忆页」第 13a 条第 3 条）：对话区照条目把这两样交过来
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  ctx.slots.mount('chat.item', { id: 'memory-dream-batch', key: 'dream.batch', render: (/** @type {any} */ it) => batchNode(t, it) });
  ctx.slots.mount('chat.item', { id: 'memory-dream-answer', key: 'dream.answer', render: (/** @type {any} */ it) => answerNode(t, it) });
  ctx.provide('memory', { open });
}

/**
 * 正在 `/dream` 的那一次（同时只一个）：哪个会话、叫停、转到后台。
 * 空会话里打的、还没开会话时 `session` 是 `null`，`where` 是这一趟整理的是哪一份（`{session}` 或 `{persona}`）。
 * @type {{session: string|null, where: {session?: string, persona?: string}, stop: () => Promise<void>, background: () => void}|null}
 */
let running = null;
/** 每个会话最后一次整理的结果那一行（只在这一次打开的页面里，不进会话记录；同一个会话再整理换掉） @type {Map<string, () => void>} */
const receipts = new Map();

/**
 * `/dream`：整理这个会话的记忆（核心先把它还没抽的抽了）；空会话照说第一句话一样先开会话（2026-10-20 项目主人：空会话还不能 dream；
 * 这样也叫停得了）。订 `memory` 流，正文末尾挂那一块，只在发起的那个会话里露出来；合完天亮，收成结果那一行。
 * `/dream stop` 叫停（核心 R-22，`command.run "/dream stop"`）；别的字不认。
 * @param {any} ctx @param {string|null|undefined} words
 */
async function dream(ctx, words) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  const say = (/** @type {string} */ text, good = false) => ctx.composer?.say?.(text, good);
  const arg = (words ?? '').trim().toLowerCase();
  if (arg === 'stop') {
    await stop(ctx);
    return;
  }
  if (arg) {
    say(t('dream_usage'));
    return;
  }
  if (running) {
    say(t('dream_busy'));
    return;
  }
  let session = ctx.chat?.current?.() ?? null;
  // 空会话里打的：不先开会话（先开再删，输入框滑下去又闪回来；2026-10-22 项目主人），照新会话要用的人格整理那一份（空会话没有要抽的），
  // 真开始合了才开会话、把那一块挂进去；那时开了会话、最后又没有要整理的（很少：半秒还没回），再删掉它，回到原来的空会话
  const draft = session ? null : ctx.chat?.draft?.() ?? null;
  const persona = session ? null : ctx.personas?.inUse?.();
  let opened = false;
  if (!session && persona === undefined) {
    // 人格列表还没读到：照原来的，先开会话
    try {
      session = await ctx.chat?.ensure?.();
      opened = true;
    } catch (err) {
      say(/** @type {any} */ (err)?.message ?? String(err));
      return;
    }
    if (!session) return;
  }
  const where = session ? { session } : { persona: persona ?? '_none' };
  // 「查看过程」：返回回到发起的这个会话（对话区照打开前正在看的记着）
  const card = new DreamCard(ctx, new Map(), { stop: () => stop(ctx), open: (id) => ctx.chat?.open?.(id) });
  // 正文末尾那一格：先是整理那一块，合完换成结果那一行
  // 进出照「动效」的占地方的一块（`unfold`：从 0 长出来、收回去；2026-10-20 项目主人：出现和消失没有过渡动画）
  const inner = h('div.unfold-inner', card.el);
  const box = h('div.dream-slot.unfold', inner);
  /** 收回去，收完了做 `after` @param {() => void} after */
  const fold = (after) => {
    unfold(box, false);
    setTimeout(after, FOLD_MS);
  };
  /** 换成 `node` 再长出来 @param {HTMLElement} node */
  const grow = (node) => {
    inner.replaceChildren(node);
    requestAnimationFrame(() => requestAnimationFrame(() => unfold(box, true)));
  };
  let away = false;
  const onPush = (/** @type {string} */ method, /** @type {any} */ params) => {
    const mine = 'session' in where ? params?.session === where.session : params?.persona === where.persona;
    if ((method === 'memory.event' || method === 'memory.dreaming') && mine) {
      card.push(method, params);
      if (card.track.batches) mount();
    }
  };
  ctx.core.onPush(onPush);
  // 只在发起的那个会话里露出来（换到别的会话藏起来，换回来接着看）
  const shown = () => { box.hidden = (ctx.chat?.current?.() ?? null) !== session; };
  const watch = setInterval(shown, 300);
  // 上一趟的结果那一行留在正文里原来的位置（是那时候的事），不拿掉
  // 挂那一块：真开始合了（头一条 `merging`）当场挂，不然等一会儿（没有要整理的很快就回，不闪一下）
  /** @type {(() => void)|null} */
  let unmount = null;
  let mounting = false;
  const mount = async () => {
    if (unmount || mounting) return;
    mounting = true;
    // 空会话里打的：这时才开会话（带上选的人格、预设、工作区）
    if (!session) {
      try {
        session = (await ctx.chat?.ensure?.()) ?? null;
      } catch {
        session = null;
      }
      if (!session) {
        mounting = false;
        return;
      }
      opened = true;
      if (running) running.session = session;
    }
    unmount = ctx.slots.mount('chat.tail', { id: `memory-dream-${session}`, render: () => box }) ?? (() => {});
    card.show();
    shown();
    ctx.chat?.reveal?.();
    requestAnimationFrame(() => requestAnimationFrame(() => unfold(box, true)));
  };
  const later = setTimeout(mount, SHOW_AFTER_MS);
  // 两下 `Esc` 叫停：在前台、没在回答、框里没字时（照终端：第一下提示，第二下叫停）
  const claim = () => ctx.composer?.claimEscape?.(away ? null : { hint: t('dream_esc_hint'), run: () => stop(ctx) });
  claim();
  const subscribed = await ctx.core.request('subscribe', { stream: 'memory', ...where }).then(() => true, () => false);
  // 滚动区照编号写正文：读一份这一份记忆（会话的照它的人格，核心认 `session`）
  ctx.core.request('memory.list', { ...where, forgotten: true, limit: 500 }).then((/** @type {any} */ got) => {
    for (const m of got?.memories ?? []) card.texts.set(m.id, m.text);
  }, () => {});
  running = {
    session,
    where,
    stop: () => stop(ctx),
    // 人说了话：叫醒、那一块收起、提示一句，整理在后台跑完再留结果那一行
    background: () => {
      if (away) return;
      away = true;
      ctx.composer?.claimEscape?.(null);
      card.wake();
      // 先淡掉，再一下收起（不缓）：这时人刚发了话、视口正往最底下走，她的回答一边在长，原来那一块 0.3 秒里一点点收，正文跟着一抖一抖的
      // （2026-10-20 项目主人）；一下收起的那一截由正文底下垫的空白顶上（`follow.js`：内容变短时视口不往回退），她接下来的字填上
      leave(card.el, () => {
        box.classList.add('is-instant');
        unfold(box, false);
        inner.replaceChildren();
        requestAnimationFrame(() => requestAnimationFrame(() => box.classList.remove('is-instant')));
      });
      say(t('dream_background'));
    },
  };
  const release = () => {
    clearTimeout(later);
    clearInterval(watch);
    card.dispose();
    ctx.core.pushes?.delete?.(onPush);
    ctx.composer?.claimEscape?.(null);
    if (subscribed) ctx.core.request('unsubscribe', { stream: 'memory', ...where }).catch(() => {});
    running = null;
  };
  const drop = () => {
    const gone = unmount;
    if (gone) fold(gone);
    receipts.delete(session);
  };
  try {
    const got = await ctx.core.request('memory.dream', where);
    const n = (got?.given ?? 0) + (got?.retired ?? 0) + (got?.revised ?? 0);
    if (!n && !got?.summary && got?.stopped !== true) {
      release();
      if (session) drop();
      // 为这一次开的会话：删掉，回到原来的空会话
      if (opened && ctx.chat?.current?.() === session) {
        await ctx.core.request('session.delete', { session }).catch(() => {});
        ctx.chat?.open?.(null);
        if (draft) ctx.chat?.setDraft?.(draft);
      }
      say(t('dream_none'));
      return;
    }
    await mount();
    card.finish(got);
    release();
    // 收成结果那一行：那一块收回去，结果那一行钉在这时正文最后一块的后面（`chat.anchor`），后来的回答接在它下面，它不再跟着往下掉
    // （2026-10-20 项目主人：这一行会往下掉）；换了会话回来照钉的位置再放（`chat.place`）
    const settle = () => {
      unmount?.();
      unmount = null;
      const line = card.receipt();
      const where = ctx.chat?.anchor?.(line) ?? null;
      const keep = setInterval(() => {
        if (where == null || line.isConnected || (ctx.chat?.current?.() ?? null) !== session) return;
        ctx.chat?.place?.(where, line);
      }, 400);
      receipts.set(session, () => { clearInterval(keep); line.remove(); receipts.delete(session); });
      ctx.chat?.reveal?.();
    };
    receipts.set(session, drop);
    if (away) settle();
    else setTimeout(() => fold(settle), SETTLE_MS);
  } catch (err) {
    release();
    if (session) drop();
    if (opened && ctx.chat?.current?.() === session) {
      await ctx.core.request('session.delete', { session }).catch(() => {});
      ctx.chat?.open?.(null);
      if (draft) ctx.chat?.setDraft?.(draft);
    }
    const why = /** @type {any} */ (err)?.data?.reason;
    say(why === 'memory_busy' ? t('dream_busy') : /** @type {any} */ (err)?.data?.message ?? /** @type {any} */ (err)?.message ?? String(err));
  }
}

/**
 * 叫停整理：`memory.dream_stop {session}`（核心 R-23；只停整理，那一块照 `memory.dream` 回来的「整理已中断」收）；还没有这个方法的旧核心交
 * `/dream stop`（R-22，它的回执「已停止整理。」不当整理的结果）。网页没在看着的（别的头叫的）照核心的原话说，没在整理的照核心的
 * `not_dreaming` 那一句。
 * @param {any} ctx
 */
async function stop(ctx) {
  const say = (/** @type {string} */ text, good = false) => ctx.composer?.say?.(text, good);
  const session = running?.session ?? ctx.chat?.current?.() ?? null;
  // 正在 `/dream` 的照它整理的那一份叫停（空会话里打的、还没开会话的是人格那一份）
  const where = running?.where ?? (session ? { session } : null);
  if (!where) {
    say(ctx.text('dream_stop_none'));
    return;
  }
  const mine = !!running;
  try {
    try {
      await ctx.core.request('memory.dream_stop', where);
      if (!mine) say(ctx.text('dream_stopped'), true);
    } catch (err) {
      const e = /** @type {any} */ (err);
      if (e?.code !== -32601 && e?.data?.reason !== 'unknown_method' && e?.reason !== 'unknown_method') throw err;
      if (!session) throw err;
      const got = await ctx.core.request('command.run', { session, text: '/dream stop' });
      if (!mine && got?.said) say(got.said, true);
    }
  } catch (err) {
    const e = /** @type {any} */ (err);
    say(e?.data?.message ?? e?.message ?? String(err));
  }
}
