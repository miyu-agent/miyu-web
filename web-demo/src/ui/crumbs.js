// @ts-check
//! 子代理的会话顶上那条路径（蓝图 `web.md`「对话区」的「子代理的会话顶上那条路径」）：看着子代理的会话时，左上角标题那一颗小片
//! （软件包 setup 画）前面，一颗颗分开的小片写上面几层（主会话、上一层……），点了进那个会话；现在这一个的标题不在这里画。主会话里没有。
//! 2026-10-24 项目主人：子代理不要顶栏、和主会话一样，路径多几颗小片、别放在一颗里。路径照 `model/tree.js` 的 `pathOf` 找；太长的
//! 中间收成一颗 `…`。回派它的那一层的按钮不在这里，在输入框正上方（`BackButton`：从下面进的子代理，回去不用跑到顶上）。

import { h, icon, replace } from './dom.js';
import { show, hide } from '../lib/motion.js';
import { res, t } from '../util/res.js';
import { crumbsOf } from '../model/tree.js';

export class Crumbs {
  /** @param {(id: string) => void} open 进一个会话 */
  constructor(open) {
    this.open = open;
    this.el = h('nav.chat-crumbs', { hidden: true, 'aria-label': t('crumbs.label') });
    this.drawn = '';
  }

  /**
   * 照路径画上面几层（最后一段是现在这个，不画）；只有一段（主会话、新会话）的藏起来。
   * @param {{session: string, title: string|null}[]} path 从主会话一层层到这一个
   */
  draw(path) {
    const sig = JSON.stringify(path);
    if (sig === this.drawn) return;
    this.drawn = sig;
    if (path.length < 2) {
      if (!this.el.hidden) hide(this.el);
      return;
    }
    replace(this.el, crumbsOf(path, res.layout.crumbs_keep).map((p) => {
      if (!p) return h('span.crumb.is-gap', { 'aria-hidden': 'true' }, '…');
      const title = p.title ?? t('sidebar.untitled');
      return h('button.crumb', { type: 'button', title, onclick: () => this.open(p.session) }, h('span', title));
    }));
    if (this.el.hidden) show(this.el);
  }
}

/**
 * 回派它的那一层（蓝图同一节）：输入框正上方靠左一个小按钮「← 返回」（悬停提示写回到哪个会话），只在子代理的会话里有；多层的
 * 一层层回；进来从下面升上来、淡入，回主会话收回。
 */
export class BackButton {
  /** @param {(id: string) => void} open 进一个会话 */
  constructor(open) {
    this.open = open;
    this.to = /** @type {string|null} */ (null);
    /** 不是回派它的会话、另给去处的（整理会话：回到打开它之前的地方） @type {(() => void)|null} */
    this.run = null;
    this.label = h('span.back-label', t('crumbs.back'));
    this.el = h('div.back-row', { hidden: true },
      h('button.back-button', { type: 'button', onclick: () => { if (this.run) this.run(); else if (this.to) this.open(this.to); } }, icon('arrow-left'), this.label));
  }

  /** 点了一样（整理会话左上角标题左边那个「←」，2026-10-22 项目主人）：在的时候回去，交回回去了没有 */
  go() {
    if (this.el.hidden || !this.to) return false;
    if (this.run) this.run(); else this.open(this.to);
    return true;
  }

  /** 回到哪里的悬停提示（没有去处的是 `null`） */
  hint() {
    return this.to ? /** @type {HTMLElement} */ (this.el.firstChild).title : null;
  }

  /**
   * 照派它的那个会话画；主会话（没有派它的）藏起来。带 `run` 的点了做它（整理会话回到打开它之前的地方），`title` 照样写在悬停提示里。
   * @param {{session: string, title: string|null, run?: () => void}|null} parent
   */
  draw(parent) {
    this.run = parent?.run ?? null;
    const to = parent ? (parent.run ? `run:${parent.title ?? ''}` : parent.session) : null;
    const title = parent ? parent.title ?? t('sidebar.untitled') : '';
    const hint = t('crumbs.back_to', { title });
    const button = /** @type {HTMLElement} */ (this.el.firstChild);
    if (to === this.to && button.title === hint) return;
    this.to = to;
    if (!to) {
      if (!this.el.hidden) hide(this.el);
      return;
    }
    // 只写「返回」，回到哪个会话写在悬停提示里（2026-09-30 项目主人定：原来整个标题写在按钮上太长）；多层的一层层回
    button.title = hint;
    if (this.el.hidden) show(this.el);
  }
}
