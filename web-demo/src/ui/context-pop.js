// @ts-check
//! 用量的明细（蓝图 `web.md`「上下文明细、累计按用途」，2026-11-02 改成一个浮窗三段）：点框下面那一行的用量那一格往上弹，三段：
//! 上下文（`session.context`）、累计消耗（`usage.query` 按 `use` 分、连子代理，`session.usage_parts` 拆块）、花费（会话状态的
//! `usage_tree`，按种类分的是核心 UP-1 的 `converted_parts`）。每段的头一行能点、展开收起，展开、收起只缓那一块的高度、转箭头，浮窗不重画。
//! 打开时问一次核心，开着时那一格的字变了再问一次。点外面、`Esc`、再点那一格收起。数怎么摊、怎么排在 `lib/context.js`。

import { h, icon, replace, scaleOf } from './dom.js';
import { show, hide, unfold } from '../lib/motion.js';
import { t } from '../util/res.js';
import { short, money } from '../lib/format.js';
import { costText, ratesOf, rateName } from '../lib/cost.js';
import { scaledParts, bar, share, toneOf, useRows, USE_TONES, costOf, partsMinus, usageSum, kindParts, costKinds, inputOf, KINDS, fitsBelow } from '../lib/context.js';

/** @typedef {'context'|'tokens'|'cost'} Section */

/** 头一次打开等问到了再露，最多等多久（毫秒） */
const SHOW_WAIT_MS = 150;

