// @ts-check
//! 按钮旁边弹出的小菜单（蓝图 `web.md`「人格、预设、工作区」第 3、4 条）：顶上一行标题（不写按键提示，2026-10-08 项目主人），下面一行一项
//! （名字，有说明的下面暗色一行；现在的那一项打勾，用不了的暗着），可以分几段（段名暗色），再下面可以有一排按钮。
//! 宽度跟着字走。`↑` `↓` 选、`Enter` 选定、`Esc` 和点外面关；鼠标悬停选中、点一下选定；`Backspace` 交给 `back`（文件夹里回上一级）。
//! 不画描边（浮起来的层那一圈细线除外）。

import { h, icon, replace } from '../../src/lib/dom.js';

/**
 * @typedef {{title: string, desc?: string, icon?: string, current?: boolean, off?: boolean, tip?: string, label?: string, more?: boolean, still?: boolean,
 *   danger?: boolean, keep?: boolean, wrap?: boolean, mono?: boolean, mouse?: boolean, action?: {icon: string, title: string, run: () => void, key?: string}, pick: (el: HTMLElement) => void}} Row
 *   `label` 是左边暗字的名字（名字、值一行的样子，左上角的「会话信息」），`more` 末尾一个 ›，`still` 只是看的、点不了、不亮，`keep` 点了不收菜单，
 *   `wrap` 值太长换行写全（不截断），`mono` 值用等宽暗字（会话编号），`mouse` 只用鼠标点（不进键盘的上下、打开时不停在它上面，悬停照样亮），`action` 行末一个图标按钮（带 `key` 的，移到这一行按这个键也一样：人格、预设的编辑是 `e`）
 * @typedef {{section: string}} Section
 * @typedef {{divider: true}} Divider 一道细线
 * @typedef {{title: string, rows: (Row|Section|Divider)[], note?: string, foot?: HTMLElement[], back?: () => void, below?: boolean, action?: {icon: string, title: string, run: () => void}, card?: string}} View
 *   `title` 空的不画头一行
 *   `card` 是会话信息卡片照哪个会话画的（换了人格、预设、工作区照它重画）
 *   `action` 是标题右边的一个图标按钮（工作区的「选择文件夹」）
 */

export class Menu {
  /** @param {string} [backLabel] 返回箭头的提示 */
  constructor(backLabel = '') {
    this.backLabel = backLabel;
    this.el = h('div.setup-menu', { hidden: true, role: 'menu' });
    /** @type {{el: HTMLElement, row: Row}[]} */
    this.items = [];
    this.at = -1;
    /** @type {View|null} */
    this.view = null;
    /** 换一屏时框的大小正在缓过去的那段动画 @type {Animation|null} */
    this.sizing = null;
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') this.mark(this.next(e.key === 'ArrowDown' ? 1 : -1));
      else if (e.key === 'Enter' && !e.isComposing && this.at >= 0) this.pick(this.items[this.at].row);
      else if (e.key === 'Backspace' && this.view?.back) this.view.back();
      else if (!e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey && this.at >= 0 && this.items[this.at].row.action?.key === e.key) this.items[this.at].row.action?.run();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    this.onDown = (/** @type {PointerEvent} */ e) => {
      const target = /** @type {Node} */ (e.target);
      if (!this.el.contains(target) && !this.anchor?.contains(target)) this.close();
    };
  }

  get open() { return !this.el.hidden; }

