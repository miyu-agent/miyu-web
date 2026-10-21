// @ts-check
//! 「隐私与安全」页的私密目录那张表（蓝图 `web.md`「设置页」第 12b 条；核心施工 5-15 下）：两项配置并成一张表。
//! `sandbox.private.remove` 的 `options` 是这台机器的出厂列表，值是去掉的出厂项；`sandbox.private.add` 是加了的。不碰页面，测试直接调。

export const ADD = 'sandbox.private.add';
export const REMOVE = 'sandbox.private.remove';

/** 一项现在的值（一串路径；没写的是空的） @param {any} item */
const listOf = (item) => {
  const v = item?.entry?.value ?? item?.default;
  return Array.isArray(v) ? v.map(String) : [];
};

/**
 * 表里的几行：出厂列表去掉 `remove` 里的，后面接 `add` 里的（加了的和出厂的重了的不重复）。
 * @param {any} add `sandbox.private.add` 那一项 @param {any} remove `sandbox.private.remove` 那一项
 * @returns {{path: string, shipped: boolean}[]}
 */
export function privateRows(add, remove) {
  const gone = new Set(listOf(remove));
  const shipped = (remove?.options ?? []).map((/** @type {any} */ o) => String(o.value));
  const rows = shipped.filter((p) => !gone.has(p)).map((path) => ({ path, shipped: true }));
  const seen = new Set(rows.map((r) => r.path));
  for (const path of listOf(add)) if (!seen.has(path)) { rows.push({ path, shipped: false }); seen.add(path); }
  return rows;
}

/**
 * 删一行：出厂的往 `remove` 里加，加了的从 `add` 里拿掉。交回要存的那一项和新的值。
 * @param {{path: string, shipped: boolean}} row @param {any} add @param {any} remove
 * @returns {{key: string, value: string[]}}
 */
export function dropChange(row, add, remove) {
  if (row.shipped) return { key: REMOVE, value: [...new Set([...listOf(remove), row.path])] };
  return { key: ADD, value: listOf(add).filter((p) => p !== row.path) };
}

/**
 * 加一个目录：去掉前后空白；空的、已经在表里的不加（交 `null`）；去掉过的出厂项再加回来就是从 `remove` 里拿掉。
 * @param {string} text @param {any} add @param {any} remove
 * @returns {{key: string, value: string[]}|null}
 */
export function addChange(text, add, remove) {
  const path = text.trim();
  if (!path) return null;
  if (privateRows(add, remove).some((r) => r.path === path)) return null;
  if (listOf(remove).includes(path)) return { key: REMOVE, value: listOf(remove).filter((p) => p !== path) };
  return { key: ADD, value: [...listOf(add), path] };
}

/** 去掉过出厂项的才有「恢复默认」：只把 `remove` 去掉（出厂的回来，加了的照留） @param {any} remove */
export const canRestore = (remove) => listOf(remove).length > 0;

/**
 * 一次加好几个（一行一个）：去掉空行和前后空白；表里已经有的跳过；去掉过的出厂项再加回来是从 `remove` 里拿掉。
 * 交回要存的几项（`add`、`remove` 各至多一项）和跳过了哪些。
 * @param {string} text @param {any} add @param {any} remove
 * @returns {{changes: {key: string, value: string[]}[], skipped: string[]}}
 */
export function batchChange(text, add, remove) {
  const have = new Set(privateRows(add, remove).map((r) => r.path));
  let adds = listOf(add);
  let removes = listOf(remove);
  /** @type {string[]} */
  const skipped = [];
  for (const line of text.split('\n')) {
    const path = line.trim();
    if (!path) continue;
    if (have.has(path)) { skipped.push(path); continue; }
    have.add(path);
    if (removes.includes(path)) removes = removes.filter((p) => p !== path);
    else adds = [...adds, path];
  }
  /** @type {{key: string, value: string[]}[]} */
  const changes = [];
  if (adds.length !== listOf(add).length) changes.push({ key: ADD, value: adds });
  if (removes.length !== listOf(remove).length) changes.push({ key: REMOVE, value: removes });
  return { changes, skipped };
}

/** 照搜的字筛表里的几行（不分大小写） @param {{path: string, shipped: boolean}[]} rows @param {string} query */
export const findRows = (rows, query) => {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.path.toLowerCase().includes(q)) : rows;
};
