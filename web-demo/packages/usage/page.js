// @ts-check
//! 设置页的「用量」一页（蓝图 `web.md`「用量页」；挂进设置页的 `settings.section`）：页头选时间段（今天、7 天、30 天、全部、自定义），
//! 四格数（花费、请求、token、缓存命中），一张三段叠起来的柱子（一天的一小时一根，长的一天一根，太长的一月一根），一张能切分组、
//! 每一列都能排的表，点一行在它下面浮一个小窗写细则。一页是一个常驻的对象：设置页重画、关了再开交回的是同一块，时间段、分页签、排法跟着它。
//! 用量没有流：打开、换时间段、点刷新时重读。

import { h, icon, replace, offsetIn } from '../../src/lib/dom.js';
import { short, hitRate, hhmm } from '../../src/lib/format.js';
import { input, total, sum, money, amountText, offsetOf, spanOf, spanParams, daysBetween, dayKey, hours, hourBars, dayBars, allBars, rangeBars, niceStep, sorted, splitsOf, exact, purposeKey, venueOf, splitModel } from './model.js';

/** 分组表先列几行 */
const FIRST = 10;
/** 柱子的画布：高，左边纵轴的字、下边横轴的字各占多少；宽照这一页画的时候有多宽（字不拉扁；之后宽窄变了照比例拉） */
const H = 190, LEFT = 44, BOTTOM = 22, TOP = 6;
const NS = 'http://www.w3.org/2000/svg';

/** @typedef {import('./model.js').Row} Row */
/** @typedef {import('./model.js').Bar} Bar */
/** @typedef {import('./model.js').Column} Column */
/** @typedef {'1'|'7'|'30'|'all'|'custom'} Range */
/** @typedef {'model'|'session'|'purpose'|'venue'} Group */

const RANGES = /** @type {Range[]} */ (['1', '7', '30', 'all', 'custom']);
const GROUPS = /** @type {Group[]} */ (['model', 'session', 'purpose', 'venue']);
const COLUMNS = /** @type {Column[]} */ (['name', 'requests', 'tokens', 'hit', 'cost']);

