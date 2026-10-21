// @ts-check
//! 吉祥物什么时候做什么（软件包 `mascot`，蓝图 `web.md`「吉祥物」第 4–9 条）：身子怎么动在 `body.js`，脸在 `face.js`，这里定
//! 什么时候做：没人动时隔一阵走一趟、摇头、抖耳朵、眨眼、打哈欠；她在回答时掏电脑敲，没人动好一阵掏游戏机玩一会儿（第 5 条）；
//! 看哪（第 6 条）；按住蓄力、松手跳，拖、扔（第 3、8 条）；落地摔重了晕一下；嘴只在打哈欠时张。没人动时隔一阵挑一处够得着的
//! 落脚点去（第 11 条：跳上台面、站点，扒住一道边，走到互动点戳、拍、看），待够了回家；提示露出来那一下凑过去看。
//! 只在要动的时候一帧一帧推（`requestAnimationFrame`），停着不画；标签页在后台不推。
//! 数都是这个包的设置项。

import { Body } from './body.js';
import { Face } from './face.js';
import { Lamp } from './lamp.js';
import { hangAt, launchFrom, standFor } from '../../src/lib/anchors.js';

/** `[最小, 最大]` 里随机一个 */
const pick = ([a, b]) => a + Math.random() * (b - a);
/** 夹在 `[-max, max]` 里 */
const clamp = (v, max) => Math.max(-max, Math.min(max, v));

/**
 * @typedef {import('../../src/lib/anchors.js').Hotspot} Hotspot
 * @typedef {{platforms: import('./body.js').Platform[], ledges: import('../../src/lib/anchors.js').Ledge[], hotspots: Hotspot[]}} World
 * @typedef {import('./body.js').Room & {draw: (pose: import('./model.js').Pose) => void,
 *   place: (at: {x: number, y: number, rot: number, clip: {left: number, right: number}|null}) => void, head: () => {x: number, y: number}|null,
 *   hold: (kind: string|null) => void, nextProp: () => void, hidden: () => boolean, world?: () => World,
 *   touch?: (id: string, kind: string) => void}} Io
 *   台子这些，再加画一帧、放到哪、头在屏幕上哪、拿出收起道具、道具下一帧、不出来；这一帧的落脚点（台面、扒边、互动点）、碰一下互动点那一块
 * @typedef {{kind: 'ground'|'perch'|'ledge'|'hotspot', id: string, from: number, x: number, y: number, stand?: string, spot?: Hotspot,
 *   action?: string, stage: 'walk'|'leap'}} Plan 要去的一处：哪一种、编号、从哪起跳（脚下这一段上）、落在哪、互动点站在哪一段、
 *   碰哪一块、做什么；走着去还是跳着去
 */

export class Behavior {
  /**
   * @param {any} config 这个包的设置项
   * @param {Io} io
   */
  constructor(config, io) {
    this.config = config;
    this.io = io;
    this.body = new Body(config, io);
    this.face = new Face(config);
    this.pose = this.face.pose;
    /** 肚子上的灯：亮灭变了画一帧（第 7 条） */
    this.lamp = new Lamp(config.lamp, () => io.reduced(), () => {
      this.pose.lamp = this.lamp.on;
      this.wake();
    });
    /** 这个会话有几个后台任务在跑（连嵌套的） */
    this.jobs = 0;
    /** 手里拿着什么：`laptop`、`console`、没有；游戏机玩到什么时候；道具换到第几帧 */
    this.activity = /** @type {string|null} */ (null);
    this.gameUntil = 0;
    this.propTimer = 0;
    this.propFrame = 0;
    /** 最后一次有人动（按键、动鼠标）；鼠标最后在哪、什么时候动的；输入框里光标在哪（框里没字是 `null`） */
    this.touched = performance.now();
    this.pointer = /** @type {{x: number, y: number}|null} */ (null);
    this.pointerAt = 0;
    this.pointerTimer = 0;
    this.caret = /** @type {{x: number, y: number}|null} */ (null);
    /** 她在回答 */
    this.busy = false;
    this.frame = 0;
    this.last = 0;
    this.droopTimer = 0;
    /** 要去的一处（第 11 条） @type {Plan|null} */
    this.plan = null;
    /** 露出来时在空中、落稳了再去看的互动点（编号） @type {string|null} */
    this.later = null;
    /** 在别处待着：哪一处、待够了回家的计时 */
    this.away = /** @type {{id: string, timer: number}|null} */ (null);
    /** @type {number[]} */
    this.timers = [];
    this.schedule();
  }

