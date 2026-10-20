// @ts-check
//! 人叫的整理那一块下面的光点（蓝图 `web.md`「记忆页」第 13 条；2026-10-20 项目主人看过样板选的「光点合并」，不用吉祥物、日月舞台）：
//! 读进来的一条记忆一个点（`given`），在这一条里随意找一处空地淡入（同一天项目主人：不是飞进来，位置随意一些）；作废了、说了留下的是哪条的
//! （`kept`）滑进那一条的点里，那个点大一圈；过时作废、没并进别的淡掉；改写的亮一下。一批合完了（`merged`），留下的点就地连起来，
//! 像神经元（同一天项目主人：整理完的连起来，不挪到左边）：每个点连到离它最近的两个，线慢慢显出来；下一批的点落在空地上，合完再连。
//! 同一天项目主人：设计逻辑对，但不够炫酷——加了光晕（点中心亮、外面一圈柔光）、淡入时荡开一圈涟漪、并进去的拖一道尾巴、被并进的鼓一下荡一圈、
//! 线从一个点长到另一个点、连好的线上不停有小光点跑过去（像神经冲动，到了那头那个点亮一下）、合完从中间那个点起一圈一圈把整张网点亮。
//! 只管点在哪、多大、多亮、连着谁（`step` 推一帧）；画在 `dream.js` 的画布上。

/** @typedef {{id: string, x: number, y: number, alpha: number, grow: number, settled: boolean, bornAt: number,
 *   into: Dot|null, gone: boolean, fading: boolean, fadeAt: number, flashAt: number, popAt: number, hitAt: number, waveAt: number,
 *   trail: [number, number][]}} Dot
 *  @typedef {{a: Dot, b: Dot, at: number}} Link
 *  @typedef {{link: Link, back: boolean, at: number, ms: number}} Pulse 线上跑的一个小光点（`back` 是从 b 往 a） */

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
/** 线从一头长到另一头多久；线上的小光点跑一趟多久；隔多久放一个（线多了放得勤一些） */
const GROW_MS = 600;
const PULSE_MS = 750;
const PULSE_EVERY_MS = [260, 620];
/** 合完那一下一圈一圈点亮，一圈隔多久 */
const WAVE_STEP_MS = 110;

