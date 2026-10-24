// @ts-check
//! 右边那一栏给软件包用（服务 `side`，蓝图 `web.md`「仪表盘」第 1、2 条）：和预览工作区共用右边那一栏、互斥，开一个关另一个；
//! 包放进去一块内容，照三种打开：`narrow` 窄栏（推开正文）、`wide` 宽栏（同预览工作区的宽，点进去看东西时）、`overlay` 盖在上面
//! （窗口不够宽：不推正文，点外面、`Esc` 收起）。推开正文的两种开合照预览工作区的「浮现」（`artifacts.js` 的 `swapWidth`）：这一栏等换好宽
//! 才浮现（不在 0 宽的时候先放掉动画），收起时浮在原处淡掉、往右偏（不跟着那一列收成 0 被裁掉）；预览工作区占过来时跟着正文一起淡掉
//! （`fadeable`）；回到这一栏时正文从左边挪回来（2026-10-24 项目主人：右栏开合、进出工作区没有动画，返回的不对）。
//! 放不放得下照左栏自动收起那一套算（`fits`）；布局变了（窗口拉宽拉窄、预览工作区把这一栏占走、点外面收起）告诉包。
//! 窄栏左边缘能拖着改宽（2026-10-24 项目主人）：默认、最窄都是左栏这时的宽（`base`，同一天项目主人：原来 312 比左栏宽一点），最宽到对话那一列
//! 只剩 `chat_min`（`room`），拖过的记在这台设备上；放不下记下的宽时照放得下的最宽画，不改记下的。

import { h, replace } from './dom.js';
import { show, hide } from '../lib/motion.js';
import { res, t } from '../util/res.js';

/** 量不到左栏的宽时窄栏默认、最窄多宽（px，自己的 CSS 像素；同左栏出厂的宽） */
export const NARROW_WIDTH = 252;
/** 拖过的宽记在这台设备上的名字（内核的 `storage` 会带上账号） */
const WIDTH = 'side_width';
/** 原来的最窄（2026-10-24 改成照左栏以前）：记着的正好是它的，是那时拖到了最窄，现在照最窄（左栏的宽）画 */
const OLD_NARROWEST = 312;
/** 拖到离最窄（左栏的宽）这么近就吸过去（px，自己的 CSS 像素），好和左栏一样宽 */
const SNAP_PX = 10;

/**
 * 窄栏画多宽：照要的（拖过的、记下的；没拖过的是最窄），夹在最窄和放得下的最宽之间；放得下的比最窄还窄的照最窄（放不放得下包自己照
 * `fits` 管）。
 * @param {number} want @param {number} room 对话那一列只剩 `chat_min` 时这一栏能有多宽 @param {number} [min] 最窄（左栏的宽）
 */
export function sideWidth(want, room, min = NARROW_WIDTH) {
  const floor = Number.isFinite(min) && min > 0 ? min : NARROW_WIDTH;
  const w = Number.isFinite(want) && want > 0 ? want : floor;
  return Math.round(Math.max(floor, Math.min(w, Number.isFinite(room) ? room : w)));
}

/** @typedef {'narrow'|'wide'|'overlay'} Mode */

