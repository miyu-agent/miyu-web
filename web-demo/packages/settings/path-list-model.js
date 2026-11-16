// @ts-check
//! 一张目录表（技能页「读取其他目录的 Skills」，蓝图 `web.md`「设置页」第 20 条；核心 PT-2外）：一项配置的值是一串路径，默认值就是出厂的
//! 样子。原来「隐私与安全」页的私密目录也是这张表（一对配置并成一张，带出厂项），随核心 PV-RM 去掉了。不碰页面，测试直接调。

/** 一项现在的值（一串路径；没写的照默认） @param {any} item */
const listOf = (item) => {
  const v = item?.entry?.value ?? item?.default;
  return Array.isArray(v) ? v.map(String) : [];
};

/** 表里的几行：现在的值，重了的不重复 @param {any} item @returns {string[]} */
export const pathRows = (item) => [...new Set(listOf(item))];

/** 删一行：交回要存的那一项和新的值 @param {string} path @param {any} item @returns {{key: string, value: string[]}} */
export const dropChange = (path, item) => ({ key: item.key, value: listOf(item).filter((p) => p !== path) });

/**
 * 一次加好几个（一行一个）：去掉空行和前后空白；表里已经有的跳过。交回要存的（至多一项）和跳过了哪些。
 * @param {string} text @param {any} item
 * @returns {{changes: {key: string, value: string[]}[], skipped: string[]}}
 */
export function batchChange(text, item) {
  const have = new Set(listOf(item));
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const skipped = [];
  for (const line of text.split('\n')) {
    const path = line.trim();
    if (!path) continue;
    if (have.has(path)) { skipped.push(path); continue; }
    have.add(path);
    added.push(path);
  }
  return { changes: added.length ? [{ key: item.key, value: [...listOf(item), ...added] }] : [], skipped };
}

/** 系统配置里写过这一项的才能「重置」（回到默认值） @param {any} item */
export const canRestore = (item) => !!item?.entry?.layers?.some((/** @type {any} */ l) => l?.origin?.layer === 'system');

/** 重置要存的：写过的去掉 @param {any} item @returns {{key: string, unset: true}[]} */
export const restoreChange = (item) => (item?.entry ? [{ key: item.key, unset: /** @type {const} */ (true) }] : []);

/** 照搜的字筛表里的几行（不分大小写） @param {string[]} rows @param {string} query */
export const findRows = (rows, query) => {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((p) => p.toLowerCase().includes(q)) : rows;
};