  /** 排下一次眨眼、摇头、抖耳朵、走动，隔一阵看要不要掏游戏机。 */
  schedule() {
    const idle = this.config.idle;
    const later = (ms, fn) => this.timers.push(window.setTimeout(fn, ms));
    const blink = () => {
      this.face.blink(pick(idle.blink_ms), Math.random() < idle.double_blink);
      this.wake();
      later(pick(idle.blink_every_ms), blink);
    };
    later(pick(idle.blink_every_ms), blink);
    const glance = () => {
      if (this.idle() && !this.caret && !this.activity && this.body.walkTo == null && !this.io.reduced()) {
        const home = Math.random() < idle.glance_home;
        this.look(home ? 0 : (Math.random() * 2 - 1) * idle.glance_yaw, home ? 0 : (Math.random() * 2 - 1) * idle.glance_pitch, idle.glance_half_life_ms);
      }
      later(pick(idle.glance_hold_ms), glance);
    };
    later(pick(idle.glance_hold_ms), glance);
    const twitch = () => {
      if (!this.io.reduced()) this.twitch();
      later(pick(idle.twitch_every_ms), twitch);
    };
    later(pick(idle.twitch_every_ms), twitch);
    // 打哈欠：没人动好一阵（`after_ms` 的 `yawn_idle` 倍）、站着、手里没东西
    const yawn = () => {
      if (this.free() && performance.now() - this.touched > idle.after_ms * this.config.mouth.yawn_idle) {
        this.face.yawn();
        this.wake();
      }
      later(pick(this.config.mouth.yawn_every_ms), yawn);
    };
    later(pick(this.config.mouth.yawn_every_ms), yawn);
    const walk = () => {
      if (this.free() && this.idle()) this.wander();
      later(pick(this.config.walk.every_ms), walk);
    };
    later(pick(this.config.walk.every_ms), walk);
    const visit = () => {
      if (this.idle()) this.visit();
      later(pick(this.config.visit.every_ms), visit);
    };
    later(pick(this.config.visit.every_ms), visit);
    const game = () => {
      const a = this.config.activity;
      if (this.free() && performance.now() - this.touched > a.game_after_ms && this.body.walkTo == null) {
        this.gameUntil = performance.now() + pick(a.game_ms);
        this.settle();
      }
      later(a.game_after_ms / 4, game);
    };
    later(this.config.activity.game_after_ms / 4, game);
  }

  /** 没人动（`after_ms` 没按键、没动鼠标）。 */
  idle() {
    return performance.now() - this.touched > this.config.idle.after_ms;
  }

  /** 闲着、站着、手里没东西，也没设减少动画：可以自己走、掏游戏机。 */
  free() {
    return !this.busy && !this.activity && this.body.standing() && !this.io.reduced() && !this.body.act && !this.plan;
  }

  /** 走一趟（没人动时隔一阵自己走；也能叫它走）。 */
  wander() {
    this.body.wander();
    this.wake();
  }

  /** 有人动了（按键）：走着的停在原地，游戏机收起来。 */
  touch() {
    this.touched = performance.now();
    this.body.halt();
    // 走着去一处的被叫停了：不去了
    if (this.plan?.stage === 'walk' && this.body.walkTo == null) this.plan = null;
    if (this.gameUntil) {
      this.gameUntil = 0;
      this.settle();
    }
    this.follow();
  }

