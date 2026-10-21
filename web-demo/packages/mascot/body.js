// @ts-check
//! 吉祥物的身子（软件包 `mascot`，蓝图 `web.md`「吉祥物」第 2–4、8 条）：受重力站在台子上（`world.js`）。站着的跟着脚下的台子挪
//! （输入框左右挪了跟着它右边挪；台子往下挪多了、没了、走出了边就掉）；浮上来的台子把它顶上去（画的时候差多少慢慢缓上去，不是
//! 一下闪过去）；越掉越快，在空中抻长一点，落地蹲下去再弹回来，摔得重的弹起来一下；跳之前先蹲一下；左键按住蹲下蓄力，没拖动
//! 就松手是跳（按得越久跳得越高），拖动了被拎起来跟着指针走，身子跟着甩，松手照拖的速度扔出去；侧过身沿着台子迈步走，在地上待够了走回
//! 输入框下面跳上去；两边、顶上是墙。蹲、抻都交给模型重画（`shape` 交回 `crouch`），不拉伸图片。数都是这个包的设置项，台子、
//! 平常站在哪、多大由 `index.js` 量。
//! 落脚点（第 11 条）：跳到一处去（`leapTo`：落在台面上，或者到那一点扒住一道边）；扒着（`hang`）不受重力，身子藏在那一块后面、
//! 从边上探出一截（`shape` 交回裁掉多少）；碰一下互动点（`startAct`：戳、拍、凑过去看，照现有的姿势拼：转身、抬鳍、蹲、歪身子）。

import { step, supportAt } from './world.js';
import { hangAt, leap } from '../../src/lib/anchors.js';
import { ease } from './face.js';

/** `[最小, 最大]` 里随机一个 */
const pick = ([a, b]) => a + Math.random() * (b - a);
/** 夹在 `[-max, max]` 里 */
const clamp = (v, max) => Math.max(-max, Math.min(max, v));

/** 一串时刻（0 到 1）附近鼓起来的一下：动作里戳、拍的那几下 @param {number} p @param {number[]} at */
const pulse = (p, at) => at.reduce((m, h) => Math.max(m, Math.exp(-(((p - h) / 0.07) ** 2))), 0);
/** 动作在哪几个时刻碰到那一块（0 到 1） */
const HITS = /** @type {Record<string, number[]>} */ ({ poke: [0.32, 0.66], pat: [0.28, 0.52, 0.76], look: [] });

/**
 * @typedef {import('./world.js').Platform & {stick?: boolean, perch?: boolean}} Platform
 * @typedef {import('../../src/lib/anchors.js').Ledge} Ledge
 * @typedef {{platforms: () => Platform[], home: () => {x: number, platform: Platform}|null, size: () => {w: number, h: number},
 *   reduced: () => boolean, avoid?: () => {x1: number, x2: number}|null, ledges?: () => Ledge[]}} Room 台子、平常站在哪、身子多大、
 *   减少动画、地上不站的那一段（正对输入框，免得挡住输入框下面那一行字）、扒得住的几道边
 * @typedef {{moving: boolean, landed: number|null, left: boolean, arrived: boolean, hung?: boolean, hit?: boolean, acted?: boolean}} Moved
 *   这一帧：还在不在动、落地多快、是不是刚离开台子、是不是走到了、是不是刚扒住一道边、动作是不是碰了那一块一下、动作是不是做完了
 * @typedef {{kind: string, side: number, at: number, ms: number, target: {x: number, y: number}, fired: number}} Act 在做的动作：
 *   哪一样、朝哪边（1 右、-1 左）、什么时候开始、做多久、碰的那一点、碰过几下
 */

