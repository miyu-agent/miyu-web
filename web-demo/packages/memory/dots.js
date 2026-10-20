// @ts-check
//! 人叫的整理那一块下面的光点（蓝图 `web.md`「记忆页」第 13 条；2026-10-20 项目主人看过样板选的「光点合并」，不用吉祥物、日月舞台）：
//! 读进来的一条记忆一个点（`given`），在这一条里随意找一处空地淡入（同一天项目主人：不是飞进来，位置随意一些）；作废了、说了留下的是哪条的
//! （`kept`）滑进那一条的点里，那个点大一圈；过时作废、没并进别的淡掉；改写的亮一下。一批合完了（`merged`），留下的点就地连起来，
//! 像神经元（同一天项目主人：整理完的连起来，不挪到左边）：每个点连到离它最近的两个，线慢慢显出来；下一批的点落在空地上，合完再连。
//! 只管点在哪、多大、多亮、连着谁（纯逻辑，`step` 推一帧）；画在 `dream.js` 的画布上。

/** @typedef {{id: string, x: number, y: number, alpha: number, grow: number, settled: boolean,
 *   into: Dot|null, gone: boolean, fading: boolean, fadeAt: number, flashAt: number, popAt: number}} Dot
 *  @typedef {{a: Dot, b: Dot, at: number}} Link */

/** 照编号定的一串 0–1 的数（同一个点每次找的地方一样） @param {string} id */
function seeded(id) {
  let x = 2166136261;
  for (let i = 0; i < id.length; i++) x = Math.imul(x ^ id.charCodeAt(i), 16777619);
  return () => {
    x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909);
    return ((x ^= x >>> 16) >>> 0) / 4294967296;
  };
}

/** 一个点离边留多少 */
const PAD = 10;
/** 找空地时试几处，取离别的点最远的那处 */
const TRIES = 24;
/** 合完一批每个点连几个最近的 */
const NEAREST = 2;

export class Dots {
  constructor() {
    /** @type {Dot[]} */
    this.dots = [];
    /** @type {Map<string, Dot>} */
    this.byId = new Map();
    /** @type {Link[]} */
    this.links = [];
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

  /** 读进来一条：在空地上淡入 @param {string} id */
  add(id) {
    if (this.byId.has(id)) return;
    const [x, y] = this.spot(id);
    /** @type {Dot} */
    const d = { id, x, y, alpha: 0, grow: 0, settled: false, into: null, gone: false, fading: false, fadeAt: 0, flashAt: 0, popAt: 0 };
    this.dots.push(d);
    this.byId.set(id, d);
    this.size();
  }

  /** 老核心：这一批几条（没有编号） @param {number} n */
  addMany(n) {
    for (let i = 0; i < n; i++) this.add(`#${++this.anon}`);
  }

  /** 找一处空地：试几处随意的，取离别的点最远的那一处（看着随意，又不挤成一团） @param {string} id @returns {[number, number]} */
  spot(id) {
    const rnd = seeded(id);
    const others = this.live();
    let best = /** @type {[number, number]} */ ([PAD, PAD]);
    let far = -1;
    for (let i = 0; i < TRIES; i++) {
      const p = /** @type {[number, number]} */ ([PAD + rnd() * (this.w - 2 * PAD), PAD + rnd() * (this.h - 2 * PAD)]);
      const near = others.reduce((m, o) => Math.min(m, Math.hypot(o.x - p[0], o.y - p[1])), Infinity);
      if (near > far) {
        far = near;
        best = p;
      }
      if (!others.length) break;
    }
    return best;
  }

  /** 点多了变小 */
  size() {
    const n = this.live().length;
    this.r = n > 60 ? 2 : n > 24 ? 2.6 : 3.2;
  }

  /** 作废了、并进 `kept`：滑过去；找不到那一条的淡掉 @param {string} id @param {string|null} kept @param {number} now */
  merge(id, kept, now) {
    const d = this.byId.get(id);
    if (!d) return;
    const into = kept ? this.byId.get(kept) : null;
    if (into && into !== d) d.into = into;
    else {
      d.fading = true;
      d.fadeAt = now;
    }
    // 连着它的线跟着拿掉
    this.links = this.links.filter((l) => l.a !== d && l.b !== d);
    this.size();
  }

  /** 改写了：亮一下 @param {string} id @param {number} now */
  flash(id, now) {
    const d = this.byId.get(id);
    if (d) d.flashAt = now;
  }

  /** 一批合完了：留下的就地连起来，每个点连到离它最近的两个（已经连着的不再连） @param {number} now */
  settle(now) {
    const live = this.live();
    for (const d of live) d.settled = true;
    const has = new Set(this.links.map((l) => [l.a.id, l.b.id].sort().join('\n')));
    for (const d of live) {
      const near = live.filter((o) => o !== d).sort((p, q) => Math.hypot(p.x - d.x, p.y - d.y) - Math.hypot(q.x - d.x, q.y - d.y)).slice(0, NEAREST);
      for (const o of near) {
        const key = [d.id, o.id].sort().join('\n');
        if (has.has(key)) continue;
        has.add(key);
        this.links.push({ a: d, b: o, at: now });
      }
    }
  }

  /** 画布换了大小：点照比例挪过去 @param {number} w @param {number} h */
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    const kx = w / this.w, ky = h / this.h;
    for (const d of this.dots) {
      d.x *= kx;
      d.y *= ky;
    }
    this.w = w;
    this.h = h;
  }