  /** 鼠标动了：看鼠标；停了 `pointer_hold_ms` 以后框里有字的改看光标。 */
  moved(pointer) {
    this.pointer = pointer;
    this.pointerAt = performance.now();
    clearTimeout(this.pointerTimer);
    this.pointerTimer = window.setTimeout(() => this.follow(), this.config.gaze.pointer_hold_ms + 20);
    this.touch();
  }

  /** 在输入框里打字：光标在哪（框里没字的是 `null`）。 */
  typing(caret) {
    this.caret = caret;
    this.touch();
  }

  /** 她在回答没有：回答时掏电脑敲；这一轮结束收起来、跳一下（`hop` 是假的不跳：引导里没连上）。 */
  setBusy(busy, hop = true) {
    if (busy === this.busy) return;
    this.busy = busy;
    this.settle();
    this.light();
    if (!busy && hop) {
      this.hop();
      this.lamp.flash();
    }
    this.follow();
  }

  /** 这个会话有几个后台任务在跑：有的时候灯隔一阵亮一下。 */
  setJobs(n) {
    this.jobs = n;
    this.light();
  }

  /** 灯照现在的样子闪：在回答一闪一闪，有后台任务隔一阵亮一下，别的灭着。 */
  light() {
    this.lamp.set(this.busy ? 'busy' : this.jobs > 0 ? 'jobs' : 'off');
  }

  /** 该拿什么照现在的样子定：站着、在回答的拿电脑；站着、在玩的拿游戏机；别的收起来。 */
  settle() {
    // 正在走的（比如从输入框正下面那一段走出来）先不拿，走到了再说
    const standing = this.body.standing() && this.body.walkTo == null && !this.io.reduced();
    const want = standing && this.busy ? 'laptop' : standing && this.gameUntil > performance.now() ? 'console' : null;
    if (want === this.activity) return;
    this.activity = want;
    this.io.hold(want);
    clearInterval(this.propTimer);
    this.propTimer = 0;
    if (want) {
      this.body.walkTo = null;
      this.propTimer = window.setInterval(() => this.propTick(), this.config.activity.frame_ms);
    }
    this.follow();
  }

  /** 道具的一帧：换一帧；敲电脑身子颠一下；游戏机玩够了收起来，玩着偶尔跳一下。 */
  propTick() {
    this.propFrame += 1;
    this.io.nextProp();
    if (this.activity === 'console') {
      if (performance.now() > this.gameUntil) {
        this.gameUntil = 0;
        this.settle();
      } else if (Math.random() < 0.04) this.hop();
    }
    this.wake();
  }

  /** 看哪（第 6 条）：拿着东西看手里；鼠标在动看鼠标；停着、框里有字看光标；在回答往上看；都没有看正前方。 */
  gaze() {
    const g = this.config.gaze;
    if (this.activity) return { yaw: 0, pitch: g.prop_pitch };
    // 扒着的朝外看；做动作的看着碰的那一块
    const hang = this.body.hang;
    if (hang) return { yaw: (hang.side === 'right' ? 1 : -1) * this.config.visit.hang_yaw, pitch: 0 };
    const act = this.body.act;
    const head = act ? this.io.head() : null;
    if (act && head) {
      const deg = (v) => (Math.atan(v / (g.distance / 3)) * 180) / Math.PI;
      return { yaw: clamp(deg(act.target.x - head.x), g.max_yaw), pitch: clamp(deg(act.target.y - head.y), g.max_pitch) };
    }
    const moving = this.pointer && performance.now() - this.pointerAt < g.pointer_hold_ms;
    const target = moving ? this.pointer : this.caret;
    const me = target ? this.io.head() : null;
    if (!target || !me) return { yaw: 0, pitch: this.busy ? this.config.jump.busy_pitch : 0 };
    const deg = (v) => (Math.atan(v / g.distance) * 180) / Math.PI;
    return { yaw: clamp(deg(target.x - me.x), g.max_yaw), pitch: clamp(deg(target.y - me.y), g.max_pitch) };
  }