export class Body {
  /**
   * @param {any} config 这个包的设置项
   * @param {Room} room
   */
  constructor(config, room) {
    this.config = config;
    this.room = room;
    /** 脚底中点（屏幕像素）、速度、站在哪；第一帧放到平常站的地方 */
    this.at = /** @type {import('./world.js').Body|null} */ (null);
    /** 被台子带着升上去、还没跟上的（像素，画的时候往下补这么多，慢慢缓到 0） */
    this.offset = 0;
    /** 走到哪、什么时候起步（步调从它算）；是不是在往输入框下面走（到了跳上去）；在地上待到什么时候 */
    this.walkTo = /** @type {number|null} */ (null);
    this.walkAt = 0;
    this.homing = false;
    /** 在往外让（地上正对输入框的那一段）：和往家走一样，动鼠标、打字不叫停 */
    this.leaving = false;
    this.floorUntil = 0;
    /** 在空中时舞台叫它回家：落稳了再回（`goHome`） */
    this.homeAfter = false;
    /** 原地跳着（落地前不算离开台子，手里的东西不收） */
    this.hopping = false;
    /** 要跳了、先蹲着：什么时候开始蹲、起跳的速度（往上、横着） */
    this.windup = /** @type {{at: number, vy: number, vx?: number}|null} */ (null);
    /** 落地：什么时候、蹲多深（之后一蹲一抻，越来越小） */
    this.landAt = /** @type {number|null} */ (null);
    this.landDepth = 0;
    /** 这一帧蹲多深（缓过去，负的是抻长）；整个身子转了多少度（侧身走路，缓过去） */
    this.crouch = 0;
    this.turn = 0;
    /** 按着：什么时候按下的、抓的地方离脚多远、上一次指针在哪、什么时候、指针的速度、挪够了没有（没挪够的是在蓄力） */
    this.drag = /** @type {{t0: number, dx: number, dy: number, x: number, y: number, t: number, vx: number, vy: number, moved: boolean}|null} */ (null);
    /** 身子歪多少度（拖的时候甩） */
    this.tilt = 0;
    this.tiltAim = 0;
    /** 扒着哪道边：编号、往哪边探、脚在多高、什么时候扒上的、身子裁掉多少（左右各多少像素） */
    this.hang = /** @type {{id: string, side: 'left'|'right', y: number, at: number, clip: {left: number, right: number}}|null} */ (null);
    /** 跳着去一处（`leapTo`）：到了做什么（落下的台面、扒住的边）、多久到、什么时候起跳的（蹲着还没起跳的是 `null`） */
    this.trip = /** @type {{then: {kind: 'land'|'hang', id: string}, x: number, y: number, t: number, t0: number|null}|null} */ (null);
    /** 在做的动作（戳、拍、看） @type {Act|null} */
    this.act = null;
  }

  /** 站在台子上，没被拖着。 */
  standing() {
    return !!this.at?.ground && !this.drag;
  }

  /** 跳 `height` 像素高：先蹲一下再起跳（站着才跳得起来）。`now` 的（蓄过力，已经蹲着）直接起跳。 */
  hop(height, now = false) {
    const b = this.at;
    if (!b?.ground || this.room.reduced()) return;
    const vy = -Math.sqrt(2 * this.config.gravity * height);
    this.hopping = true;
    this.walkTo = null;
    if (now) this.at = { ...b, vy, ground: null };
    else this.windup = { at: performance.now(), vy };
  }

  /** 自己走一趟：在地上待够了走回输入框下面（到了跳上去）；别的沿着脚下的台子走到另一处，有时走过台子的边掉下去。 */
  wander() {
    const b = this.at;
    const g = b?.ground;
    if (!b || !g || this.windup) return;
    const w = this.config.walk;
    const edge = this.config.home.edge;
    const home = this.room.home();
    this.walkAt = performance.now();
    if (g.id === 'floor' && home && performance.now() > this.floorUntil) {
      // 回输入框：地上正对输入框的那一段不站，站在旁边的原地起跳、斜着跳上去（`arrive`）；没地方让的走到它下面
      const out = this.outside(b.x);
      this.walkTo = out !== b.x || this.room.avoid?.() ? out : Math.max(home.platform.x1 + edge, Math.min(home.platform.x2 - edge, home.x));
      this.homing = true;
    } else if (g.id === 'floor' && this.room.avoid?.()) {
      // 在地上闲逛：只在自己那一边走，不走进正对输入框的那一段
      const zone = /** @type {{x1: number, x2: number}} */ (this.room.avoid());
      const half = this.room.size().w / 2;
      const [lo, hi] = b.x <= zone.x1 ? [half, zone.x1] : [zone.x2, innerWidth - half];
      this.walkTo = hi > lo ? lo + Math.random() * (hi - lo) : b.x;
    } else if (g.id !== 'floor' && Math.random() < w.off_edge) {
      // 走过边：往近的那一头走，多走出去半个身子
      const half = this.room.size().w / 2;
      this.walkTo = b.x - g.x1 < g.x2 - b.x ? g.x1 - half : g.x2 + half;
    } else {
      this.walkTo = g.x1 + edge + Math.random() * Math.max(0, g.x2 - g.x1 - 2 * edge);
    }
  }