  /** 在 `anchor` 旁边打开一屏（已经开着的换成这一屏）：`below` 开在它下面（左上角那一条），不然开在上面。 @param {HTMLElement} anchor @param {View} view */
  show(anchor, view) {
    // 开着换一屏的：记下原来多大，换完从原来的大小缓到新的（2026-10-20 项目主人：宽的会话信息换到窄的换人格没有动画）
    const before = this.el.hidden ? null : { width: this.el.offsetWidth, height: this.el.offsetHeight };
    this.anchor = anchor;
    this.view = view;
    this.items = [];
    const nodes = view.rows.map((r) => {
      if ('section' in r) return h('div.setup-menu-section', r.section);
      if ('divider' in r) return h('div.setup-menu-divider', { role: 'separator' });
      const text = h('div.setup-menu-text', h('span.setup-menu-title', r.title), r.desc ? h('span.setup-menu-desc', r.desc) : null);
      const el = h(`div.setup-menu-row${r.current ? '.is-current' : ''}${r.off ? '.is-off' : ''}${r.label != null ? '.is-pair' : ''}${r.still ? '.is-still' : ''}${r.danger ? '.is-danger' : ''}${r.wrap ? '.is-wrap' : ''}${r.mono ? '.is-mono' : ''}${r.mouse ? '.is-mouse' : ''}`, {
        role: 'menuitem', title: r.tip ?? null,
        onmousedown: (/** @type {MouseEvent} */ e) => e.preventDefault(),
        onmousemove: () => { if (!r.off && !r.still) this.mark(this.items.findIndex((x) => x.row === r)); },
        onmouseenter: (/** @type {MouseEvent} */ e) => { if (r.mouse) /** @type {HTMLElement} */ (e.currentTarget).classList.add('is-selected'); },
        onmouseleave: (/** @type {MouseEvent} */ e) => { if (r.mouse) /** @type {HTMLElement} */ (e.currentTarget).classList.remove('is-selected'); },
        onclick: () => this.pick(r),
      }, r.icon ? icon(r.icon) : null, r.label != null ? h('span.setup-menu-label', r.label) : null, text,
        r.action ? h('button.setup-menu-action.is-inline', {
          type: 'button', title: r.action.title, 'aria-label': r.action.title, onmousedown: (/** @type {MouseEvent} */ e) => e.preventDefault(),
          onclick: (/** @type {MouseEvent} */ e) => { e.stopPropagation(); r.action?.run(); },
        }, icon(r.action.icon)) : null,
        // 现在的那一项不打勾、名字照 accent 色，右边不留打勾的空档（2026-10-20 项目主人）
        r.more ? h('span.setup-menu-more', icon('chevron-right')) : null);
      if (!r.still && !r.mouse) this.items.push({ el, row: r });
      return el;
    });
    replace(this.el,
      // 翻进来的一页（有 `back` 的）：标题前面一个返回的箭头（2026-10-19 项目主人：子菜单要有返回的箭头）
      view.title ? h('div.setup-menu-head',
        view.back ? h('button.setup-menu-back', { type: 'button', title: this.backLabel, 'aria-label': this.backLabel, onmousedown: (/** @type {MouseEvent} */ e) => e.preventDefault(), onclick: () => view.back?.() }, icon('chevron-left')) : null,
        h('strong.setup-menu-name', view.title),
        view.action ? h('button.setup-menu-action', { type: 'button', title: view.action.title, 'aria-label': view.action.title, onmousedown: (/** @type {MouseEvent} */ e) => e.preventDefault(), onclick: () => view.action?.run() }, icon(view.action.icon)) : null) : null,
      h('div.setup-menu-list', nodes, view.note ? h('div.setup-menu-note', view.note) : null),
      view.foot?.length ? h('div.setup-menu-foot', view.foot) : null);
    this.el.classList.toggle('is-below', !!view.below);
    // 只有一句话和按钮的一屏（问一句的：换人格前的确认）：话照正文的颜色、大一点
    this.el.classList.toggle('is-ask', !view.rows.length && !!view.note);
    // 左边对齐：左上角那一条里的按钮开的，和那一条的左边对齐（不是按钮自己的左边，差一截内边距；2026-10-20 项目主人：没对齐）
    const edge = /** @type {HTMLElement} */ (anchor.closest('.setup-info') ?? anchor);
    this.el.style.left = `${edge.offsetLeft}px`;
    const wasOpen = !this.el.hidden;
    this.el.hidden = false;
    // 开着菜单的那个按钮：箭头跟着朝下（左上角的标题）
    if (anchor.getAttribute('aria-haspopup') === 'menu') anchor.setAttribute('aria-expanded', 'true');
    this.fit();
    if (before) this.resize(before);
    this.mark(Math.max(0, this.items.findIndex((x) => x.row.current && !x.row.off)));
    if (!wasOpen) {
      document.addEventListener('keydown', this.onKey, true);
      document.addEventListener('pointerdown', this.onDown, true);
    }
  }

  /**
   * 换了一屏：框从原来的宽高缓到现在的（0.22 秒，里面的字先藏着），里面的新内容跟着淡进来；一样大的只淡进来。减少动画的直接换。
   * 量的是排版的大小（`offsetWidth`）：页面整个缩放了的（界面缩放），`getBoundingClientRect` 量出来的是放大以后的，缓到它会大一圈再跳回去。
   * @param {{width: number, height: number}} before
   */
  resize(before) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const after = { width: this.el.offsetWidth, height: this.el.offsetHeight };
    this.sizing?.cancel();
    const same = Math.abs(after.width - before.width) < 1 && Math.abs(after.height - before.height) < 1;
    const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    if (!same) {
      this.el.style.overflow = 'hidden';
      this.sizing = this.el.animate([
        { width: `${before.width}px`, height: `${before.height}px` },
        { width: `${after.width}px`, height: `${after.height}px` },
      ], { duration: 220, easing: ease });
      const done = () => { this.el.style.overflow = ''; this.sizing = null; };
      this.sizing.onfinish = done;
      this.sizing.oncancel = done;
    }
    for (const kid of this.el.children) kid.animate([{ opacity: 0 }, { opacity: 1 }], { duration: same ? 140 : 200, delay: same ? 0 : 40, easing: 'ease-out', fill: 'backwards' });
  }

  /** 放不下（空会话里输入框在窗口中间，上面地方少）：列表那一截矮下去，整个菜单留在窗口里。 */
  fit() {
    const list = /** @type {HTMLElement|null} */ (this.el.querySelector('.setup-menu-list'));
    if (!list) return;
    list.style.maxHeight = '';
    const r = this.el.getBoundingClientRect();
    const over = this.view?.below ? r.bottom - (innerHeight - 8) : 8 - r.top;
    if (over > 0) list.style.maxHeight = `${Math.max(96, list.clientHeight - over)}px`;
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.view = null;
    this.anchor?.removeAttribute('aria-expanded');
    document.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('pointerdown', this.onDown, true);
  }

  /** 下一个能选的（跳过暗着的），到头绕回去。 @param {number} step */
  next(step) {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (((this.at + step * k) % n) + n) % n;
      if (!this.items[i].row.off) return i;
    }
    return this.at;
  }

  /** @param {number} i */
  mark(i) {
    this.at = i;
    this.items.forEach((x, j) => x.el.classList.toggle('is-selected', j === i));
    this.items[i]?.el.scrollIntoView({ block: 'nearest' });
  }

  /** 选定一项：先关上（它要换一屏的自己再开；`keep` 的不关）。 @param {Row} r */
  pick(r) {
    if (r.off || r.still) return;
    const el = this.items.find((x) => x.row === r)?.el;
    if (!r.keep) this.close();
    r.pick(/** @type {HTMLElement} */ (el));
  }
}