  /**
   * 推一帧：淡入、滑着的滑过去、淡着的淡掉。交回这一帧还要不要接着推。
   * @param {number} now @param {boolean} reduce
   */
  step(now, reduce) {
    let moving = false;
    for (const d of this.dots) {
      if (d.gone) continue;
      if (d.alpha < 1) {
        d.alpha = reduce ? 1 : Math.min(1, d.alpha + 0.035);
        moving = true;
      }
      if (d.into) {
        // 留下的那条也被并走了：跟着滑到最后留下的
        let t = d.into;
        while (t.into) t = t.into;
        d.x += (t.x - d.x) * (reduce ? 1 : 0.08);
        d.y += (t.y - d.y) * (reduce ? 1 : 0.08);
        if (Math.hypot(d.x - t.x, d.y - t.y) < 1.2) {
          d.gone = true;
          t.grow = Math.min(4, t.grow + 1);
          t.popAt = now;
        }
        moving = true;
      }
      if (d.fading) {
        if (now - d.fadeAt >= 900) d.gone = true;
        moving = true;
      }
    }
    return moving;
  }

  /**
   * 画到 `g` 上（已经照像素比放大好）：先画线（细、淡，0.8 秒显出来），再画点（轻轻一明一暗）；合完了整个慢慢淡一些（`doneAt`）。
   * @param {CanvasRenderingContext2D} g @param {number} now @param {string} color @param {number} doneAt @param {boolean} reduce
   */
  draw(g, now, color, doneAt, reduce = false) {
    g.clearRect(0, 0, this.w, this.h);
    const dim = doneAt ? 0.6 + 0.4 * Math.max(0, 1 - (now - doneAt) / 1500) : 1;
    g.strokeStyle = color;
    g.lineWidth = 1;
    for (const l of this.links) {
      if (l.a.gone || l.b.gone) continue;
      g.globalAlpha = 0.28 * Math.min(1, (now - l.at) / 800) * dim;
      g.beginPath();
      g.moveTo(l.a.x, l.a.y);
      g.lineTo(l.b.x, l.b.y);
      g.stroke();
    }
    g.fillStyle = color;
    for (const d of this.dots) {
      if (d.gone) continue;
      // 轻轻一明一暗（每个点错开），减少动画的不闪
      const breathe = reduce ? 1 : 0.85 + 0.15 * Math.sin(now / 900 + d.x * 0.7 + d.y);
      let a = d.alpha * breathe * dim;
      if (d.fading) a *= Math.max(0, 1 - (now - d.fadeAt) / 900);
      const pop = d.popAt ? Math.max(0, 1 - (now - d.popAt) / 400) : 0;
      const flash = d.flashAt ? Math.max(0, 1 - (now - d.flashAt) / 900) : 0;
      const r = (this.r + d.grow * this.r * 0.22 + pop * 1.5) * (0.6 + 0.4 * d.alpha);
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
