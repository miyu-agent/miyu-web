// @ts-check
//! 左栏拖会话（蓝图 `web.md`「会话整理和项目」第 5 条）：左键按住一个顶层会话挪过 5px 拖起来，那一行变成一张浮起来的小卡片跟着指针，
//! 原处淡下去；指针下面能放的那一块亮起来：「置顶」那一栏（置顶；还没有置顶的，拖起来时临时露出一块「拖到这里置顶」）、下面按时间
//! 分组的会话（取消置顶）。项目（移进项目）等核心有了项目再加。拖到左栏上下边上 40px 以内左栏跟着滚；`Esc` 取消；拖过的那一下
//! 不算点开。不用浏览器的拖放（Firefox 里不灵，2026-10-19 项目主人：拖动没成功）。

import { h } from './dom.js';
import { t } from '../util/res.js';

/** 挪过几像素算拖起来、离边多近开始滚、一帧滚几像素 */
const START_PX = 5;
const EDGE_PX = 40;
const SCROLL_PX = 8;

export class SessionDrag {
  /**
   * @param {{items: HTMLElement, list: HTMLElement|null, selecting: boolean, renaming: string|null, last: [any[], string|null],
   *   pinnedHeader: HTMLElement, sep: HTMLElement, on: {pin: (id: string, on: boolean) => Promise<void>}}} bar 左栏（`sidebar.js`）
   */
  constructor(bar) {
    this.bar = bar;
    /** @type {null|{id: string, pinned: boolean, row: HTMLElement, x: number, y: number, dx: number, dy: number, on: boolean,
     *   ghost: HTMLElement|null, zone: 'pin'|'loose'|null, hint: HTMLElement|null, mark: HTMLElement|null, scroll: any}} */
    this.drag = null;
    bar.items.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', () => this.end(false));
    addEventListener('pointercancel', () => this.end(true));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.drag?.on) this.end(true); });
  }

  /** @param {PointerEvent} e */
  down(e) {
    const bar = this.bar;
    if (e.button !== 0 || bar.selecting || e.pointerType === 'touch') return;
    const target = /** @type {Element} */ (e.target);
    // 菜单按钮、展开的箭头、改名的框不算
    if (target.closest('.session-menu-button, .session-menu, .session-fold, .session-kids, input')) return;
    const row = /** @type {HTMLElement|null} */ (target.closest('.session-item'));
    const id = row?.dataset.session;
    if (!row || !id || row.classList.contains('is-child') || bar.renaming === id) return;
    const item = bar.last[0].find((it) => it.session === id);
    if (!item) return;
    this.drag = { id, pinned: !!item.pinned, row, x: e.clientX, y: e.clientY, dx: 0, dy: 0, on: false, ghost: null, zone: null, hint: null, mark: null, scroll: 0 };
  }

  /** @param {PointerEvent} e */
  move(e) {
    const d = this.drag;
    if (!d) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < START_PX) return;
      this.start(d);
    }
    e.preventDefault();
    if (d.ghost) d.ghost.style.transform = `translate(${e.clientX - d.dx}px, ${e.clientY - d.dy}px) rotate(-1.5deg)`;
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
      d.hint = h('div.session-drop-hint', t('sidebar.drop_pin'));
      this.bar.items.prepend(d.hint);
    }
  }

  /** 指针下面是哪一块：置顶那一栏（头、行、临时露出来的那一块）还是下面的会话；放不了的（本来就在那边）交 `null` @param {number} x @param {number} y */
  zoneAt(x, y) {
    const d = this.drag;
    const bar = this.bar;
    if (!d) return null;
    const el = document.elementFromPoint(x, y);
    if (!el || !bar.items.contains(el)) return null;
    const pinnedIds = new Set(bar.last[0].filter((it) => it.pinned).map((it) => it.session));
    const row = /** @type {HTMLElement|null} */ (el.closest('.session-item, .session-group-header, .session-drop-hint, .session-done-row'));
    if (!row) return null;
    // 在置顶那一栏里：它的头、临时那一块、置顶的会话（连同挂在它下面的子代理行，照它前面最近的顶层行算）
    let zone = /** @type {'pin'|'loose'} */ ('loose');
    if (row === bar.pinnedHeader || row.classList.contains('session-drop-hint')) zone = 'pin';
    else {
      const sepAt = bar.sep.isConnected ? [...bar.items.children].indexOf(bar.sep) : -1;
      const at = [...bar.items.children].indexOf(row);
      if (pinnedIds.size && (sepAt < 0 ? false : at < sepAt)) zone = 'pin';
    }
    if (zone === 'pin' && d.pinned) return null;
    if (zone === 'loose' && !d.pinned) return null;
    return zone;
  }

  /** 亮起那一块：一张盖在那一段上面的框（行是平铺的，没有包着一段的元素） @param {'pin'|'loose'|null} zone */
  mark(zone) {
    const d = this.drag;
    if (!d || d.zone === zone) return;
    d.zone = zone;
    d.mark?.remove();
    d.mark = null;
    if (!zone) return;
    // 置顶那一段：细线以上（还没有置顶的就是临时那一块）；下面那一段：细线以下（没有细线的是除了临时那一块的全部），不算「查看全部」
    const kids = [...this.bar.items.children];
    const sepAt = kids.indexOf(this.bar.sep);
    const part = zone === 'pin'
      ? (d.hint ? [d.hint] : kids.slice(0, sepAt >= 0 ? sepAt : kids.length))
      : kids.slice(sepAt >= 0 ? sepAt + 1 : 0).filter((el) => el !== d.hint && !el.classList.contains('session-all'));
    const boxes = part.map((el) => el.getBoundingClientRect()).filter((r) => r.height);
    if (!boxes.length) return;
    // 盖在会话表那一层（`.session-track`，相对它定位）上
    const track = /** @type {HTMLElement} */ (this.bar.items.parentElement);
    const host = track.getBoundingClientRect();
    const top = Math.min(...boxes.map((r) => r.top)) - host.top;
    const bottom = Math.max(...boxes.map((r) => r.bottom)) - host.top;
    d.mark = h('div.session-drop-zone', { style: `top: ${top - 2}px; height: ${bottom - top + 4}px` });
    track.prepend(d.mark);
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
    this.drag = null;
    if (!d?.on) return;
    clearInterval(d.scroll);
    d.ghost?.remove();
    d.mark?.remove();
    d.hint?.remove();
    d.row.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-session');
    // 松手不在原处时浏览器不发 click：这一拦当场撤掉，免得吞了下一次真的点
    const eat = (/** @type {Event} */ ev) => { ev.stopPropagation(); ev.preventDefault(); };
    addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', eat, { capture: true }), 0);
    if (cancel || !d.zone) return;
    this.bar.on.pin(d.id, d.zone === 'pin');
  }
}
