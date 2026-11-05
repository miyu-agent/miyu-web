// @ts-check
//! 核心的软件包列表（`package.list`、订 `packages` 的回应）里同一个编号几层都有的（核心 SD-1，系统加装层）：认的那份照常列，被上面
//! 一层盖住的那份也列着，带 `covered: {by, version, over, newer}`（不加载、不算错）。头照编号认包的地方只要认的那份，被盖住的挂在它
//! 下面（`covers`），设置「软件包」页照它写一句（W-1106）。纯的。
//! `covered: true` 是另一回事（核心 F-9 补：包里的 MCP 服务全被自制的同名服务替代了，认的那份也可能有），只有对象才算被盖住。

/** 对象才算（不是 F-9 的 `true`）。 @param {any} v */
const isObj = (v) => typeof v === 'object' && v !== null;

/**
 * 这一项是不是被上面一层盖住的那份：核心 SD-1补 起这一格叫 `shadowed`（core1 11-05：和 F-9 的 `covered: true` 分开），SD-1 时叫
 * `covered`，两种都认。 @param {any} p
 */
export const shadowed = (p) => !!p && (isObj(p.shadowed) || isObj(p.covered));

/**
 * 只留认的那份；被盖住的照编号挂到认的那份的 `covers` 上（`{layer, version, newer}`，照列表的先后）。不是数组的原样交回。
 * @param {any} list `packages` @returns {any}
 */
export function foldCovered(list) {
  if (!Array.isArray(list)) return list;
  /** @type {Map<string, {layer: string|null, version: string|null, newer: boolean}[]>} */
  const covers = new Map();
  for (const p of list) {
    if (!shadowed(p) || typeof p.package !== 'string') continue;
    covers.set(p.package, [...(covers.get(p.package) ?? []), coverOf(p)]);
  }
  return list.filter((p) => !shadowed(p)).map((p) => (covers.has(p?.package) ? { ...p, covers: covers.get(p.package) } : p));
}

/** 被盖住的那一项挂到认的那份上的样子：哪一层、这一份的版本、这一份是不是更新。 @param {any} p */
export function coverOf(p) {
  const c = isObj(p.shadowed) ? p.shadowed : p.covered;
  return { layer: typeof p.layer === 'string' ? p.layer : null, version: typeof c.version === 'string' ? c.version : typeof p.version === 'string' ? p.version : null, newer: c.newer === true };
}

/** 整个回应：`packages` 照 [`foldCovered`] 收，别的格子不动。 @param {any} reply @returns {any} */
export const foldReply = (reply) => (reply && Array.isArray(reply.packages) ? { ...reply, packages: foldCovered(reply.packages) } : reply);
