// @ts-check
//! 对话那一列的宽能拖（蓝图 `web.md`「样子」三列那一条下面；2026-10-23 项目主人：照 DeepSeek Harness，两边能拖，但不要看得出来的线）：
//! 这一列左右两边沿各一条看不见的抓手（指针移上去正中淡入一个小把手），按住拖两边一起对称地变宽变窄；双击回到出厂的宽；记在这台设备上（内核的 `storage`，按账号分开）。
//! 宽写在对话区上的 `--chat-w`，正文、输入框、空会话的首页照它（styles/chat.css、composer.css）。

import { h, scaleOf } from './dom.js';

/** 记在这台设备上的名字 */
const KEY = 'chat.width';
/** 最窄、出厂（px） */
const MIN = 560;
export const DEFAULT_WIDTH = 980;

/**
 * 拖到 `x` 时这一列多宽：照正中对称（离正中多远 × 2），夹在最窄和对话区的宽之间。纯函数。
 * @param {number} x 指针 @param {number} center 这一列的正中 @param {number} room 对话区多宽
 */
export function widthAt(x, center, room) {
  return Math.round(Math.max(MIN, Math.min(room, Math.abs(x - center) * 2)));
}

export class ChatWidth {
  /**
   * @param {HTMLElement} stage 对话区（`--chat-w` 写在它上面，抓手挂在它里面）
   * @param {() => HTMLElement|null} column 量这一列在哪（正文那一列）
   * @param {{get: (k: string, d: any) => any, set: (k: string, v: any) => void}} storage
   */
  constructor(stage, column, storage) {
    this.stage = stage;
    this.column = column;
    this.storage = storage;
    const saved = Number(storage.get(KEY, 0));
    this.width = saved >= MIN ? saved : null;
    this.grips = [h('div.chat-grip', { 'aria-hidden': 'true' }), h('div.chat-grip', { 'aria-hidden': 'true' })];
    for (const grip of this.grips) {
      grip.addEventListener('pointerdown', (e) => this.down(e, grip));
      grip.addEventListener('dblclick', () => this.set(null));
      // 抓手盖在正文的边上：在它上面滚滚轮照样滚正文
      grip.addEventListener('wheel', (e) => { stage.querySelector('.chat-scroll')?.scrollBy({ top: e.deltaY, left: 0 }); }, { passive: true });
      stage.append(grip);
    }
    this.apply();
    const watch = new ResizeObserver(() => this.place());
    watch.observe(stage);
    const col = column();
    if (col) watch.observe(col);
  }

  /** 写上 `--chat-w`（没拖过的拿掉，照出厂的）、记下，摆抓手 @param {number|null} w */
  set(w) {
    this.width = w;
    this.storage.set(KEY, w ?? 0);
    this.apply();
  }

  apply() {
    if (this.width) this.stage.style.setProperty('--chat-w', `${this.width}px`);
    else this.stage.style.removeProperty('--chat-w');
    this.place();
  }

  /** 抓手摆在这一列的两个边沿上；对话区比出厂的宽还窄（窗口小、开着预览工作区）的不出 */
  place() {
    const col = this.column();
    const r = col?.getBoundingClientRect();
    const s = this.stage.getBoundingClientRect();
    // 量到的是屏幕上的像素，整页放大（`--ui-scale`）以后要换回对话区自己的 CSS 像素
    const k = scaleOf(this.stage) || 1;
    const room = s.width / k;
    const roomy = !!r && r.width > 0 && room >= MIN + 80;
    for (const [i, grip] of this.grips.entries()) {
      grip.hidden = !roomy;
      if (!roomy || !r) continue;
      const x = ((i === 0 ? r.left : r.right) - s.left) / k;
      // 这一列撑满对话区时抓手不出对话区（不盖到左栏上）
      grip.style.left = `${Math.round(Math.max(0, Math.min(room - 12, x - 6)))}px`;
    }
  }

  /** 按住拖：两边照正中对称地变 @param {PointerEvent} e @param {HTMLElement} grip */
  down(e, grip) {
    if (e.button !== 0) return;
    e.preventDefault();
    const col = this.column();
    const r = col?.getBoundingClientRect();
    if (!r) return;
    const k = scaleOf(this.stage) || 1;
    const center = r.left + r.width / 2;
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('is-dragging');
    document.documentElement.classList.add('is-chat-resizing');
    const move = (/** @type {PointerEvent} */ ev) => {
      const room = this.stage.getBoundingClientRect().width;
      this.width = Math.round(widthAt(ev.clientX, center, room) / k);
      this.apply();
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      grip.classList.remove('is-dragging');
      document.documentElement.classList.remove('is-chat-resizing');
      this.set(this.width === DEFAULT_WIDTH ? null : this.width);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  }
}
