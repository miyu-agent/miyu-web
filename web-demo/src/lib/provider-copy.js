// @ts-check
//! 同一家供应商的自用、共用两份（核心 PL-1；蓝图 `web.md`「设置页」第 14 条、「换模型的菜单」第 1、2 条）：系统配置、个人设置都写了的
//! 一个编号，`model.list` 列成两家——自用那份照原编号（`relay`），共用那份编号是 `<编号>@system`（`relay@system`），模型引用
//! `relay@system/<模型>`。`@system` 不露给人：两份都有的标「自用」「共用」，只有一份的不标。换模型的菜单、设置页两处共用。

/** 共用那份的编号后缀 */
export const SYSTEM_COPY = '@system';

/** 原来的编号：共用那份去掉后缀，别的照原样。 @param {string} id */
export const baseOf = (id) => (id.endsWith(SYSTEM_COPY) ? id.slice(0, -SYSTEM_COPY.length) : id);

/** 核心给不给每家在哪一层（`layer`，PL-1 起有）：有一家带就是给。 @param {any[]|null|undefined} providers */
export const hasLayers = (providers) => (providers ?? []).some((p) => p && typeof p === 'object' && typeof p.layer === 'string');

/**
 * 两份都有的原编号：列表里既有 `<编号>` 又有 `<编号>@system` 的。
 * @param {{id: string}[]|null|undefined} providers
 * @returns {Set<string>}
 */
export function twinsOf(providers) {
  const ids = new Set((providers ?? []).map((p) => p.id));
  const out = new Set();
  for (const id of ids) if (id.endsWith(SYSTEM_COPY) && ids.has(baseOf(id))) out.add(baseOf(id));
  return out;
}

/**
 * 这一家（编号）要标哪一份：两份都有的自用那份是 `personal`、共用那份是 `system`，只有一份的 `null`。
 * @param {string} id @param {Set<string>} twins `twinsOf` 的
 * @returns {'personal'|'system'|null}
 */
export const copyOf = (id, twins) => (twins.has(baseOf(id)) ? (id.endsWith(SYSTEM_COPY) ? 'system' : 'personal') : null);
