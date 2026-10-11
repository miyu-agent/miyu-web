// @ts-check
//! 长期目标（软件包 `goal`，蓝图 `web.md`「长期目标」；2026-10-12 项目主人定）：正在看的会话有长期目标时，框下面那一行的中间写
//! 「(靶心图标) 目标 · 第 N 轮」，停着、等回复、受阻换成状态和颜色（`model.js`）；点它等于打 `/goal`（核心的回执写进提示）。照会话状态的
//! `goal`（`view.status` 推来就重画）。停用了这一截没有，`/goal` 照样能用。

import { h, icon } from '../../src/lib/dom.js';
import { goalLine } from './model.js';

/** @param {any} ctx */
export function apply(ctx) {
  const t = (/** @type {string} */ path, /** @type {any} */ fields) => ctx.text(path, fields);
  let session = ctx.chat.current();
  const text = h('span.goal-text');
  const tail = h('span.goal-tail');
  const button = /** @type {HTMLButtonElement} */ (h('button.goal-pill', { type: 'button', hidden: true, onclick: () => ask() }, icon('target'), text, h('span.goal-sep', '·'), tail));
  /** 上一次画的：没变的不重画（在收的字每来一段都推一次会话状态） */
  let seen = '';
  /** @param {string|null} id @param {any} status */
  const redo = (id, status) => {
    session = id;
    const line = id ? goalLine(status?.goal, t) : null;
    const sig = JSON.stringify(line);
    if (sig === seen) return;
    seen = sig;
    button.hidden = !line;
    if (!line) return;
    text.textContent = line.text;
    tail.textContent = line.tail;
    button.title = line.title;
    button.dataset.state = line.state;
  };
  // 点了：照 `/goal` 问核心，回执写进提示
  const ask = async () => {
    if (!session) return;
    try {
      const got = await ctx.core.request('command.run', { session, text: '/goal' });
      if (got?.said) ctx.composer.say(got.said, true);
    } catch (err) {
      ctx.composer.say(typeof err?.data?.why === 'string' && err.data.why ? err.data.why : err?.message ?? String(err));
    }
  };
  redo(session, session ? ctx.sessions.sessions.get(session)?.view.status ?? null : null);
  ctx.on('view.changed', (/** @type {any} */ v) => redo(v.session, v.status));
  ctx.slots.mount('composer.footer', { id: 'goal', order: 20, render: () => button });
  ctx.effect(() => () => button.remove());
}