/** `#rrggbb` 换成带透明度的 `rgba(...)`；认不出的交 `null`（不画光晕） @param {string} c @param {number} a */
function rgba(c, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
const ease = (/** @type {number} */ t) => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;

export class Dots {
  constructor() {
    /** @type {Dot[]} */
    this.dots = [];
    /** @type {Map<string, Dot>} */
    this.byId = new Map();
    /** @type {Link[]} */
    this.links = [];
    /** @type {Pulse[]} */
    this.pulses = [];
    this.nextPulse = 0;
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
  add(id, now = 0) {
    if (this.byId.has(id)) return;
    const [x, y] = this.spot(id);
    /** @type {Dot} */
    const d = { id, x, y, alpha: 0, grow: 0, settled: false, bornAt: now, into: null, gone: false, fading: false, fadeAt: 0, flashAt: 0, popAt: 0, hitAt: 0, waveAt: 0, trail: [] };
    this.dots.push(d);
    this.byId.set(id, d);
    this.size();
  }

  /** 老核心：这一批几条（没有编号） @param {number} n @param {number} [now] */
  addMany(n, now = 0) {
    for (let i = 0; i < n; i++) this.add(`#${++this.anon}`, now);
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
    // 连着它的线、线上跑着的光点跟着拿掉
    this.links = this.links.filter((l) => l.a !== d && l.b !== d);
    this.pulses = this.pulses.filter((p) => this.links.includes(p.link));
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

  /**
   * 合完了：从离中间最近的那个点起，顺着线一圈一圈点亮（没连着的最后一起亮）。
   * @param {number} now
   */
  finish(now) {
    const live = this.live();
    if (!live.length) return;
    const start = live.reduce((m, d) => (Math.hypot(d.x - this.w / 2, d.y - this.h / 2) < Math.hypot(m.x - this.w / 2, m.y - this.h / 2) ? d : m));
    const depth = new Map([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const d = /** @type {Dot} */ (queue.shift());
      for (const l of this.links) {
        const o = l.a === d ? l.b : l.b === d ? l.a : null;
        if (o && !depth.has(o)) {
          depth.set(o, /** @type {number} */ (depth.get(d)) + 1);
          queue.push(o);
        }
      }
    }
    const most = Math.max(0, ...depth.values());
    for (const d of live) d.waveAt = now + (depth.get(d) ?? most + 1) * WAVE_STEP_MS;
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
        d.trail.push([d.x, d.y]);
        if (d.trail.length > 10) d.trail.shift();
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
    // 线上的小光点：跑到了那头那个点亮一下；连好的线（长完了的）上隔一阵放一个
    this.pulses = this.pulses.filter((p) => {
      if (now - p.at < p.ms) return true;
      (p.back ? p.link.a : p.link.b).hitAt = now;
      return false;
    });
    const grown = this.links.filter((l) => now - l.at > GROW_MS && !l.a.gone && !l.b.gone);
    if (!reduce && grown.length && now >= this.nextPulse) {
      const link = grown[Math.floor(Math.random() * grown.length)];
      this.pulses.push({ link, back: Math.random() < 0.5, at: now, ms: PULSE_MS * (0.8 + Math.random() * 0.5) });
      const [lo, hi] = PULSE_EVERY_MS;
      this.nextPulse = now + (lo + Math.random() * (hi - lo)) / Math.min(3, 1 + grown.length / 12);
    }
    return moving || this.pulses.length > 0;
  }

  /**
   * 画到 `g` 上（已经照像素比放大好）：线（从一头长到另一头，细、淡）、线上跑的小光点、点（光晕、亮的芯、淡入的涟漪、并进去的尾巴、
   * 被并进的鼓一下、改写的一圈淡光、合完一圈一圈点亮）；合完了整个慢慢淡一些（`doneAt`）。
   * @param {CanvasRenderingContext2D} g @param {number} now @param {string} color @param {number} doneAt @param {boolean} reduce
   */
  draw(g, now, color, doneAt, reduce = false) {
    g.clearRect(0, 0, this.w, this.h);
    const dim = doneAt ? 0.65 + 0.35 * Math.max(0, 1 - (now - doneAt - 1400) / 1500) : 1;
    const glow = (/** @type {number} */ a) => rgba(color, a) ?? color;
    g.lineCap = 'round';
    // 线：从 a 长到 b
    g.strokeStyle = color;
    g.lineWidth = 1;
    for (const l of this.links) {
      if (l.a.gone || l.b.gone) continue;
      const k = reduce ? 1 : ease((now - l.at) / GROW_MS);
      g.globalAlpha = 0.26 * dim;
      g.beginPath();
      g.moveTo(l.a.x, l.a.y);
      g.lineTo(l.a.x + (l.b.x - l.a.x) * k, l.a.y + (l.b.y - l.a.y) * k);
      g.stroke();
    }
    // 线上跑的小光点
    for (const p of this.pulses) {
      const k = (now - p.at) / p.ms;
      const [from, to] = p.back ? [p.link.b, p.link.a] : [p.link.a, p.link.b];
      const x = from.x + (to.x - from.x) * k, y = from.y + (to.y - from.y) * k;
      const halo = g.createRadialGradient(x, y, 0, x, y, 7);
      halo.addColorStop(0, glow(0.55 * dim));
      halo.addColorStop(1, glow(0));
      g.globalAlpha = Math.sin(Math.PI * Math.min(1, k));
      g.fillStyle = halo;
      g.fillRect(x - 7, y - 7, 14, 14);
    }
    for (const d of this.dots) {
      if (d.gone) continue;
      let a = d.alpha * dim;
      if (d.fading) a *= Math.max(0, 1 - (now - d.fadeAt) / 900);
      const breathe = reduce ? 1 : 0.85 + 0.15 * Math.sin(now / 900 + d.x * 0.7 + d.y);
      const pop = d.popAt ? Math.max(0, 1 - (now - d.popAt) / 450) : 0;
      const hit = d.hitAt ? Math.max(0, 1 - (now - d.hitAt) / 500) : 0;
      const flash = d.flashAt ? Math.max(0, 1 - (now - d.flashAt) / 900) : 0;
      const wave = d.waveAt && now >= d.waveAt ? Math.max(0, 1 - (now - d.waveAt) / 600) : 0;
      const lit = Math.max(pop, hit, wave);
      const r = (this.r + d.grow * this.r * 0.22 + pop * 1.5 + wave * 1.2) * (0.6 + 0.4 * d.alpha);
      // 并进去的尾巴
      if (d.into && d.trail.length > 1) {
        g.strokeStyle = color;
        g.lineWidth = r * 1.2;
        for (let i = 1; i < d.trail.length; i++) {
          g.globalAlpha = (i / d.trail.length) * 0.35 * a;
          g.beginPath();
          g.moveTo(d.trail[i - 1][0], d.trail[i - 1][1]);
          g.lineTo(d.trail[i][0], d.trail[i][1]);
          g.stroke();
        }
      }
      // 光晕
      const R = r * (3.2 + lit * 2.5);
      const halo = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, R);
      halo.addColorStop(0, glow(0.32 + 0.4 * lit));
      halo.addColorStop(1, glow(0));
      g.globalAlpha = a * breathe;
      g.fillStyle = halo;
      g.fillRect(d.x - R, d.y - R, 2 * R, 2 * R);
      // 淡入的涟漪、被并进的一圈、改写的一圈、点亮的一圈
      const born = d.bornAt ? (now - d.bornAt) / 900 : 1;
      const rings = /** @type {[number, number][]} */ ([[born, 0.5], [1 - pop, pop ? 0.6 : 0], [1 - flash, flash ? 0.5 : 0], [1 - wave, wave ? 0.45 : 0]]);
      g.strokeStyle = color;
      g.lineWidth = 1;
      for (const [t, strength] of rings) {
        if (reduce || !strength || t < 0 || t >= 1) continue;
        g.globalAlpha = (1 - t) * strength * dim;
        g.beginPath();
        g.arc(d.x, d.y, r + 2 + ease(t) * 12, 0, Math.PI * 2);
        g.stroke();
      }
      // 点：实的一个，中间一小点亮的芯
      g.globalAlpha = a * (0.75 + 0.25 * breathe);
      g.fillStyle = color;
      g.beginPath();
      g.arc(d.x, d.y, r, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = a * (0.45 + 0.4 * lit);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(d.x - r * 0.25, d.y - r * 0.25, r * 0.42, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}