  /**
   * 舞台换了（第一次引导）：站在别处的原地起跳、跳回家（`arrive`）；被拖着的不管，在空中的落稳了再回。
   * `drop` 的先放到窗口顶上外面、正对着家的地方，掉下来（欢迎页开场，2026-10-10 项目主人：从上面掉下来比从下面升上来有趣）。
   * 减少动画的直接放到家。
   * @param {boolean} [drop]
   */
  goHome(drop = false) {
    const home = this.room.home();
    if (!home || this.drag) return;
    if (this.room.reduced()) {
      this.at = { x: home.x, y: home.platform.y, vx: 0, vy: 0, ground: home.platform };
      return;
    }
    if (drop) {
      this.at = { x: home.x, y: -this.room.size().h, vx: 0, vy: 0, ground: null };
      this.homeAfter = false;
      return;
    }
    if (!this.at) {
      const floor = this.room.platforms().find((p) => p.id === 'floor') ?? null;
      this.at = { x: home.x, y: floor?.y ?? innerHeight, vx: 0, vy: 0, ground: floor };
    }
    const g = this.at.ground;
    // 在空中（跳着、掉着）：落稳了再回
    if (!g) {
      this.homeAfter = true;
      return;
    }
    this.homeAfter = false;
    if (g.id === home.platform.id) return;
    const gone = !this.room.platforms().some((p) => p.id === g.id);
    // 换了一屏、新的台子还在原来的高度（标题上沿没挪）：直接站上去，不跳
    if (gone && Math.abs(home.platform.y - this.at.y) < 2 && this.at.x >= home.platform.x1 && this.at.x <= home.platform.x2) {
      this.at = { ...this.at, ground: home.platform };
      return;
    }
    this.homing = true;
    this.arrive(this.at, performance.now(), home.x);
    // 脚下的台子跟着换走的那一屏没了：不蹲了，当场起跳（蹲着的下一帧就悬空掉下去，跳不起来）
    const w = this.windup;
    if (w && gone) {
      this.at = { ...this.at, vy: w.vy, vx: w.vx ?? 0, ground: null };
      this.windup = null;
    }
  }

  /** 别走了（往家走的、往外让的不停）。 */
  halt() {
    if (!this.homing && !this.leaving) this.walkTo = null;
  }

  /** 左键按下（指针在屏幕上哪）：抓住，开始蹲下蓄力。 */
  grab(x, y) {
    const b = this.at;
    if (!b) return;
    const now = performance.now();
    this.drag = { t0: now, dx: b.x - x, dy: b.y - y, x, y, t: now, vx: 0, vy: 0, moved: false };
    this.walkTo = null;
    this.homing = false;
    this.homeAfter = false;
    this.leaving = false;
    this.hopping = false;
    this.windup = null;
    this.hang = null;
    this.trip = null;
    this.act = null;
  }

  /**
   * 跳到 `(x, y)` 去（第 11 条）：`then.kind` 是 `land` 的落在那里的台面上，`hang` 的到那一点时扒住那道边。站着才跳得起来，
   * 先蹲一下；跳得比两头高的那一头再高 `visit.extra_px`，横着的速度照落到那里要多久算。交回跳没跳。
   * @param {number} x @param {number} y @param {{kind: 'land'|'hang', id: string}} then
   */
  leapTo(x, y, then) {
    const b = this.at;
    if (!b?.ground || this.room.reduced() || this.drag) return false;
    const v = leap(b.x, b.y, x, y, this.config.gravity, this.config.visit.extra_px);
    this.walkTo = null;
    this.homing = false;
    this.leaving = false;
    this.act = null;
    this.windup = { at: performance.now(), vy: v.vy, vx: v.vx };
    this.trip = { then, x, y, t: v.t, t0: null };
    return true;
  }

