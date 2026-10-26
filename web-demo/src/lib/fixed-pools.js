// @ts-check
//! 三个固定池（核心 Q-1：`model.list` 的池带 `fixed`，`flagship`、`normal`、`lite` 永远在）：先后和认名字。换模型的菜单、设置页的
//! 模型池同一个先后（2026-10-26 项目主人：旗舰、日常、轻量，终端同一天照这个做）。显示名各自照自己的字表写。

/** 三个固定池的先后：旗舰、日常、轻量 */
export const FIXED_POOLS = ['flagship', 'normal', 'lite'];

/** 是不是固定池的名字（不带 `@`）。 @param {string} name */
export const isFixedPool = (name) => FIXED_POOLS.includes(name);

/**
 * 模型池的先后：三个固定池（`fixed`）排最前，照 {@link FIXED_POOLS}；后面是人建的，照列表的先后。
 * @template {{name: string, fixed?: boolean}} P @param {P[]} pools @returns {P[]}
 */
export function poolOrder(pools) {
  const rank = (/** @type {P} */ p) => { const i = FIXED_POOLS.indexOf(p.name); return i < 0 ? FIXED_POOLS.length : i; };
  return [...pools.filter((p) => p.fixed).sort((a, b) => rank(a) - rank(b)), ...pools.filter((p) => !p.fixed)];
}
