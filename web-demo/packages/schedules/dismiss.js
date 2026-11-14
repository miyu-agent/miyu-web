// @ts-check
//! 设置框外面开的浮窗（右侧栏卡片、输入框上面的循环标记点开的详情，卡片里点进去的新建、修改）按 `Esc` 收起最上面那一层。
//! 设置框开着时由它在捕获阶段拿走 `Esc`、找带 `data-set-dismiss` 的发 `set-dismiss`（`settings/dialog.js` 的 `dismissTop`），
//! 冒泡不到这里；设置框外面原来没人管，详情只能点 ✕、点遮罩关（2026-11-14 W-1181 走查测出）。
//! 在冒泡阶段听：时刻、月历浮层在捕获阶段先拿走自己的 `Esc`（`pickers.js`），别处处理过的（`defaultPrevented`）不管；
//! 叠了几张浮窗的只交给最上面那张；浮窗里开着下拉菜单的先收菜单（同设置框：发给最后一个 `.set-menu`、`[data-set-dismiss]`）。

/**
 * @param {HTMLElement} modal 浮窗的遮罩那一层（带 `.sch-modal`、`data-set-dismiss`，听 `set-dismiss`）
 * @param {Document} [doc]
 * @returns {() => void} 不再听
 */
export function escDismisses(modal, doc = document) {
  const key = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !modal.isConnected) return;
    if ([...doc.querySelectorAll('.sch-modal')].at(-1) !== modal) return;
    e.preventDefault();
    const top = [...modal.querySelectorAll('.set-menu, [data-set-dismiss]')].at(-1) ?? modal;
    top.dispatchEvent(new CustomEvent('set-dismiss'));
  };
  doc.addEventListener('keydown', key);
  return () => doc.removeEventListener('keydown', key);
}