  /** 松开扒着的边：往外一蹬，掉下去。 */
  unhang() {
    const h = this.hang;
    if (!h || !this.at) return;
    const out = h.side === 'right' ? 1 : -1;
    this.hang = null;
    this.at = { ...this.at, vx: out * 60, vy: -160, ground: null };
  }

  /**
   * 做一个动作（互动点，第 11 条）：`poke` 戳、`pat` 拍、`look` 凑过去看，朝着 `target` 那一点（屏幕像素）做 `ms` 毫秒。站着才做。
   * @param {string} kind @param {{x: number, y: number}} target @param {number} ms
   */
  startAct(kind, target, ms) {
    const b = this.at;
    if (!b?.ground || this.drag || this.room.reduced()) return false;
    this.walkTo = null;
    this.act = { kind, side: target.x >= b.x ? 1 : -1, at: performance.now(), ms, target, fired: 0 };
    return true;
  }

  /** 拖着挪到指针那里；挪得够远才算拖（不然松手是跳）。交回是不是这一下才开始拖。 */
  dragTo(x, y) {
    const d = this.drag;
    const b = this.at;
    if (!d || !b) return false;
    const now = performance.now();
    const dt = Math.max(1, now - d.t) / 1000;
    d.vx = 0.6 * d.vx + 0.4 * ((x - d.x) / dt);
    d.vy = 0.6 * d.vy + 0.4 * ((y - d.y) / dt);
    Object.assign(d, { x, y, t: now });
    if (!d.moved && Math.hypot(b.x - d.dx - x, b.y - d.dy - y) < this.config.drag.threshold_px) return false;
    const started = !d.moved;
    d.moved = true;
    // 拖到窗口外面的：身子停在窗口的边上（出了窗口就找不回来了）
    const { w, h } = this.room.size();
    this.at = { ...b, x: Math.max(w / 2, Math.min(innerWidth - w / 2, x + d.dx)), y: Math.max(h, Math.min(innerHeight, y + d.dy)), vx: 0, vy: 0, ground: null };
    this.tiltAim = clamp(d.vx * this.config.drag.tilt_per_speed, this.config.drag.max_tilt);
    return started;
  }

  /**
   * 松手：拖过的照拖的速度扔出去往下掉，交回 `null`；没拖动的交回蓄了多少力（0 到 1，按得越久越多），由外面让它跳。
   * @returns {number|null}
   */
  release() {
    const d = this.drag;
    const b = this.at;
    this.drag = null;
    this.tiltAim = 0;
    if (!d || !b) return null;
    if (!d.moved) return Math.min(1, (performance.now() - d.t0) / this.config.jump.charge_ms);
    const max = this.config.drag.max_throw;
    this.at = { ...b, vx: clamp(d.vx, max), vy: clamp(d.vy, max), ground: null };
    return null;
  }

