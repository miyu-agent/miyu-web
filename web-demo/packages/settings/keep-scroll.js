// @ts-check
//! 设置页右边那一栏重画以后回到原来滚到的地方（蓝图 `web.md`「设置页」第 12c 条，W-1153，2026-11-11 项目主人：「每次调整这个开关，都会跳到
//! 这一页的最上方，要重新滚下来」）。重画是整栏换掉；新的内容里有晚一步才画出来的（「通用」页最上面的主题卡片要先问主题包），换上去的那一刻
//! 整栏矮了一截，滚动位置被浏览器收到矮的那个底，后面长回来了也不回去；紧跟着再重画一次（存的回执、网页软件换完监听各一次）又从收过的位置
//! 往上收一截。这里记着要回到哪：到不了的先记着，内容一长高就再去；到了、人自己动了、等够久了就不再管。
//!
//! 不碰页面：看内容长高、人动没动由用的那一头给（`watch`），单元测试给一个假的。

/** 差这么多像素以内算到了（缩放下滚动位置有小数） */
const NEAR = 1;

export class ScrollKeeper {
  /**
   * @param {{scrollTop: number}} body 能滚的那一栏
   * @param {(again: () => void, drop: () => void) => () => void} watch 开始看：内容长高了叫 `again`，人动了、等够久了叫 `drop`；交回停看的
   */
  constructor(body, watch) {
    this.body = body;
    this.watch = watch;
    /** 还没回到的那一处；到了、不管了是 `null` @type {number|null} */
    this.want = null;
    /** @type {(() => void)|null} */
    this.stop = null;
  }

  /** 重画以前问：这一次要回到哪。上一次没到的照上一次要的，不照被收过的位置。 */
  wanted() {
    return this.want ?? this.body.scrollTop;
  }

  /**
   * 重画以后（内容长高以后）：滚到 `want`。到了就不再管；内容还不够高、到不了的记着，开始看。
   * @param {number} want
   */
  restore(want) {
    this.body.scrollTop = want;
    if (this.body.scrollTop + NEAR >= want) return this.drop();
    this.want = want;
    this.stop ??= this.watch(() => { if (this.want !== null) this.restore(this.want); }, () => this.drop());
  }

  /** 不再管（到了、人自己动了、换了一页）。 */
  drop() {
    this.want = null;
    this.stop?.();
    this.stop = null;
  }
}
