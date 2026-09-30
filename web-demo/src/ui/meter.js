// @ts-check
//! 框下面那一行右边那两个数（蓝图 `web.md`「框下面那一行的数」）：上下文画成一个空心圆环（`layout.json` 的 `context_ring`），
//! 累计前面一个数据库图标；两格都能点，点了在框下面那一块就地展开一块牌子：色块条、色片、大数字，写这一次（上下文）或
//! 这一路（累计）的 token 构成，`Esc`、点同一格关，点另一格换（2026-10-01 项目主人定：不要浮层、也不要朴素表格，要色块）。
//!
//! 展开照 `lib/motion.js` 的 `unfold`（在流里占地方，收着时高度 0，框下面那一行不动）；色块条一开口从左边刷出来、一道高光
//! 扫过去（收着时重画，所以每开一次都放一遍）。颜色全用主题里的：未命中 `accent`、缓存读 `online`、缓存写 `gold`、输出 `ribbon`，
//! 两套主题都成立。

import { h, replace } from './dom.js';
import { res, t } from '../util/res.js';
import { short, percentTenths } from '../model/format.js';
import { unfold } from '../lib/motion.js';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * 四段：这一次（上下文）和这一路（累计）都照这四样分。前一个名字是颜色（`styles/composer.css` 的 `.is-名字`），
 * 中间是 `model/footer.js` 交上来的字段，后一个名字是界面上的字。
 */
const TONES = [
  ['uncached', 'uncached', 'usage.uncached'],
  ['cache_read', 'cacheRead', 'usage.cache_read'],
  ['cache_write', 'cacheWrite', 'usage.cache_write'],
  ['output', 'output', 'usage.output'],
];

/**
 * 上下文那个空心圆环：轨道一整圈，弧是「用了 ÷ 窗口」（`ratio`，超过 1 的由 `model/footer.js` 夹过）；到
 * `context_ring.warn_at` 弧换警告色。没有窗口（`ratio` 是 null）的只画轨道。
 * @param {{ratio: number|null}} part 上下文那一格（`model/footer.js` 的 `footer`）
 */
export function ring(part) {
  const { size, stroke, warn_at: warnAt } = res.layout.context_ring;
  const at = size / 2;
  const radius = (size - stroke) / 2;
  const around = 2 * Math.PI * radius;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'meter-ring');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.append(circle({ cx: at, cy: at, r: radius, 'stroke-width': stroke, class: 'meter-ring-track' }));
  if (part.ratio != null) {
    const arc = around * part.ratio;
    svg.append(circle({
      cx: at, cy: at, r: radius, 'stroke-width': stroke, class: 'meter-ring-arc',
      'stroke-dasharray': `${arc} ${around - arc}`, transform: `rotate(-90 ${at} ${at})`,
    }));
    if (part.ratio >= warnAt) svg.classList.add('is-warn');
  }
  return svg;
}

/** 圆环里的一圈 `<circle>`（SVG 的属性都得照字符串写）。 */
function circle(attrs) {
  const el = document.createElementNS(SVG, 'circle');
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  return el;
}

/**
 * 就地展开的那一块：点框下面那一行的上下文、累计两格，在框和那一行之间长出来。谁开着由这里记（`openKey`），
 * 整块收着时高度 0（`unfold`），画的内容每开一次重来（色块条、高光跟着重放）。
 */
export class Meters {
  constructor() {
    this.card = h('div.meters-card', { role: 'group' });
    this.el = h('div.footer-meters.unfold', h('div.unfold-inner', this.card));
    /** 开着的那一格（`'context'`、`'total'`）；没开是 `null` */
    this.openKey = /** @type {string|null} */ (null);
    /** 开着的那一格的数：和上一次一样就不重画 */
    this.sign = /** @type {string|null} */ (null);
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.close();
    };
    unfold(this.el, false);
  }

  get open() {
    return this.openKey;
  }

  /** 点一格：开着这一格就收回去，开着别的换过去（重画，色块条再长一遍）。 */
  toggle(part) {
    if (this.openKey === part.key) {
      this.close();
      return;
    }
    this.show(part);
  }

  /** @param {any} part `model/footer.js` 的上下文或累计那一格 */
  show(part) {
    const drawn = this.draw(part, true);
    replace(this.card, drawn);
    this.sign = this.signature(part);
    this.openKey = part.key;
    unfold(this.el, true);
    document.addEventListener('keydown', this.onKey, true);
  }

  /**
   * 底下的数变了（在跑的时候一直在变）：开着的那一格跟着重画，动画不重放（色块条不会一顿一顿地重新长）。
   * @param {any} part 刚算出来的上下文或累计那一格
   */
  refresh(part) {
    if (this.openKey !== part.key) return;
    const sign = this.signature(part);
    if (sign === this.sign) return;
    this.sign = sign;
    replace(this.card, this.draw(part, false));
  }

  /** 这一格现在的数：变了才重画。 */
  signature(part) {
    return `${part.text}|${part.percent ?? ''}|${JSON.stringify(part.detail ?? {})}`;
  }

  close() {
    if (!this.openKey) return;
    this.openKey = null;
    this.sign = null;
    unfold(this.el, false);
    document.removeEventListener('keydown', this.onKey, true);
  }

  /**
   * 这一块的样子：左边标题和一行原数，右边一个大数字（上下文写窗口占比、累计写命中率，没有窗口的上下文写用了多少），
   * 下面一条色块条（四格），再下面一行色片（一个色点、名字、数）。数都是 `short()` 过的。头一次画（`animate`）的
   * 时候色块条从左往右一段段长出来、一道高光扫过；底下的数变了重画的那一遍不重放动画。
   * @param {any} part
   * @param {boolean} animate 放不放生长、高光那两下
   */
  draw(part, animate) {
    const d = part.detail ?? {};
    const segs = TONES.map(([tone, field, label]) => ({ tone, label: t(label), value: d[field] ?? 0 }));
    const hero = part.key === 'total'
      ? `${part.percent}%`
      : part.window
        ? `${percentTenths(part.used, part.window)}%`
        : short(part.used);
    const cap = part.key === 'total' ? t('usage.hit') : part.window ? t('usage.window') : null;
    const sub = part.key === 'total'
      ? [`${t('usage.input')} ${short(d.input)}`, `${t('usage.requests')} ${d.requests}`]
      : [part.window ? `${short(part.used)} / ${short(part.window)}` : null, d.messages == null ? null : `${t('usage.messages')} ${d.messages}`];
    return [
      h('div.meters-head',
        h('div.meters-what',
          h('strong.meters-title', t(`usage.${part.key}`)),
          h('span.meters-sub', sub.filter(Boolean).join(' · '))),
        h('span.meters-hero', h('b', hero), cap ? h('small.meters-cap', cap) : null)),
      h(`div.meters-bar${animate ? '' : '.is-quiet'}`,
        segs.filter((s) => s.value > 0).map((s, i) => h(`i.meters-seg.is-${s.tone}`, { style: `flex: ${s.value} 1 0; --i: ${i}`, title: `${s.label} ${short(s.value)}` })),
        h('span.meters-shine', { 'aria-hidden': 'true' })),
      h('div.meters-legend', segs.map((s) => h(`span.meters-chip.is-${s.tone}`, h('i.meters-dot'), h('span.meters-chip-label', s.label), h('b', short(s.value))))),
    ];
  }
}
