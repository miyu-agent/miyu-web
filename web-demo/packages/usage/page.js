// @ts-check
//! 设置页的「用量」一页（蓝图 `web.md`「用量页」；挂进设置页的 `settings.section`）：页头选时间段，四格数（花费、请求、token、
//! 缓存命中），一张三段叠起来的柱子（今天一小时一根，7 天、30 天一天一根，全部太长的一月一根），一张能切分组的表。
//! 一页是一个常驻的对象：设置页重画、关了再开交回的是同一块，时间段、分页签、排法跟着它。用量没有流：打开、换时间段、点刷新时重读。

import { h, icon, replace } from '../../src/lib/dom.js';
import { short, hitRate, hhmm } from '../../src/lib/format.js';
import { input, total, sum, money, offsetOf, fromOf, hours, hourBars, dayBars, allBars, niceStep, sorted, purposeKey, venueOf, splitModel } from './model.js';

/** 分组表先列几行 */
const FIRST = 10;
/** 柱子的画布：高，左边纵轴的字、下边横轴的字各占多少；宽照这一页画的时候有多宽（字不拉扁；之后宽窄变了照比例拉） */
const H = 190, LEFT = 44, BOTTOM = 22, TOP = 6;
const NS = 'http://www.w3.org/2000/svg';

/** @typedef {import('./model.js').Row} Row */
/** @typedef {import('./model.js').Bar} Bar */
/** @typedef {'1'|'7'|'30'|'all'} Range */
/** @typedef {'model'|'session'|'purpose'|'venue'} Group */

