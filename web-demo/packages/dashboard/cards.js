// @ts-check
//! 右侧边栏的卡片（挂载位 `side.cards`，蓝图 `web.md`「仪表盘」第 4 条；2026-10-24 项目主人定做成模块）：谁都能往里挂一张卡，外壳（底、边、圆角、
//! 钉住的头一行、最大高度、在卡里滚、空的整张收起）这里画，内容各包自己画。先后、关掉哪几张、每张最多露几行照这个包的设置（`cards`、
//! `cards_off`、`card_rows`、`card_rows_default`），没在设置里排过的照各自的 `order` 接在后面。
//!
//! 挂一张卡：`{id, order, keep?, shrink?, render(card)}`。`render` 只叫一次，交一个 `card`（见 `Card`）；交回一个函数的，拿下来时叫它收拾。
//! `keep` 是窗口矮、放不下时这张卡至少留几行（出厂 3；`Infinity` 不缩），`shrink` 是放不下时谁先缩（越大越先，出厂 4、`0` 不缩），
//! `head: false` 的没有头一行（会话信息：直接从会话标题开始），`rows: false` 的不限高度、设置里不出「最多露几行」（会话信息），
//! `name` 是设置里列出来叫什么（不写的照 `card.title` 写的、再不行照编号）。设置改了（`live`）当场照新的排、改高度（`reconfigure`）。

import { h, replace } from '../../src/lib/dom.js';
import { unfold } from '../../src/lib/motion.js';
import { arrange } from './model.js';

/** 一行多高、头一行多高（px，同 `style.css`：头一行 36、上下边和卡片底下的空 18） */
const ROW_PX = 30;
const CHROME_PX = 54;

/**
 * 交给挂卡片的那一边的：照着改头一行、内容，说有没有东西、现在几行。
 * @typedef {{
 *   el: HTMLElement,
 *   title: (text: string) => void,
 *   head: (...nodes: any[]) => void,
 *   gap: () => HTMLElement,
 *   body: (...nodes: any[]) => void,
 *   show: (on: boolean) => void,
 *   size: (rows: number) => void,
 *   maxRows: () => number,
 *   link: (open: () => void) => void,
 * }} Card
 */

export class Cards {
  /**
   * @param {HTMLElement} host 卡片排在哪（最后一个是「什么都还没有」那一句）
   * @param {any} slots 这个包的挂载位（`ctx.slots`）
   * @param {{cards: string[], cards_off: string[], card_rows: Record<string, number>, card_rows_default: number}} config
   * @param {(owner: string, reason: string) => Node} failed 画的时候出错的那一张里写什么
   * @param {() => void} changed 有卡出来、收起了（「什么都还没有」那一句跟着）；设置改了也叫（内容照新的行数重画）
   */
  constructor(host, slots, config, failed, changed) {
    this.host = host;
    this.slots = slots;
    this.config = config;
    this.failed = failed;
    this.changed = changed;
    /** @type {Map<any, {slot: HTMLElement, card: Card, on: boolean, rows: number, title: string, dispose?: () => void}>} */
    this.drawn = new Map();
  }

  /** 设置改了（先后、关掉的、行数）：照新的排，每张卡的高度、收起的地方跟着换 @param {any} config */
  reconfigure(config) {
    this.config = config;
    for (const [entry, d] of this.drawn) {
      d.rows = this.rowsOf(entry);
      d.card.el.style.setProperty('--card-rows', Number.isFinite(d.rows) ? String(d.rows) : '');
      if (!Number.isFinite(d.rows)) d.card.el.style.removeProperty('--card-rows');
    }
    this.sync();
  }

  /** 一张卡在设置里叫什么 @param {string} id */
  nameOf(id) {
    const entry = this.slots.list('side.cards').find((/** @type {any} */ e) => e.id === id);
    if (entry?.name) return String(entry.name);
    for (const [e, d] of this.drawn) if (e.id === id && d.title) return d.title;
    return id;
  }

  /** 开始照挂载位画；交回停下来的（拿下每一张，叫它们收拾） */
  start() {
    const stop = this.slots.watch('side.cards', () => this.sync());
    this.sync();
    return () => {
      stop();
      for (const entry of [...this.drawn.keys()]) this.drop(entry);
    };
  }

