// @ts-check
//! 「正在连接…」那一屏（蓝图 `web.md`「连核心」第 9 条）：页面正中一句；过了 10 秒还在这一屏的，下面多一句为什么连不上（2026-11-10：局域网里的
//! 手机开着代理的 TUN 模式，登录以后实时通道一直连不上，页面只写「正在连接…」一直等；关了代理就好了）。线通了、那一头说核心还在启动的
//! （核心 CS-6），换成那一句（[`starting`]），不再接代理那一行：线是通的。

/** 多久还没连上就写原因（毫秒） */
export const SLOW_MS = 10_000;

/**
 * 一屏「正在连接」：`why` 给了的，过 [`SLOW_MS`] 还挂在页面上就接一行原因。
 * @param {string} text @param {string|null} [why]
 * @returns {HTMLElement}
 */
export function waitScreen(text, why = null) {
  const el = document.createElement('div');
  el.className = 'boot-wait';
  const line = document.createElement('div');
  line.textContent = text;
  el.append(line);
  if (why) {
    setTimeout(() => {
      if (!el.isConnected || el.classList.contains('is-starting')) return;
      const more = document.createElement('p');
      more.className = 'boot-wait-why';
      more.textContent = why;
      el.append(more);
    }, SLOW_MS);
  }
  return el;
}

/**
 * 那一头说核心还在启动（核心 CS-6）：`root` 里挂着「正在连接」那一屏的，那一句换成 `text`，代理那一行拿掉、不再接。
 * @param {HTMLElement} root @param {string} text
 */
export function starting(root, text) {
  const el = root.querySelector('.boot-wait');
  if (!el) return;
  el.classList.add('is-starting');
  el.querySelector('.boot-wait-why')?.remove();
  const line = el.firstElementChild;
  if (line) line.textContent = text;
}