  /** 推一帧：跟着台子、被顶上去、起跳、走、掉、落地、撞墙。拖着的不动（位置由 `dragTo` 给）。 */
  move(dt, now) {
    /** @type {Moved} */
    const out = { moving: !!this.drag, landed: null, left: false, arrived: false };
    if (this.drag && this.at) return out;
    const c = this.config;
    // 扒着：不受重力，跟着那道边；边没了、短得够不着脚了就松手掉下去
    if (this.hang && this.at) {
      const h = this.hang;
      const l = this.room.ledges?.().find((x) => x.id === h.id);
      if (l && h.y >= l.y1 && h.y <= l.y2) {
        const at = hangAt(l, this.room.size().w, c.visit.peek);
        this.hang = { ...h, side: l.side, clip: { left: at.left, right: at.right } };
        this.at = { x: at.x, y: h.y, vx: 0, vy: 0, ground: null };
        out.moving = now - h.at < c.visit.hang_settle_ms;
        return out;
      }
      this.unhang();
    }
    const platforms = this.room.platforms();
    if (!this.at) {
      const home = this.room.home();
      const floor = platforms.find((p) => p.id === 'floor') ?? null;
      this.at = home ? { x: home.x, y: home.platform.y, vx: 0, vy: 0, ground: home.platform } : { x: innerWidth / 2, y: floor?.y ?? innerHeight, vx: 0, vy: 0, ground: floor };
    }
    let b = this.at;
    if (b.ground) {
      const was = b.ground;
      const same = platforms.find((p) => p.id === was.id);
      // 输入框左右挪了（收起左栏、改窗口）：跟着它右边挪
      const x = same && was.id === 'composer' && this.walkTo == null ? b.x + (same.x2 - was.x2) : b.x;
      // 输入框自己往下收（确认、提问的抽屉收起，一帧能收几十像素）：跟着下去，不掉下去再弹一下（2026-10-20 项目主人：收起会弹）；
      // 跟着挪的（`stick`：你的话跟着对话滚）一样；别的台子挪得多了照旧掉
      const drop = was.id === 'composer' || same?.stick ? Infinity : c.carry.snap_px;
      if (!same || x < same.x1 || x > same.x2 || same.y - b.y > drop) b = { ...b, x, ground: null };
      else {
        if (same.y < b.y) this.offset += b.y - same.y;
        b = { ...b, x, y: same.y, ground: same };
      }
    }
    // 浮上来的台子（命令列表、后台任务的浮层）：站在它下面的顶到它上面
    if (b.ground && !b.ground.carry) {
      const up = supportAt(b, platforms.filter((p) => p.carry), Infinity);
      if (up && up.y < b.y) {
        this.offset += b.y - up.y;
        b = { ...b, y: up.y, ground: up };
      }
    }
    // 往下掉（或者停在半空）的时候，实心的台子（输入框）从下面长上来、越过了脚（打开抽屉时框往上长）：顶到它上面，不从框里
    // 穿过去掉到地上；往上跳着的不算（斜着跳上输入框，从旁边进来时脚还在上沿下面）
    if (!b.ground && b.vy >= 0) {
      const inside = platforms.find((p) => p.bottom != null && b.x >= p.x1 && b.x <= p.x2 && b.y > p.y && b.y <= p.bottom);
      if (inside) {
        this.offset += b.y - inside.y;
        b = { ...b, y: inside.y, vx: 0, vy: 0, ground: inside };
      }
    }
    // 蹲够了：起跳（蹲着的时候脚下的台子没了，就不跳了）
    if (this.windup && (!b.ground || now - this.windup.at >= c.jump.windup_ms)) {
      if (b.ground) {
        b = { ...b, vy: this.windup.vy, vx: this.windup.vx ?? 0, ground: null };
        if (this.trip) this.trip.t0 = now;
      } else this.trip = null;
      this.windup = null;
    }
    // 动作：做够了收；碰那一块的那几下告诉外面（被碰的那一块动一下）
    const a = this.act;
    if (a) {
      const p = (now - a.at) / a.ms;
      if (!b.ground || p >= 1) {
        this.act = null;
        out.acted = true;
      } else if (a.fired < (HITS[a.kind] ?? []).length && p >= HITS[a.kind][a.fired]) {
        a.fired += 1;
        out.hit = true;
      }
    }
    // 站在地上正对输入框的那一段、又没在走（刚起来、窗口改了、被叫停过）：往外让
    if (b.ground?.id === 'floor' && this.walkTo == null && !this.windup) this.leave(b, now);
    // 走：到了往家走的蹲下准备跳上输入框，别的站定；站着不走的不再往前挪
    if (this.walkTo != null && b.ground) {
      const dir = Math.sign(this.walkTo - b.x);
      const speed = c.walk.speed * (0.4 + 1.2 * Math.abs(Math.sin(this.phase(now))));
      // 这一帧挪得到的：直接到（不走过头再往回挪）
      if (Math.abs(this.walkTo - b.x) <= Math.max(1, (speed * dt) / 1000)) {
        b = { ...b, x: this.walkTo, vx: 0 };
        this.arrive(b, now);
        out.arrived = true;
      } else b = { ...b, vx: dir * speed };
    } else if (b.ground && b.vx) {
      // 站着、不在走（被叫停、手里拿了东西）：不再往前挪
      b = { ...b, vx: 0 };
    }
    const wasGround = !!b.ground;
    if (this.room.reduced() && !b.ground) {
      // 减少动画：不掉，直接到下面的台子上
      const below = platforms.filter((p) => b.x >= p.x1 && b.x <= p.x2 && p.y >= b.y).reduce((a, p) => (!a || p.y < a.y ? p : a), /** @type {Platform|null} */ (null));
      if (below) b = { ...b, y: below.y, vx: 0, vy: 0, ground: below };
    } else {
      const r = step(b, dt, platforms, c.gravity);
      b = r.body;
      if (r.landed) {
        this.trip = null;
        b = this.land(b, r.landed, now);
        out.landed = r.landed;
      }
    }
    // 跳着去扒一道边：到了那一刻（往下落着经过那一点）扒住
    const t = this.trip;
    if (t && t.then.kind === 'hang' && !b.ground && t.t0 != null && (now - t.t0) / 1000 >= t.t - dt / 2000) {
      const l = this.room.ledges?.().find((x) => x.id === t.then.id);
      this.trip = null;
      if (l && t.y >= l.y1 && t.y <= l.y2) {
        const at = hangAt(l, this.room.size().w, c.visit.peek);
        this.hang = { id: l.id, side: l.side, y: t.y, at: now, clip: { left: at.left, right: at.right } };
        this.at = { x: at.x, y: t.y, vx: 0, vy: 0, ground: null };
        this.landAt = now;
        this.landDepth = c.land.squash * 0.4;
        out.hung = true;
        out.moving = true;
        return out;
      }
    }
    // 两边、顶上是墙：撞墙的弹回来一点；走着撞到墙的就停在那儿（要去的地方在墙外，不原地踏步）
    const { w, h } = this.room.size();
    if (b.x < w / 2 || b.x > innerWidth - w / 2) {
      b = { ...b, x: Math.max(w / 2, Math.min(innerWidth - w / 2, b.x)), vx: -b.vx * 0.3 };
      if (this.walkTo != null && b.ground) {
        this.walkTo = null;
        this.homing = false;
        b = { ...b, vx: 0 };
      }
    }
    if (b.y < h) b = { ...b, y: h, vy: Math.max(0, b.vy) };
    // 整页的底边是最后一层地：掉到它下面去的（窗口变矮了、不知怎么穿过去了）当场放回地上
    const floor = platforms.find((p) => p.id === 'floor');
    if (floor && b.y > floor.y + 1) {
      const v = Math.max(0, b.vy);
      b = this.land({ ...b, x: Math.max(floor.x1 + w / 2, Math.min(floor.x2 - w / 2, b.x)), y: floor.y, vx: 0, vy: 0, ground: floor }, v, now);
      out.landed = v;
    }
    this.at = b;
    out.left = wasGround && !b.ground && !this.hopping;
    out.moving = !b.ground || this.walkTo != null || !!this.windup;
    return out;
  }

