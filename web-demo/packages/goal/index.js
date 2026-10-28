// @ts-check
//! 长期目标（软件包 `goal`，蓝图 `web.md`「长期目标」；2026-10-12 项目主人定）：正在看的会话有长期目标时，输入框右上方（和左上方的
//! 运行状态行共用紧挨着框的那一行，挂载位 `composer.above`、`.dock-lane`）写「(靶心图标) 目标原文 · 第 N 轮」，停着、等回复、受阻换成
//! 状态和颜色（`model.js`）；出来、收起照「动效」（`unfold`）。点它开改目标的浮层（`panel.js`，挂载位 `composer.float`）。照会话
//! 状态的 `goal`（`view.status` 推来就重画）。停用了这一截和浮层都没有，`/goal` 照样能用。

import { h, icon } from '../../src/lib/dom.js';
import { unfold } from '../../src/lib/motion.js';
import { goalLine } from './model.js';
import { GoalPanel } from './panel.js';

/** @param {any} ctx */
export function apply(ctx) {
  const t = (/** @type {string} */ path, /** @type {any} */ fields) => ctx.text(path, fields);
  let session = ctx.chat.current();
  const text = h('span.goal-text');
  const tail = h('span.goal-tail');
  const button = /** @type {HTMLButtonElement} */ (h('button.goal-pill', { type: 'button', onclick: () => panel.toggle() }, icon('target'), text, h('span.goal-sep', '·'), tail));
  const el = h('div.dock-goal.dock-lane.unfold', h('div.unfold-inner', h('div.goal-body', button)));
  unfold(el, false);
  /** 上一次画的：没变的不重画（在收的字每来一段都推一次会话状态） */
  let seen = '';
  /** @param {string|null} id @param {any} status */
  const redo = (id, status) => {
    if (id !== session) panel.close();
    session = id;
    const line = id ? goalLine(status?.goal, t) : null;
    const sig = JSON.stringify(line);
    if (sig === seen) return;
    seen = sig;
    // 收起时字留着（收的动画里还看得到）
    unfold(el, !!line);
    panel.update(line);
    if (!line) return;
    text.textContent = line.text;
    tail.textContent = line.tail;
    button.title = line.title;
    button.dataset.state = line.state;
  };
  // 浮层里的做法都交核心的 `/goal`：回执写进提示，拒了的交回为什么（写在浮层里）
  const panel = new GoalPanel(t, {
    anchor: () => button,
    run: async (args) => {
      if (!session) return null;
      try {
        const got = await ctx.core.request('command.run', { session, text: `/goal ${args}` });
        if (got?.said) ctx.composer.say(got.said, true);
        return null;
      } catch (err) {
        // 前缀要变、问了以后取消的（核心 OV-1 下）：不发、不说
        if (err?.reason === 'prefix_cancelled') return null;
        return typeof err?.data?.why === 'string' && err.data.why ? err.data.why : err?.message ?? String(err);
      }
    },
  });
  ctx.effect(() => () => panel.destroy());
  redo(session, session ? ctx.sessions.sessions.get(session)?.view.status ?? null : null);
  ctx.on('view.changed', (/** @type {any} */ v) => redo(v.session, v.status));
  ctx.slots.mount('composer.above', { id: 'goal', order: 30, render: () => el });
  ctx.slots.mount('composer.float', { id: 'goal', order: 20, render: () => panel.el });
}