export class UsagePage {
  /** @param {any} ctx `usage` 包的 ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    this.el = h('div.use-page');
    /** @type {any} */
    this.kit = null;
    /** @type {Range} */
    this.range = '30';
    /** 自定义的两天（`2026-10-14`）；头一次点「自定义」照最近 7 天填 @type {{from: string, to: string}|null} */
    this.custom = null;
    /** @type {Group} */
    this.group = 'model';
    /** @type {{by: Column, desc: boolean}} */
    this.sort = { by: 'tokens', desc: true };
    this.all = false;
    /** 浮着细则的那一行（分组那一格的值；`undefined` 是没开） @type {string|null|undefined} */
    this.open = undefined;
    /** 这一回画出来的那一行（浮窗照它摆） @type {{row: Row, el: HTMLElement}|null} */
    this.openRow = null;
    // 浮窗开着：`Esc` 先关它（设置框找带 `data-set-dismiss` 的发 `set-dismiss`），点外面也关（点别的行是换一行）
    this.el.addEventListener('set-dismiss', () => this.closePop());
    document.addEventListener('pointerdown', (e) => {
      if (this.open === undefined) return;
      const target = /** @type {Element|null} */ (e.target);
      if (target?.closest?.('.use-pop, .use-row')) return;
      this.closePop();
    }, true);
    /** 拆开的行：照（时间段、分组、拆的那一样）记着，同一段时间问过的不再问 @type {Map<string, Row[]|'loading'>} */
    this.splits = new Map();
    /** 读到的：合计、会话数、柱子、分组的行；`null` 是还没读完 @type {{total: Row, sessions: number, bars: Bar[], unit: 'hour'|'day'|'month', rows: Row[], at: number}|null} */
    this.data = null;
    /** 这一次读的时间段（拆开的行照它问） @type {Record<string, string>} */
    this.params = {};
    /** 会话表（标题、preview、派它的会话、一次性的），打开这一页时读一次 @type {Map<string, any>} */
    this.sessions = new Map();
    /** 旧核心没有 `usage.query`：整页一张卡 */
    this.old = false;
    /** 第几次读（换得快的，早读的晚回来不画） */
    this.round = 0;
  }

  /** 设置页画这一页：每次打开重读，交回同一块。 @param {any} kit */
  render(kit) {
    this.kit = kit;
    this.reload(true);
    return this.el;
  }

  // —— 读 ——

  /** @param {any} params */
  query(params) {
    return this.ctx.core.request('usage.query', params);
  }

  /** @param {unknown} err */
  fail(err) {
    const e = /** @type {any} */ (err);
    this.kit?.toast?.(e?.data?.message ?? e?.message ?? String(err));
  }

  /** 重读这一段时间的数；`fresh` 的连会话表一起读。 @param {boolean} [fresh] */
  async reload(fresh = false) {
    const round = ++this.round;
    const now = new Date();
    const span = spanOf(this.range, now, this.custom);
    const params = spanParams(span);
    const offset = offsetOf(now);
    this.open = undefined;
    this.splits.clear();
    try {
      const [whole, bySession, chart, rows, list] = await Promise.all([
        this.query(params),
        this.query({ ...params, group: ['session'] }),
        this.chart(now, span, params, offset),
        this.query({ ...params, group: groupOf(this.group), offset }),
        fresh || !this.sessions.size ? this.listSessions() : null,
      ]);
      if (round !== this.round) return;
      if (list) this.sessions = list;
      this.old = false;
      this.params = params;
      this.data = {
        total: (whole?.rows ?? [])[0] ?? sum([]),
        sessions: (bySession?.rows ?? []).filter((/** @type {Row} */ r) => r.session !== null && r.requests > 0).length,
        bars: chart.bars,
        unit: chart.unit,
        rows: rows?.rows ?? [],
        at: Date.now(),
      };
    } catch (err) {
      if (round !== this.round) return;
      const e = /** @type {any} */ (err);
      if (e?.code === -32601 || e?.reason === 'unknown_method' || e?.data?.reason === 'unknown_method') this.old = true;
      else this.fail(err);
      this.data = null;
    }
    this.draw();
  }

  /** 会话表：本机的会话加一次性的（`session.list` 默认不列一次性的；场所里的会话它不列，照用量行的 `venue` 写） @returns {Promise<Map<string, any>|null>} */
  async listSessions() {
    const [main, once] = await Promise.all([
      this.ctx.core.request('session.list', {}).catch(() => null),
      this.ctx.core.request('session.list', { oneshot: true }).catch(() => null),
    ]);
    if (!main) return null;
    return new Map([...(main.sessions ?? []), ...(once?.sessions ?? [])].map((/** @type {any} */ s) => [s.session, s]));
  }

  /** 只换分组：只重读那一张表。 */
  async regroup() {
    const round = ++this.round;
    this.open = undefined;
    try {
      const got = await this.query({ ...this.params, group: groupOf(this.group), offset: offsetOf(new Date()) });
      if (round !== this.round || !this.data) return;
      this.data.rows = got?.rows ?? [];
    } catch (err) {
      this.fail(err);
    }
    this.draw();
  }

  /**
   * 柱子的数：只有一天的照整点问 24 次（核心只能按天分），别的 `group: ["day"]`。
   * @param {Date} now @param {{from: Date|null, until: Date|null}} span @param {Record<string, string>} params @param {string} offset
   * @returns {Promise<{bars: Bar[], unit: 'hour'|'day'|'month'}>}
   */
  async chart(now, span, params, offset) {
    const last = span.until ? new Date(span.until.getFullYear(), span.until.getMonth(), span.until.getDate() - 1) : now;
    if (span.from && daysBetween(span.from, last) === 1) {
      const today = dayKey(span.from) === dayKey(now);
      const slots = hours(span.from);
      const got = await Promise.all(slots.map((s) => (today && s.hour > now.getHours() ? null : this.query({ from: s.from, until: s.until }))));
      return { bars: hourBars(got.map((g) => (g?.rows ?? [])[0] ?? null), span.from, now, this.t), unit: 'hour' };
    }
    const got = await this.query({ ...params, group: ['day'], offset });
    const rows = got?.rows ?? [];
    const drawn = this.range === 'all' ? allBars(rows, now, this.t)
      : this.range === 'custom' && span.from ? rangeBars(rows, span.from, last, now, this.t)
        : { monthly: false, bars: dayBars(rows, /** @type {Date} */ (span.from), Number(this.range), now, this.t) };
    return { bars: drawn.bars, unit: drawn.monthly ? 'month' : 'day' };
  }

  /**
   * 展开一行时拆开的行：照（时间段、分组、拆的那一样）问一次，记着；问着的时候是 `'loading'`。
   * @param {string} sub @returns {Row[]|'loading'}
   */
  split(sub) {
    const key = `${JSON.stringify(this.params)}|${this.group}|${sub}`;
    const got = this.splits.get(key);
    if (got) return got;
    this.splits.set(key, 'loading');
    const round = this.round;
    this.query({ ...this.params, group: [this.group, sub], offset: offsetOf(new Date()) }).then((res) => {
      if (round !== this.round) return;
      this.splits.set(key, res?.rows ?? []);
      this.draw();
    }, (err) => {
      this.splits.delete(key);
      this.fail(err);
    });
    return 'loading';
  }

  // —— 画 ——

  draw() {
    if (this.old) {
      replace(this.el, h('div.use-problem', h('p', this.t('errors.old_core'))));
      return;
    }
    this.openRow = null;
    replace(this.el, this.head(), this.range === 'custom' ? this.picker() : null, this.tiles(), this.bars(), this.table());
    const at = this.openRow;
    if (!at) {
      this.open = undefined;
      delete this.el.dataset.setDismiss;
      return;
    }
    // 细则的小窗：浮在那一行下面，靠右（照这一页自己的 CSS 像素量，整页放大以后也对）
    const pop = this.detail(at.row);
    this.el.append(pop);
    pop.style.top = `${offsetIn(at.el, this.el) + at.el.offsetHeight + 4}px`;
    this.el.dataset.setDismiss = '1';
  }

  /** 收起细则的小窗：只拿掉它（不重画：点外面关的那一下，点的那个按钮还要收到这一下点击） */
  closePop() {
    if (this.open === undefined) return;
    this.open = undefined;
    this.openRow = null;
    this.el.querySelector('.use-pop')?.remove();
    for (const row of this.el.querySelectorAll('.use-row.is-open')) {
      row.classList.remove('is-open');
      row.setAttribute('aria-expanded', 'false');
    }
    delete this.el.dataset.setDismiss;
  }

  head() {
    const seg = h('div.use-seg', { role: 'tablist' }, RANGES.map((r) => h(`button${r === this.range ? '.is-on' : ''}`, {
      type: 'button', role: 'tab', 'aria-selected': String(r === this.range),
      onclick: () => {
        if (r === this.range) return;
        this.range = r;
        if (r === 'custom' && !this.custom) {
          const now = new Date();
          this.custom = { from: dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), to: dayKey(now) };
        }
        this.all = false;
        this.reload();
      },
    }, this.t(`range.${r}`))));
    const at = this.data ? this.t('updated', { time: hhmm(new Date(this.data.at).toISOString()) }) : this.t('loading');
    return h('div.use-head',
      h('span.use-stamp', at),
      h('button.icon-button.use-refresh', { type: 'button', title: this.t('refresh'), 'aria-label': this.t('refresh'), onclick: () => this.reload(true) }, icon('rotate-cw')),
      seg);
  }

  /** 自定义：从哪天到哪天（系统的日期框，晚于今天的选不了；选反了照对调的算） */
  picker() {
    const today = dayKey(new Date());
    const custom = this.custom ?? { from: today, to: today };
    /** @param {'from'|'to'} which */
    const box = (which) => h('input.use-date', {
      type: 'date', value: custom[which], max: today, 'aria-label': this.t(`custom.${which}`),
      onchange: (/** @type {Event} */ e) => {
        const value = /** @type {HTMLInputElement} */ (e.target).value;
        if (!value) return;
        this.custom = { ...custom, [which]: value };
        this.reload();
      },
    });
    return h('div.use-custom', h('span', this.t('custom.from')), box('from'), h('span', this.t('custom.to')), box('to'));
  }

  tiles() {
    const d = this.data;
    const row = d?.total ?? sum([]);
    const u = row.usage;
    const cost = money(row.amounts);
    /** @param {string} key @param {string} value @param {string} sub @param {boolean} [warn] */
    const tile = (key, value, sub, warn = false) => h('div.use-tile',
      h('span.use-tile-k', this.t(`tile.${key}`)),
      h('span.use-tile-v', { title: value }, d ? value : '—'),
      h(`span.use-tile-s${warn ? '.is-warn' : ''}`, { title: sub }, d ? sub : ''));
    return h('div.use-tiles',
      tile('cost', cost || '—', row.unpriced ? this.t('unpriced_more', { n: row.unpriced.toLocaleString() }) : '', row.unpriced > 0),
      tile('requests', this.t('times', { n: row.requests.toLocaleString() }), this.t('sessions', { n: d?.sessions ?? 0 })),
      tile('tokens', short(total(u)), this.t('in_out', { input: short(input(u)), output: short(u.output) })),
      tile('hit', `${hitRate(u.cache_read, input(u))}%`, this.t('hit_sub', { n: short(u.cache_read) })));
  }

  bars() {
    const d = this.data;
    const title = this.t(`chart.${d?.unit === 'hour' ? 'hourly' : d?.unit === 'month' ? 'monthly' : 'daily'}`);
    const legend = h('span.use-legend',
      h('span', h('i.use-c-hit'), this.t('legend.hit')),
      h('span', h('i.use-c-new'), this.t('legend.new')),
      h('span', h('i.use-c-out'), this.t('legend.out')));
    const box = h('div.use-chart');
    const sumText = d && d.total.requests ? h('span.use-sum', exact(total(d.total.usage))) : null;
    const block = h('div.use-block', h('div.use-block-head', h('h3', title, sumText), legend), box);
    if (!d) return block;
    if (!d.bars.length || d.bars.every((b) => !b.row)) {
      replace(box, h('p.use-empty', this.t(this.range === 'all' ? 'empty.ever' : 'empty.range')));
      return block;
    }
    const max = Math.max(1, ...d.bars.map((b) => (b.row ? total(b.row.usage) : 0)));
    const step = niceStep(max), top = step * 4;
    const y = (/** @type {number} */ v) => TOP + (H - TOP - BOTTOM) * (1 - v / top);
    const W = Math.round(this.el.clientWidth) || 700;
    const n = d.bars.length;
    const bw = (W - LEFT) / n, gap = Math.min(4, bw * 0.28);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': title });
    for (let i = 0; i <= 4; i++) {
      svg.append(el('line', { class: 'use-grid', x1: LEFT, x2: W, y1: y(step * i), y2: y(step * i) }));
      svg.append(el('text', { x: LEFT - 6, y: y(step * i) + 3.5, 'text-anchor': 'end' }, i ? short(step * i) : '0'));
    }
    // 悬停的那一根：中间一道竖的虚线
    const cursor = el('line', { class: 'use-cursor', x1: 0, x2: 0, y1: TOP, y2: H - BOTTOM, visibility: 'hidden' });
    const tip = h('div.use-tip', { hidden: true });
    /** @type {SVGElement[]} */
    const hots = [];
    d.bars.forEach((b, i) => {
      const x = LEFT + i * bw;
      const hot = el('rect', { class: 'use-hot', x, y: TOP, width: bw, height: H - TOP - BOTTOM });
      hots.push(hot);
      svg.append(hot);
      if (b.row) {
        const u = b.row.usage;
        let base = 0;
        for (const [v, c] of /** @type {[number, string][]} */ ([[u.cache_read, 'use-c-hit'], [u.uncached + u.cache_write, 'use-c-new'], [u.output, 'use-c-out']])) {
          if (v > 0) svg.append(el('rect', { class: c, x: x + gap / 2, y: y(base + v), width: bw - gap, height: Math.max(0, y(base) - y(base + v)), 'pointer-events': 'none' }));
          base += v;
        }
      }
      if (b.label) svg.append(el('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', class: b.now ? 'is-now' : null }, b.label));
      hot.addEventListener('mouseenter', () => {
        hots.forEach((o) => o.classList.toggle('is-on', o === hot));
        cursor.setAttribute('x1', String(x + bw / 2));
        cursor.setAttribute('x2', String(x + bw / 2));
        cursor.setAttribute('visibility', 'visible');
        replace(tip, ...this.tipLines(b));
        tip.hidden = false;
        // 照这一根在第几个算位置（整页放大以后量屏幕像素会偏）
        const width = box.clientWidth;
        const mid = ((x + bw / 2) / W) * width;
        tip.style.left = `${Math.min(Math.max(0, width - tip.offsetWidth), Math.max(0, mid - tip.offsetWidth / 2))}px`;
      });
    });
    svg.append(cursor);
    svg.addEventListener('mouseleave', () => {
      tip.hidden = true;
      cursor.setAttribute('visibility', 'hidden');
      hots.forEach((o) => o.classList.remove('is-on'));
    });
    replace(box, svg, tip);
    return block;
  }

  /** 悬停一根写什么：头一行时段和合计，下面一项一行（名目在左、数在右） @param {Bar} b */
  tipLines(b) {
    if (!b.row) return [h('div.use-tip-head', h('b', b.title)), h('span.use-tip-none', this.t('tip.none'))];
    const u = b.row.usage;
    const cost = money(b.row.amounts);
    /** @param {any} mark @param {string} name @param {string} value */
    const line = (mark, name, value) => h('div.use-tip-row', mark, h('span.use-tip-k', name), h('span.use-tip-v', value));
    return [
      h('div.use-tip-head', h('b', b.title), h('b', exact(total(u)))),
      line(h('i.use-c-hit'), this.t('legend.hit'), exact(u.cache_read)),
      line(h('i.use-c-new'), this.t('legend.new'), exact(u.uncached + u.cache_write)),
      line(h('i.use-c-out'), this.t('legend.out'), exact(u.output)),
      h('div.use-tip-rule'),
      line(h('i'), this.t('col.requests'), this.t('times', { n: b.row.requests.toLocaleString() })),
      line(h('i'), this.t('col.cost'), cost || this.t('tip.no_price')),
      cost && b.row.unpriced ? h('div.use-tip-more', this.t('unpriced_more', { n: b.row.unpriced })) : null,
    ];
  }

  table() {
    const d = this.data;
    const tabs = h('div.use-tabs', { role: 'tablist' }, GROUPS.map((g) => h(`button.use-tab${g === this.group ? '.is-on' : ''}`, {
      type: 'button', role: 'tab', 'aria-selected': String(g === this.group),
      onclick: () => {
        if (g === this.group) return;
        this.group = g;
        this.all = false;
        if (this.sort.by === 'name') this.sort = { by: 'tokens', desc: true };
        this.regroup();
      },
    }, this.t(`group.${g}`))));
    const block = h('div.use-block', tabs);
    if (!d) return block;
    const order = d.total.amounts.map((a) => a.currency);
    const rows = sorted(d.rows.filter((r) => r.requests > 0), this.sort, this.group, order, (r) => this.nameText(r));
    if (!rows.length) {
      block.append(h('p.use-empty', this.t('empty.range')));
      return block;
    }
    const whole = rows.reduce((s, r) => s + total(r.usage), 0) || 1;
    const shown = this.all ? rows : rows.slice(0, FIRST);
    const th = (/** @type {Column} */ key) => {
      const on = this.sort.by === key;
      return h(`th${key === 'name' ? '' : '.num'}`, { 'aria-sort': on ? (this.sort.desc ? 'descending' : 'ascending') : null }, h(`button${on ? '.is-on' : ''}`, {
        type: 'button',
        onclick: () => {
          this.sort = on ? { by: key, desc: !this.sort.desc } : { by: key, desc: key !== 'name' };
          this.draw();
        },
      }, ...arrowed(key === 'name' ? this.t(`col.${this.group}`) : this.t(`col.${key}`), h('span.use-arrow', on ? (this.sort.desc ? '↓' : '↑') : ''), key === 'name')));
    };
    const body = h('tbody');
    for (const r of shown) {
      const value = r[this.group];
      const open = this.open === value;
      const toggle = () => {
        this.open = open ? undefined : value;
        this.draw();
      };
      const tr = h(`tr.use-row${open ? '.is-open' : ''}`, {
        tabindex: '0', 'aria-expanded': String(open),
        onclick: toggle,
        onkeydown: (/** @type {KeyboardEvent} */ e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          toggle();
        },
      },
      h('td.use-name', h('div.use-name-row', this.name(r), h('span.use-chevron', icon('chevron-right'))), h('div.use-share', h('i', { style: { width: `${((total(r.usage) / whole) * 100).toFixed(1)}%` } }))),
      h('td.num', r.requests.toLocaleString()),
      h('td.num', short(total(r.usage))),
      h('td.num', `${hitRate(r.usage.cache_read, input(r.usage))}%`),
      h('td.num', r.amounts.length ? [r.amounts.map((a) => h('div', amountText(a))), r.unpriced ? h('div.use-more', this.t('unpriced_part', { n: r.unpriced })) : null] : this.noCost(r)));
      if (open) this.openRow = { row: r, el: tr };
      body.append(tr);
    }
    const table = h('table.use-table',
      h('colgroup', COLUMNS.map((c) => h(`col.use-col-${c}`))),
      h('thead', h('tr', COLUMNS.map(th))),
      body);
    block.append(h('div.use-scroll', table));
    if (!this.all && rows.length > FIRST) {
      block.append(h('button.use-all', { type: 'button', onclick: () => { this.all = true; this.draw(); } }, this.t('show_all', { n: rows.length })));
    }
    return block;
  }

  /** 细则的小窗：名字，四项 token、花费，照另一样拆开；本机能打开的会话一个「打开会话」 @param {Row} r */
  detail(r) {
    const u = r.usage;
    const cost = money(r.amounts);
    const value = r[this.group];
    const parts = [
      h('div.use-pop-head', this.name(r), h('button.icon-button.use-pop-close', { type: 'button', title: this.t('close'), 'aria-label': this.t('close'), onclick: () => this.closePop() }, icon('x'))),
      h('p.use-detail-line', this.t('detail.tokens', { hit: exact(u.cache_read), miss: exact(u.uncached), write: exact(u.cache_write), out: exact(u.output) })),
      h('p.use-detail-line', cost
        ? [this.t('detail.cost', { cost }), r.unpriced ? ` · ${this.t('unpriced_more', { n: r.unpriced })}` : '']
        : r.unpriced ? this.t('unpriced_only', { n: r.unpriced }) : this.t('detail.cost', { cost: '—' })),
    ];
    for (const sub of splitsOf(this.group)) {
      const got = this.split(sub);
      const head = h('span.use-split-head', this.t(`detail.by.${sub}`));
      if (got === 'loading') {
        parts.push(h('div.use-split', head, h('span.use-faint', this.t('loading'))));
        continue;
      }
      const mine = sorted(got.filter((x) => x[this.group] === value && x.requests > 0), { by: 'tokens', desc: true }, sub);
      parts.push(h('div.use-split', head, mine.map((x) => h('div.use-split-row',
        h('span.use-split-name', this.subName(sub, x[sub])),
        h('span.num', this.t('times', { n: x.requests.toLocaleString() })),
        h('span.num', short(total(x.usage))),
        h('span.num', money(x.amounts) || this.noCost(x))))));
    }
    if (this.group === 'session' && typeof value === 'string' && this.sessions.has(value)) {
      parts.push(h('div.use-detail-actions', h('button.set-btn', {
        type: 'button',
        onclick: () => {
          this.ctx.settings?.close?.();
          this.ctx.chat?.open?.(value);
        },
      }, this.t('detail.open'))));
    }
    return h('div.use-pop', { role: 'dialog' }, parts);
  }

  /** 没有金额的那一格：有没价格的写几次，都没有（用量是 0 的请求）写 `—` @param {Row} r */
  noCost(r) {
    return h('span.use-faint', r.unpriced ? this.t('unpriced_only', { n: r.unpriced }) : '—');
  }

  /** 拆开的那一行写什么名字 @param {string} sub @param {any} v */
  subName(sub, v) {
    if (sub === 'model') {
      const { provider, name } = splitModel(v ?? '');
      return h('span', name, provider ? h('span.use-sub', ` ${provider}`) : null);
    }
    const key = purposeKey(v);
    return h('span', key ? this.t(`purpose.${key}`) : String(v));
  }

  /** 分组那一格的字（照名字排、拆开的行照它） @param {Row} r @returns {string} */
  nameText(r) {
    const v = r[this.group];
    if (this.group === 'model') return splitModel(v).name;
    if (this.group === 'purpose') { const key = purposeKey(v); return key ? this.t(`purpose.${key}`) : String(v); }
    if (this.group === 'venue') return v === null || v === undefined ? this.t('other') : this.venueText(v);
    if (v === null) return this.t('other');
    const s = this.sessions.get(v);
    if (!s) return r.venue && r.venue !== 'local' ? this.venueText(r.venue) : this.t('deleted');
    return s.title || s.preview || this.t('untitled');
  }

  /** 分组那一格写成什么 @param {Row} r */
  name(r) {
    const v = r[this.group];
    const text = this.nameText(r);
    if (this.group === 'model') {
      const { provider } = splitModel(v);
      return h('div.use-name-line', h('span', text), provider ? h('span.use-sub', provider) : null);
    }
    if (this.group === 'purpose') {
      const key = purposeKey(v);
      const sub = key ? this.t(`purpose_sub.${key}`) : '';
      return h('div.use-name-line', h('span', text), sub ? h('span.use-sub', sub) : null);
    }
    if (v === null || v === undefined) return h('div.use-name-line', { title: this.t('other_hint') }, h('span.use-faint', text));
    if (this.group === 'venue') return h('div.use-name-line', h('span', text));
    // 会话：场所里的（QQ 群这类）会话表不列，写场所
    const s = this.sessions.get(v);
    if (!s && r.venue && r.venue !== 'local') return h('div.use-name-line', h('span', text), h('span.use-sub', this.t('venue_session')));
    if (!s) return h('div.use-name-line', h('span.use-faint', text));
    return h('div.use-name-line', h('span', text), s.parent ? h('span.use-sub', this.t('subagent')) : s.oneshot ? h('span.use-sub', this.t('oneshot')) : null);
  }

  /** @param {string} v */
  venueText(v) {
    const got = venueOf(v);
    return 'raw' in got ? got.raw : this.t(got.key, got.fields);
  }
}

/** 列头的字和箭头：名字那一列箭头在后，数的那几列在前（字和下面的数右边对齐） @param {string} label @param {HTMLElement} arrow @param {boolean} after */
const arrowed = (label, arrow, after) => (after ? [label, arrow] : [arrow, label]);

/** 照什么分组问：按会话的连场所一起分（场所里的会话会话表不列，名字照场所写） @param {Group} g */
const groupOf = (g) => (g === 'session' ? ['session', 'venue'] : [g]);

/**
 * 一个 SVG 节点：值是 `null` 的属性不写，`kid` 是里面的字。
 * @param {string} tag @param {Record<string, any>} attrs @param {string} [kid] @returns {SVGElement}
 */
function el(tag, attrs, kid) {
  const node = /** @type {SVGElement} */ (document.createElementNS(NS, tag));
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  if (kid !== undefined) node.textContent = kid;
  return node;
}
