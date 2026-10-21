// @ts-check
//! 设置页的「记忆」一页（蓝图 `web.md`「记忆页」；挂进设置页的 `settings.section`）：顶上选看哪个人格的那一份、搜、整理、记一条；
//! 一排类别筛选和「显示作废的」；一条一行，点开在同一页里换成详情（改内容和关键词、作废、找回）；底下清空这一份。开着时订阅那一份的
//! `memory` 流，推来的重读（停 300 毫秒并成一次）。一页是一个常驻的对象：设置页重画、关了再开交回的是同一块，写了一半的字还在。

import { leave } from '../../src/lib/motion.js';
import { h, icon, replace } from '../../src/lib/dom.js';
import { keywordBox } from './keywords.js';
import { DreamCard } from './dream.js';
import { CLASSES, TEXT_MAX, KEYWORDS_MAX, chars, counts, visible, hasKeywords, updateOf, canSave, saveNote, shortId, agoText, isRetired, tidying } from './model.js';

/** 一次列几条（滚到底再多读一批） */
const PAGE = 200;
/** 搜索框停多久再问、推来的停多久再重读 */
const TYPE_MS = 250;
const PUSH_MS = 300;
/** 人叫的整理合完以后那一块留几秒再收起（第 13 条） */
const DREAM_KEEP_MS = 6000;
/** 无人格那一份的编号（核心 P-12 的 NO_PERSONA；人格编号都以小写字母开头，撞不上） */
export const NO_PERSONA = '_none';