  /** 照 `gaze` 转过去（走着的脸朝走的方向，不管它）。 */
  follow() {
    if (this.io.reduced() || this.body.walkTo != null) return;
    const a = this.gaze();
    this.look(a.yaw, a.pitch, this.config.gaze.half_life_ms);
  }

  /** 转到 `yaw`、`pitch`，照 `half` 缓动过去。 */
  look(yaw, pitch, half) {
    this.face.look(yaw, pitch, half);
    this.wake();
  }

  /** 耳朵往外抖一下。 */
  twitch() {
    this.face.twitch(pick(this.config.idle.twitch_tilt));
    this.wake();
  }

  /** 原地跳一下（先蹲再跳）。 */
  hop() {
    this.body.hop(this.config.jump.height_px);
    this.wake();
  }

  /** 耷拉一下耳朵、低头（第一次引导里没连上），过一会儿抬回来。 */
  droop() {
    const d = this.config.droop;
    this.face.droop(d.tilt, d.ms);
    this.look(0, d.pitch, this.config.gaze.half_life_ms);
    window.clearTimeout(this.droopTimer);
    this.droopTimer = window.setTimeout(() => this.follow(), d.ms);
  }

  /** 舞台换了：跳回家（`drop` 的从窗口顶上掉下来）。扒着的先松手。 */
  goHome(drop = false) {
    this.home();
    this.body.goHome(drop);
    this.wake();
  }

  /** 不在别处待了、不去了 */
  home() {
    this.plan = null;
    if (this.away) clearTimeout(this.away.timer);
    this.away = null;
    if (this.body.hang) this.body.unhang();
  }

  /**
   * 挑一处够得着的落脚点去（第 11 条）：台面（不是脚下这一段、不是家、不是地、不是浮层）、站点、扒边、互动点（露出来那一下才去的不算）；
   * 离脚下这一段横着不超过 `visit.reach_x`、往上不超过 `visit.reach_up`。交回去没去。
   */
  visit() {
    const b = this.body.at;
    const g = b?.ground;
    const world = this.io.world?.();
    if (!b || !g || !world || !this.free()) return false;
    const v = this.config.visit;
    const edge = this.config.home.edge;
    const { w, h } = this.io.size();
    const home = this.io.home();
    const reach = (/** @type {{x: number, y: number}} */ to) => launchFrom({ x: b.x, ground: g }, to, v, edge);
    /** @type {Plan[]} */
    const cands = [];
    for (const p of world.platforms) {
      if (p.id === g.id || p.id === 'floor' || p.id === home?.platform.id || p.carry) continue;
      const x = p.perch || p.x2 - p.x1 < 2 * edge ? (p.x1 + p.x2) / 2 : Math.max(p.x1 + edge, Math.min(p.x2 - edge, b.x));
      const from = reach({ x, y: p.y });
      if (from != null) cands.push({ kind: p.perch ? 'perch' : 'ground', id: p.id, from, x, y: p.y, stage: 'walk' });
    }
    for (const l of world.ledges) {
      const y = Math.max(l.y1 + h, Math.min(l.y2 - 6, g.y - v.hang_rise_px));
      if (y > l.y2) continue;
      const x = hangAt(l, w, v.peek).x;
      const from = reach({ x, y });
      if (from != null) cands.push({ kind: 'ledge', id: l.id, from, x, y, stage: 'walk' });
    }
    for (const s of world.hotspots) {
      if (s.when === 'appear') continue;
      const stand = standFor(s, world.platforms);
      if (!stand) continue;
      const x = Math.max(stand.x1, Math.min(stand.x2, s.x));
      const from = stand.id === g.id ? x : reach({ x, y: stand.y });
      if (from != null) cands.push({ kind: 'hotspot', id: s.id, from, x, y: stand.y, stand: stand.id, spot: s, action: s.actions[Math.floor(Math.random() * s.actions.length)], stage: 'walk' });
    }
    if (!cands.length) return false;
    this.go(cands[Math.floor(Math.random() * cands.length)]);
    return true;
  }