const RANGES = /** @type {Range[]} */ (['1', '7', '30', 'all']);
const GROUPS = /** @type {Group[]} */ (['model', 'session', 'purpose', 'venue']);

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
    /** @type {Group} */
    this.group = 'model';
    /** @type {'tokens'|'requests'} */
    this.sortBy = 'tokens';
    this.all = false;
    /** 读到的：合计、会话数、柱子、分组的行；`null` 是还没读完 @type {{total: Row, sessions: number, bars: Bar[], monthly: boolean, rows: Row[], at: number}|null} */
    this.data = null;
    /** 会话表（标题、preview、派它的会话、场所），打开这一页时读一次 @type {Map<string, any>} */
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

  /** 重读这一段时间的数；`fresh` 的连会话表一起读。 @param {boolean} [fresh] */
  async reload(fresh = false) {
    const round = ++this.round;
    const now = new Date();
    const from = fromOf(this.range, now);
    const span = from ? { from } : {};
    const offset = offsetOf(now);
    try {
      const [whole, bySession, chart, rows, list] = await Promise.all([
        this.query(span),
        this.query({ ...span, group: ['session'] }),
        this.chart(now, from, offset),
        this.query({ ...span, group: groupOf(this.group), offset }),
        fresh || !this.sessions.size ? this.listSessions() : null,
      ]);
      if (round !== this.round) return;
      if (list) this.sessions = list;
      this.old = false;
      this.data = {
        total: (whole?.rows ?? [])[0] ?? sum([]),
        sessions: (bySession?.rows ?? []).filter((/** @type {Row} */ r) => r.session !== null && r.requests > 0).length,
        bars: chart.bars,
        monthly: chart.monthly,
        rows: rows?.rows ?? [],
        at: Date.now(),
      };
    } catch (err) {
      if (round !== this.round) return;
      const e = /** @type {any} */ (err);
      if (e?.code === -32601 || e?.reason === 'unknown_method' || e?.data?.reason === 'unknown_method') this.old = true;
      else this.kit?.toast?.(e?.data?.message ?? e?.message ?? String(err));
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
    const now = new Date();
    const from = fromOf(this.range, now);
    try {
      const got = await this.query({ ...(from ? { from } : {}), group: groupOf(this.group), offset: offsetOf(now) });
      if (round !== this.round || !this.data) return;
      this.data.rows = got?.rows ?? [];
    } catch (err) {
      const e = /** @type {any} */ (err);
      this.kit?.toast?.(e?.data?.message ?? e?.message ?? String(err));
    }
    this.draw();
  }

  /**
   * 柱子的数：今天照整点问 24 次（核心只能按天分），别的 `group: ["day"]`。
   * @param {Date} now @param {string|null} from @param {string} offset @returns {Promise<{bars: Bar[], monthly: boolean}>}
   */
  async chart(now, from, offset) {
    if (this.range === '1') {
      const slots = hours(now);
      const got = await Promise.all(slots.map((s) => (s.hour > now.getHours() ? null : this.query({ from: s.from, until: s.until }))));
      return { bars: hourBars(got.map((g) => (g?.rows ?? [])[0] ?? null), now, this.t), monthly: false };
    }
    const got = await this.query({ ...(from ? { from } : {}), group: ['day'], offset });
    const rows = got?.rows ?? [];
    if (this.range === 'all') return allBars(rows, now, this.t);
    return { bars: dayBars(rows, Number(this.range), now, this.t), monthly: false };
  }

  // —— 画 ——

  draw() {
    if (this.old) {
      replace(this.el, h('div.use-problem', h('p', this.t('errors.old_core'))));
      return;
    }
    replace(this.el, this.head(), this.tiles(), this.bars(), this.table());
  }

  head() {
    const seg = h('div.use-seg', { role: 'tablist' }, RANGES.map((r) => h(`button${r === this.range ? '.is-on' : ''}`, {
      type: 'button', role: 'tab', 'aria-selected': String(r === this.range),
      onclick: () => {
        if (r === this.range) return;
        this.range = r;
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
      tile('cost', cost || '—', row.unpriced ? this.t('unpriced_more', { n: row.unpriced.toLocaleString() }) : row.requests ? this.t('all_priced') : '', row.unpriced > 0),
      tile('requests', this.t('times', { n: row.requests.toLocaleString() }), this.t('sessions', { n: d?.sessions ?? 0 })),
      tile('tokens', short(total(u)), this.t('in_out', { input: short(input(u)), output: short(u.output) })),
      tile('hit', `${hitRate(u.cache_read, input(u))}%`, this.t('hit_sub', { n: short(u.cache_read) })));
  }

  bars() {
    const d = this.data;
    const title = this.range === '1' ? this.t('chart.hourly') : d?.monthly ? this.t('chart.monthly') : this.t('chart.daily');
    const legend = h('span.use-legend',
      h('span', h('i.use-c-hit'), this.t('legend.hit')),
      h('span', h('i.use-c-new'), this.t('legend.new')),
      h('span', h('i.use-c-out'), this.t('legend.out')));
    const box = h('div.use-chart');
    const block = h('div.use-block', h('div.use-block-head', h('h3', title), legend), box);
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
        replace(tip, ...this.tipLines(b));
        tip.hidden = false;
        // 照这一根在第几个算位置（整页放大以后量屏幕像素会偏）
        const width = box.clientWidth;
        const mid = ((x + bw / 2) / W) * width;
        tip.style.left = `${Math.min(Math.max(0, width - tip.offsetWidth), Math.max(0, mid - tip.offsetWidth / 2))}px`;
      });
    });
    svg.addEventListener('mouseleave', () => {
      tip.hidden = true;
      hots.forEach((o) => o.classList.remove('is-on'));
    });
    replace(box, svg, tip);
    return block;
  }

  /** 悬停一根写什么 @param {Bar} b */
  tipLines(b) {
    const lines = [h('b', b.title)];
    if (!b.row) return [...lines, h('span', this.t('tip.none'))];
    const u = b.row.usage;
    const cost = money(b.row.amounts);
    const more = cost && b.row.unpriced ? this.t('tip.unpriced_more', { n: b.row.unpriced }) : '';
    return [...lines,
      h('span', this.t('tip.requests', { n: b.row.requests.toLocaleString(), tokens: short(total(u)) })),
      h('span', this.t('tip.hit', { percent: hitRate(u.cache_read, input(u)), output: short(u.output) })),
      h('span', (cost || this.t('tip.no_price')) + more)];
  }

  table() {
    const d = this.data;
    const tabs = h('div.use-tabs', { role: 'tablist' }, GROUPS.map((g) => h(`button.use-tab${g === this.group ? '.is-on' : ''}`, {
      type: 'button', role: 'tab', 'aria-selected': String(g === this.group),
      onclick: () => {
        if (g === this.group) return;
        this.group = g;
        this.all = false;
        this.regroup();
      },
    }, this.t(`group.${g}`))));
    const block = h('div.use-block', tabs);
    if (!d) return block;
    const rows = sorted(d.rows.filter((r) => r.requests > 0), this.sortBy, this.group);
    if (!rows.length) {
      block.append(h('p.use-empty', this.t('empty.range')));
      return block;
    }
    const whole = rows.reduce((s, r) => s + total(r.usage), 0) || 1;
    const shown = this.all ? rows : rows.slice(0, FIRST);
    const th = (/** @type {'tokens'|'requests'} */ key) => h('th.num', h(`button${this.sortBy === key ? '.is-on' : ''}`, {
      type: 'button',
      onclick: () => {
        this.sortBy = key;
        this.draw();
      },
    }, this.t(`col.${key}`) + (this.sortBy === key ? ' ↓' : '')));
    const table = h('table.use-table',
      h('thead', h('tr', h('th', this.t(`col.${this.group}`)), th('requests'), th('tokens'), h('th.num', this.t('col.hit')), h('th.num', this.t('col.output')), h('th.num', this.t('col.cost')))),
      h('tbody', shown.map((r) => {
        const cost = money(r.amounts);
        return h('tr',
          h('td.use-name', this.name(r), h('div.use-share', h('i', { style: { width: `${((total(r.usage) / whole) * 100).toFixed(1)}%` } }))),
          h('td.num', r.requests.toLocaleString()),
          h('td.num', short(total(r.usage))),
          h('td.num', `${hitRate(r.usage.cache_read, input(r.usage))}%`),
          h('td.num', short(r.usage.output)),
          h('td.num', cost ? [cost, r.unpriced ? h('div.use-more', this.t('unpriced_part', { n: r.unpriced })) : null] : h('span.use-faint', this.t('unpriced_only', { n: r.unpriced }))));
      })));
    block.append(h('div.use-scroll', table));
    if (!this.all && rows.length > FIRST) {
      block.append(h('button.use-all', { type: 'button', onclick: () => { this.all = true; this.draw(); } }, this.t('show_all', { n: rows.length })));
    }
    if (this.group === 'model') block.append(h('p.use-note', this.t('note.model')));
    return block;
  }

  /** 分组那一格写成什么 @param {Row} r */
  name(r) {
    const v = r[this.group];
    if (this.group === 'model') {
      const { provider, name } = splitModel(v);
      return h('div.use-name-line', h('span', name), provider ? h('span.use-sub', provider) : null);
    }
    if (this.group === 'purpose') {
      const key = purposeKey(v);
      const sub = key ? this.t(`purpose_sub.${key}`) : '';
      return h('div.use-name-line', h('span', key ? this.t(`purpose.${key}`) : String(v)), sub ? h('span.use-sub', sub) : null);
    }
    if (this.group === 'venue') return h('div.use-name-line', this.venueName(v));
    // 会话
    if (v === null) return h('div.use-name-line', { title: this.t('other_hint') }, h('span.use-faint', this.t('other')));
    const s = this.sessions.get(v);
    // 场所里的会话（QQ 群这类）会话表不列：写场所，不能点
    if (!s && r.venue && r.venue !== 'local') return h('div.use-name-line', h('span', this.venueText(r.venue)), h('span.use-sub', this.t('venue_session')));
    if (!s) return h('div.use-name-line', h('span.use-faint', this.t('deleted')));
    const title = s.title || s.preview || this.t('untitled');
    return h('div.use-name-line',
      h('button.use-link', {
        type: 'button',
        onclick: () => {
          this.ctx.settings?.close?.();
          this.ctx.chat?.open?.(v);
        },
      }, title),
      s.parent ? h('span.use-sub', this.t('subagent')) : s.oneshot ? h('span.use-sub', this.t('oneshot')) : null);
  }

  /** 场所那一格 @param {string|null} v */
  venueName(v) {
    if (v === null || v === undefined) return h('span.use-faint', { title: this.t('other_hint') }, this.t('other'));
    return h('span', this.venueText(v));
  }

  /** @param {string} v */
  venueText(v) {
    const got = venueOf(v);
    return 'raw' in got ? got.raw : this.t(got.key, got.fields);
  }
}

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

