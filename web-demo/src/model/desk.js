// @ts-check
//! 输入框跟着会话走（W-1137，2026-11-10 项目主人：框里打了字没发，切到别的会话，草稿跟着带了过去；终端同一个毛病发版前 check 第 17 条
//! 修过，照它那套）：切走时这个会话框里的那一份记在它名下，切回来放回去；还没开的新会话页上的不记，换上来的新会话页是空的；
//! 发出去的照常清掉，删掉的会话忘掉它的那一份。只记在这个页面里（终端也只记在内存里），刷新了就没了。

/**
 * 一个会话的输入框：没发的字、光标、文件块、`Ctrl+S` 暂存的、撤销放回来的那句、翻输入历史翻到哪（两下 `Esc` 清掉的那句也在里面）、
 * 跟着话发的几样（挂载位 `composer.payload` 能收起来的，照编号）。
 * @typedef {{text: string, start: number, end: number, blocks: [string, string][], stashed: any, putBackText: string|null,
 *   recall: {at: number, shown: string|null, draft: string, cleared: string|null, prefix: string|null}, parts: Record<string, any>}} Desk
 */

/** 什么都没有：不用记。 @param {Desk} desk */
export function emptyDesk(desk) {
  return !desk.text && !desk.blocks.length && !desk.stashed && desk.putBackText == null && desk.recall.at < 0
    && desk.recall.cleared == null && !Object.keys(desk.parts).length;
}

/** 各会话记着的那一份。 */
export class Desks {
  constructor() {
    /** @type {Map<string, Desk>} */
    this.byId = new Map();
  }

  /**
   * 从 `from` 换到 `to`（`null` 是还没开的新会话页）：`take` 交出框里现在这一份、框回到空的，记在 `from` 名下（空的不记、记着的旧的
   * 扔掉；新会话页上的不记）；`put` 放上 `to` 记着的那一份（没有的、新会话页交 `null`，框照空的）。
   * @param {string|null} from @param {string|null} to @param {() => Desk} take @param {(desk: Desk|null) => void} put
   */
  swap(from, to, take, put) {
    const desk = take();
    if (from) {
      if (emptyDesk(desk)) this.byId.delete(from);
      else this.byId.set(from, desk);
    }
    const own = to ? this.byId.get(to) ?? null : null;
    if (to) this.byId.delete(to);
    put(own);
  }

  /** 会话删掉了：它的那一份不要了。 @param {string} id */
  drop(id) {
    this.byId.delete(id);
  }
}