  /** 去这一处：先沿着脚下这一段走到起跳的地方（互动点在脚下这一段上的走到它那里），到了再跳（`launch`）。 @param {Plan} plan */
  go(plan) {
    const b = this.body.at;
    if (!b) return;
    this.plan = plan;
    if (Math.abs(plan.from - b.x) > 1) {
      this.body.walkTo = plan.from;
      this.body.walkAt = performance.now();
      this.wake();
    } else this.launch();
  }

  /** 走到了起跳的地方：互动点在脚下这一段上的当场做动作，别的跳过去（扒边的到那一点扒住）。 */
  launch() {
    const p = this.plan;
    const g = this.body.at?.ground;
    if (!p || !g) return;
    if (p.kind === 'hotspot' && p.stand === g.id) {
      this.perform(p);
      return;
    }
    const then = /** @type {{kind: 'land'|'hang', id: string}} */ ({ kind: p.kind === 'ledge' ? 'hang' : 'land', id: p.kind === 'hotspot' ? /** @type {string} */ (p.stand) : p.id });
    if (this.body.leapTo(p.x, p.y, then)) p.stage = 'leap';
    else this.plan = null;
    this.wake();
  }

  /** 做互动点的那个动作（时长照 `visit.<动作>_ms`）。 @param {Plan} p */
  perform(p) {
    const s = /** @type {Hotspot} */ (p.spot);
    const r = s.rect;
    const action = p.action ?? s.actions[0];
    const target = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    if (!this.body.startAct(action, target, this.config.visit[`${action}_ms`])) this.plan = null;
    else this.plan = { ...p, stage: 'leap' };
    if (action === 'look') this.twitch();
    this.wake();
  }

  /**
   * 互动点露出来了（`when: "appear"`，提示）：站着、手里没东西的凑过去看。在脚下这一段上、离得不远（`visit.notice_walk_px`）的走过去，
   * 远的就地侧过身看。
   * @param {Hotspot} s
   */
  notice(s) {
    const b = this.body.at;
    const g = b?.ground;
    // 在空中（框上的命令列表刚收起、正掉回输入框）：落稳了再看，那时它还露着的话
    this.later = !g && !this.body.drag ? s.id : null;
    if (!b || !g || this.activity || this.body.act || this.body.drag || this.io.reduced() || this.plan || this.body.windup) return;
    const world = this.io.world?.();
    const stand = world ? standFor(s, world.platforms) : null;
    const action = s.actions[0];
    if (stand?.id === g.id && Math.abs(s.x - b.x) <= this.config.visit.notice_walk_px) {
      this.go({ kind: 'hotspot', id: s.id, from: Math.max(stand.x1, Math.min(stand.x2, s.x)), x: s.x, y: stand.y, stand: stand.id, spot: s, action, stage: 'walk' });
    } else this.perform({ kind: 'hotspot', id: s.id, from: b.x, x: b.x, y: b.y, stand: g.id, spot: s, action, stage: 'leap' });
  }

  /** 到了别处（台面、站点、扒着）：待一会儿（`visit.stay_ms`、扒着的 `visit.hang_ms`）回家。 @param {string} id @param {number} ms */
  stay(id, ms) {
    if (this.away) clearTimeout(this.away.timer);
    this.away = {
      id,
      timer: window.setTimeout(() => {
        this.away = null;
        if (this.body.hang?.id === id) this.body.unhang();
        else if (this.body.at?.ground?.id === id && this.body.standing()) this.body.goHome();
        this.wake();
      }, ms),
    };
  }

  /** 左键按下：抓起来。 */
  grab(x, y) {
    this.home();
    this.body.grab(x, y);
    this.wake();
  }

  /** 拖着走：开始拖的那一下手里的东西收起来。 */
  dragTo(x, y) {
    if (this.body.dragTo(x, y)) this.settle();
    this.wake();
  }

