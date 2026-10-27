// @ts-check
//! 这个账号的定时任务（软件包 `schedules`）：设置页那一页、右侧栏卡片共用一份。有人在用（`hold`）时订 `schedules` 流、`schedule.list`
//! 读一次，`schedules.changed` 整项换、拿掉，掉了队（`resync`）重订重读；都不用了退订。旧核心没有 `schedule.*`：`supported` 是假的。

import { sorted, applyChange } from './model.js';

export class ScheduleStore {
  /** @param {any} core 核心的连接（`ctx.core`） */
  constructor(core) {
    this.core = core;
    /** @type {import('./model.js').Schedule[]} */
    this.list = [];
    /** 核心有没有 `schedule.*`：还没问过是 `null` @type {boolean|null} */
    this.supported = null;
    /** @type {Set<() => void>} */
    this.listeners = new Set();
    /** 在用的几处 */
    this.users = 0;
    this.subscribed = false;
    this.onPush = (/** @type {string} */ method, /** @type {any} */ p) => {
      if (method === 'resync' && p?.stream === 'schedules') {
        this.subscribed = false;
        if (this.users > 0) this.subscribe();
        return;
      }
      if (method !== 'schedules.changed') return;
      this.list = applyChange(this.list, p);
      this.emit();
    };
    core.onPush?.(this.onPush);
  }

  /** @param {() => void} fn @returns {() => void} */
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (err) {
        console.error('定时任务的监听出错了', err);
      }
    }
  }

  /** 问一次核心有没有（起来时）；交回有没有 */
  async probe() {
    try {
      const got = await this.core.request('schedule.list', {});
      this.list = sorted(Array.isArray(got?.schedules) ? got.schedules : []);
      this.supported = true;
    } catch (err) {
      // 旧核心不认这个方法；别的错（成员调不了之类）也当没有，不出这两处
      const e = /** @type {any} */ (err);
      this.supported = e?.code === -32601 || e?.reason === 'unknown_method' || e?.data?.reason === 'unknown_method' ? false : this.supported ?? false;
    }
    this.emit();
    return !!this.supported;
  }

  /** 开始用：头一个用的订流、读一次；交回不用了的 @returns {() => void} */
  hold() {
    this.users += 1;
    if (this.users === 1) this.subscribe();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.users -= 1;
      if (this.users === 0) this.unsubscribe();
    };
  }

  async subscribe() {
    if (this.subscribed || this.supported === false) return;
    this.subscribed = true;
    await this.core.request('subscribe', { stream: 'schedules' }).catch(() => { this.subscribed = false; });
    await this.reload();
  }

  unsubscribe() {
    if (!this.subscribed) return;
    this.subscribed = false;
    this.core.request('unsubscribe', { stream: 'schedules' }).catch(() => {});
  }

  /** 重读整张表 */
  async reload() {
    try {
      const got = await this.core.request('schedule.list', {});
      this.list = sorted(Array.isArray(got?.schedules) ? got.schedules : []);
      this.emit();
    } catch {
      // 读不到的留着原来的
    }
  }

  /**
   * 停、续、删、建：成了照回应换进列表（推送再来一遍也一样）；拒了抛出来。
   * @param {'schedule.pause'|'schedule.resume'|'schedule.cancel'|'schedule.add'} method @param {any} params
   */
  async act(method, params) {
    const got = await this.core.request(method, params);
    if (method === 'schedule.cancel') this.list = applyChange(this.list, { id: params.id, removed: true });
    else if (got?.schedule?.id) this.list = applyChange(this.list, { id: got.schedule.id, entry: got.schedule });
    this.emit();
    return got;
  }
}
