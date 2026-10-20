// @ts-check
//! 人叫的整理那一块下面的光点（蓝图 `web.md`「记忆页」第 13 条；2026-10-20 项目主人看过样板选的「光点合并」，不用吉祥物、日月舞台）：
//! 读进来的一条记忆一个点（`given`）；作废了、说了留下的是哪条的（`kept`）飞进那一条的点里，那个点大一圈；过时作废、没并进别的淡掉；
//! 改写的亮一下。一批合完了（`merged`），留下的点挪到左边成一小堆，给下一批腾地方。点多了自动变小，照个数排成不重叠的散点。
//! 只管点在哪、多大、多亮（纯逻辑，`step` 推一帧）；画在 `dream.js` 的画布上。

/** @typedef {{id: string, x: number, y: number, tx: number|null, ty: number, alpha: number, grow: number, settled: boolean,
 *   into: Dot|null, gone: boolean, fading: boolean, fadeAt: number, flashAt: number, popAt: number}} Dot */

/** 编号照出一个 0–1 之间固定的数（散点的抖动；同一个点每次排都在同一处） @param {string} id @param {number} seed */
const jitter = (id, seed) => {
  let x = seed;
  for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) % 9973;
  return (x % 97) / 97;
};

export class Dots {
  constructor() {
    /** @type {Dot[]} */
    this.dots = [];
    /** @type {Map<string, Dot>} */
    this.byId = new Map();
    this.w = 400;
    this.h = 96;
    this.r = 3.2;
    /** 老核心不带 `given`、只说了一批几条的：编号自己编 */
    this.anon = 0;
  }

  /** 还看得见的（没并走、没淡掉的） */
  live() {
    return this.dots.filter((d) => !d.gone && !d.into && !d.fading);
  }

  /** 读进来一条 @param {string} id */
  add(id) {
    if (this.byId.has(id)) return;
    /** @type {Dot} */
    const d = { id, x: this.w - 20, y: this.h / 2, tx: null, ty: 0, alpha: 0, grow: 0, settled: false, into: null, gone: false, fading: false, fadeAt: 0, flashAt: 0, popAt: 0 };
    this.dots.push(d);
    this.byId.set(id, d);
    this.layout();
  }

  /** 老核心：这一批几条（没有编号） @param {number} n */
  addMany(n) {
    for (let i = 0; i < n; i++) this.add(`#${++this.anon}`);
  }

  /** 作废了、并进 `kept`：飞过去；找不到那一条的淡掉 @param {string} id @param {string|null} kept @param {number} now */
  merge(id, kept, now) {
    const d = this.byId.get(id);
    if (!d) return;
    const into = kept ? this.byId.get(kept) : null;
    if (into && into !== d) d.into = into;
    else {
      d.fading = true;
      d.fadeAt = now;
    }
    this.layout();
  }

  /** 改写了：亮一下 @param {string} id @param {number} now */
  flash(id, now) {
    const d = this.byId.get(id);
    if (d) d.flashAt = now;
  }

  /** 一批合完了：留下的挪到左边那一堆 */
  settle() {
    for (const d of this.live()) d.settled = true;
    this.layout();
  }

  /** 画布换了大小 @param {number} w @param {number} h */
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.layout();
  }

  /** 照个数排：左边是合完的那一堆，右边是这一批的；一片里排成几行几列的格子，每格里抖一下，不重叠 */
  layout() {
    const live = this.live();
    const kept = live.filter((d) => d.settled);
    const fresh = live.filter((d) => !d.settled);
    this.r = live.length > 60 ? 2 : live.length > 24 ? 2.6 : 3.2;
    const split = kept.length ? Math.min(this.w * 0.42, 60 + Math.sqrt(kept.length) * 22) : 0;
    const place = (/** @type {Dot[]} */ list, /** @type {number} */ x0, /** @type {number} */ x1, /** @type {number} */ seed) => {
      if (!list.length) return;
      const span = Math.max(1, x1 - x0);
      const cols = Math.max(1, Math.ceil(Math.sqrt((list.length * span) / Math.max(1, this.h - 16))));
      const rows = Math.max(1, Math.ceil(list.length / cols));
      const cw = span / cols;
      const ch = (this.h - 16) / rows;
      list.forEach((d, i) => {
        d.tx = x0 + ((i % cols) + 0.25 + jitter(d.id, seed) * 0.5) * cw;
        d.ty = 8 + (Math.floor(i / cols) + 0.25 + jitter(d.id, seed + 1) * 0.5) * ch;
      });
    };
    place(kept, 16, Math.max(40, split - 12), 3);
    place(fresh, split + 12, this.w - 16, 7);
  }

  /**
   * 推一帧：往该在的地方缓过去（轻轻晃一下），飞着的飞过去，淡着的淡掉。交回这一帧还要不要接着推（都停了、减少动画的不推）。
   * @param {number} now @param {boolean} reduce
   */
  step(now, reduce) {
    let moving = false;
    for (const d of this.dots) {
      if (d.gone) continue;
      if (d.alpha < 1) {
        d.alpha = reduce ? 1 : Math.min(1, d.alpha + 0.05);
        moving = true;
      }
      if (d.into) {
        // 留下的那条也被并走了：跟着飞到最后留下的
        let t = d.into;
        while (t.into) t = t.into;
        d.x += (t.x - d.x) * (reduce ? 1 : 0.09);
        d.y += (t.y - d.y) * (reduce ? 1 : 0.09);
        if (Math.hypot(d.x - t.x, d.y - t.y) < 1.2) {
          d.gone = true;
          t.grow = Math.min(4, t.grow + 1);
          t.popAt = now;
        }
        moving = true;
      } else if (d.tx != null) {
        const wob = reduce ? 0 : 1.2;
        const k = reduce ? 1 : 0.07;
        d.x += (d.tx + Math.sin(now / 1300 + d.ty) * wob - d.x) * k;
        d.y += (d.ty + Math.cos(now / 1100 + d.tx) * wob - d.y) * k;
        if (!reduce) moving = true;
      }
      if (d.fading) {
        if (now - d.fadeAt >= 900) d.gone = true;
        moving = true;
      }
    }
    return moving;
  }

  /**
   * 画到 `g` 上（已经照像素比放大好）：合完那一堆淡一点；合完了整个慢慢淡下去（`doneAt`）。
   * @param {CanvasRenderingContext2D} g @param {number} now @param {string} color @param {number} doneAt
   */
  draw(g, now, color, doneAt) {
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = color;
    for (const d of this.dots) {
      if (d.gone) continue;
      let a = d.alpha * (d.settled ? 0.55 : 1);
      if (d.fading) a *= Math.max(0, 1 - (now - d.fadeAt) / 900);
      if (doneAt) a *= 0.6 + 0.4 * Math.max(0, 1 - (now - doneAt) / 1500);
      const pop = d.popAt ? Math.max(0, 1 - (now - d.popAt) / 400) : 0;
      const flash = d.flashAt ? Math.max(0, 1 - (now - d.flashAt) / 900) : 0;
      const r = this.r + d.grow * this.r * 0.22 + pop * 1.5;
      if (flash) {
        g.globalAlpha = flash * 0.35;
        g.beginPath();
        g.arc(d.x, d.y, r + 5 * flash, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = a;
      g.beginPath();
      g.arc(d.x, d.y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}
