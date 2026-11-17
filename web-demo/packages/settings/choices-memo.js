// @ts-check
//! 包在运行时给的选项（核心 SG-2 的 `choices_from`，`rows.js` 的 `fromPackage`）记在哪：每次打开设置照旧重新问（`reset`），这一次问到的照它画；
//! 这一次还没问到的先照上一次打开时问到的画下拉，写选项的名字（W-1208：原来每次打开设置头一下都是文字框、写存着的原值，
//! 例如「引擎 deepseek-tools」，问到了才换成「DeepSeek 功能全家桶」；包慢、没在跑的一直是原值）。纯的，不碰页面。

/** @typedef {{value: string, name: string, desc?: string}[]} Choices */

export class ChoiceMemo {
  constructor() {
    /** @type {Map<string, Choices>} 上一次问到的（问不到的不记，留着更早那一份） */
    this.last = new Map();
    /** @type {Map<string, Choices|null|Promise<Choices|null>>} 这一次打开设置问的：问到的选项、问不到的 `null`、还在问的 Promise */
    this.round = new Map();
  }

  /** 又打开了设置：这一次的清掉，上一次问到的留着。 */
  reset() {
    this.round = new Map();
  }

  /**
   * 现在照什么画：这一次问完了的照这一次（`fresh`，问不到的是 `null`：文字框）；还没问完的照上一次问到的（没有的是 `null`）。
   * @param {string} key @returns {{list: Choices|null, fresh: boolean}}
   */
  now(key) {
    const got = this.round.get(key);
    if (Array.isArray(got) || got === null) return { list: got, fresh: true };
    return { list: this.last.get(key) ?? null, fresh: false };
  }

  /**
   * 问一次（这一次打开设置里同一个只问一次）：交回问到的选项，问不到的 `null`。
   * @param {string} key @param {() => Promise<Choices|null>} request
   * @returns {Promise<Choices|null>}
   */
  ask(key, request) {
    const got = this.round.get(key);
    if (got !== undefined) return Promise.resolve(got);
    const asking = request().then((list) => {
      this.round.set(key, list);
      if (list) this.last.set(key, list);
      return list;
    }, () => {
      this.round.set(key, null);
      return null;
    });
    this.round.set(key, asking);
    return asking;
  }
}
