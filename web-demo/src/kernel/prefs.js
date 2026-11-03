// @ts-check
//! 个人那一层跟着人走（蓝图 `web/architecture.md`「配置」第 2 条、「多用户、多终端」；核心 HP-1 `prefs.*`）：软件包的开关、配置，内核自己的
//! 设置（编号 `kernel`：界面语言、职能选谁）整份存在核心里网页那个界面包（`miyu-webui`）的设置里，顶层的键就是包编号。用 `127.0.0.1`、
//! `localhost`、局域网地址、手机打开看到的是同一份（2026-11-03 项目主人：用不同地址打开外观不一样要避免，W-1087）。
//!
//! - 起来先照这台浏览器记着的那一份（缓存，不是来源）画；订 `prefs` 回来的整份照它换掉，页面当场照新的画。
//! - 本地改了先当场换上、画好，再 `prefs.set` 只送改了的顶层键，一件件送；核心交回的整份照它换。`prefs_too_big` 的说一句、这一次的退回。
//! - 别处改了推 `prefs.changed`（整份）照它换；掉了队（`resync`）、重连以后重订；断着时改的留着，订上了再送。
//! - 第一次连上有 `prefs` 的核心：核心那份是空的、浏览器里记着原来的一层，推上去一次（成了在这台设备上记一笔），之后以核心为准。
//! - 旧核心（订不上）、网页不是装着的界面包：照原来只记在这台设备上。

/** 网页在核心里的界面包编号：个人那一层放在它的设置里 */
export const PACKAGE = 'miyu-webui';
/** 订不上就照只记在这台设备上走、不算出错的：旧核心（没有这个流、没有这个方法）、网页没装成界面包（走桥的演示） */
const LOCAL_ONLY = new Set(['bad_params', 'unknown_package', 'not_a_ui_package']);
const NO_METHOD = -32601;

/**
 * @typedef {Record<string, any>} Layer 个人那一层：包编号（内核自己的是 `kernel`）→ 补丁 `{disabled?, config?}`
 * @typedef {{
 *   request: (method: string, params: any) => Promise<any>,
 *   cache: {get: () => Layer, set: (layer: Layer) => void},
 *   moved: {get: () => boolean, set: () => void},
 *   changed: () => Promise<unknown>,
 *   tooBig: () => void,
 * }} Deps 问核心；这台浏览器记着的那一份；原来的一层搬没搬过；这一层变了（内核照它对账）；整份超过上限，说一句
 * @typedef {{values: Record<string, any>, migrate?: boolean}} Patch 改了的顶层键（`null` 是删掉），搬原来那一层的那一次带 `migrate`
 */

export class Prefs {
  /** @param {Deps} deps */
  constructor(deps) {
    this.deps = deps;
    /** @type {'waiting'|'core'|'local'} 还没订上；以核心为准；只记在这台设备上 */
    this.mode = 'waiting';
    /** @type {Layer} 核心收下了的（只记在这台设备上的时候就是记着的） */
    this.confirmed = plain(deps.cache.get());
    /** @type {Patch[]} 改了、核心还没收下的，照先后 */
    this.pending = [];
    /** @type {Layer} 现在照它画的：收下了的加上没收下的 */
    this.layer = this.confirmed;
    /** 正一件件送着 */
    this.sending = false;
  }

  /** 现在的这一层（别改它，改经 `edit`）。 */
  get() {
    return this.layer;
  }

  /**
   * 改一个顶层键：`fn` 拿现在的值交回新的（`null`、`undefined` 删掉）。当场换上、叫内核对账，再送给核心；交回对账完了。
   * @param {string} key @param {(had: any) => any} fn
   */
  edit(key, fn) {
    const value = fn(this.layer[key]) ?? null;
    if (same(this.layer[key] ?? null, value)) return Promise.resolve();
    const patch = { values: { [key]: value } };
    if (this.mode === 'local') this.confirmed = merge(this.confirmed, patch.values);
    else this.pending.push(patch);
    const done = this.relayer();
    this.flush();
    return done;
  }