  /** 步调：起步以后走到哪一步（弧度，一步是 π：一片鳍抬起再落下）。迈步的时候往前挪得快，两步之间慢。 */
  phase(now) {
    return ((now - this.walkAt) / this.config.walk.step_ms) * Math.PI;
  }

  /**
   * 在地上正对输入框的那一段里：往近的那一边让（让到了、两边都站不下的不动）；离那一边超过 `leave_jump_px` 的不走过去（一路压着
   * 那一行字），就地跳回输入框（减少动画的不跳，照走）。
   * @param {import('./world.js').Body} b
   */
  leave(b, now) {
    const out = this.outside(b.x);
    const zone = this.room.avoid?.();
    // 两边都站不下（窗口窄，那一段占满了）：不在地上压着字等，就地跳回输入框
    const stuck = out === b.x && zone && b.x > zone.x1 && b.x < zone.x2;
    if (out === b.x && !stuck) return;
    if ((stuck || Math.abs(out - b.x) > this.config.walk.leave_jump_px) && this.room.home() && !this.room.reduced()) {
      this.homing = true;
      this.arrive(b, now);
      return;
    }
    this.walkTo = out;
    this.walkAt = now;
    this.leaving = true;
  }

  /**
   * 走到了：往家走的先蹲下，再起跳，跳得比输入框高一点，落在它上面；站在输入框旁边的斜着跳，横着的速度照落到它上沿要多久算
   * （往上到最高、再落下 `home_extra_px` 的时间）。
   */
  arrive(b, now, to = b.x) {
    this.walkTo = null;
    this.leaving = false;
    const home = this.homing ? this.room.home() : null;
    this.homing = false;
    if (!home) return;
    const g = this.config.gravity;
    const extra = this.config.walk.home_extra_px;
    const up = Math.sqrt(2 * g * Math.max(0, b.y - home.platform.y + extra));
    const p = home.platform;
    const margin = this.config.home.edge;
    const target = Math.max(p.x1 + margin, Math.min(p.x2 - margin, to));
    // 落到家要多久：升到最高（`up / g`），再从最高落到家的高度；家在下面的（换了一屏）落得更远，横着的速度照它算，不然飞过头
    const drop = home.platform.y - (b.y - (up * up) / (2 * g));
    const flight = up / g + Math.sqrt((2 * Math.max(extra, drop)) / g);
    this.windup = { at: now, vy: -up, vx: (target - b.x) / flight };
  }

