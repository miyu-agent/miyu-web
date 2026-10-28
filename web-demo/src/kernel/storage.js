// @ts-check
//! 这台设备上存的东西（蓝图 `web/architecture.md`「多用户、多终端」第 5 条；核心 SU-1 起只有主人一个人）：存法是宿主给的（浏览器是 `localStorage`），
//! 键是 `miyu.me.<键>`。原来按账号分的（`miyu.<账号>.<键>`）、更早不分账号的旧键，第一次读时搬过来。值存成 JSON；读写抛错（隐私窗口、清过数据）、
//! 存的读不懂的，照没有算，页面照样起得来。

/**
 * @param {import('../host/browser.js').Store} store 宿主给的存法
 * @param {Record<string, string>} [legacy] 更早不分账号的旧键：`{新名字: 旧键}`
 * @param {string[]} [former] 原来按账号分时用过的账号（先找前面的）：第一次读时把 `miyu.<账号>.<键>` 搬过来
 */
export function ownerStorage(store, legacy = {}, former = []) {
  const full = (/** @type {string} */ key) => `miyu.me.${key}`;
  // 原来按账号分的：能列出全部键的存法（`localStorage`）一次搬完（还没读到的键也不落下）；新键已经有的不覆盖
  try {
    const all = /** @type {any} */ (store);
    if (typeof all.length === 'number' && typeof all.key === 'function') {
      const keys = Array.from({ length: all.length }, (_, i) => all.key(i)).filter((k) => typeof k === 'string');
      for (const a of former) {
        const prefix = `miyu.${a}.`;
        for (const k of keys.filter((x) => x.startsWith(prefix))) {
          const name = k.slice(prefix.length);
          const v = store.getItem(k);
          if (v != null && store.getItem(full(name)) == null) store.setItem(full(name), v);
          if (v != null) store.removeItem(k);
        }
      }
    }
  } catch {
    // 列不了、写不了的：照下面一个个键读的时候再搬
  }
  /** 读一个键的原样；新键没有的先从原来的几处搬过来 */
  const raw = (/** @type {string} */ key) => {
    const got = store.getItem(full(key));
    if (got != null) return got;
    for (const old of [...former.map((a) => `miyu.${a}.${key}`), ...(legacy[key] ? [legacy[key]] : [])]) {
      const moved = store.getItem(old);
      if (moved == null) continue;
      store.setItem(full(key), moved);
      store.removeItem(old);
      return moved;
    }
    return null;
  };
  return {
    /** 读；没有的、读不了的交 `fallback`。 */
    get(/** @type {string} */ key, /** @type {any} */ fallback) {
      try {
        const v = raw(key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    /** 写；写不了的只记一条（这一次照样用）。 */
    set(/** @type {string} */ key, /** @type {any} */ value) {
      try {
        store.setItem(full(key), JSON.stringify(value));
      } catch (err) {
        console.error(`存不下 ${key}`, err);
      }
    },
  };
}
