// @ts-check
//! 人叫的整理那一块下面的星空（蓝图 `web.md`「记忆页」第 13 条；2026-10-20 项目主人看过几版样板选的「星空」，底色跟主题）：
//! 一条记忆一颗星——形状有四角闪光、六角星、菱形、小圆点，大小不一（多数小、少数亮的大星），颜色在几种蓝、青、淡紫里换、偶尔一颗暖金，
//! 各自照自己的节奏闪；背后一层很淡的星尘，偶尔划过一颗流星（只是背景，不代表记忆）。
//! 读进来的一条（`given`）在空地上淡入、光芒亮一下；作废了、说了留下的是哪条的（`kept`）像流星一样拖着尾巴滑进那一颗，那颗闪一下、大一点；
//! 过时作废、没并进别的淡掉；改写的闪一下；一批合完了（`merged`），留下的星之间连起淡淡的星座线（每颗连最近的一两颗，太远的不连）；
//! 整理完从中间一颗起，顺着星座线一颗颗闪亮。放不下的（同一时刻多于 80 颗）：更早的、整理过的缩成背景里的星尘。
//! 只管星在哪、什么样、连着谁（`step` 推一帧）；画在 `dream.js` 的画布上。

/** @typedef {'sparkle'|'star6'|'diamond'|'dot'} Shape
 *  @typedef {{id: string, x: number, y: number, born: number, color: number, size: number, shape: Shape, rot: number, phase: number, speed: number,
 *   alpha: number, into: Star|null, gone: boolean, fading: boolean, fadeAt: number, lit: number, settled: boolean, dusting: boolean, dustAt: number,
 *   trail: [number, number][]}} Star
 *  @typedef {{a: Star, b: Star, at: number}} Link
 *  @typedef {{x: number, y: number, a: number, r: number, ph: number}} Dust */

/** 星的颜色：几种蓝、青、淡紫，偶尔一颗暖金（浅色主题用深一档的，深色主题用亮的） */
export const PALETTE = {
  light: [[58, 99, 201], [41, 128, 214], [86, 92, 214], [32, 150, 170], [124, 98, 210], [219, 153, 40]],
  dark: [[150, 190, 255], [120, 210, 255], [175, 165, 255], [130, 230, 220], [205, 170, 255], [255, 214, 130]],
};
/** 六种颜色各占多少（金色最少） */
const WEIGHT = [26, 22, 16, 14, 14, 8];
/** @type {Shape[]} */
const SHAPES = ['sparkle', 'sparkle', 'star6', 'diamond', 'dot', 'dot'];
/** 同一时刻最多几颗单独的星（多了的、整理过的缩成星尘） */
export const MAX_STARS = 80;
/** 找空地时试几处，取离别的星最远的那处 */
const TRIES = 24;

const ease = (/** @type {number} */ t) => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;

/** 照编号定的一串 0–1 的数（同一颗星每次的样子、位置一样） @param {string} id */
export function seeded(id) {
  let x = 2166136261;
  for (let i = 0; i < id.length; i++) x = Math.imul(x ^ id.charCodeAt(i), 16777619);
  return () => {
    x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909);
    return ((x ^= x >>> 16) >>> 0) / 4294967296;
  };
}

export class Sky {
  constructor() {
    /** @type {Star[]} */
    this.stars = [];
    /** @type {Map<string, Star>} */
    this.byId = new Map();
    /** @type {Link[]} */
    this.links = [];
    /** @type {{x: number, y: number, at: number, dx: number, dy: number}[]} */
    this.shooters = [];
    this.w = 400;
    this.h = 120;
    this.doneAt = 0;
    /** 老核心不带 `given`、只说了一批几条的：编号自己编 */
    this.anon = 0;
    // 背景里一层很淡、很小、不动的星尘（位置是比例，换了大小跟着走）
    const rnd = seeded('dust');
    /** @type {Dust[]} */
    this.dust = Array.from({ length: 70 }, () => ({ x: rnd(), y: rnd(), a: 0.15 + rnd() * 0.35, r: 0.4 + rnd() * 0.6, ph: rnd() * 6 }));
  }

  /** 还看得见的（没并走、没淡掉、没缩成星尘的） */
  live() {
    return this.stars.filter((s) => !s.gone && !s.into && !s.fading && !s.dusting);
  }

