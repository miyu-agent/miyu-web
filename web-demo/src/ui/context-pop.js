// @ts-check
//! 上下文明细、累计按用途的浮窗（蓝图 `web.md`「上下文明细、累计按用途」）：点框下面那一行的上下文、累计那一格往上弹，
//! 打开时问一次核心（`session.context`、`usage.query` 按 `use` 分），开着时那一格的字变了再问一次。一次只开一个；点外面、`Esc`、
//! 再点那一格收起。数怎么摊、怎么排在 `model/context.js`。

import { h, icon, replace, scaleOf } from './dom.js';
import { show, hide, unfold } from '../lib/motion.js';
import { t } from '../util/res.js';
import { short, money } from '../lib/format.js';
import { scaledParts, bar, share, toneOf, useRows, USE_TONES, costOf, partsMinus } from '../model/context.js';

/** @typedef {'context'|'total'} Kind */

/** 头一次打开等问到了再露，最多等多久（毫秒） */
const SHOW_WAIT_MS = 150;

export class ContextPop {
  /**
   * @param {{session: () => string|null, preview: () => Record<string, any>, request: (method: string, params: any) => Promise<any>, openUsage?: (session: string) => void}} on
   *   `session` 正在看的会话；`preview` 还没开的新会话问预览带的人格、预设；`openUsage` 开设置的用量页、弹这个会话的细则（没装用量页的没有）
   */
  constructor(on) {
    this.on = on;
    this.body = h('div.ctx-pop-body');
    this.el = h('div.ctx-pop', { hidden: true, role: 'dialog' }, this.body);
    /** @type {Kind|null} */
    this.kind = null;
    /** @type {HTMLElement|null} */
    this.anchor = null;
    /** 展开着的块（`part`） @type {Set<string>} */
    this.opened = new Set();
    /** 问过的，照会话和哪一个记着（下次打开先照它画） @type {Map<string, any>} */
    this.cache = new Map();
    /** @type {ReturnType<typeof setTimeout>|undefined} 头一次打开最多等多久再露 */
    this.showTimer = undefined;
    /** 展开、收起了一块以后（累计那一个照它重画横条） @type {((part: string) => void)|null} */
    this.onFlip = null;
    /** 上一次问到的（`null` 是还在问；`false` 是核心不支持） @type {any} */
    this.data = null;
    this.seq = 0;
    this.sig = '';
    this.onDown = (/** @type {PointerEvent} */ e) => {
      const target = /** @type {Node} */ (e.target);
      if (!this.el.contains(target) && !this.anchor?.contains(target)) this.close();
    };
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this.close();
    };
  }

  get isOpen() {
    return this.kind != null;
  }

  /** @param {Kind} kind @param {HTMLElement} anchor @param {string} sig 那一格现在的字 */
  toggle(kind, anchor, sig) {
    if (this.kind === kind) this.close();
    else this.open(kind, anchor, sig);
  }

  /** @param {Kind} kind @param {HTMLElement} anchor @param {string} sig */
  open(kind, anchor, sig) {
    if (this.isOpen) this.anchor?.classList.remove('is-open');
    else {
      document.addEventListener('pointerdown', this.onDown, true);
      document.addEventListener('keydown', this.onKey, true);
    }
    this.kind = kind;
    this.anchor = anchor;
    this.sig = sig;
    this.opened.clear();
    anchor.classList.add('is-open');
    // 这个会话这一个问过的先照上一次的画；头一次的等问到了再露（最多等 SHOW_WAIT_MS）：原来先写「正在读…」、几十毫秒后换成内容，高度一变就跳
    this.data = this.cache.get(this.cacheKey()) ?? null;
    clearTimeout(this.showTimer);
    if (this.data !== null) this.reveal();
    else this.showTimer = setTimeout(() => this.reveal(), SHOW_WAIT_MS);
    this.load();
  }

  /** 这个会话这一个（记上一次问到的用） */
  cacheKey() {
    return `${this.kind}\n${this.on.session() ?? ''}`;
  }

  /** 露出来：照现在有的画好、摆好，再放进场 */
  reveal() {
    clearTimeout(this.showTimer);
    if (!this.isOpen || !this.el.hidden) return;
    this.draw();
    show(this.el);
    this.place();
  }

  close() {
    if (!this.isOpen) return;
    this.kind = null;
    this.seq += 1;
    clearTimeout(this.showTimer);
    this.anchor?.classList.remove('is-open');
    document.removeEventListener('pointerdown', this.onDown, true);
    document.removeEventListener('keydown', this.onKey, true);
    hide(this.el);
  }

  /**
   * 框下面那一行重画了：开着的那一格的字变了（新的一次请求、压缩了）再问一次；那一格没了（清空、换了会话）收起。
   * @param {Map<string, {el: HTMLElement, text: string}>} cells 现在露着的几格
   */
  refresh(cells) {
    if (!this.kind) return;
    const cell = cells.get(this.kind);
    if (!cell) return this.close();
    if (cell.el !== this.anchor) {
      this.anchor?.classList.remove('is-open');
      this.anchor = cell.el;
      cell.el.classList.add('is-open');
      this.place();
    }
    if (cell.text === this.sig) return;
    this.sig = cell.text;
    this.load();
  }

  /**
   * 摆在那一格上面，左边对齐那一格，放不下往左挪（量的是屏幕像素，整页放大以后换回自己的 CSS 像素）；还没开的新会话输入框在正中，
   * 摆在下面（2026-10-23 项目主人）
   */
  place() {
    const parent = this.el.parentElement;
    if (!parent || !this.anchor) return;
    this.el.classList.toggle('is-below', !!this.el.closest('.is-empty'));
    const scale = scaleOf(parent);
    const box = this.anchor.getBoundingClientRect();
    const root = parent.getBoundingClientRect();
    const width = this.el.offsetWidth;
    const left = Math.min((box.left - root.left) / scale, root.width / scale - width);
    // 取整数像素：落在半个像素上的字，动画前后画得不一样，看着跳一下
    this.el.style.left = `${Math.round(Math.max(0, left))}px`;
  }

  async load() {
    const kind = this.kind;
    const session = this.on.session();
    const seq = ++this.seq;
    if (!session && kind !== 'context') return;
    const got = await (kind === 'context'
      ? this.on.request('session.context', session ? { session } : this.on.preview())
      : Promise.all([
        this.on.request('usage.query', { session, tree: true, group: ['use'] }),
        // 照上下文的块分开的累计（核心 CX-3）：主会话自己的、连子代理的，相减是子代理的；旧核心没有的都不拆
        this.on.request('session.usage_parts', { session }).catch(() => null),
        this.on.request('session.usage_parts', { session, tree: true }).catch(() => null),
      ]).then(([r, parts, all]) => {
        // 旧核心不认 `use`：分组照样回，行里没有这一格
        if (r?.rows?.length && !r.rows.some((/** @type {any} */ x) => 'use' in x)) throw Object.assign(new Error('no use'), { code: -32601 });
        return { ...r, parts, all };
      })).catch((/** @type {any} */ e) => (e?.code === -32601 || e?.code === -32602 ? false : this.data));
    if (seq !== this.seq || this.kind !== kind) return;
    const data = got ?? false;
    // 和画着的一样的不重画（照上一次画的那一份，问到的没变）
    const same = JSON.stringify(data) === JSON.stringify(this.data);
    this.data = data;
    if (data !== false) this.cache.set(this.cacheKey(), data);
    if (this.el.hidden) this.reveal();
    else if (!same) this.draw();
  }

  draw() {
    if (this.data === null) replace(this.body, h('div.ctx-pop-note', icon('loader-circle'), t('context_pop.loading')));
    else if (this.data === false) replace(this.body, h('div.ctx-pop-note', t('context_pop.unsupported')));
    else replace(this.body, this.kind === 'context' ? this.contextView(this.data) : this.usageView(this.data));
  }

  /** @param {import('../model/context.js').Context} c */
  contextView(c) {
    this.onFlip = null;
    const parts = scaledParts(c);
    const used = c.used ?? parts.reduce((n, p) => n + p.tokens, 0);
    const b = bar(c, parts);
    const head = h('div.ctx-pop-head', h('strong.ctx-pop-title', t('context_pop.title')),
      h('span.ctx-pop-sum', c.window ? `${short(used)} / ${short(c.window)} · ${share(used, c.window)}%` : short(used)),
      c.basis === 'estimated' ? h('span.ctx-pop-est', t('context_pop.estimated')) : null);
    const track = h('div.ctx-bar',
      b.segments.map((s) => h('span.ctx-bar-seg', { style: `width: ${(s.ratio * 100).toFixed(3)}%; --tone: var(--${toneOf(s.part)})` })),
      b.line != null ? h('span.ctx-bar-line', { style: `left: ${(b.line * 100).toFixed(3)}%` }) : null);
    // 每块占已用的几成（2026-10-23 项目主人定：占窗口的在窗口大时都是「<0.1%」）
    const rows = h('div.ctx-rows', parts.map((p) => this.partRows(p, 0, used)));
    return [head, track, rows, c.line ? h('div.ctx-pop-foot', t('context_pop.line', { line: short(c.line) })) : null];
  }

  /**
   * 一块一行，有子项的能展开：子项那一块一直画着，收着的高度是 0，展开、收起照 `unfold` 缓（同时间线点开一步）。
   * @param {import('../model/context.js').Part} p @param {number} depth @param {number} full 百分比照它算（已用的）
   */
  partRows(p, depth, full) {
    const kids = p.children ?? [];
    const open = this.opened.has(p.part);
    const box = kids.length ? h('div.unfold.ctx-kids', h('div.unfold-inner', kids.map((k) => this.partRows(k, depth + 1, full)))) : null;
    if (box) unfold(box, open);
    const flip = () => this.flip(p.part, row, /** @type {HTMLElement} */ (box));
    const row = h(`div.ctx-row${kids.length ? '.is-parent' : ''}${open ? '.is-open' : ''}${depth ? '.is-child' : ''}`, {
      style: `--depth: ${depth}; --tone: var(--${p.tone ?? toneOf(p.part)})`,
      role: kids.length ? 'button' : null, tabindex: kids.length ? '0' : null, 'aria-expanded': kids.length ? String(open) : null,
      onclick: kids.length ? flip : null,
      onkeydown: kids.length ? (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } } : null,
    },
    h('span.ctx-row-arrow', kids.length ? icon('chevron-right') : null),
    h('span.ctx-dot'),
    h('span.ctx-row-name', p.label),
    h('span.ctx-row-n', short(p.tokens)),
    h('span.ctx-row-pct', `${share(p.tokens, full)}%`));
    return [row, box];
  }

  /** 展开、收起一块：不重画，只换这一行和它下面那一块的开关（高度缓过去） @param {string} part @param {HTMLElement} row @param {HTMLElement} box */
  flip(part, row, box) {
    const on = !this.opened.has(part);
    if (on) this.opened.add(part);
    else this.opened.delete(part);
    row.classList.toggle('is-open', on);
    row.setAttribute('aria-expanded', String(on));
    unfold(box, on);
    this.onFlip?.(part);
  }

  /**
   * 累计那一个（蓝图「上下文明细、累计按用途」第 4 条）：合计和花费、一根横条（照用途一块接一块，主会话那一块再照它的各部分拆开）、
   * 一列，照上下文明细的样子（2026-10-23 项目主人）：一个用途一行，主会话、子代理能展开出各部分，最下面「含子代理」和「在用量页看」。
   * 各部分是核心 CX-3 的 `session.usage_parts`：同上下文明细的块，多一块「AI 输出」；`parts` 是主会话自己的，`all` 连子代理，
   * 相减是子代理的（2026-10-24 项目主人问子代理为什么没有明细）；旧核心没有的不拆。
   * @typedef {{requests: number, input: number, output: number, parts: import('../model/context.js').Part[]}} UsageParts
   * @param {{rows?: any[], parts?: UsageParts|null, all?: UsageParts|null}} r
   */
  usageView(r) {
    const rows = useRows(r.rows ?? []);
    const sum = rows.reduce((n, x) => n + x.tokens, 0);
    const cost = money(costOf(rows));
    const session = this.on.session();
    const own = (r.parts?.parts ?? []).filter((x) => (x.tokens ?? 0) > 0);
    // 子代理的：连子代理的减去主会话自己的（`all` 没有的旧核心、没问到的不拆）
    const kids = r.all ? partsMinus(r.all.parts ?? [], r.parts?.parts ?? []) : [];
    /** 一块照比例摊成那一行的数（连子项，0 的不要） @param {import('../model/context.js').Part} p @param {number} f @returns {import('../model/context.js').Part} */
    const scale = (p, f) => ({ ...p, tokens: Math.round(p.tokens * f), children: (p.children ?? []).filter((k) => k.tokens > 0).map((k) => scale(k, f)) });
    /** 一个用途的各部分摊成它那一行的数 @param {import('../model/context.js').Part[]} ps @param {number} total */
    const spread = (ps, total) => {
      const n = ps.reduce((m, x) => m + x.tokens, 0);
      return n > 0 ? ps.map((p) => scale(p, total / n)) : [];
    };
    // 一个用途一行，同上下文明细的块：主会话、子代理的子项是各自的各部分（核心给了的）
    const tree = rows.map((x) => ({
      part: `use:${x.use}`, label: t(`context_pop.use.${x.use}`), tokens: x.tokens, tone: USE_TONES[x.use] ?? 'text-faint',
      children: x.use === 'main' ? spread(own, x.tokens) : x.use === 'subagent' ? spread(kids, x.tokens) : [],
    }));
    const split = tree.filter((x) => x.children.length);
    const seg = (/** @type {number} */ n, /** @type {string} */ tone) => h('span.ctx-bar-seg', { style: `flex: ${n} 1 0px; --tone: var(--${tone})` });
    // 横条：用途之间留缝；主会话展开着的时候那一块照各部分拆开
    const track = h('div.ctx-bar.is-split');
    const drawBar = () => replace(track, tree.map((x) => h('span.ctx-bar-group', { style: `flex: ${x.tokens} 1 0px` },
      split.includes(x) && this.opened.has(x.part) ? x.children.map((p) => seg(p.tokens, toneOf(p.part))) : seg(1, x.tone))));
    drawBar();
    this.onFlip = (part) => { if (split.some((x) => x.part === part)) drawBar(); };
    return [
      h('div.ctx-pop-head', h('strong.ctx-pop-title', t('context_pop.usage_title')), h('span.ctx-pop-sum', cost ? `${short(sum)} · ${cost}` : short(sum))),
      rows.length ? track : null,
      rows.length ? h('div.ctx-rows', tree.map((x) => this.partRows(x, 0, sum))) : h('div.ctx-pop-note', t('context_pop.no_usage')),
      h('div.ctx-pop-foot.ctx-pop-foot-row', h('span', t('context_pop.with_subagents')),
        session && this.on.openUsage ? h('button.ctx-pop-link', { type: 'button', onclick: () => { const id = session; this.close(); this.on.openUsage?.(id); } }, t('context_pop.open_usage'), icon('chevron-right')) : null),
    ];
  }

}
