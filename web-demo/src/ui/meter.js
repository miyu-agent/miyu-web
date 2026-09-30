// @ts-check
//! 框下面那一行右边那两个数（蓝图 `web.md`「框下面那一行的数」，2026-10-01 项目主人定）：上下文画成一个空心圆环
//! （`layout.json` 的 `context_ring`），累计前面一个数据库图标；两格都能点，点了在输入框上面开一个浮层，一行一项写
//! 这一次（上下文）或这一路（累计）的 token 构成，`Esc`、点外面关，点另一格换过去。
//!
//! 浮层和命令列表、后台任务同一个位置、同一个样子（带 `dock-float`，吉祥物照它站上去）：挂在输入框那一块里
//! （`ui/composer.js`），开关照 `ui/picker.js`。

import { h, replace } from './dom.js';
import { res } from '../util/res.js';
import { show, hide } from '../lib/motion.js';

const SVG = 'http://www.w3.org/2000/svg';

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
 * 点开的那一块：标题、一行总账、一行一项。谁点开的由 `ui/composer.js` 记（`openKey`），这里只管画和开关。
 */
export class MeterPanel {
  constructor() {
    this.title = h('strong.meter-title');
    this.sum = h('div.meter-sum');
    this.rows = h('div.meter-rows');
    this.el = h('div.dock-usage.dock-float', { hidden: true, role: 'dialog' }, h('div.meter-head', this.title), this.sum, this.rows);
    /** 开着的那一格（`'context'`、`'total'`）；没开是 `null` */
    this.openKey = /** @type {string|null} */ (null);
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.close();
    };
    this.onDown = (/** @type {PointerEvent} */ e) => {
      const at = /** @type {any} */ (e.target);
      // 点开这一格的按钮不算「外面」：那一头自己的 click 管开关
      if (!this.el.contains(at) && !at.closest?.('.footer-meter')) this.close();
    };
  }

  get open() {
    return this.openKey;
  }

  /**
   * 点一格：开着这一格就关掉，开着别的换过去。
   * @param {string} key 哪一格（`'context'`、`'total'`）
   * @param {string} title 浮层的标题
   * @param {string} sum 第一行总账
   * @param {[string, string][]} rows 一行一项：[名字, 数]
   */
  toggle(key, title, sum, rows) {
    if (this.openKey === key) {
      this.close();
      return;
    }
    this.title.textContent = title;
    this.sum.textContent = sum;
    replace(this.rows, rows.map(([label, value]) => h('div.meter-row', h('span.meter-label', label), h('span.meter-value', value))));
    this.openKey = key;
    show(this.el);
    document.addEventListener('keydown', this.onKey, true);
    document.addEventListener('pointerdown', this.onDown, true);
  }

  close() {
    if (!this.openKey) return;
    this.openKey = null;
    document.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('pointerdown', this.onDown, true);
    hide(this.el);
  }
}