  /**
   * 地上这个位置要不要让开：在正对输入框的那一段里的，交回近的那一边站得下的地方；不在里面的、两边都站不下的，交回原处。
   * @param {number} x
   */
  outside(x) {
    const zone = this.room.avoid?.();
    if (!zone || x <= zone.x1 || x >= zone.x2) return x;
    const half = this.room.size().w / 2;
    const sides = [zone.x1, zone.x2].filter((s) => s >= half && s <= innerWidth - half);
    return sides.length ? sides.reduce((a, s) => (Math.abs(s - x) < Math.abs(a - x) ? s : a)) : x;
  }

  /** 落地：照落得多快蹲下去（之后一蹲一抻停住）；摔得重的弹起来一下；落在地上的记下待到什么时候。 */
  land(b, v, now) {
    const l = this.config.land;
    this.walkTo = null;
    this.leaving = false;
    this.hopping = false;
    this.landAt = now;
    this.landDepth = l.squash * Math.min(1, v / l.per_speed);
    if (b.ground?.id === 'floor') this.floorUntil = now + pick(this.config.walk.floor_stay_ms);
    if (v > l.bounce_min) return { ...b, vy: -v * l.bounce, ground: null };
    // 在空中时舞台叫过它回家：站稳了就回（下一帧起跳）
    if (this.homeAfter) {
      queueMicrotask(() => this.goHome());
      return b;
    }
    // 落在地上正对输入框的那一段：走到近的那一边去
    if (b.ground?.id === 'floor') this.leave(b, now);
    return b;
  }

  /**
   * 这一帧蹲多深（负的是抻长）：按着没拖动的越按越深；拎着的抻一点；要起跳的蹲下去；在空中照速度抻长；落地一蹲一抻停住。
   * @param {number} now
   */
  crouchAim(now) {
    const c = this.config;
    const j = c.jump;
    const b = /** @type {import('./world.js').Body} */ (this.at);
    if (this.drag) return this.drag.moved ? j.hold_crouch : j.charge_depth * Math.min(1, (now - this.drag.t0) / j.charge_ms);
    if (this.windup) return j.windup_depth * Math.min(1, (now - this.windup.at) / j.windup_ms);
    // 扒着：扒上去那一下蹲一下，之后抻着一点（挂在那儿）
    if (this.hang) {
      const t = now - this.hang.at;
      return t < c.visit.hang_settle_ms ? c.land.squash * 0.4 * Math.exp(-t / c.land.decay_ms) * Math.cos((2 * Math.PI * t) / c.land.period_ms) : -0.08;
    }
    if (!b.ground) return -Math.min(c.land.stretch_max, Math.abs(b.vy) / c.land.stretch_per_speed);
    // 动作：戳的弯下腰、每戳一下再低一点；拍的每拍一下蹲一点；看的抻一点（凑过去）
    if (this.act) {
      const a = this.act;
      const p = Math.min(1, (now - a.at) / a.ms);
      const bell = Math.sin(Math.PI * p);
      if (a.kind === 'poke') return 0.35 * bell + 0.25 * pulse(p, HITS.poke);
      if (a.kind === 'pat') return 0.15 * pulse(p, HITS.pat);
      return -0.06 * bell;
    }
    if (this.landAt != null) {
      const t = now - this.landAt;
      if (t > c.land.decay_ms * 5) this.landAt = null;
      else return this.landDepth * Math.exp(-t / c.land.decay_ms) * Math.cos((2 * Math.PI * t) / c.land.period_ms);
    }
    // 走着：两只脚都着地的那一下蹲一点，一只脚抬起来的时候抻一点（身子跟着步子一上一下）
    if (this.walkTo != null) return c.walk.step_crouch * Math.cos(2 * this.phase(now));
    return 0;
  }

