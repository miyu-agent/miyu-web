// @ts-check
//! 换会话头一次画进来很多块的时候先不排版视口外的（W-1110，蓝图 `web.md`「换会话时对话区的正文」那一行）：块带 `is-deferred`
//! （`content-visibility: auto`），浏览器只排看得见的那几块，换会话当场就快（2026-11-06 量出来：长会话每切一次整份排版、绘制，两三个
//! 一百多毫秒的长任务，页面停一下）。随后趁空闲一批批摘掉，排成真高度：对话区关了浏览器的滚动锚定（`overflow-anchor: none`，滚动由
//! `follow.js` 管），视口上方的块长出来（或者缩回去）的那一截交给 `shifted` 补上，看着的地方不动。几百毫秒里就全是真高度，跟着最新的、跳转条照旧照
//! 准确的位置算；人一动（按下、滚轮、按键）剩下的当场摘完。换了会话（`clear`）没摘完的不管了：那些节点跟着拿掉。

import { res } from '../util/res.js';

/** 空闲时调：没有 `requestIdleCallback` 的（Safari）照下一个宏任务、给一小段时间。 @param {(d: {timeRemaining: () => number}) => void} fn */
const idle = (fn) => (typeof requestIdleCallback === 'function'
  ? requestIdleCallback(fn, { timeout: 200 })
  : window.setTimeout(() => { const start = performance.now(); fn({ timeRemaining: () => Math.max(0, 8 - (performance.now() - start)) }); }, 16));

/** 取消排着的那一次。 @param {number} id */
const unidle = (id) => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(id) : clearTimeout(id));

/** 视口里最上面那一块（底边在视口顶下面的头一块）。 @param {HTMLElement} list @param {number} top 视口顶（屏幕坐标） */
const topmost = (list, top) => {
  for (const child of /** @type {HTMLCollectionOf<HTMLElement>} */ (list.children)) if (child.getBoundingClientRect().bottom > top) return child;
  return null;
};

export class Deferred {
  /**
   * @param {HTMLElement} scroller 滚的那一层
   * @param {(top: number, by: number, at: number) => void} shifted 视口上方的一块长了 `by`（CSS 像素，变矮是负的）：滚动位置放到
   *   `top`（摘以前的位置加上 `by`）；`at` 是那一块原来在内容里多深
   * @param {() => void} flushed 人一动、剩下的当场摘完了：照摘完的样子当场对一次位置（下一帧量尺寸的再对就是原地，不写滚动位置，
   *   不掐掉跳转条刚开始的平滑滚动）
   */
  constructor(scroller, shifted, flushed) {
    this.scroller = scroller;
    this.shifted = shifted;
    this.flushed = flushed;
    /** @type {HTMLElement[]} 还没摘的，从后往前摘（最新的离视口近） */
    this.queue = [];
    this.handle = 0;
    // 人要动了（点跳转条、往上滚、翻页）：剩下的当场摘完再让人动。不然跳转条照估的高度算去哪，平滑滚到一半又被补滚动位置
    // 掐断（2026-11-06 实测：切过去几百毫秒内点跳转条，一动不动）；点侧栏换会话的不摘，反正要换掉
    const now = (/** @type {Event} */ e) => {
      if (!this.queue.length) return;
      if (e.type === 'pointerdown' && !(this.scroller.closest('main') ?? document.body).contains(/** @type {Node} */ (e.target))) return;
      this.flush();
    };
    document.addEventListener('pointerdown', now, { capture: true, passive: true });
    document.addEventListener('keydown', now, { capture: true, passive: true });
    scroller.addEventListener('wheel', now, { passive: true });
    scroller.addEventListener('touchstart', now, { passive: true });
  }

  /** 这几块先不排版，排进队里等空闲时摘。 @param {HTMLElement[]} nodes */
  add(nodes) {
    if (!nodes.length) return;
    for (const node of nodes) node.classList.add('is-deferred');
    this.queue.push(...nodes);
    if (!this.handle) this.handle = idle((d) => this.run(d, res.layout.defer_batch));
  }

  /** 不摘了（换会话：这些节点跟着拿掉）。 */
  clear() {
    this.queue = [];
    if (this.handle) unidle(this.handle);
    this.handle = 0;
  }

  /** 剩下的当场全摘了：一批摘完，只排一次版。 */
  flush() {
    if (this.handle) unidle(this.handle);
    this.run({ timeRemaining: () => Infinity }, this.queue.length);
    this.flushed();
  }

  /**
   * 空闲的这一段里能摘几批摘几批，没摘完的排下一次。一批 `size` 块一起摘、只量一次：一块一块摘每块都要排一次版，整份摘完比
   * 一次全排还慢十倍（2026-11-06 量出来：剩 40 块一块块摘 600 毫秒，一次全排 60 来毫秒）。
   * @param {{timeRemaining: () => number}} deadline @param {number} size
   */
  run(deadline, size) {
    this.handle = 0;
    const view = this.scroller.getBoundingClientRect();
    let ref = null;
    while (this.queue.length && deadline.timeRemaining() > 1) {
      const batch = this.queue.splice(-size).filter((node) => node.isConnected && node.classList.contains('is-deferred'));
      if (!batch.length) continue;
      // 看着的最上面那一块往下挪了多少就补多少：不量摘掉的块自己长了多少（先不排版的块不跟里面的外边距合并，摘掉以后合并了，
      // 自己的高度和占的地方差一截，2026-11-06 照自己的高度补，视口还是跳一百多像素）；在它下面的挪不动它，不补。量的是排版
      // 位置，整页缩放不影响
      ref ??= topmost(/** @type {HTMLElement} */ (batch[0].parentElement), view.top);
      const before = ref?.offsetTop ?? 0;
      const at = Math.min(...batch.map((node) => node.offsetTop));
      // 照摘以前的滚动位置补：变矮的时候停在底上的，浏览器已经把滚动位置收了一截（滚不到原来那么深），再照收过的减就减了两回
      const from = this.scroller.scrollTop;
      for (const node of batch) node.classList.remove('is-deferred');
      const by = (ref?.offsetTop ?? 0) - before;
      if (by) this.shifted(from + by, by, at);
    }
    if (this.queue.length) this.handle = idle((d) => this.run(d, res.layout.defer_batch));
  }
}