export class ContextPop {
  /**
   * @param {{session: () => string|null, preview: () => Record<string, any>, request: (method: string, params: any) => Promise<any>, openUsage?: (session: string) => void,
   *   status: () => any, compact?: () => void}} on
   *   `session` 正在看的会话；`preview` 还没开的新会话问预览带的人格、预设；`openUsage` 开设置的用量页、弹这个会话的细则（没装用量页的没有）；
   *   `status` 用量那一格这一刻的样子（`statusFooter` 交的 `ring` 加会话状态 `status`）；`compact` 卡住时的「压缩」（同 `/compact`）
   */
  constructor(on) {
    this.on = on;
    this.body = h('div.ctx-pop-body');
    this.el = h('div.ctx-pop.is-usage', { hidden: true, role: 'dialog' }, this.body);
    this.isOpen = false;
    /** @type {HTMLElement|null} */
    this.anchor = null;
    /** 展开着的段（`sec:<段>`）和块（`part`） @type {Set<string>} */
    this.opened = new Set();
    /** 问过的，照会话记着（下次打开先照它画） @type {Map<string, any>} */
    this.cache = new Map();
    /** @type {ReturnType<typeof setTimeout>|undefined} 头一次打开最多等多久再露 */
    this.showTimer = undefined;
    /** 展开、收起了一块以后（累计那一段照它重画横条） @type {((part: string) => void)|null} */
    this.onFlip = null;
    /** 上一次问到的：`{context, usage}`，各自 `false` 是核心不支持（`null` 是还在问） @type {any} */
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

  /** 用量那一格点了：开着的收起，收着的打开 @param {HTMLElement} anchor @param {string} sig 那一格现在的字 */
  toggle(anchor, sig) {
    if (this.isOpen) this.close();
    else this.open(anchor, sig);
  }

  /** `/context`：打开、这一段展开着（开着的照样展开这一段） @param {HTMLElement} anchor @param {Section} section */
  openAt(anchor, section) {
    if (!this.isOpen) this.open(anchor, this.sig);
    if (this.opened.has(`sec:${section}`)) return;
    this.opened.add(`sec:${section}`);
    if (!this.el.hidden) this.draw();
  }

  /** @param {HTMLElement} anchor @param {string} sig */
  open(anchor, sig) {
    document.addEventListener('pointerdown', this.onDown, true);
    document.addEventListener('keydown', this.onKey, true);
    this.isOpen = true;
    this.anchor = anchor;
    this.sig = sig;
    this.opened.clear();
    anchor.classList.add('is-open');
    // 这个会话问过的先照上一次的画；头一次的等问到了再露（最多等 SHOW_WAIT_MS）：原来先写「正在读…」、几十毫秒后换成内容，高度一变就跳
    this.data = this.cache.get(this.on.session() ?? '') ?? null;
    clearTimeout(this.showTimer);
    if (this.data !== null) this.reveal();
    else this.showTimer = setTimeout(() => this.reveal(), SHOW_WAIT_MS);
    this.load();
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
    this.isOpen = false;
    this.seq += 1;
    clearTimeout(this.showTimer);
    this.anchor?.classList.remove('is-open');
    document.removeEventListener('pointerdown', this.onDown, true);
    document.removeEventListener('keydown', this.onKey, true);
    hide(this.el);
  }

  /**
   * 框下面那一行重画了：那一格的字变了（新的一次请求、压缩了）再问一次；那一格没了（清空、换了会话、变成转圈）收起。
   * @param {{el: HTMLElement, text: string}|null} cell 现在的用量那一格
   */
  refresh(cell) {
    if (!this.isOpen) return;
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
   * 摆在那一格上面，右边对齐那一格，放不下往左挪（量的是屏幕像素，整页放大以后换回自己的 CSS 像素）；还没开的新会话输入框在正中，
   * 摆在下面（2026-10-23 项目主人）；下面放不下的照旧摆上面（2026-11-11：主题把新会话的输入框放到最底下时，往下弹到了屏幕外面）
   */
  place() {
    const parent = this.el.parentElement;
    if (!parent || !this.anchor) return;
    const scale = scaleOf(parent);
    const box = this.anchor.getBoundingClientRect();
    this.el.classList.toggle('is-below', !!this.el.closest('.is-empty') && fitsBelow(box.bottom, this.el.offsetHeight * scale, innerHeight));
    const root = parent.getBoundingClientRect();
    const width = this.el.offsetWidth;
    const left = Math.min((box.right - root.left) / scale - width, root.width / scale - width);
    // 取整数像素：落在半个像素上的字，动画前后画得不一样，看着跳一下
    this.el.style.left = `${Math.round(Math.max(0, left))}px`;
  }

  async load() {
    const session = this.on.session();
    const seq = ++this.seq;
    const unsupported = (/** @type {any} */ e) => (e?.code === -32601 || e?.code === -32602 ? false : null);
    const context = this.on.request('session.context', session ? { session } : this.on.preview()).catch(unsupported);
    const usage = session
      ? Promise.all([
        this.on.request('usage.query', { session, tree: true, group: ['use'] }),
        // 照上下文的块分开的累计（核心 CX-3）：主会话自己的、连子代理的，相减是子代理的；旧核心没有的都不拆
        this.on.request('session.usage_parts', { session }).catch(() => null),
        this.on.request('session.usage_parts', { session, tree: true }).catch(() => null),
      ]).then(([r, parts, all]) => {
        // 旧核心不认 `use`：分组照样回，行里没有这一格
        if (r?.rows?.length && !r.rows.some((/** @type {any} */ x) => 'use' in x)) return false;
        return { ...r, parts, all };
      }).catch(unsupported)
      : Promise.resolve(null);
    const [c, u] = await Promise.all([context, usage]);
    if (seq !== this.seq || !this.isOpen) return;
    // 一时问不到的（连接断了）留着上一次的
    const data = { context: c ?? this.data?.context ?? false, usage: session ? (u ?? this.data?.usage ?? false) : null };
    // 和画着的一样的不重画（照上一次画的那一份，问到的没变）
    const same = JSON.stringify(data) === JSON.stringify(this.data);
    this.data = data;
    this.cache.set(session ?? '', data);
    if (this.el.hidden) this.reveal();
    else if (!same) this.draw();
  }

  draw() {
    if (this.data === null) {
      replace(this.body, h('div.ctx-pop-note', icon('loader-circle'), t('context_pop.loading')));
      return;
    }
    const info = this.on.status() ?? {};
    const usage = this.data.usage;
    replace(this.body,
      this.section('context', this.contextView(this.data.context, info)),
      usage === null ? null : this.section('tokens', usage === false ? this.unsupported(t('usage_cell.tokens')) : this.tokensView(usage)),
      usage === null ? null : this.section('cost', this.costView(info.status, usage || null)),
      usage ? this.foot(usage) : null);
  }

  /** 核心不支持的那一段：头一行加一行暗字 @param {string} title */
  unsupported(title) {
    return { head: [h('strong.ctx-pop-title', title)], body: null, more: h('div.ctx-pop-note', t('context_pop.unsupported')) };
  }

  /**
   * 一段：头一行（有能展开的东西才能点、带箭头），头下面一直露着的（横条），展开出来的（缓高度），再下面一直露着的。
   * @param {Section} key @param {{head: any[], bar?: any, body: any, more?: any}} v
   */
  section(key, v) {
    const id = `sec:${key}`;
    const open = this.opened.has(id);
    const box = v.body ? h('div.unfold.ctx-kids', h('div.unfold-inner', v.body)) : null;
    if (box) unfold(box, open);
    const flip = () => this.flip(id, head, /** @type {HTMLElement} */ (box));
    const head = h(`div.ctx-pop-head${box ? '.is-parent' : ''}${open && box ? '.is-open' : ''}`, {
      role: box ? 'button' : null, tabindex: box ? '0' : null, 'aria-expanded': box ? String(open) : null,
      onclick: box ? flip : null,
      onkeydown: box ? (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } } : null,
    }, h('span.ctx-row-arrow', box ? icon('chevron-right') : null), ...v.head);
    return h(`div.ctx-sec.is-${key}`, head, v.bar ?? null, box, v.more ?? null);
  }

  /**
   * 上下文那一段（第 3 条）：头一行用了多少 / 窗口 · 占几成，横条，展开是各块；底下压缩线、已压缩、缓存断裂，卡住的再一行红字和「压缩」。
   * @param {import('../lib/context.js').Context|false} c @param {any} info
   */
  contextView(c, info) {
    const status = info.status ?? {};
    const ring = info.ring ?? null;
    if (c === false) return this.unsupported(t('context_pop.title'));
    const parts = scaledParts(c);
    const used = c.used ?? parts.reduce((n, p) => n + p.tokens, 0);
    const b = bar(c, parts);
    const bad = ring?.stuck === 'failed' || ring?.stuck === 'over';
    const head = [h('strong.ctx-pop-title', t('context_pop.title')),
      h(`span.ctx-pop-sum${bad ? '.is-bad' : ''}`, c.window ? `${short(used)} / ${short(c.window)} · ${share(used, c.window)}%` : short(used)),
      c.basis === 'estimated' ? h('span.ctx-pop-est', t('context_pop.estimated')) : null];
    const track = h('div.ctx-bar',
      b.segments.map((s) => h('span.ctx-bar-seg', { style: `width: ${(s.ratio * 100).toFixed(3)}%; --tone: var(--${toneOf(s.part)})` })),
      b.line != null ? h('span.ctx-bar-line', { style: `left: ${(b.line * 100).toFixed(3)}%` }) : null);
    // 每块占已用的几成（2026-10-23 项目主人定：占窗口的在窗口大时都是「<0.1%」）
    const rows = parts.length ? h('div.ctx-rows', parts.map((p) => this.partRows(p, 0, used))) : null;
    const meta = (/** @type {string} */ name, /** @type {string} */ value) => h('div.ctx-meta', h('span.ctx-meta-k', name), h('span.ctx-meta-v', value));
    // 已压缩、缓存断裂：会话状态的 `usage` 里是 0 的核心不写这两格，有用量的照 0 写；还没开的新会话没有
    const usage = status.usage ?? null;
    const more = [
      // 这个会话设了的上下文上限（核心 CTX-1，`session.context` 的 `context`，W-1129）：窗口照它压小了
      c.context ? meta(t('usage_cell.cap'), short(c.context)) : null,
      // 这个会话钉了压缩线的（核心 CT-1，`view.status` 顶层的 `compaction_line`，百分数）接在后面（W-1163）
      c.line ? meta(t('usage_cell.line'), Number.isInteger(status.compaction_line) ? `${short(c.line)} · ${t('usage_cell.line_pinned', { n: status.compaction_line })}` : short(c.line)) : null,
      usage ? meta(t('usage_cell.compactions'), t('usage_cell.times', { n: usage.compactions ?? 0 })) : null,
      usage ? meta(t('usage_cell.cache_breaks'), t('usage_cell.times', { n: usage.cache_breaks ?? 0 })) : null,
      bad ? h('p.ctx-pop-bad', t(`usage_cell.why_${ring.stuck}`)) : null,
      bad && this.on.compact ? h('button.footer-compact.ctx-pop-compact', { type: 'button', onclick: () => { this.close(); this.on.compact?.(); } }, t('usage_cell.compact')) : null,
    ];
    return { head, bar: track, body: rows, more: h('div.ctx-metas', more) };
  }

  /**
   * 一块一行，有子项的能展开：子项那一块一直画着，收着的高度是 0，展开、收起照 `unfold` 缓（同时间线点开一步）。
   * @param {import('../lib/context.js').Part} p @param {number} depth @param {number} full 百分比照它算
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

  /** 展开、收起一块、一段：不重画，只换这一行和它下面那一块的开关（高度缓过去） @param {string} part @param {HTMLElement} row @param {HTMLElement} box */
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
   * 累计消耗那一段（第 4 条）：头一行「累计消耗 128.4k」、右边「缓存命中 81%」（连子代理），横条照四种 token 分；展开先是四种一种一行，
   * 再一行暗字「按用途」，下面一个用途一行（照上下文明细的样子，2026-10-23 项目主人）：主会话、子代理能展开出各部分。各部分是核心 CX-3 的
   * `session.usage_parts`：`parts` 主会话自己的，`all` 连子代理，相减是子代理的；旧核心没有的不拆。
   * @typedef {{requests: number, input: number, output: number, parts: import('../lib/context.js').Part[]}} UsageParts
   * @param {{rows?: any[], rates?: import('../lib/cost.js').Rate[], parts?: UsageParts|null, all?: UsageParts|null}} r
   */
  tokensView(r) {
    const rows = useRows(r.rows ?? []);
    const u = usageSum(r.rows ?? []);
    const sum = inputOf(u) + u.output;
    const own = (r.parts?.parts ?? []).filter((x) => (x.tokens ?? 0) > 0);
    // 子代理的：连子代理的减去主会话自己的（`all` 没有的旧核心、没问到的不拆）
    const kids = r.all ? partsMinus(r.all.parts ?? [], r.parts?.parts ?? []) : [];
    /** 一块照比例摊成那一行的数（连子项，0 的不要） @param {import('../lib/context.js').Part} p @param {number} f @returns {import('../lib/context.js').Part} */
    const scale = (p, f) => ({ ...p, tokens: Math.round(p.tokens * f), children: (p.children ?? []).filter((k) => k.tokens > 0).map((k) => scale(k, f)) });
    /** 一个用途的各部分摊成它那一行的数 @param {import('../lib/context.js').Part[]} ps @param {number} total */
    const spread = (ps, total) => {
      const n = ps.reduce((m, x) => m + x.tokens, 0);
      return n > 0 ? ps.map((p) => scale(p, total / n)) : [];
    };
    const tree = rows.map((x) => ({
      part: `use:${x.use}`, label: t(`context_pop.use.${x.use}`), tokens: x.tokens, tone: USE_TONES[x.use] ?? 'text-faint',
      children: x.use === 'main' ? spread(own, x.tokens) : x.use === 'subagent' ? spread(kids, x.tokens) : [],
    }));
    const head = [h('strong.ctx-pop-title', t('usage_cell.tokens_title', { tokens: short(sum) })),
      sum ? h('span.ctx-pop-sum.is-faint', t('usage_cell.hit', { percent: share(u.cache_read, inputOf(u)) })) : null];
    if (!sum) return { head, body: null, more: h('div.ctx-pop-note', t('context_pop.no_usage')) };
    const track = h('div.ctx-bar.is-split', KINDS.filter(([k]) => u[k] > 0).map(([k, tone]) => h('span.ctx-bar-seg', { style: `flex: ${u[k]} 1 0px; --tone: var(--${tone})` })));
    const body = [
      h('div.ctx-rows', kindParts(u, (k) => t(`usage_cell.kind.${k}`)).map((p) => this.partRows(p, 0, sum))),
      h('div.ctx-sub', t('usage_cell.by_use')),
      h('div.ctx-rows', tree.map((x) => this.partRows(x, 0, sum))),
    ];
    return { head, bar: track, body };
  }

  /**
   * 花费那一段（第 5 条）：头一行总数（连子代理，会话状态的 `usage_tree`，旧核心照 `usage`，没有的照问到的行加）；展开是按种类分的
   * （`converted_parts`，核心 UP-1），没有的不能展开。一笔都算不出钱的写「没有价格」。
   * @param {any} status @param {any} usage 问到的（`usage.query` 的行）
   */
  costView(status, usage) {
    const tree = status?.usage_tree ?? status?.usage ?? null;
    const cost = costText(tree) || (usage ? costText(costOf(useRows(usage.rows ?? []))) : '');
    const head = [h('strong.ctx-pop-title', t('usage_cell.cost')), cost ? h('span.ctx-pop-sum', cost) : h('span.ctx-pop-sum.is-faint', t('usage_cell.no_price'))];
    const kinds = cost ? costKinds(tree) : null;
    if (!kinds) return { head, body: null };
    const whole = kinds.reduce((n, k) => n + k.amount, 0);
    return {
      head,
      body: h('div.ctx-rows', kinds.map((k) => h('div.ctx-row', { style: `--depth: 0; --tone: var(--${KINDS.find(([x]) => x === k.kind)?.[1] ?? 'text-faint'})` },
        h('span.ctx-row-arrow'), h('span.ctx-dot'), h('span.ctx-row-name', t(`usage_cell.kind.${k.kind}`)),
        h('span.ctx-row-n', money([{ currency: k.currency, amount: k.amount }])),
        h('span.ctx-row-pct', `${share(k.amount, whole)}%`)))),
    };
  }

  /** 最下面：暗字「含子代理」，右边「在用量页看」；用到兜底汇率源的一行小字注明来源 @param {any} r */
  foot(r) {
    const rates = ratesOf(r);
    const [before, after = ''] = t('context_pop.rates_from').split('{name}');
    const session = this.on.session();
    return [
      h('div.ctx-pop-foot.ctx-pop-foot-row', h('span', t('context_pop.with_subagents')),
        session && this.on.openUsage ? h('button.ctx-pop-link', { type: 'button', onclick: () => { const id = session; this.close(); this.on.openUsage?.(id); } }, t('context_pop.open_usage'), icon('chevron-right')) : null),
      rates.length ? h('p.ctx-pop-rates', before, rates.map((x, i) => [i ? ' · ' : null, h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, rateName(x))]), after) : null,
    ];
  }
}