  /**
   * 这一帧画成什么样：被带上去的慢慢跟上、拖着甩、蹲多深；走的时候侧过身去（`turn`，照走的方向，走完转回正面）、两片鳍前后迈
   * （`stride`）、迈一步颠一下（正面的时候左右摇，侧过去就不摇了）；再加 `bob`（敲电脑一下一下颠）。
   * 扒着的再交回身子左右各裁掉多少（`clip`，藏在那一块后面的那一截）；动作的转身、歪、抬鳍在这里拼。
   * @returns {{x: number, y: number, rot: number, stride: number, crouch: number, turn: number, moving: boolean, clip: {left: number, right: number}|null}}
   */
  shape(dt, now, bob) {
    const c = this.config;
    const b = /** @type {import('./world.js').Body} */ (this.at);
    let moving = false;
    this.offset = this.offset > 0.3 ? ease(this.offset, 0, dt, c.carry.half_life_ms) : 0;
    if (this.offset) moving = true;
    this.tilt = ease(this.tilt, this.tiltAim, dt, c.drag.tilt_half_life_ms);
    if (Math.abs(this.tilt - this.tiltAim) < 0.2) this.tilt = this.tiltAim;
    else moving = true;
    const aim = this.crouchAim(now);
    this.crouch = ease(this.crouch, aim, dt, c.jump.crouch_half_life_ms);
    if (Math.abs(this.crouch - aim) < 0.01) this.crouch = aim;
    if (this.crouch || aim) moving = true;
    const walking = this.walkTo != null && !!b.ground;
    const w = c.walk;
    const v = c.visit;
    const act = this.act;
    const p = act ? Math.min(1, (now - act.at) / act.ms) : 0;
    const bell = Math.sin(Math.PI * p);
    // 扒着的、拍的、看的侧过身朝那一边（扒着的朝外）；戳的正对着
    const out = this.hang ? (this.hang.side === 'right' ? 1 : -1) : 0;
    const face = walking ? Math.sign(/** @type {number} */ (this.walkTo) - b.x) * w.turn_deg
      : this.hang ? out * v.hang_turn_deg
        : act && act.kind !== 'poke' ? act.side * v.act_turn_deg * Math.min(1, bell * 3) : 0;
    this.turn = ease(this.turn, face, dt, w.turn_half_life_ms);
    if (Math.abs(this.turn - face) < 0.5) this.turn = face;
    else moving = true;
    const wave = walking ? Math.sin(this.phase(now)) : 0;
    const side = Math.cos((this.turn * Math.PI) / 180);
    // 侧过身时往走的方向倾一点（转了多少倾多少）；正面的时候左右摇
    let lean = (this.turn / w.turn_deg) * w.lean_deg;
    let stride = wave;
    if (this.hang) {
      // 扒着：往外歪，两片鳍一下一下扒着边（刚扒上的那一会儿扒得快，之后停住）
      const t = now - this.hang.at;
      lean = out * v.hang_lean_deg;
      stride = t < v.hang_settle_ms ? 0.6 * Math.sin(t / 70) * (1 - t / v.hang_settle_ms) : 0;
      if (t < v.hang_settle_ms) moving = true;
    } else if (act) {
      moving = true;
      if (act.kind === 'poke') stride = 1.4 * pulse(p, HITS.poke);
      // 拍：抬起朝它那一边的鳍（往右的是右鳍，`stride` 负的），拍的那几下落下去
      else if (act.kind === 'pat') stride = -act.side * (1.5 - 1.1 * pulse(p, HITS.pat)) * Math.min(1, bell * 4);
      else stride = 0;
      if (act.kind !== 'poke') lean = act.side * v.act_lean_deg * Math.min(1, bell * 3);
    }
    const clip = this.hang ? this.hang.clip : null;
    return { x: b.x, y: b.y + this.offset - Math.abs(wave) * w.hop_px - bob, rot: this.tilt + lean + wave * w.waddle_deg * side, stride, crouch: this.crouch, turn: this.turn, moving, clip };
  }
}
