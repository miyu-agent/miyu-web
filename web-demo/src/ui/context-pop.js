// @ts-check
//! 上下文明细、累计按用途的浮窗（蓝图 `web.md`「上下文明细、累计按用途」）：点框下面那一行的上下文、累计那一格往上弹，
//! 打开时问一次核心（`session.context`、`usage.query` 按 `use` 分），开着时那一格的字变了再问一次。一次只开一个；点外面、`Esc`、
//! 再点那一格收起。数怎么摊、怎么排在 `model/context.js`。

import { h, icon, replace, scaleOf } from './dom.js';
import { show, hide, unfold } from '../lib/motion.js';
import { t } from '../util/res.js';
import { short, money } from '../lib/format.js';
import { scaledParts, bar, share, toneOf, useRows, USE_TONES, costOf } from '../model/context.js';

/** @typedef {'context'|'total'} Kind */

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
    this.data = null;
    show(this.el);
    this.place();
    this.draw();
    this.load();
  }

  close() {
    if (!this.isOpen) return;
    this.kind = null;
    this.seq += 1;
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
    this.el.style.left = `${Math.max(0, left)}px`;
    this.el.style.setProperty('--origin', `${(box.left - root.left) / scale - Math.max(0, left) + box.width / scale / 2}px`);
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
        // 主会话照上下文的块分开的累计（核心 CX-3）：旧核心没有的主会话不拆
        this.on.request('session.usage_parts', { session, tree: true }).catch(() => null),
      ]).then(([r, parts]) => {
        // 旧核心不认 `use`：分组照样回，行里没有这一格
        if (r?.rows?.length && !r.rows.some((/** @type {any} */ x) => 'use' in x)) throw Object.assign(new Error('no use'), { code: -32601 });
        return { ...r, parts };
      })).catch((/** @type {any} */ e) => (e?.code === -32601 || e?.code === -32602 ? false : this.data));
    if (seq !== this.seq || this.kind !== kind) return;
    this.data = got ?? false;
    this.draw();
  }

  draw() {
    if (this.data === null) replace(this.body, h('div.ctx-pop-note', icon('loader-circle'), t('context_pop.loading')));
    else if (this.data === false) replace(this.body, h('div.ctx-pop-note', t('context_pop.unsupported')));
    else replace(this.body, this.kind === 'context' ? this.contextView(this.data) : this.usageView(this.data));
  }

  /** @param {import('../model/context.js').Context} c */
  contextView(c) {
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
      style: `--depth: ${depth}; --tone: var(--${toneOf(p.part)})`,
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
  }

  /**
   * 累计那一个（蓝图「上下文明细、累计按用途」第 4 条）：合计和花费、一根横条（照用途一块接一块，主会话那一块再照它的各部分拆开）、
   * 一列：一个用途一行、主会话下面缩进一档列各部分，只写百分比（2026-10-23 项目主人：字太多，细的去用量页看），最下面「含子代理」和「在用量页看」。
   * 各部分是核心 CX-3 的 `session.usage_parts`：同上下文明细的块，多一块「AI 输出」；旧核心没有的主会话不拆。
   * @param {{rows?: any[], parts?: {requests: number, input: number, output: number, parts: import('../model/context.js').Part[]}|null}} r
   */
  usageView(r) {
    const rows = useRows(r.rows ?? []);
    const sum = rows.reduce((n, x) => n + x.tokens, 0);
    const cost = money(costOf(rows));
    const session = this.on.session();
    const parts = (r.parts?.parts ?? []).filter((x) => (x.tokens ?? 0) > 0);
    const partSum = parts.reduce((n, x) => n + x.tokens, 0);
    /** 这个用途拆成哪几块（只有主会话、核心给了的拆） @param {string} use */
    const split = (use) => (use === 'main' && partSum > 0 ? parts : null);
    const tone = (/** @type {string} */ use) => `--tone: var(--${USE_TONES[use] ?? 'text-faint'})`;
    const partTone = (/** @type {import('../model/context.js').Part} */ p) => `--tone: var(--${toneOf(p.part)})`;
    // 横条：用途之间留缝（`flex` 照 token 分，缝不挤掉比例）；拆开的那一块里各部分照它在这一块里的比例
    const track = h('div.ctx-bar.is-split', rows.map((x) => {
      const ps = split(x.use);
      return h('span.ctx-bar-group', { style: `flex: ${x.tokens} 1 0px` },
        ps ? ps.map((p) => h('span.ctx-bar-seg', { style: `flex: ${p.tokens} 1 0px; ${partTone(p)}` }))
          : h('span.ctx-bar-seg', { style: `flex: 1 1 0px; ${tone(x.use)}` }));
    }));
    /** 一列里的一行：色点、名字、占整个会话合计的百分比（`depth` 1 是主会话下面的部分） @param {string} style @param {string} name @param {number} tokens @param {number} depth @param {boolean} [blank] */
    const row = (style, name, tokens, depth, blank = false) => h(`div.ctx-row${depth ? '.is-child' : ''}`, { style: `--depth: ${depth}; ${style}` },
      h(`span.ctx-dot${blank ? '.is-blank' : ''}`), h('span.ctx-row-name', name), h('span.ctx-row-pct', `${share(tokens, sum)}%`));
    return [
      h('div.ctx-pop-head', h('strong.ctx-pop-title', t('context_pop.usage_title')), h('span.ctx-pop-sum', cost ? `${short(sum)} · ${cost}` : short(sum))),
      rows.length ? track : null,
      rows.length
        ? h('div.ctx-rows.is-usage', rows.map((x) => {
          const ps = split(x.use);
          // 拆开的主会话不画色点（颜色在下面各部分那几行），各部分照它在主会话里的比例摊成占整个会话的
          return [row(tone(x.use), t(`context_pop.use.${x.use}`), x.tokens, 0, !!ps),
            ...(ps ?? []).map((p) => row(partTone(p), p.label, (p.tokens / partSum) * x.tokens, 1))];
        }))
        : h('div.ctx-pop-note', t('context_pop.no_usage')),
      h('div.ctx-pop-foot.ctx-pop-foot-row', h('span', t('context_pop.with_subagents')),
        session && this.on.openUsage ? h('button.ctx-pop-link', { type: 'button', onclick: () => { const id = session; this.close(); this.on.openUsage?.(id); } }, t('context_pop.open_usage'), icon('chevron-right')) : null),
    ];
  }
}