  /** 找一处空地：试几处随意的，取离别的星最远的那处 @param {string} id @returns {[number, number]} */
  spot(id) {
    const rnd = seeded(`${id}:spot`);
    const others = this.live();
    let best = /** @type {[number, number]} */ ([14, 12]);
    let far = -Infinity;
    for (let i = 0; i < TRIES; i++) {
      const p = /** @type {[number, number]} */ ([14 + rnd() * (this.w - 28), 12 + rnd() * (this.h - 24)]);
      const near = others.reduce((m, o) => Math.min(m, Math.hypot(o.x - p[0], o.y - p[1]) - o.size), Infinity);
      if (near > far) {
        far = near;
        best = p;
      }
      if (!others.length) break;
    }
    return best;
  }

  /** 读进来一条：在空地上淡入一颗；多于 `MAX_STARS` 的，最早一颗整理过的缩成星尘 @param {string} id @param {number} now */
  add(id, now) {
    if (this.byId.has(id)) return;
    const live = this.live();
    if (live.length >= MAX_STARS) {
      const old = live.find((s) => s.settled);
      if (old) {
        old.dusting = true;
        old.dustAt = now;
        this.links = this.links.filter((l) => l.a !== old && l.b !== old);
      }
    }
    const rnd = seeded(id);
    const [x, y] = this.spot(id);
    let pick = rnd() * WEIGHT.reduce((a, b) => a + b, 0);
    let color = 0;
    while (pick > WEIGHT[color]) pick -= WEIGHT[color++];
    // 大小：多数小、少数大；大的都是四角闪光
    const big = rnd();
    const size = big > 0.9 ? 6 + rnd() * 2.5 : big > 0.65 ? 4 + rnd() * 1.5 : 2.2 + rnd() * 1.6;
    const shape = size > 5.5 ? 'sparkle' : SHAPES[Math.floor(rnd() * SHAPES.length)];
    /** @type {Star} */
    const s = { id, x, y, born: now, color, size, shape, rot: rnd() * Math.PI / 4, phase: rnd() * 6.28, speed: 0.6 + rnd() * 1.2,
      alpha: 0, into: null, gone: false, fading: false, fadeAt: 0, lit: 0, settled: false, dusting: false, dustAt: 0, trail: [] };
    this.stars.push(s);
    this.byId.set(id, s);
  }

  /** 老核心：这一批几条（没有编号） @param {number} n @param {number} now */
  addMany(n, now) {
    for (let i = 0; i < n; i++) this.add(`#${++this.anon}`, now);
  }

  /** 作废了、并进 `kept`：拖着尾巴滑过去；找不到那一条的淡掉 @param {string} id @param {string|null} kept @param {number} now */
  merge(id, kept, now) {
    const s = this.byId.get(id);
    if (!s) return;
    const into = kept ? this.byId.get(kept) : null;
    if (into && into !== s) s.into = into;
    else {
      s.fading = true;
      s.fadeAt = now;
    }
    this.links = this.links.filter((l) => l.a !== s && l.b !== s);
  }

  /** 改写了：闪一下 @param {string} id @param {number} now */
  flash(id, now) {
    const s = this.byId.get(id);
    if (s) s.lit = now;
  }

  /** 一批合完了：留下的连成星座（每颗连离它最近的一两颗，大星连两颗；太远的不连；已经连着的不再连） @param {number} now */
  settle(now) {
    const live = this.live();
    for (const s of live) s.settled = true;
    const has = new Set(this.links.map((l) => [l.a.id, l.b.id].sort().join('\n')));
    for (const s of live) {
      const near = live.filter((o) => o !== s).sort((p, q) => Math.hypot(p.x - s.x, p.y - s.y) - Math.hypot(q.x - s.x, q.y - s.y)).slice(0, s.size > 4 ? 2 : 1);
      for (const o of near) {
        if (Math.hypot(o.x - s.x, o.y - s.y) > this.w * 0.18) continue;
        const key = [s.id, o.id].sort().join('\n');
        if (has.has(key)) continue;
        has.add(key);
        this.links.push({ a: s, b: o, at: now + seeded(key)() * 500 });
      }
    }
  }