  /**
   * 订 `prefs`、照回应的整份换掉（起来时、重连以后、掉了队）；订不上的只记在这台设备上。
   * @returns {Promise<void>}
   */
  async follow() {
    let got;
    try {
      got = await this.deps.request('subscribe', { stream: 'prefs', package: PACKAGE });
    } catch (err) {
      // 断了：等重连以后再订，改了的留着
      if (err?.reason === 'disconnected') return;
      if (err?.code === NO_METHOD || LOCAL_ONLY.has(err?.reason)) console.info(`核心不存网页的个人设置（${err?.reason ?? err?.code}），记在这台设备上`);
      else console.error(`订不上个人设置：${err?.message ?? err}`);
      this.mode = 'local';
      this.confirmed = this.layer;
      this.pending = [];
      this.deps.cache.set(this.layer);
      return;
    }
    this.mode = 'core';
    const values = plain(got?.values);
    if (!this.deps.moved.get()) {
      // 第一次连上：核心那份是空的、这台浏览器记着原来的一层，推上去一次（排在改了的前面）；核心那份不空的以它为准
      // （推着的时候断了、重订时核心已经有了的：不再推）
      const queued = this.pending.some((p) => p.migrate);
      if (Object.keys(values).length) {
        this.pending = this.pending.filter((p) => !p.migrate);
        this.deps.moved.set();
      } else if (!queued && Object.keys(this.confirmed).length) this.pending.unshift({ values: this.confirmed, migrate: true });
      else if (!queued) this.deps.moved.set();
    }
    this.confirmed = values;
    await this.relayer();
    await this.flush();
  }

  /**
   * 推送：`prefs.changed` 照整份换，`resync`（`prefs` 掉了队）重新订。交回认不认得。
   * @param {string} method @param {any} params
   */
  push(method, params) {
    if (params?.package !== PACKAGE) return false;
    if (method === 'resync' && params?.stream === 'prefs') {
      this.follow();
      return true;
    }
    if (method !== 'prefs.changed' || this.mode !== 'core') return false;
    this.confirmed = plain(params.values);
    this.relayer();
    return true;
  }

  /** 没收下的一件件送；断了停下，重订以后接着送。 */
  async flush() {
    if (this.sending || this.mode !== 'core') return;
    this.sending = true;
    try {
      while (this.pending.length && this.mode === 'core') {
        const patch = this.pending[0];
        try {
          const got = await this.deps.request('prefs.set', { package: PACKAGE, values: patch.values });
          this.pending.shift();
          this.confirmed = plain(got?.values);
          if (patch.migrate) this.deps.moved.set();
        } catch (err) {
          if (err?.reason === 'disconnected') break;
          // 拒了：这一次的退回（整份超过上限的说一句，别的记一条）
          if (err?.reason === 'prefs_too_big') this.deps.tooBig();
          else console.error(`存不进个人设置：${err?.message ?? err}`);
          if (patch.migrate) {
            // 原来那一层搬不上去：不丢它，照旧只记在这台设备上（连着改了的一起）
            this.mode = 'local';
            this.confirmed = this.pending.reduce((layer, p) => merge(layer, p.values), {});
            this.pending = [];
          } else this.pending.shift();
        }
        await this.relayer();
      }
    } finally {
      this.sending = false;
    }
  }

  /** 照收下了的加上没收下的重算一遍；变了的记进这台浏览器、叫内核对账。 */
  relayer() {
    const next = this.pending.reduce((layer, p) => merge(layer, p.values), this.confirmed);
    if (same(next, this.layer)) return Promise.resolve();
    this.layer = next;
    this.deps.cache.set(next);
    return this.deps.changed();
  }
}

/** 照顶层的键并（同核心）：写了的整个换，`null` 的删掉。 @param {Layer} layer @param {Record<string, any>} values */
function merge(layer, values) {
  const out = { ...layer };
  for (const [k, v] of Object.entries(values)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** 是一个 JSON 对象的原样交回，别的当空的。 @param {any} v @returns {Layer} */
function plain(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** 两份一样（对象不看键的先后：核心交回的键可能排过序）。 @param {any} a @param {any} b @returns {boolean} */
function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
}
