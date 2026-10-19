// @ts-check
//! 左栏拖会话（蓝图 `web.md`「会话整理和项目」第 5 条）：左键按住一个顶层会话挪过 5px 拖起来，那一行变成一张浮起来的小卡片跟着指针，
//! 原处淡下去；指针下面能放的那一块亮起来：「置顶」那一栏（置顶；还没有置顶的，拖起来时临时露出一块「拖到这里置顶」）、下面按时间
//! 分组的会话（取消置顶、移出项目）、一个项目（移进去，同时取消置顶；核心 H-2）。哪一块放得下照左栏给每一行写的 `data-zone`（`pin`、`loose`、
//! `project:<编号>`）。拖到左栏上下边上 40px 以内左栏跟着滚；`Esc` 取消；拖过的那一下不算点开。不用浏览器的拖放（Firefox 里不灵，2026-10-19
//! 项目主人：拖动没成功）。

import { h } from './dom.js';
import { t } from '../util/res.js';

/** 挪过几像素算拖起来、离边多近开始滚、一帧滚几像素 */
const START_PX = 5;
const EDGE_PX = 40;
const SCROLL_PX = 8;

export class SessionDrag {
  /**
   * @param {{items: HTMLElement, list: HTMLElement|null, selecting: boolean, renaming: string|null, last: [any[], string|null],
   *   pinnedHeader: HTMLElement, on: {pin: (id: string, on: boolean) => Promise<void>,
   *   place: (id: string, patch: {pinned?: boolean, project?: string|null}) => Promise<void>}}} bar 左栏（`sidebar.js`）
   */
  constructor(bar) {
    this.bar = bar;
    /** @type {null|{id: string, pinned: boolean, project: string|null, row: HTMLElement, x: number, y: number, dx: number, dy: number, on: boolean,
     *   ghost: HTMLElement|null, zone: string|null, hint: HTMLElement|null, lit: HTMLElement|null, scroll: any}} */
    this.drag = null;
    bar.items.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', () => this.end(false));
    addEventListener('pointercancel', () => this.end(true));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.drag?.on) this.end(true); });
    // 拖着的时候切走了（别的窗口拿了焦点、页面到了后台）：收不到松手，当取消（2026-10-19 项目主人：切回来卡在半路）
    addEventListener('blur', () => this.end(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.end(true); });
  }

  /** @param {PointerEvent} e */
  down(e) {
    const bar = this.bar;
    if (e.button !== 0 || bar.selecting || e.pointerType === 'touch') return;
    const target = /** @type {Element} */ (e.target);
    // 菜单按钮、展开的箭头、改名的框、项目那一行不算
    if (target.closest('.session-menu-button, .session-menu, .session-fold, .session-kids, input, .project-row')) return;
    const row = /** @type {HTMLElement|null} */ (target.closest('.session-item'));
    const id = row?.dataset.session;
    if (!row || !id || row.classList.contains('is-child') || bar.renaming === id) return;
    const item = bar.last[0].find((it) => it.session === id);
    if (!item) return;
    this.drag = { id, pinned: !!item.pinned, project: item.project ?? null, row, x: e.clientX, y: e.clientY, dx: 0, dy: 0, on: false, ghost: null, zone: null, hint: null, lit: null, scroll: 0 };
  }

  /** @param {PointerEvent} e */
  move(e) {
    const d = this.drag;
    if (!d) return;
    // 指针回来时已经松开了（在别处松的手）：当取消
    if (e.buttons === 0) {
      this.end(true);
      return;
    }
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < START_PX) return;
      this.start(d);
    }
    e.preventDefault();
    if (d.ghost) d.ghost.style.transform = `translate(${e.clientX - d.dx}px, ${e.clientY - d.dy}px) `;
    this.edgeScroll(e.clientY);
    this.mark(this.zoneAt(e.clientX, e.clientY));
  }

  /** 拖起来：浮起来的小卡片、原处淡下去；没有置顶的露出「拖到这里置顶」 @param {NonNullable<SessionDrag['drag']>} d */
  start(d) {
    d.on = true;
    const r = d.row.getBoundingClientRect();
    d.dx = d.x - r.left;
    d.dy = d.y - r.top;
    const title = /** @type {HTMLElement|null} */ (d.row.querySelector('.session-copy strong'))?.textContent ?? '';
    d.ghost = h('div.session-ghost', { style: `width: ${r.width}px` }, title);
    document.body.append(d.ghost);
    d.row.classList.add('is-dragging');
    document.body.classList.add('is-dragging-session');
    if (!this.bar.pinnedHeader.isConnected && !d.pinned) {
      d.hint = h('div.session-drop-hint', { dataset: { zone: 'pin' } }, t('sidebar.drop_pin'));
      this.bar.items.prepend(d.hint);
    }
  }

  /** 这个会话现在在哪一块：置顶的在置顶，项目里的在它的项目，别的在下面 */
  home() {
    const d = this.drag;
    return !d ? null : d.pinned ? 'pin' : d.project ? `project:${d.project}` : 'loose';
  }

  /** 指针下面是哪一块（`data-zone`）；放不了的（本来就在那边、项目那一栏的头）交 `null` @param {number} x @param {number} y */
  zoneAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!this.drag || !el || !this.bar.items.contains(el)) return null;
    // 落在两行之间的缝里：照旧亮着刚才那一块，不闪
    if (el === this.bar.items) return this.drag.zone;
    const zone = /** @type {HTMLElement|null} */ (el.closest('[data-zone]'))?.dataset.zone ?? null;
    return zone && zone !== this.home() ? zone : null;
  }

  /**
   * 亮起那一块（`accent_soft` 底、一圈 `accent`）：每一块都是一个元素（一栏、一个项目、临时那一块「拖到这里置顶」），给它自己加 `is-drop-on`，
   * 照它自己的圆角、边画（2026-10-19 项目主人：原来另盖一张框，和虚线框、里面的会话对不上）。
   * @param {string|null} zone
   */
  mark(zone) {
    const d = this.drag;
    if (!d || d.zone === zone) return;
    d.zone = zone;
    this.unmark();
    if (!zone) return;
    const el = zone === 'pin' && d.hint ? d.hint : /** @type {HTMLElement|null} */ ([...this.bar.items.querySelectorAll('[data-zone]')].find((x) => x instanceof HTMLElement && x.dataset.zone === zone) ?? null);
    if (!el) return;
    el.classList.add('is-drop-on');
    d.lit = el;
  }

  /** 收起亮着的那一块 */
  unmark() {
    const d = this.drag;
    if (!d) return;
    d.lit?.classList.remove('is-drop-on');
    d.lit = null;
  }

  /** 拖到左栏上下边上：跟着滚 @param {number} y */
  edgeScroll(y) {
    const d = this.drag;
    const list = this.bar.list;
    if (!d || !list) return;
    const r = list.getBoundingClientRect();
    const v = y < r.top + EDGE_PX ? -SCROLL_PX : y > r.bottom - EDGE_PX ? SCROLL_PX : 0;
    clearInterval(d.scroll);
    d.scroll = v ? setInterval(() => { list.scrollTop += v; }, 16) : 0;
  }

  /** 松手（`cancel` 的是取消）：放进亮着的那一块；拖过的那一下不算点开 @param {boolean} cancel */
  end(cancel) {
    const d = this.drag;
    if (d?.on) this.unmark();
    this.drag = null;
    if (!d?.on) return;
    clearInterval(d.scroll);
    d.ghost?.remove();
    d.hint?.remove();
    d.row.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-session');
    // 松手不在原处时浏览器不发 click：这一拦当场撤掉，免得吞了下一次真的点
    const eat = (/** @type {Event} */ ev) => { ev.stopPropagation(); ev.preventDefault(); };
    addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', eat, { capture: true }), 0);
    if (cancel || !d.zone) return;
    // 置顶：只改置顶（项目里的照旧在项目里）；下面：取消置顶、移出项目；项目：移进去，同时取消置顶
    if (d.zone === 'pin') this.bar.on.pin(d.id, true);
    else if (d.zone === 'loose') this.bar.on.place(d.id, { ...(d.pinned ? { pinned: false } : {}), ...(d.project ? { project: null } : {}) });
    else this.bar.on.place(d.id, { project: d.zone.slice('project:'.length), ...(d.pinned ? { pinned: false } : {}) });
  }
}