  /** 整理完：从离中间最近的一颗起，顺着星座线一颗颗闪亮（没连着的最后随意亮） @param {number} now */
  finish(now) {
    this.doneAt = now;
    const live = this.live();
    if (!live.length) return;
    const mid = (/** @type {Star} */ s) => Math.hypot(s.x - this.w / 2, s.y - this.h / 2);
    const start = live.reduce((m, s) => (mid(s) < mid(m) ? s : m));
    const depth = new Map([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const s = /** @type {Star} */ (queue.shift());
      for (const l of this.links) {
        const o = l.a === s ? l.b : l.b === s ? l.a : null;
        if (o && !depth.has(o)) {
          depth.set(o, /** @type {number} */ (depth.get(s)) + 1);
          queue.push(o);
        }
      }
    }
    const most = Math.max(0, ...depth.values());
    for (const s of live) s.lit = now + (depth.get(s) ?? most + 1 + seeded(`${s.id}:wave`)() * 3) * 120;
  }

  /** 画布换了大小：星照比例挪过去 @param {number} w @param {number} h */
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    const kx = w / this.w, ky = h / this.h;
    for (const s of this.stars) {
      s.x *= kx;
      s.y *= ky;
    }
    this.w = w;
    this.h = h;
  }

  /** 推一帧：淡入、滑着的滑过去、淡着的淡掉、缩成星尘的缩掉；偶尔放一颗流星 @param {number} now @param {boolean} reduce */
  step(now, reduce) {
    for (const s of this.stars) {
      if (s.gone) continue;
      s.alpha = reduce ? 1 : Math.min(1, s.alpha + 0.03);
      if (s.into) {
        // 留下的那颗也被并走了：跟着滑到最后留下的
        let t = s.into;
        while (t.into) t = t.into;
        s.trail.push([s.x, s.y]);
        if (s.trail.length > 16) s.trail.shift();
        s.x += (t.x - s.x) * (reduce ? 1 : 0.06);
        s.y += (t.y - s.y) * (reduce ? 1 : 0.06);
        if (Math.hypot(s.x - t.x, s.y - t.y) < 1.2) {
          s.gone = true;
          t.lit = now;
          t.size = Math.min(8.5, t.size + 0.4);
        }
      }
      if (s.fading && now - s.fadeAt > 1100) s.gone = true;
      if (s.dusting && now - s.dustAt > 1200) {
        s.gone = true;
        this.dust.push({ x: s.x / this.w, y: s.y / this.h, a: 0.4, r: 0.7, ph: s.phase });
      }
    }
    if (!reduce && Math.random() < 0.004) {
      this.shooters.push({ x: Math.random() * this.w * 0.6, y: Math.random() * this.h * 0.6, at: now, dx: 160 + Math.random() * 120, dy: 40 + Math.random() * 30 });
    }
    this.shooters = this.shooters.filter((m) => now - m.at < 900);
  }