  /** 有没有露着的卡 */
  any() {
    return [...this.drawn.values()].some((d) => d.on);
  }

  sync() {
    const entries = arrange(this.slots.list('side.cards'), { order: this.config.cards, off: this.config.cards_off });
    for (const entry of [...this.drawn.keys()]) if (!entries.includes(entry)) this.drop(entry);
    /** @type {Node|null} */
    let prev = null;
    for (const entry of entries) {
      let d = this.drawn.get(entry);
      if (!d) d = this.make(entry);
      const want = prev ? prev.nextSibling : this.host.firstChild;
      if (want !== d.slot) this.host.insertBefore(d.slot, want);
      prev = d.slot;
    }
    this.changed();
  }

  /** 一张卡的外壳，叫挂它的那一边画 @param {any} entry */
  make(entry) {
    const id = String(entry.id);
    const rows = this.rowsOf(entry);
    const title = h('strong.dash-title');
    const head = h('div.dash-head.is-sticky', title);
    const body = h('div.dash-card-body');
    const bare = entry.head === false;
    const el = h(`section.dash-card${bare ? '.is-bare' : ''}`, { dataset: { card: id }, style: Number.isFinite(rows) ? `--card-rows: ${rows}` : null }, bare ? null : head, body);
    const slot = h('div.unfold.dash-slot', { dataset: { card: id } }, h('div.unfold-inner', el));
    const keep = entry.keep ?? 3;
    const shrink = entry.shrink ?? 4;
    slot.style.flexShrink = String(shrink);
    /** @type {{slot: HTMLElement, card: Card, on: boolean, rows: number, title: string, dispose?: () => void}} */
    const d = { slot, on: false, rows, title: '', card: /** @type {any} */ (null) };
    d.card = {
      el,
      title: (text) => {
        d.title = text;
        title.textContent = text;
        el.setAttribute('aria-label', text);
      },
      head: (...nodes) => replace(head, title, ...nodes),
      gap: () => h('span.dash-gap'),
      body: (...nodes) => replace(body, ...nodes),
      show: (on) => {
        unfold(slot, on);
        if (d.on === on) return;
        d.on = on;
        this.changed();
      },
      // 窗口矮、放不下时缩到哪为止（留 `keep` 行，不超过最多露的）；本来就不到这么多行的、不缩的不缩
      size: (n) => {
        const floor = Math.min(keep, d.rows);
        slot.classList.toggle('is-short', shrink === 0 || n <= floor);
        slot.style.setProperty('--dash-floor', `${CHROME_PX + floor * ROW_PX}px`);
      },
      maxRows: () => d.rows,
      // 标题字能点（放大看，蓝图「仪表盘」第 4 条「放大看」）：悬停下划线、指针变手，回车、空格也行
      link: (open) => {
        title.classList.add('is-link');
        title.setAttribute('role', 'button');
        title.tabIndex = 0;
        title.onclick = () => open();
        title.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          open();
        };
      },
    };
    unfold(slot, false);
    this.drawn.set(entry, d);
    const out = this.slots.draw(entry, d.card);
    if (out?.failed) {
      d.card.title(String(entry.id));
      d.card.body(this.failed(out.owner, out.reason));
      d.card.show(true);
    } else if (typeof out === 'function') d.dispose = out;
    return d;
  }

  /** @param {any} entry */
  drop(entry) {
    const d = this.drawn.get(entry);
    if (!d) return;
    try {
      d.dispose?.();
    } catch (err) {
      console.error(`${entry.owner} 挂的卡 ${entry.id} 拿下来时出错了`, err);
    }
    d.slot.remove();
    this.drawn.delete(entry);
  }

  /** 这张卡最多露几行（设置 `card_rows`，没写的照 `card_rows_default`；`rows: false` 的、都没有的不限） @param {any} entry */
  rowsOf(entry) {
    if (entry.rows === false) return Infinity;
    const n = Number(this.config.card_rows?.[String(entry.id)]);
    if (Number.isFinite(n) && n > 0) return n;
    const d = Number(this.config.card_rows_default);
    return Number.isFinite(d) && d > 0 ? d : Infinity;
  }
}
