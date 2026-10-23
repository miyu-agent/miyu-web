// @ts-check
//! 右边那一栏给软件包用（服务 `side`，蓝图 `web.md`「仪表盘」第 1、2 条）：和预览工作区共用右边那一栏、互斥，开一个关另一个；
//! 包放进去一块内容，照三种打开：`narrow` 窄栏（推开正文）、`wide` 宽栏（同预览工作区的宽，点进去看东西时）、`overlay` 盖在上面
//! （窗口不够宽：不推正文，点外面、`Esc` 收起）。推开正文的两种开合照预览工作区的「浮现」（`artifacts.js` 的 `swapWidth`）。
//! 放不放得下照左栏自动收起那一套算（`fits`）；布局变了（窗口拉宽拉窄、预览工作区把这一栏占走、点外面收起）告诉包。

import { h, replace } from './dom.js';
import { res } from '../util/res.js';

/** 窄栏多宽（px，自己的 CSS 像素） */
export const NARROW_WIDTH = 364;

/** @typedef {'narrow'|'wide'|'overlay'} Mode */

export class SideColumn {
  /**
   * @param {HTMLElement} shell 三列那一层
   * @param {import('./artifacts.js').Artifacts} artifacts 预览工作区（互斥、借它的换宽动画）
   * @param {() => void} relayout 布局变了（自动收起、放回左栏）
   */
  constructor(shell, artifacts, relayout) {
    this.shell = shell;
    this.artifacts = artifacts;
    this.relayout = relayout;
    this.el = h('aside.side-column', { hidden: true });
    /** @type {Mode|null} */
    this.mode = null;
    /** @type {Set<(state: {mode: Mode|null, fits: boolean, why: string}) => void>} */
    this.listeners = new Set();
    this.onDown = (/** @type {PointerEvent} */ e) => {
      const at = /** @type {Element} */ (e.target);
      if (this.mode !== 'overlay' || this.el.contains(at) || at.closest?.('.stage-tools')) return;
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
    replace(this.el, node);
    return () => {
      if (this.el.firstChild !== node) return;
      this.close('unmounted');
      replace(this.el);
    };
  }

  /** 开着时对话那一列还剩得下 `chat_min` 不：窄栏的宽照算，左栏会自动收起的不算它（照「仪表盘」第 2 条）；窄屏一律放不下 */
  fits() {
    if (innerWidth <= res.layout.narrow_below) return false;
    const scale = parseFloat(getComputedStyle(this.shell).zoom) || 1;
    return innerWidth / scale - NARROW_WIDTH >= res.artifacts.chat_min;
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
    this.el.hidden = false;
    this.el.classList.toggle('is-overlay', mode === 'overlay');
    if (mode === 'overlay') {
      // 盖在上面：不动那一列；原来推着正文的收回去
      if (was && was !== 'overlay') this.swap(false, -1);
      this.listen(true);
      this.tell('open');
      return;
    }
    this.listen(false);
    this.swap(true, was && was !== 'overlay' ? 0 : 1);
    this.tell('open');
  }

  /** 收起 @param {string} [why] */
  close(why = 'close') {
    if (!this.mode) return;
    const was = this.mode;
    this.mode = null;
    this.listen(false);
    if (was === 'overlay') {
      this.el.classList.remove('is-overlay');
      this.el.hidden = true;
    } else this.swap(false, -1);
    this.tell(why);
  }

  /** 预览工作区要占这一栏：不动画、一下子让出来（它自己在动画里） */
  yield() {
    if (!this.mode) return;
    this.mode = null;
    this.listen(false);
    this.el.classList.remove('is-overlay');
    this.el.hidden = true;
    this.shell.classList.remove('has-side');
    this.tell('taken');
  }

  /**
   * 推开正文的那一列换宽：宽度一下子换（照预览工作区的 `swapWidth`：正文淡出、换宽、淡入），预览工作区开着的让它关上（不另动画）。
   * @param {boolean} on @param {number} dir 正文从哪边挪回来：1 往左推开、-1 往右放回、0 只换宽
   */
  swap(on, dir) {
    const apply = () => {
      this.shell.classList.add('is-artifact-swapping');
      if (on && this.artifacts.open) this.artifacts.setOpen(false, { swap: false });
      this.shell.classList.toggle('has-side', on);
      this.shell.style.setProperty('--side-w', this.mode === 'wide' ? 'calc(var(--artifact-ratio) * 100vw / var(--ui-scale))' : `${NARROW_WIDTH}px`);
      if (!on && this.mode !== 'overlay') this.el.hidden = true;
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