  /** 一颗星的形状（原点在星的中心） @param {CanvasRenderingContext2D} g @param {Star} s @param {number} r */
  shape(g, s, r) {
    g.beginPath();
    if (s.shape === 'dot') g.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    else if (s.shape === 'diamond') {
      g.moveTo(0, -r * 0.9);
      g.lineTo(r * 0.55, 0);
      g.lineTo(0, r * 0.9);
      g.lineTo(-r * 0.55, 0);
      g.closePath();
    } else {
      const points = s.shape === 'star6' ? 6 : 4, inner = s.shape === 'star6' ? 0.42 : 0.22;
      for (let i = 0; i < points * 2; i++) {
        const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * inner : r;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
    }
    g.fill();
  }

  /**
   * 画到 `g` 上（已经照像素比放大好）。`dark` 是深色主题：用亮的那套颜色、光叠着加。
   * @param {CanvasRenderingContext2D} g @param {number} now @param {boolean} dark @param {boolean} reduce
   */
  draw(g, now, dark, reduce = false) {
    const pal = PALETTE[dark ? 'dark' : 'light'];
    const rgba = (/** @type {number} */ c, /** @type {number} */ a) => `rgba(${pal[c][0]}, ${pal[c][1]}, ${pal[c][2]}, ${Math.max(0, Math.min(1, a))})`;
    g.clearRect(0, 0, this.w, this.h);
    g.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    // 星尘
    for (const d of this.dust) {
      const tw = reduce ? 1 : 0.6 + 0.4 * Math.sin(now / 1500 + d.ph);
      g.fillStyle = dark ? `rgba(220, 230, 255, ${d.a * tw})` : `rgba(80, 100, 160, ${d.a * 0.35})`;
      g.beginPath();
      g.arc(d.x * this.w, d.y * this.h, d.r, 0, Math.PI * 2);
      g.fill();
    }
    // 流星
    for (const m of this.shooters) {
      const k = (now - m.at) / 900;
      const x = m.x + m.dx * k, y = m.y + m.dy * k;
      const grad = g.createLinearGradient(x - m.dx * 0.25, y - m.dy * 0.25, x, y);
      const c = dark ? '220, 235, 255' : '90, 120, 200';
      grad.addColorStop(0, `rgba(${c}, 0)`);
      grad.addColorStop(1, `rgba(${c}, ${0.55 * Math.sin(Math.PI * k)})`);
      g.strokeStyle = grad;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x - m.dx * 0.25, y - m.dy * 0.25);
      g.lineTo(x, y);
      g.stroke();
    }
    // 星座线：细、淡、从一颗长到另一颗，两头照两颗星的颜色
    g.lineWidth = 0.8;
    for (const l of this.links) {
      if (l.a.gone || l.b.gone) continue;
      const k = reduce ? 1 : ease((now - l.at) / 900);
      if (k <= 0) continue;
      const grad = g.createLinearGradient(l.a.x, l.a.y, l.b.x, l.b.y);
      grad.addColorStop(0, rgba(l.a.color, 0.35));
      grad.addColorStop(1, rgba(l.b.color, 0.35));
      g.strokeStyle = grad;
      g.beginPath();
      g.moveTo(l.a.x, l.a.y);
      g.lineTo(l.a.x + (l.b.x - l.a.x) * k, l.a.y + (l.b.y - l.a.y) * k);
      g.stroke();
    }
    const dim = this.doneAt ? 0.8 + 0.2 * Math.max(0, 1 - (now - this.doneAt - 2500) / 1500) : 1;
    for (const s of this.stars) {
      if (s.gone) continue;
      let a = s.alpha * dim;
      if (s.fading) a *= Math.max(0, 1 - (now - s.fadeAt) / 1100);
      if (s.dusting) a *= Math.max(0, 1 - (now - s.dustAt) / 1200);
      const tw = reduce ? 1 : 0.65 + 0.35 * Math.sin((now / 1000) * s.speed + s.phase);
      const lit = s.lit && now >= s.lit ? Math.max(0, 1 - (now - s.lit) / 700) : 0;
      const born = reduce ? 0 : Math.max(0, 1 - (now - s.born) / 700);
      const r = s.size * (0.85 + 0.15 * tw) * (1 + lit * 0.6 + born * 0.8) * (s.dusting ? 1 - Math.min(1, (now - s.dustAt) / 1200) * 0.8 : 1);
      // 流星尾巴
      if (s.into && s.trail.length > 1) {
        for (let i = 1; i < s.trail.length; i++) {
          g.strokeStyle = rgba(s.color, (i / s.trail.length) * 0.5 * a);
          g.lineWidth = (i / s.trail.length) * s.size * 0.5;
          g.beginPath();
          g.moveTo(s.trail[i - 1][0], s.trail[i - 1][1]);
          g.lineTo(s.trail[i][0], s.trail[i][1]);
          g.stroke();
        }
      }
      // 光晕
      const H = r * (dark ? 3.2 : 2.4);
      const halo = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, H);
      halo.addColorStop(0, rgba(s.color, (dark ? 0.45 : 0.22) * a * tw + lit * 0.3));
      halo.addColorStop(1, rgba(s.color, 0));
      g.fillStyle = halo;
      g.fillRect(s.x - H, s.y - H, 2 * H, 2 * H);
      // 星本身，中间一小点白
      g.save();
      g.translate(s.x, s.y);
      if (s.shape !== 'sparkle') g.rotate(s.rot);
      g.fillStyle = rgba(s.color, a * (0.7 + 0.3 * tw));
      this.shape(g, s, r);
      if (s.shape !== 'dot') {
        g.fillStyle = `rgba(255, 255, 255, ${a * (dark ? 0.8 : 0.65)})`;
        g.beginPath();
        g.arc(0, 0, Math.max(0.6, r * 0.18), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
  }
}