  /** 松手：拖过的扔出去往下掉；没拖动的跳起来，蓄得越久跳得越高（蓄过力的已经蹲着，直接起跳），抖一下耳朵。 */
  release() {
    const charge = this.body.release();
    if (charge != null) {
      const j = this.config.jump;
      this.body.hop(j.height_px + charge * j.charge_px, charge >= j.charge_min);
      this.twitch();
    }
    this.wake();
  }

  /** 要动了：没在推的开始推。 */
  wake() {
    if (!this.frame && !document.hidden) this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  /** 推一帧：身子、落地以后的事、脸；都停了不再推。 */
  tick(now) {
    this.frame = 0;
    if (this.io.hidden()) {
      this.last = 0;
      return;
    }
    const dt = this.last ? Math.min(now - this.last, 50) : 16;
    this.last = now;
    const c = this.config;
    const moved = this.body.move(dt, now);
    if (moved.left && this.activity) this.settle();
    if (moved.landed != null) {
      if (moved.landed > c.land.dizzy_min) {
        this.face.daze(c.land.dizzy_ms);
        this.twitch();
      }
      // 站稳了：该拿的东西拿出来
      if (this.body.standing()) this.settle();
    }
    if (moved.arrived) this.settle();
    // 去一处（第 11 条）：走到了起跳；落下了，落在要去的那一段上的待一会儿（互动点的做动作）；扒住了边待一会儿；动作碰了那一块、做完了
    const plan = this.plan;
    if (plan && moved.arrived && plan.stage === 'walk') this.launch();
    else if (plan && moved.landed != null && plan.stage === 'leap' && !this.body.act) {
      this.plan = null;
      const on = this.body.at?.ground?.id;
      if (plan.kind === 'hotspot' && on === plan.stand) this.perform(plan);
      else if (on === plan.id) this.stay(plan.id, pick(c.visit.stay_ms));
    }
    if (moved.landed != null && this.later && this.body.standing()) {
      const id = this.later;
      this.later = null;
      const spot = this.io.world?.()?.hotspots.find((x) => x.id === id);
      if (spot) this.notice(spot);
    }
    if (moved.hung && plan) {
      this.plan = null;
      this.stay(plan.id, pick(c.visit.hang_ms));
    }
    if (moved.hit && this.plan?.spot) this.io.touch?.(this.plan.spot.id, this.body.act?.kind ?? this.plan.action ?? '');
    if (moved.acted) {
      this.plan = null;
      this.follow();
    }
    if (moved.arrived || moved.landed != null) this.follow();
    const bob = this.activity === 'laptop' ? (this.propFrame % 2) * c.activity.type_bob_px : 0;
    const shape = this.body.shape(dt, now, bob);
    let moving = moved.moving || shape.moving;
    // 走着的侧过身去（身子转，`body.js`），头朝着身子前面；在动的时候（掉、被带着、拖）要看的方向跟着变
    const b = this.body.at;
    if (this.body.walkTo != null && b?.ground) this.face.aim = { yaw: 0, pitch: 0, half: c.gaze.half_life_ms };
    else if (moving && !this.io.reduced()) this.face.aim = { ...this.face.aim, ...this.gaze() };
    moving = this.face.tick(dt, now) || moving;
    // 扒着的耳朵往外撇一点（使着劲）
    if (this.body.hang) this.pose.ear += c.visit.hang_ear;
    this.pose.stride = shape.stride;
    this.pose.crouch = shape.crouch;
    this.pose.turn = shape.turn;
    this.io.place(shape);
    this.io.draw(this.pose);
    if (moving) this.wake();
  }

  /** 停用了：停掉计时、不再推。 */
  destroy() {
    for (const id of this.timers) clearTimeout(id);
    if (this.away) clearTimeout(this.away.timer);
    clearTimeout(this.pointerTimer);
    clearTimeout(this.droopTimer);
    clearInterval(this.propTimer);
    this.lamp.destroy();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
