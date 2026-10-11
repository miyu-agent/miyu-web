// @ts-check
//! 换颜色时整页一起淡过去（蓝图 `web.md`「主题」的换颜色）：浏览器的视图过渡（`startViewTransition`：旧的一张画面淡出、新的淡入），
//! 同一时刻里的几样改动（主题的颜色、人格的背景图）并成一次。不支持的浏览器、系统设了少动效的、标签页在后台的、要求不要过渡的（第一次
//! 上色）直接换。
//!
//! 原来给每个元素的颜色加过渡：渐变（背景图那一层、对话区上下的淡出）不会过渡，一下就换了，中间几帧一半新一半旧。

/** 等着并进这一次过渡的改动 @type {Array<() => void>} */
let queued = [];

/**
 * 换一样看得见的颜色、背景：和同一时刻的别的改动并成一次过渡。
 * @param {() => void} change 真去改（写变量、换类）；有过渡的时候晚一点、在浏览器拍下旧画面以后才跑
 * @param {{animate?: boolean}} [opts] `animate: false` 直接换
 */
export function retheme(change, opts = {}) {
  const doc = /** @type {any} */ (document);
  const animate = opts.animate !== false && typeof doc.startViewTransition === 'function' && !document.hidden
    && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate) {
    change();
    return;
  }
  queued.push(change);
  if (queued.length > 1) return;
  queueMicrotask(() => {
    const run = queued;
    queued = [];
    const shift = doc.startViewTransition(() => {
      for (const fn of run) fn();
    });
    // 连着换（存了人格紧跟着重读、换会话紧跟着换颜色）时前一次被后一次顶掉，浏览器拒掉前一次的 ready：那是正常的，改动照样做了
    shift.ready.catch((/** @type {any} */ err) => {
      if (err?.name !== 'AbortError') console.error(err);
    });
  });
}
