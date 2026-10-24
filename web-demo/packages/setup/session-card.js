// @ts-check
//! 右侧边栏的「会话信息」卡（蓝图 `web.md`「仪表盘」第 4 条「会话信息」，2026-10-24 项目主人：放最上面、一直在，右栏就不空了）：挂进仪表盘的
//! 挂载位 `side.cards`（编号 `session`）。会话标题、编号（点了复制）、人格、预设、工作区（同点左上角标题弹的那张卡片，点了照原来的菜单换，
//! 菜单浮在这一行下面）、上下文（照上下文明细的分块颜色一根横条）、本会话用量（连子代理）。上下文、用量照框下面那一行的两个浮窗问的问
//! （`session.context`、`usage.query`），会话状态里的上下文、累计变了再问一次；问着的时候照上一次的画。

import { h, icon } from '../../src/lib/dom.js';
import { short, money } from '../../src/lib/format.js';
import { scaledParts, bar, share, toneOf, useRows, costOf } from '../../src/lib/context.js';

/** 会话状态里的上下文、累计变了以后等多久再问（一轮里字一段段来，状态一直在变） */
const SETTLE_MS = 400;

/**
 * @typedef {{session: string, title: string|null, persona: string, preset: string, path: string, full: string}} Info 人格、预设照名字写好的
 * @typedef {{persona: (anchor: HTMLElement) => void, preset: (anchor: HTMLElement) => void, workspace: (anchor: HTMLElement) => void,
 *   copy: (text: string) => void, request: (method: string, params: any) => Promise<any>}} On
 */

export class SessionCard {
  /** @param {(key: string, fields?: any) => string} t @param {On} on */
  constructor(t, on) {
    this.t = t;
    this.on = on;
    /** 挂载位交来的卡（`card.title`、`body`、`show`、`size`、`el`；仪表盘停用了、关掉了这张卡的没有） @type {any} */
    this.card = null;
    /** @type {Info|null} */
    this.info = null;
    /** 问到的上下文、用量（照会话记着：换回来先照上一次的画） @type {Map<string, {context?: any, usage?: any}>} */
    this.got = new Map();
    this.sig = '';
    this.statusSig = '';
    this.timer = 0;
    this.seq = 0;
  }

  /** 挂载位交来一张卡：写上标题、照现在的画；交回拿下来时怎么收拾 @param {any} card */
  attach(card) {
    this.card = card;
    card.title(this.t('card.title'));
    this.sig = '';
    this.draw();
    return () => {
      if (this.card === card) this.card = null;
      clearTimeout(this.timer);
    };
  }

  /** 这张卡露着没有（右栏开着、没关掉这张）：露着的时候点左上角标题不弹卡片 */
  visible() {
    const el = this.card?.el;
    return !!el && el.isConnected && el.getClientRects().length > 0 && !el.closest('[hidden], [inert]');
  }

  /** 会话换了、人格预设工作区换了（`setup` 画左上角那一条时叫） @param {Info|null} info */
  set(info) {
    const was = this.info?.session ?? null;
    this.info = info;
    if (info && info.session !== was) {
      this.statusSig = '';
      this.load();
    }
    this.draw();
  }

  /** 会话状态变了：上下文、累计那几格变了才再问（等一小会儿，一轮里一直在变） @param {any} status */
  status(status) {
    if (!this.info) return;
    const sig = JSON.stringify([status?.context?.used ?? null, status?.context?.window ?? null, status?.usage?.usage ?? null]);
    if (sig === this.statusSig) return;
    const first = !this.statusSig;
    this.statusSig = sig;
    if (first) return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.load(), SETTLE_MS);
  }

  /** 问上下文、用量；问到了照新的画（会话换了的丢掉） */
  async load() {
    const info = this.info;
    if (!info) return;
    const session = info.session;
    const seq = ++this.seq;
    const [context, usage] = await Promise.all([
      this.on.request('session.context', { session }).catch(() => null),
      this.on.request('usage.query', { session, tree: true, group: ['use'] }).catch(() => null),
    ]);
    if (seq !== this.seq || this.info?.session !== session) return;
    const had = this.got.get(session) ?? {};
    this.got.set(session, { context: context ?? had.context, usage: usage ?? had.usage });
    this.draw();
  }

  draw() {
    const card = this.card;
    if (!card) return;
    const info = this.info;
    card.show(!!info);
    if (!info) return;
    const t = this.t;
    const got = this.got.get(info.session) ?? {};
    const sig = JSON.stringify([info, got]);
    if (sig === this.sig) return;
    this.sig = sig;
    /** 一行左边暗字、右边值；点了开换的菜单（浮在这一行下面） @param {string} label @param {string} value @param {(anchor: HTMLElement) => void} pick @param {string} [tip] */
    const pair = (label, value, pick, tip) => {
      const row = h('button.setup-card-pair', { type: 'button', title: tip ?? value, onclick: () => pick(row) },
        h('span.setup-card-label', label), h('span.setup-card-value', value), h('span.setup-card-more', icon('chevron-right')));
      return row;
    };
    const c = got.context;
    const rows = got.usage?.rows ? useRows(got.usage.rows) : null;
    card.body(
      h('div.setup-card-title', info.title ?? t('info.untitled')),
      h('button.setup-card-id', { type: 'button', title: t('card.copy_id'), onclick: () => this.on.copy(info.session) }, info.session),
      h('div.setup-card-pairs',
        pair(t('info.persona'), info.persona, (a) => this.on.persona(a)),
        pair(t('info.preset'), info.preset, (a) => this.on.preset(a)),
        pair(t('info.workspace'), info.path, (a) => this.on.workspace(a), info.full)),
      c && (c.used != null || c.parts?.length) ? this.contextView(c) : null,
      rows ? this.usageView(rows) : null);
    card.size(8);
  }

  /** 上下文：「上下文」右边 `45.2k / 128k · 35.3%`，下面一根横条照分块颜色一块接一块，压缩线一道竖线 @param {any} c */
  contextView(c) {
    const t = this.t;
    const parts = scaledParts(c);
    const used = parts.reduce((n, p) => n + p.tokens, 0) || c.used || 0;
    const b = bar(c, parts);
    return h('div.setup-card-stat',
      h('div.setup-card-line', h('span.setup-card-label', t('card.context')),
        h('span.setup-card-num', c.window ? `${short(used)} / ${short(c.window)} · ${share(used, c.window)}%` : short(used))),
      h('div.setup-card-bar', { role: 'img', 'aria-label': c.window ? `${short(used)} / ${short(c.window)}` : short(used) },
        b.segments.map((s) => h('span.setup-card-seg', { style: `width: ${(s.ratio * 100).toFixed(2)}%; --tone: var(--${toneOf(s.part)})` })),
        b.line != null ? h('span.setup-card-mark', { style: `left: ${(b.line * 100).toFixed(2)}%` }) : null));
  }

  /** 本会话用量（连子代理）：合计 token，有花费的接金额 @param {import('../../src/lib/context.js').UseRow[]} rows */
  usageView(rows) {
    const t = this.t;
    const sum = rows.reduce((n, x) => n + x.tokens, 0);
    const cost = money(costOf(rows));
    return h('div.setup-card-line', h('span.setup-card-label', t('card.usage')), h('span.setup-card-num', cost ? `${short(sum)} · ${cost}` : short(sum)));
  }
}