export class MemoryPage {
  /** @param {any} ctx `memory` 包的 ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    this.el = h('div.mem-page.set-fill');
    // `Esc`：「记一条」、一条的详情的小窗开着时先收起它（设置框找带 `data-set-dismiss` 的发 `set-dismiss`）
    this.el.addEventListener('set-dismiss', () => {
      if (this.adding) this.closeAdd();
      else if (this.open) this.closeDetail();
    });
    /** @type {any} */
    this.kit = null;
    /** @type {{persona: string, name: string}[]} */
    this.personas = [];
    /** 看哪一份（人格编号） @type {string|null} */
    this.persona = null;
    /** 这一份的记忆（新的在前；搜着的是搜到的，最相关的在前） @type {import('./model.js').Memory[]} */
    this.list = [];
    this.limit = PAGE;
    this.query = '';
    this.cls = 'all';
    this.retired = false;
    this.adding = false;
    /** 开着详情的那一条 @type {string|null} */
    this.open = null;
    /** 开着详情的那一条最后一次见到的样子：改完不再命中搜索、掉出列表的，详情照它接着画 @type {import('./model.js').Memory|null} */
    this.seen = null;
    /** 核心认不认关键词（R-15 上）：读到过一条带这一格的就一直算认（搜不到东西、列表空着时也不收起关键词那一行） */
    this.keywords = false;
    this.dreaming = false;
    /** 后台自己在整理的几批（`upto`）：有就在顶上一排下面写「正在整理…」（第 12 条） @type {Set<number|string>} */
    this.background = new Set();
    /** 人叫的整理那一块（第 13 条；没在整理的是 `null`） @type {DreamCard|null} */
    this.card = null;
    /** 出错（没装记忆、这里没有记忆）：整页一张卡 @type {string|null} */
    this.problem = null;
    this.loaded = false;
    /** 订着哪一份的流 @type {string|null} */
    this.subscribed = null;
    /** @type {any} */
    this.reloadTimer = 0;
    /** @type {any} */
    this.typeTimer = 0;
    this.onPush = (/** @type {string} */ method, /** @type {any} */ params) => this.push(method, params);
    ctx.core.onPush(this.onPush);
    ctx.effect?.(() => () => {
      ctx.core.pushes?.delete(this.onPush);
      this.unsubscribe();
    });
  }

  /** 设置页画这一页：第一次读人格和记忆，交回同一块。 @param {any} kit */
  render(kit) {
    this.kit = kit;
    if (!this.loaded) this.start();
    else {
      this.subscribe();
      this.reload();
    }
    return this.el;
  }

  /** 从别处跳过来（人格详情的「记忆 N 条」、`/memory`）：换到这一份、回到列表。 @param {string|null} persona */
  show(persona) {
    if (persona && persona !== this.persona) {
      this.persona = persona;
      this.open = null;
      this.query = '';
      if (this.loaded) {
        this.subscribe();
        this.reload();
      }
    }
  }

  async start() {
    this.loaded = true;
    const [list, got] = await Promise.all([
      this.ctx.core.request('persona.list', {}).then((r) => r?.personas ?? [], () => []),
      this.ctx.core.request('config.get', { keys: ['persona.default'] }).catch(() => null),
    ]);
    this.personas = list.filter((/** @type {any} */ p) => !p.problem).map((/** @type {any} */ p) => ({ persona: p.persona, name: p.name || p.persona }));
    // 无人格不是人格（`persona.list` 里没有），自己加一项
    this.personas.push({ persona: NO_PERSONA, name: this.t('none') });
    const fallback = got?.items?.['persona.default']?.value ?? null;
    if (!this.persona || !this.personas.some((p) => p.persona === this.persona)) {
      this.persona = this.personas.some((p) => p.persona === fallback) ? fallback : this.personas[0]?.persona ?? null;
    }
    this.subscribe();
    await this.reload();
  }

  // —— 读 ——

  /** 照现在的人格、搜索、作废的开关重读。 */
  async reload() {
    if (!this.persona) {
      this.list = [];
      this.draw();
      return;
    }
    const persona = this.persona;
    const q = this.query.trim();
    try {
      const got = q
        ? await this.ctx.core.request('memory.search', { persona, query: q, forgotten: this.retired, limit: Math.min(500, this.limit) })
        : await this.ctx.core.request('memory.list', { persona, forgotten: this.retired, limit: Math.min(500, this.limit) });
      if (persona !== this.persona || q !== this.query.trim()) return;
      this.list = Array.isArray(got?.memories) ? got.memories : [];
      this.keywords = this.keywords || hasKeywords(this.list);
      this.problem = null;
    } catch (err) {
      const why = /** @type {any} */ (err)?.data?.reason;
      this.problem = why === 'memory_not_installed' ? 'missing' : why === 'memory_unavailable' ? 'unavailable'
        // 不认 `_none` 的旧核心：回 `unknown_persona`，或者人格编号写法不对的 `bad_params`
        : (why === 'unknown_persona' || why === 'bad_params' || /** @type {any} */ (err)?.code === -32602) && persona === NO_PERSONA ? 'old_core' : null;
      if (!this.problem) this.say(/** @type {any} */ (err)?.message ?? String(err));
      this.list = [];
    }
    this.draw();
  }

  async subscribe() {
    if (!this.persona || this.subscribed === this.persona) return;
    this.unsubscribe();
    this.subscribed = this.persona;
    // 换了一份、重订了：后台在整理的从头记（流只推新的）
    this.background = new Set();
    await this.ctx.core.request('subscribe', { stream: 'memory', persona: this.persona }).catch(() => {
      this.subscribed = null;
    });
  }

  unsubscribe() {
    if (!this.subscribed) return;
    this.ctx.core.request('unsubscribe', { stream: 'memory', persona: this.subscribed }).catch(() => {});
    this.subscribed = null;
  }

  /** 推送：这一份的日志多了一行，重读；不在页面上了的退订。 @param {string} method @param {any} params */
  push(method, params) {
    if (method === 'resync' && params?.stream === 'memory') {
      this.subscribed = null;
      if (this.el.isConnected) this.subscribe();
      return;
    }
    if ((method !== 'memory.event' && method !== 'memory.dreaming') || params?.persona !== this.subscribed) return;
    // 人叫的整理那一块：日志、模型写出来的决定都交给它（第 13 条）
    this.card?.push(method, params);
    if (method === 'memory.dreaming') return;
    if (!this.el.isConnected) {
      this.unsubscribe();
      return;
    }
    const was = this.background.size > 0;
    this.background = tidying(this.background, params.event);
    if (was !== this.background.size > 0) this.drawTidying();
    clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => this.reload(), PUSH_MS);
  }

  // —— 画 ——

  draw() {
    if (!this.kit) return;
    // 「记一条」的小窗里写着字的：不重画，免得冲掉（收起以后再画）
    if (this.adding && /** @type {HTMLTextAreaElement|null} */ (this.el.querySelector('.mem-add textarea'))?.value.trim()) return;
    if (this.adding || this.open) this.el.dataset.setDismiss = '1';
    else delete this.el.dataset.setDismiss;
    // 正在详情里写着的：不重画那一张，免得冲掉写了一半的字；那一条在别处没了的写一行
    if (this.open && this.el.querySelector('.mem-detail')) {
      const still = this.list.find((m) => m.id === this.open);
      const note = this.el.querySelector('.mem-gone');
      if (note instanceof HTMLElement) note.hidden = !!still;
      const editing = this.el.querySelector('.mem-detail [data-dirty]');
      if (editing) return;
    }
    // 一条的详情在列表上面弹一个小窗（2026-10-20 项目主人：改成浮动窗口），列表留在后面
    replace(this.el, this.problem ? this.problemCard() : [this.page(), this.open ? this.detail() : null]);
  }

  problemCard() {
    const t = this.t;
    if (this.problem === 'missing') {
      return h('div.mem-problem', h('p', t('problem.missing')), this.kit.button(t('problem.install'), { primary: true }, () => this.ctx.settings?.open?.('packages')));
    }
    return h('div.mem-problem', h('p', t(this.problem === 'old_core' ? 'problem.old_core' : 'problem.unavailable')));
  }

  page() {
    const t = this.t;
    const c = counts(this.list);
    const shown = visible(this.list, { cls: this.cls, retired: this.retired });
    const name = this.personas.find((p) => p.persona === this.persona)?.name ?? '';
    const picker = this.personas.length
      ? this.kit.select(this.personas.map((p) => ({ value: p.persona, name: p.name })), this.persona, (/** @type {string} */ v) => {
        this.persona = v;
        this.cls = 'all';
        this.query = '';
        this.adding = false;
        this.subscribe();
        this.reload();
      })
      : null;
    const find = /** @type {HTMLInputElement} */ (h('input.mem-find-input', { type: 'search', value: this.query, placeholder: t('search'), spellcheck: 'false', autocomplete: 'off' }));
    find.addEventListener('input', (e) => {
      if (/** @type {InputEvent} */ (e).isComposing) return;
      this.query = find.value;
      clearTimeout(this.typeTimer);
      this.typeTimer = setTimeout(() => this.reload().then(() => this.refocus()), TYPE_MS);
    });
    find.addEventListener('compositionend', () => find.dispatchEvent(new Event('input')));
    // 整理中的时候这个按钮也能点：点了叫停（同那一块的「停止」；2026-10-21 项目主人），悬停时字换成「停止整理」
    const label = h('span', t(this.dreaming ? 'dreaming' : 'dream_action'));
    const mark = icon(this.dreaming ? 'loader-circle' : 'sparkles');
    const dream = h(`button.set-btn.mem-dream${this.dreaming ? '.is-busy' : ''}`, {
      type: 'button', disabled: !this.persona || (this.dreaming && !this.card?.stopBtn), title: this.dreaming ? t('dream_stop_hint') : null,
      onclick: () => (this.dreaming ? this.card?.stopBtn?.click() : this.dream()),
      onmouseenter: () => { if (this.dreaming) { label.textContent = t('dream_stop'); dream.replaceChildren(icon('square'), label); } },
      onmouseleave: () => { if (this.dreaming) { label.textContent = t('dreaming'); dream.replaceChildren(mark, label); } },
    }, mark, label);
    const add = h('button.set-btn.is-primary', { type: 'button', disabled: !this.persona, onclick: () => { this.adding = true; this.draw(); this.el.querySelector('.mem-add textarea')?.focus(); } }, icon('plus'), t('add'));
    const chips = h('div.mem-chips',
      ['all', ...CLASSES].map((k) => h(`button.mem-chip${this.cls === k ? '.is-on' : ''}${k === 'all' ? '' : `.is-${k}`}`, { type: 'button', onclick: () => { this.cls = k; this.draw(); } },
        t(`classes.${k}`), h('span.mem-n', String(c[k] ?? 0)))),
      h('label.mem-retired', this.kit.toggle(this.retired, (/** @type {boolean} */ on) => { this.retired = on; this.reload(); return true; }), h('span', t('show_retired'))));
    const rows = shown.length
      ? shown.map((m) => this.row(m))
      : h('p.mem-empty', this.list.length || this.query.trim() ? t('no_match') : t('empty', { name }));
    const more = this.list.length >= this.limit ? h('button.mem-more', { type: 'button', onclick: () => { this.limit += PAGE; this.reload(); } }, t('more')) : null;
    const retiredCount = this.retired ? this.list.filter(isRetired).length : 0;
    const clear = h('button.set-btn.is-danger.mem-clear', { type: 'button', disabled: !c.all, onclick: (/** @type {Event} */ e) => this.clear(/** @type {Element} */ (e.currentTarget)) },
      icon('trash-2'), t('clear'));
    return h('div.mem-list-page',
      h('div.mem-tools', picker, h('label.mem-find', icon('search'), find), dream, add),
      this.tidyingLine(),
      this.card?.el ?? null,
      chips,
      h('div.mem-list', rows, more),
      h('div.mem-foot.set-pinned', h('span', t(retiredCount ? 'foot_retired' : 'foot', { live: c.all, retired: retiredCount })), clear),
      // 「记一条」在设置框正中弹一个小窗（2026-10-20 项目主人：新建以浮动窗口出现更好）：点外面（还没写字的）、`Esc`、「取消」收起
      this.adding ? h('div.mem-modal', {
        onclick: (/** @type {Event} */ e) => {
          if (e.target !== e.currentTarget || /** @type {HTMLTextAreaElement|null} */ (this.el.querySelector('.mem-add textarea'))?.value.trim()) return;
          this.closeAdd();
        },
      }, this.addForm()) : null);
  }

  /** 收起「记一条」的小窗（写着的字不要了） */
  closeAdd() {
    this.adding = false;
    delete this.el.dataset.setDismiss;
    this.fadeModal();
  }

  /** 小窗收起：先放完退场（遮罩淡掉、卡片缩回去，同设置里别的小窗；2026-10-20 项目主人：退出没有动画），再重画 */
  fadeModal() {
    const modal = /** @type {HTMLElement|null} */ (this.el.querySelector('.mem-modal'));
    if (modal) leave(modal, () => this.draw());
    else this.draw();
  }

  /** 后台在整理的那一行（第 12 条）：没在整理的留一个藏着的空位，推来时只换它，不重画列表 */
  tidyingLine() {
    return h('p.mem-tidying', { hidden: this.background.size === 0 }, icon('loader-circle'), this.t('tidying'));
  }

  drawTidying() {
    const line = this.el.querySelector('.mem-tidying');
    if (line instanceof HTMLElement) line.hidden = this.background.size === 0;
  }

  /** 一条一行。 @param {import('./model.js').Memory} m */
  row(m) {
    const t = this.t;
    const at = m.at ? Date.parse(m.at) : NaN;
    return h(`div.mem-row${isRetired(m) ? '.is-retired' : ''}`, { role: 'button', tabindex: '0', onclick: () => this.openDetail(m.id), onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter') this.openDetail(m.id); } },
      h('span.mem-text', this.marked(m.text)),
      // 右边一格：日期、用到几次；作废的悬停时换成「找回」（同一格，不挤下一行）
      h('span.mem-side',
        h('span.mem-meta', h('span', [t(`classes.${m.class}`), Number.isFinite(at) ? agoText(at, Date.now(), this.t) : ''].filter(Boolean).join(' · ')), h('span', m.used ? t('used', { n: m.used }) : t('unused'))),
        isRetired(m)
          ? h('button.set-btn.mem-restore', { type: 'button', onclick: (/** @type {Event} */ e) => { e.stopPropagation(); this.restore(m.id); } }, icon('rotate-ccw'), t('restore'))
          : null));
  }

  /** 搜到的字淡黄底标出来 @param {string} text */
  marked(text) {
    const q = this.query.trim();
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    return i < 0 ? text : [text.slice(0, i), h('mark', text.slice(i, i + q.length)), text.slice(i + q.length)];
  }

  addForm() {
    const t = this.t;
    let cls = 'user';
    const area = /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.set-area.mem-area', { placeholder: t('add_hint', { n: TEXT_MAX }), rows: '3' }));
    const kw = this.keywords ? keywordBox(null, t('add_keywords')) : null;
    const count = h('span.mem-count', `0 / ${TEXT_MAX}`);
    const ok = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'submit', disabled: true }, t('remember')));
    const kinds = h('div.mem-chips', CLASSES.map((k) => h(`button.mem-chip${k === cls ? '.is-on' : ''}`, { type: 'button', onclick: (/** @type {Event} */ e) => {
      cls = k;
      for (const b of kinds.children) b.classList.toggle('is-on', b === e.currentTarget);
    } }, t(`classes.${k}`))));
    const sync = () => {
      const n = chars(area.value.trim());
      count.textContent = `${n} / ${TEXT_MAX}`;
      count.classList.toggle('is-over', n > TEXT_MAX);
      ok.disabled = !area.value.trim() || n > TEXT_MAX || (kw != null && chars(kw.value.trim()) > KEYWORDS_MAX);
    };
    area.addEventListener('input', sync);
    kw?.addEventListener('input', sync);
    const form = h('form.mem-add', kinds, area, kw, h('div.mem-add-foot', count,
      h('button.set-btn', { type: 'button', onclick: () => this.closeAdd() }, t('cancel')), ok));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (ok.disabled) return;
      ok.disabled = true;
      /** @type {any} */
      const params = { persona: this.persona, class: cls, text: area.value.trim() };
      if (kw?.value.trim()) params.keywords = kw.value.trim();
      try {
        await this.ctx.core.request('memory.remember', params);
        this.adding = false;
        this.kit.toast(t('remembered'));
        await this.reload();
      } catch (err) {
        ok.disabled = false;
        this.say(this.refusal(err));
      }
    });
    return form;
  }

  /** @param {string} id */
  openDetail(id) {
    this.open = id;
    this.draw();
  }

  /** 收起详情的小窗（写着没存的字不要了） */
  closeDetail() {
    this.open = null;
    this.fadeModal();
  }

  detail() {
    const t = this.t;
    const m = this.list.find((x) => x.id === this.open) ?? (this.seen?.id === this.open ? this.seen : null);
    if (!m) {
      this.open = null;
      return null;
    }
    this.seen = m;
    const name = this.personas.find((p) => p.persona === this.persona)?.name ?? '';
    const ro = isRetired(m);
    const area = /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.set-area.mem-area', { disabled: ro }, m.text));
    const withKw = this.keywords || hasKeywords([m]);
    const kw = withKw ? keywordBox(m.keywords ?? null, t('detail.keywords_hint'), ro) : null;
    const count = h('span.mem-count', `${chars(m.text)} / ${TEXT_MAX}`);
    const kwCount = kw ? h('span.mem-count', `${chars(m.keywords ?? '')} / ${KEYWORDS_MAX}`) : null;
    const note = h('span.mem-note');
    const save = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'submit', disabled: true }, t('detail.save')));
    const sync = () => {
      const n = chars(area.value.trim());
      count.textContent = `${n} / ${TEXT_MAX}`;
      count.classList.toggle('is-over', n > TEXT_MAX);
      if (kw && kwCount) {
        const k = chars(kw.value.trim());
        kwCount.textContent = `${k} / ${KEYWORDS_MAX}`;
        kwCount.classList.toggle('is-over', k > KEYWORDS_MAX);
      }
      const change = updateOf(m, area.value, kw ? kw.value : null);
      const said = saveNote(change);
      note.textContent = said ? t(said) : '';
      save.disabled = !canSave(m, area.value, kw ? kw.value : null);
    };
    for (const el of [area, kw]) el?.addEventListener('input', () => { el.dataset.dirty = '1'; sync(); });
    const at = m.at ? Date.parse(m.at) : NaN;
    const usedAt = m.used_at ? Date.parse(m.used_at) : NaN;
    const row = (/** @type {string} */ label, /** @type {any} */ value) => h('div.mem-field', h('span.mem-label', label), h('div.mem-value', value));
    const sources = (m.sources ?? []).map((s) => h('button.mem-source', { type: 'button', onclick: () => { this.ctx.chat?.open?.(s.session); this.ctx.settings?.close?.(); } },
      t('detail.source', { id: shortId(s.session), turn: s.turn })));
    const form = h('form.mem-detail',
      ro ? h('div.mem-retired-banner', h('span', m.retired ? t('detail.retired', { why: m.retired }) : t('detail.retired_plain')), h('button.set-btn', { type: 'button', onclick: () => this.restore(m.id) }, icon('rotate-ccw'), t('restore'))) : null,
      h('p.mem-gone', { hidden: true }, t('detail.gone')),
      row(t('detail.text'), [area, count]),
      kw ? row(t('detail.keywords'), [kw, h('div.mem-kw-foot', h('span.mem-hint', t('detail.keywords_note')), kwCount)]) : null,
      row(t('detail.class'), h('span.mem-plain', t(`classes.${m.class}`))),
      row(t('detail.at'), h('span.mem-plain', [Number.isFinite(at) ? new Date(at).toLocaleDateString() : '', t(m.by === 'person' ? 'detail.by_person' : 'detail.by_tool')].filter(Boolean).join(' · '))),
      row(t('detail.used'), h(`span.mem-plain${m.used ? '' : '.is-faint'}`, m.used ? t('detail.used_n', { n: m.used, when: Number.isFinite(usedAt) ? agoText(usedAt, Date.now(), this.t) : '' }) : t('unused'))),
      row(t('detail.sources'), sources.length ? h('div.mem-sources', sources) : h('span.mem-plain.is-faint', t('detail.no_source'))),
      m.venue ? row(t('detail.venue'), h('span.mem-plain', m.venue)) : null,
      ro ? null : h('div.mem-actions', note,
        h('button.set-btn.is-danger', { type: 'button', onclick: () => this.forget(m.id) }, icon('trash-2'), t('detail.forget')), save));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const change = updateOf(m, area.value, kw ? kw.value : null);
      if (!change || save.disabled) return;
      save.disabled = true;
      try {
        const got = await this.ctx.core.request('memory.update', { persona: this.persona, ...change });
        this.kit.toast(t('detail.saved'));
        this.open = got?.id ?? m.id;
        // 先照改了的记下：重读以后它不在列表里（不再命中搜索）的照这一份画
        this.seen = { ...m, id: this.open, ...('text' in change ? { text: change.text } : {}), ...('keywords' in change ? { keywords: change.keywords || null } : {}) };
        delete area.dataset.dirty;
        if (kw) delete kw.dataset.dirty;
        await this.reload();
        // 改了内容的是新编号：详情换到新的那一条
        this.draw();
      } catch (err) {
        save.disabled = false;
        const why = /** @type {any} */ (err)?.data;
        if (why?.reason === 'memory_too_long') (why.field === 'keywords' ? kwCount : count)?.classList.add('is-over');
        this.say(this.refusal(err));
      }
    });
    // 小窗：头一行「记忆」、暗字「人格 · 编号」、✕；点外面（没写着字的）、`Esc`、✕ 收起
    return h('div.mem-modal', {
      onclick: (/** @type {Event} */ e) => {
        if (e.target !== e.currentTarget || this.el.querySelector('.mem-detail [data-dirty]')) return;
        this.closeDetail();
      },
    }, h('div.mem-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('title') },
      h('div.mem-pop-head', h('strong', t('title')), h('span.mem-detail-id', `${name} · ${m.id}`),
        h('button.icon-button.mem-pop-close', { type: 'button', title: t('close'), 'aria-label': t('close'), onclick: () => this.closeDetail() }, icon('x'))),
      form));
  }

  // —— 改 ——

  /** @param {string} id */
  async forget(id) {
    try {
      await this.ctx.core.request('memory.forget', { persona: this.persona, id });
      this.open = null;
      this.kit.toast(this.t('forgot'));
      await this.reload();
    } catch (err) {
      this.say(this.refusal(err));
    }
  }

  /** @param {string} id */
  async restore(id) {
    try {
      await this.ctx.core.request('memory.restore', { persona: this.persona, id });
      this.kit.toast(this.t('restored'));
      await this.reload();
      this.draw();
    } catch (err) {
      this.say(this.refusal(err));
    }
  }

  /**
   * 整理（第 2、13 条）：顶上一排下面展开那一块，日志、模型写出来的决定推来照它画；合完天亮、写结果，6 秒后收起。没有要整理的、
   * 忙着的、出错的不留那一块，提示一句。
   */
  async dream() {
    const persona = this.persona;
    this.dreaming = true;
    // 「停止」：叫停这一份这时人叫的整理（核心 R-23 的 `memory.dream_stop`）
    const card = new DreamCard(this.ctx, new Map(this.list.map((m) => [m.id, m.text])), {
      stop: () => this.ctx.core.request('memory.dream_stop', { persona }).then(() => {}, (/** @type {any} */ err) => { this.say(this.refusal(err)); }),
    });
    this.card = card;
    this.draw();
    // 滚动区照编号写正文：先照列着的，再读一份整的（搜着、筛着的时候列着的不全）
    this.ctx.core.request('memory.list', { persona, forgotten: true, limit: 500 }).then((got) => {
      for (const m of got?.memories ?? []) card.texts.set(m.id, m.text);
    }, () => {});
    // 收起：照「动效」退场（`is-leaving` 的动画走完再拿掉）
    const drop = () => {
      if (this.card !== card) return;
      this.card = null;
      card.dispose();
      leave(card.el, () => card.el.remove());
    };
    try {
      const got = await this.ctx.core.request('memory.dream', { persona });
      const n = (got?.given ?? 0) + (got?.retired ?? 0) + (got?.revised ?? 0);
      if (n || got?.summary || got?.stopped === true) {
        card.finish(got);
        setTimeout(drop, DREAM_KEEP_MS);
      } else {
        drop();
        this.kit.toast(this.t('dream_none'));
      }
    } catch (err) {
      drop();
      this.say(/** @type {any} */ (err)?.data?.reason === 'memory_busy' ? this.t('dream_busy') : this.refusal(err));
    }
    this.dreaming = false;
    await this.reload();
  }

  /** 清空这一份：先弹窗问「确认要清空记忆吗」。 @param {Element} from */
  async clear(from) {
    if (!await this.kit.confirm(from, this.t('clear_ask'))) return;
    try {
      const got = await this.ctx.core.request('memory.forget', { persona: this.persona, clear: 'me' });
      this.kit.toast(this.t('cleared', { n: got?.cleared ?? 0 }));
    } catch (err) {
      this.say(this.refusal(err));
    }
    await this.reload();
  }

  // —— 别的 ——

  /** 搜完重画以后把焦点、光标放回搜索框 */
  refocus() {
    const f = this.el.querySelector('.mem-find-input');
    if (f instanceof HTMLInputElement) {
      f.focus();
      f.setSelectionRange(f.value.length, f.value.length);
    }
  }

  /** 核心拒了：照原因写一句 @param {any} err */
  refusal(err) {
    const d = err?.data;
    if (d?.reason === 'memory_too_long') return this.t(d.field === 'keywords' ? 'too_long_keywords' : 'too_long', { n: d.limit ?? (d.field === 'keywords' ? KEYWORDS_MAX : TEXT_MAX) });
    if (d?.reason === 'memory_not_current') return this.t('not_current');
    if (d?.reason === 'unknown_memory') return this.t('not_current');
    return d?.message ?? err?.message ?? String(err);
  }

  /** @param {string} text */
  say(text) {
    if (text) this.kit?.toast(text);
  }
}