export class SideColumn {
  /**
   * @param {HTMLElement} shell 三列那一层
   * @param {import('./artifacts.js').Artifacts} artifacts 预览工作区（互斥、借它的换宽动画）
   * @param {() => void} relayout 布局变了（自动收起、放回左栏）
   * @param {{storage?: {get: (key: string, fallback: any) => any, set: (key: string, value: any) => void}, room?: () => number, base?: () => number}} [opts]
   *   记拖过的宽、对话那一列只剩 `chat_min` 时这一栏能有多宽、左栏这时多宽（窄栏默认、最窄照它）
   */
  constructor(shell, artifacts, relayout, opts = {}) {
    this.shell = shell;
    this.artifacts = artifacts;
    this.relayout = relayout;
    this.storage = opts.storage ?? null;
    this.room = opts.room ?? (() => Infinity);
    this.base = opts.base ?? (() => NARROW_WIDTH);
    /** 拖过的宽（没拖过的、拖到过原来的最窄的是 0：照最窄，2026-10-24 项目主人：拖到最窄和左栏并不一样宽） */
    const stored = Number(this.storage?.get(WIDTH, 0)) || 0;
    this.width = stored === OLD_NARROWEST ? 0 : stored;
    // 左边缘拖着改宽：只在窄栏露（盖在上面的、点进去看工作区的不露）
    this.handle = h('div.side-resize-handle', { hidden: true, title: t('artifacts.resize'), onpointerdown: (/** @type {PointerEvent} */ e) => this.resize(e) });
    this.el = h('aside.side-column', { hidden: true }, this.handle);
    /** @type {Mode|null} */
    this.mode = null;
    /** @type {Set<(state: {mode: Mode|null, fits: boolean, why: string}) => void>} */
    this.listeners = new Set();
    this.onDown = (/** @type {PointerEvent} */ e) => {
      const at = /** @type {Element} */ (e.target);
      // 这一栏里的东西开的浮层（放在页面最上面一层的菜单，带 `data-keeps-side`）算里面，点了不收
      if (this.mode !== 'overlay' || this.el.contains(at) || at.closest?.('.stage-tools, [data-keeps-side]')) return;
      this.close('outside');
    };
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (this.mode !== 'overlay' || e.key !== 'Escape') return;
      e.stopPropagation();
      this.close('escape');
    };
    addEventListener('resize', () => this.tell('resize'));
  }

  /** 放进一块内容（同一时间只有一块）；交回怎么拿掉 @param {Node} node */
  mount(node) {
    replace(this.el, this.handle, node);
    return () => {
      if (this.el.lastChild !== node) return;
      this.close('unmounted');
      replace(this.el, this.handle);
    };
  }

  /** 窄栏现在画多宽（拖过的，夹在放得下的里；没拖过的同左栏） */
  narrowWidth() {
    return sideWidth(this.width, this.room(), this.base());
  }

  /** 窗口、左栏变了：推着正文的窄栏照放得下的重新夹一次宽 */
  fitWidth() {
    if (this.mode === 'narrow' && this.shell.classList.contains('has-side')) this.shell.style.setProperty('--side-w', `${this.narrowWidth()}px`);
  }

  /** 拖左边缘改宽：拖的时候不过渡（三列那一层的宽一下一下跟着指针），松手记下来、叫一次布局 @param {PointerEvent} e */
  resize(e) {
    if (this.mode !== 'narrow' || e.button !== 0) return;
    e.preventDefault();
    const handle = this.handle;
    handle.setPointerCapture(e.pointerId);
    this.shell.classList.add('is-artifact-resizing', 'is-side-resizing');
    const scale = parseFloat(getComputedStyle(this.shell).zoom) || 1;
    const move = (/** @type {PointerEvent} */ m) => {
      const base = sideWidth(0, Infinity, this.base());
      const w = sideWidth((innerWidth - m.clientX) / scale, this.room(), this.base());
      // 拖到离左栏的宽很近：吸过去，和左栏一样宽
      this.width = Math.abs(w - base) <= SNAP_PX ? base : w;
      this.shell.style.setProperty('--side-w', `${this.width}px`);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointercancel', up);
      this.shell.classList.remove('is-artifact-resizing', 'is-side-resizing');
      this.storage?.set(WIDTH, this.width);
      this.relayout();
      this.tell('resize');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
    handle.addEventListener('pointercancel', up, { once: true });
  }

  /** 开着时对话那一列还剩得下 `chat_min` 不：窄栏的宽照算，左栏会自动收起的不算它（照「仪表盘」第 2 条）；窄屏一律放不下 */
  fits() {
    if (innerWidth <= res.layout.narrow_below) return false;
    const scale = parseFloat(getComputedStyle(this.shell).zoom) || 1;
    return innerWidth / scale - sideWidth(0, Infinity, this.base()) >= res.artifacts.chat_min;
  }

  /** 预览工作区展示过的那几样（主会话的，拿掉的不算）、面板里挂着几件、来了新的没看、开没开着、在不在借着看别的（`side.work`） */
  works() {
    const a = this.artifacts;
    return {
      list: a.list.map((x) => ({ path: x.path, name: x.name, title: x.title ?? null, kind: x.kind, seq: x.seq })),
      panel: a.panelItems, fresh: a.fresh, open: a.open, presenting: !!a.presenting,
    };
  }

  /** 工作区开在面板那一页 */
  openPanel() {
    this.artifacts.tab = 'panel';
    if (this.artifacts.open) this.artifacts.setTab('panel');
    else this.artifacts.setOpen(true);
  }

  /** 这一栏空着不（预览工作区没占着）：包自己开之前问一句，别把人开着的工作区挤掉 */
  free() {
    return !this.artifacts.open;
  }

  /** 照一种打开（已经这样开着的什么也不做） @param {Mode} mode */
  open(mode) {
    if (this.mode === mode) return;
    const was = this.mode;
    this.mode = mode;
    this.handle.hidden = mode !== 'narrow';
    this.el.classList.toggle('is-overlay', mode === 'overlay');
    if (mode === 'overlay') {
      // 盖在上面：不动那一列，在自己的位置上浮现；原来推着正文的收回去
      show(this.el);
      if (was && was !== 'overlay') this.swap(false, -1);
      this.listen(true);
      this.tell('open');
      return;
    }
    this.listen(false);
    // 正文从哪边挪回来：从预览工作区回来（这一栏变窄、正文变宽）从左边，原来关着的从右边，窄宽互换的不挪
    const dir = this.artifacts.open ? -1 : was && was !== 'overlay' ? 0 : 1;
    this.swap(true, dir);
    this.tell('open');
  }

  /** 收起：这一栏浮在原处淡掉、往右偏（`artifacts.css` 的 `.side-column.is-leaving`），正文换回原来的宽 @param {string} [why] */
  close(why = 'close') {
    if (!this.mode) return;
    const was = this.mode;
    this.mode = null;
    this.handle.hidden = true;
    this.listen(false);
    hide(this.el);
    if (was !== 'overlay') this.swap(false, -1);
    this.tell(why);
  }

  /** 预览工作区占过来时跟着正文一起淡掉的（开着的这一栏）；`yield` 再一下子藏起来 */
  fadeable() {
    return this.mode && !this.el.hidden ? [this.el] : [];
  }

  /** 预览工作区要占这一栏：已经跟着正文淡掉了，一下子让出来（工作区自己在浮现） */
  yield() {
    if (!this.mode) return;
    this.mode = null;
    this.handle.hidden = true;
    this.listen(false);
    this.el.classList.remove('is-overlay');
    this.el.hidden = true;
    this.shell.classList.remove('has-side');
    this.tell('taken');
  }

  /**
   * 推开正文的那一列换宽：宽度一下子换（照预览工作区的 `swapWidth`：正文淡出、换宽、淡入），预览工作区开着的让它关上（它自己淡掉）；
   * 打开的这一栏在换好宽以后才露出来浮现。
   * @param {boolean} on @param {number} dir 正文从哪边挪回来：1 往左推开、-1 往右放回、0 只换宽
   */
  swap(on, dir) {
    const apply = () => {
      this.shell.classList.add('is-artifact-swapping');
      // 收起时浮在原处淡掉的那一下照收起之前的宽（`--side-w` 不跟着换）
      if (on) this.shell.style.setProperty('--side-w', this.mode === 'wide' ? 'calc(var(--artifact-ratio) * 100vw / var(--ui-scale))' : `${this.narrowWidth()}px`);
      this.shell.classList.toggle('has-side', on);
      // 换宽要在工作区关上之前：它关的时候量一下、拿掉不过渡宽的类，晚了这一列的宽就连续变过去（2026-10-24 量到从 0 长到 343px）
      if (on && this.artifacts.open) this.artifacts.setOpen(false, { swap: false });
      if (on && this.mode) show(this.el);
      this.relayout();
      void this.shell.offsetWidth;
      this.shell.classList.remove('is-artifact-swapping');
    };
    if (!on && !this.shell.classList.contains('has-side')) return apply();
    this.artifacts.swapWidth(apply, dir * 24);
  }

  /** 盖在上面时听点外面、`Esc` @param {boolean} on */
  listen(on) {
    document.removeEventListener('pointerdown', this.onDown, true);
    document.removeEventListener('keydown', this.onKey, true);
    if (!on) return;
    document.addEventListener('pointerdown', this.onDown, true);
    document.addEventListener('keydown', this.onKey, true);
  }

  /** 布局变了，告诉包 @param {(state: {mode: Mode|null, fits: boolean, why: string}) => void} fn */
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** @param {string} why */
  tell(why) {
    const state = { mode: this.mode, fits: this.fits(), why };
    for (const fn of this.listeners) {
      try {
        fn(state);
      } catch (err) {
        console.error('右边那一栏的布局通知出错了', err);
      }
    }
  }
}
