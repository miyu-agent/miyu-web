// @ts-check
//! 吉祥物的落脚点量在页面上哪（软件包 `mascot`，蓝图 `web.md`「吉祥物」第 11 条）：照落脚点表（`resources/mascot-anchors.json`，
//! 加上挂载位 `mascot.anchors` 里别的包挂的、主题包加的和挪的）和部件名表（`resources/parts.json`）找页面上的东西，不认类名。
//! 算的：看得见（有宽高、在窗口里、不在退场）、头顶放得下、`layer` 那一块里没被盖住、`needs` 的那一项算着。量法是 `src/lib/anchors.js`
//! 的纯函数；这里只读页面。一帧里量一次（同一帧里问几回交同一份）。

import { knownTo, measure, roomy } from '../../src/lib/anchors.js';

/**
 * @typedef {import('../../src/lib/anchors.js').Anchor} Anchor
 * @typedef {import('../../src/lib/anchors.js').Platform} Platform
 * @typedef {import('../../src/lib/anchors.js').Ledge} Ledge
 * @typedef {import('../../src/lib/anchors.js').Hotspot} Hotspot
 * @typedef {import('../../src/lib/anchors.js').Parts} Parts
 * @typedef {{platforms: Platform[], ledges: Ledge[], hotspots: Hotspot[], rects: Map<string, DOMRect>, els: Map<string, Element>,
 *   blocked: Set<string>}} World 这一帧量出来的：台面（连站点）、扒边、互动点；每一处（`key`）的那一块和它的位置；看得见却被盖住了的落脚点
 */

/** 这个吉祥物会哪几种落脚点（第 11 条）：不会扒下沿（`under`，2026-10-21 项目主人：「但是我们的吉祥物不做这个」），那一种的点不量、不去 */
export const KINDS = /** @type {const} */ (['ground', 'perch', 'ledge', 'hotspot']);
/** 扒边至少要这么长才算（像素） */
const MIN_LEDGE = 24;

/** 量过的落脚点最多信多久（毫秒）：页面没报变化、自己挪了的（过渡、动画）这么久以后跟上 */
const STALE_MS = 200;

export class Anchors {
  /**
   * @param {{size: () => {w: number, h: number}, inset: () => number, layer: Element, kinds: readonly string[]}} o 身子多大、台面两头默认让多少、
   *   吉祥物那一层（看盖没盖住时跳过）、这个吉祥物会哪几种点（不会的不量）
   */
  constructor(o) {
    this.o = o;
    /** @type {Parts} */
    this.parts = {};
    /** 这一回算的那几个点（`combine` 过的） @type {Anchor[]} */
    this.list = [];
    /** 一块东西一个号（`all` 的每一个都要有自己的编号，滚动、重排了还是它） @type {WeakMap<Element, number>} */
    this.serial = new WeakMap();
    this.next = 1;
    /** @type {{group: string|null, world: World, at: number}|null} */
    this.cache = null;
  }

  /** 换一批点（表读到了、挂载位变了、换了主题） @param {Parts} parts @param {Anchor[]} list */
  set(parts, list) {
    this.parts = parts;
    this.list = knownTo(list, this.o.kinds);
    this.drop();
  }

  /** 页面变了：下一次重量 */
  drop() {
    this.cache = null;
  }

  /** 一块东西的号 @param {Element} el */
  keyOf(el) {
    let n = this.serial.get(el);
    if (!n) {
      n = this.next++;
      this.serial.set(el, n);
    }
    return n;
  }

  /** 这个部件在页面上的几块 @param {string} name */
  elements(name) {
    const p = this.parts[name];
    return p ? [...document.querySelectorAll(p.select.join(', '))] : [];
  }

