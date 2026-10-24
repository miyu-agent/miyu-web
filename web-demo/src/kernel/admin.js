// @ts-check
//! 管理员模式的开关（蓝图 `web.md`「管理员模式」第 2、3 条）：只有握手 `admin: true` 的人有（`available`）；只在这一页里，刷新、重连回到平常。
//! 开着时连接给系统那一层的写请求带 `scope`（`connection.js` 的 `scopeFor`）；开、关时告诉听着的（设置页的窄条、齿轮上的小点、锁着的地方）。

export class AdminMode {
  /** @param {boolean} available 握手 `admin: true` */
  constructor(available) {
    this.available = available;
    this.on = false;
    /** @type {Set<(on: boolean) => void>} */
    this.listeners = new Set();
  }

  /** 开、关（没有这个开关的人开不了） @param {boolean} on */
  set(on) {
    const next = this.available && on;
    if (next === this.on) return;
    this.on = next;
    for (const fn of this.listeners) {
      try {
        fn(next);
      } catch (err) {
        console.error('管理员模式的开关通知出错了', err);
      }
    }
  }

  /** 听开、关 @param {(on: boolean) => void} fn @returns {() => void} */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 平时锁着系统那一层：管理员、没开着 */
  get locked() {
    return this.available && !this.on;
  }
}
