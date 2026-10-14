// @ts-check
//! 后台命令预览露着的那一段（`preview.js`）：第一次是核心交的最后几行，之后一段段接上（`job.output` 带 `after`，核心 V-6 上），
//! 只留最后 `keep` 行。带 `after` 的回应不给 `lines`，一共几行这里数：第一次的 `lines`，加上之后每段里的换行；上一段末尾没有换行的，
//! 那一行已经算过，接上的字不再加一。

/** 一段字里有几个换行 @param {string} text */
const newlines = (text) => text.split('\n').length - 1;

export class Tail {
  /** @param {number} keep 最多留几行 */
  constructor(keep) {
    this.keep = keep;
    /** 留着的字 */
    this.text = '';
    /** 一共有几个换行 */
    this.breaks = 0;
    /** 最后一段没有换行（它也算一行） */
    this.open = false;
  }

  /** 第一次：核心交的最后几行、一共几行。 @param {string} output @param {number} [lines] */
  first(output, lines) {
    this.text = output;
    this.open = output !== '' && !output.endsWith('\n');
    this.breaks = Math.max(0, (lines ?? newlines(output) + (this.open ? 1 : 0)) - (this.open ? 1 : 0));
  }

  /** 接上一段。 @param {string} more */
  add(more) {
    if (!more) return;
    this.breaks += newlines(more);
    this.open = !more.endsWith('\n');
    const lines = (this.text + more).split('\n');
    // 末尾有换行的，切出来最后一格是空的，多留一格
    this.text = lines.slice(-(this.open ? this.keep : this.keep + 1)).join('\n');
  }

  /** 一共几行。 */
  get total() {
    return this.breaks + (this.open ? 1 : 0);
  }

  /** 露着几行。 */
  get shown() {
    return this.text ? this.text.replace(/\n$/, '').split('\n').length : 0;
  }
}