  /**
   * 量一次（`group` 是舞台的；`null` 是平常的页面：表里的、没写 `group` 的。整页的底边哪个舞台都算）。量过的留着，页面变了
   * （`drop`：改了 DOM、改窗口、滚动……）或者过了 `STALE_MS` 才重量：原来每一帧都量，长会话里每一帧都逼着整页重排，
   * 开关预览工作区、闲着都卡（2026-10-23 项目主人）
   * @param {string|null} group
   * @returns {World}
   */
  world(group) {
    const now = performance.now();
    if (this.cache && this.cache.group === group && now - this.cache.at < STALE_MS) return this.cache.world;
    const world = this.measure(group);
    this.cache = { group, world, at: now };
    return world;
  }

  /** @param {string|null} group @returns {World} */
  measure(group) {
    const { w, h } = this.o.size();
    const inset = this.o.inset();
    /** @type {World} */
    const out = { platforms: [], ledges: [], hotspots: [], rects: new Map(), els: new Map(), blocked: new Set() };
    /** 每个落脚点量出来的几处（`needs` 照它） @type {Map<string, Array<{key: string, platform?: Platform, ledge?: Ledge, hotspot?: Hotspot}>>} */
    const found = new Map();
    for (const a of this.list) {
      if (a.id !== 'floor' && (a.group ?? null) !== group) continue;
      const got = [];
      for (const { el, rect, key } of this.places(a)) {
        if (!this.open(a, el, rect)) {
          out.blocked.add(a.id);
          continue;
        }
        const m = measure(a, rect, { key, inset, w });
        if (m.platform && a.id !== 'floor' && !roomy(m.platform, h)) continue;
        if (m.ledge) {
          m.ledge.y1 = Math.max(m.ledge.y1, h);
          m.ledge.y2 = Math.min(m.ledge.y2, innerHeight);
          if (m.ledge.y2 - m.ledge.y1 < MIN_LEDGE) continue;
        }
        if (el) out.els.set(key, el);
        out.rects.set(key, rect);
        got.push({ key, ...m });
        if (!a.all) break;
      }
      found.set(a.id, got);
    }
    for (const a of this.list) {
      const got = found.get(a.id);
      if (!got || (a.needs && !found.get(a.needs)?.length)) continue;
      for (const m of got) {
        if (m.platform) out.platforms.push(m.platform);
        if (m.ledge) out.ledges.push(m.ledge);
        if (m.hotspot) out.hotspots.push(m.hotspot);
      }
    }
    return out;
  }

  /**
   * 这个点落在页面上哪几块：照部件名找（`within` 的只要那一块里面的），或者挂进来的自己量（`at()`）。看不见的不要。
   * @param {Anchor} a
   * @returns {Array<{el: Element|null, rect: DOMRect, key: string}>}
   */
  places(a) {
    if (a.at) {
      const r = a.at();
      if (!r) return [];
      return [{ el: null, rect: new DOMRect(r.left, r.top, r.right - r.left, r.bottom - r.top), key: typeof r.key === 'string' ? r.key : a.id }];
    }
    const inside = a.within ? this.elements(a.within).find((e) => e.getBoundingClientRect().width) : null;
    if (a.within && !inside) return [];
    const out = [];
    for (const el of this.elements(/** @type {string} */ (a.part))) {
      if (inside && !inside.contains(el)) continue;
      if (el.closest('.is-leaving, [hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight) continue;
      out.push({ el, rect: r, key: a.all ? `${a.id}#${this.keyOf(el)}` : a.id });
      if (!a.all) break;
    }
    return out;
  }

  /**
   * 没被盖住：`layer` 那一块里，这一块看得见的那一截正中那一点上最上面的是它自己（或者它里面的）。那一块外面的（弹窗、吉祥物这一层）不管。
   * @param {Anchor} a @param {Element|null} el @param {DOMRect} r
   */
  open(a, el, r) {
    if (!a.layer || !el) return true;
    const root = this.elements(a.layer)[0];
    if (!root) return true;
    const x = (Math.max(0, r.left) + Math.min(innerWidth, r.right)) / 2;
    const y = (Math.max(0, r.top) + Math.min(innerHeight, r.bottom)) / 2;
    const hit = document.elementsFromPoint(x, y).find((e) => root.contains(e) && !this.o.layer.contains(e));
    return !hit || el.contains(hit);
  }
}
