// @ts-check
//! 左栏多宽（蓝图 `web.md`「整页」左栏的宽那一条，2026-10-30 项目主人：左栏太宽，窗口窄的时候跟着收窄，或者像右栏那样能拖、记住）：
//! 出厂照主题的 `--side-width`（252px），窗口窄时照窗口宽的 22% 收窄，最窄 200px；右边沿一条看不见的抓手，按住拖改宽（最窄 200、最宽 400，
//! 也不超过窗口宽的 36%），拖到离出厂 10px 以内吸过去、当没拖过；双击回到出厂。拖过的记在这台设备上（内核的 `storage`）。
//! 窗口变了照放得下的画、不改记下的：夹宽交给 CSS（`sidebar.css` 的 `--left-w`），这里只写拖过的 `--side-drag`。

import { h } from './dom.js';
import { t } from '../util/res.js';

/** 最窄、拖得到的最宽（px，自己的 CSS 像素） */
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 400;
/** 没拖过的照窗口宽的几成收窄；拖过的最宽占窗口宽的几成 */
const AUTO_SHARE = 0.22;
const DRAG_SHARE = 0.36;
/** 拖到离出厂这么近就吸过去（px） */
const SNAP_PX = 10;
/** 拖过的宽记在这台设备上的名字（内核的 `storage` 会带上账号）；0 是没拖过 */
const WIDTH = 'sidebar_width';

/**
 * 没拖过的这时多宽：照窗口宽的 22%，夹在最窄和出厂之间（主题写得比最窄还窄的照主题的）。
 * @param {number} view 窗口多宽（自己的 CSS 像素） @param {number} [base] 出厂（主题的 `--side-width`）
 */
export function autoWidth(view, base = 252) {
  const floor = Math.min(SIDEBAR_MIN, base);
  return Math.round(Math.max(floor, Math.min(view * AUTO_SHARE, base)));
}

/**
 * 拖到的宽：夹在最窄和放得下的最宽之间；离出厂 10px 以内交 0（吸过去、当没拖过）。
 * @param {number} want @param {number} view 窗口多宽 @param {number} [base] 出厂
 */
export function dragWidth(want, view, base = 252) {
  const most = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, view * DRAG_SHARE));
  const w = Math.round(Math.max(SIDEBAR_MIN, Math.min(want, most)));
  return Math.abs(w - autoWidth(view, base)) <= SNAP_PX ? 0 : w;
}

export class SidebarWidth {
  /**
   * @param {HTMLElement} shell 三列那一层（`--side-drag` 写在它上面）
   * @param {HTMLElement} sidebar 左栏（抓手放在它的右边沿）
   * @param {{storage?: {get: (key: string, fallback: any) => any, set: (key: string, value: any) => void}, changed?: () => void}} [opts]
   *   记拖过的宽、拖完了（右栏照左栏的宽重算）
   */
  constructor(shell, sidebar, opts = {}) {
    this.shell = shell;
    this.sidebar = sidebar;
    this.storage = opts.storage;
    this.changed = opts.changed ?? (() => {});
    this.handle = h('div.sidebar-resize-handle', {
      title: t('artifacts.resize'),
      onpointerdown: (/** @type {PointerEvent} */ e) => this.resize(e),
      ondblclick: () => this.set(0, true),
    });
    sidebar.append(this.handle);
    const stored = Number(this.storage?.get(WIDTH, 0)) || 0;
    this.set(stored > 0 ? stored : 0, false);
  }

  /** 照写的画（0 是没拖过），`keep` 的记下来、告诉外面 @param {number} w @param {boolean} keep */
  set(w, keep) {
    this.width = w;
    if (w > 0) this.shell.style.setProperty('--side-drag', `${w}px`);
    else this.shell.style.removeProperty('--side-drag');
    if (!keep) return;
    this.storage?.set(WIDTH, w);
    this.changed();
  }

  /** 拖右边沿：拖的时候不过渡（三列那一层的宽跟着指针），松手记下来 @param {PointerEvent} e */
  resize(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = this.handle;
    handle.setPointerCapture(e.pointerId);
    this.shell.classList.add('is-artifact-resizing', 'is-side-resizing');
    const scale = parseFloat(getComputedStyle(this.shell).zoom) || 1;
    const base = parseFloat(getComputedStyle(this.shell).getPropertyValue('--side-width')) || 252;
    const left = this.sidebar.getBoundingClientRect().left;
    const move = (/** @type {PointerEvent} */ m) => this.set(dragWidth((m.clientX - left) / scale, innerWidth / scale, base), false);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointercancel', up);
      this.shell.classList.remove('is-artifact-resizing', 'is-side-resizing');
      this.set(this.width, true);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
    handle.addEventListener('pointercancel', up, { once: true });
  }
}
