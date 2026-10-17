// @ts-check
//! 整页里能改的（软件包 `widgets`，蓝图 `web.md`「界面块」第 7 条；核心 `widgets.md`「整页里能改」）：`sections` 画成左边列表、右边详情（窄的一列、
//! 点进去、`Esc` 回来），`form` 一格一行、只交改过的格。选中哪一项、人改到哪了都记在这里（推来新内容时照 `forms.js` 并），节点能留着的留着
//! （正在填的框不丢光标）。没保存就离开的问一句。别的六种段照 `render.js` 画。

import { h, icon } from '../../src/lib/dom.js';
import { segment } from './render.js';
import { fieldRow } from './fields.js';
import { fresh, merge, edit, dirty, changes, revert, savedAll, outcome, initialOf, matches, badgeOf, stateOf } from './forms.js';
import { toneOf } from './model.js';

/** 够宽画两栏（内容区的宽，蓝图第 7 条） */
const WIDE = 760;
/** 项多于这么多时列表顶上一个找的框 */
const SEARCH_FROM = 8;
/** 「已保存」露多久 */
const SAVED_MS = 2200;

/**
 * @typedef {{text: (path: string, fields?: any) => string, act: (action: any, block: any) => void,
 *   call: (block: any, method: string, params: any) => Promise<any>}} Opts
 * @typedef {{form: import('./forms.js').Form, state: import('./forms.js').State, invalid: Record<string, string>, el: HTMLElement|null, sig: string}} Entry
 */

/** 整页的内容里有没有能改的段（有的交给这里画）。 @param {any[]|null|undefined} content */
export const editable = (content) => Array.isArray(content) && content.some((s) => s?.type === 'sections' || s?.type === 'form');

export class PageView {
  /** @param {Opts} opts */
  constructor(opts) {
    this.opts = opts;
    this.t = opts.text;
    /** 表单编号 → 人改到哪了 @type {Map<string, Entry>} */
    this.forms = new Map();
    /** 选中的那一项（`null`：选第一项） @type {string|null} */
    this.selected = null;
    /** 窄的时候在看详情 */
    this.inside = false;
    this.query = '';
    /** @type {any} */
    this.block = null;
    this.notice = h('div.wg-f-notice', { hidden: true });
    this.body = h('div.wg-forms-body');
    this.el = h('div.wg-forms', { tabindex: '-1' }, this.notice, this.body);
    this.wide = true;
    /** 上一次画的内容（找没了的表单是哪一项） @type {any[]} */
    this.lastContent = [];
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    this.noticeTimer = undefined;
    this.observer = new ResizeObserver(() => {
      const wide = this.el.clientWidth >= WIDE;
      if (wide !== this.wide) {
        this.wide = wide;
        this.draw(true);
      }
    });
    this.observer.observe(this.el);
    // 整页开着时光标不一定在这里面（点过按钮、加过一项）：`Ctrl+S` 在整页上都认
    this.keys = (/** @type {KeyboardEvent} */ e) => this.onKey(e);
    document.addEventListener('keydown', this.keys);
  }

  /** 推来了这一块的新内容。 @param {any} block */
  update(block) {
    this.block = block;
    const content = Array.isArray(block?.content) ? block.content : [];
    const seen = new Set();
    for (const form of formsIn(content)) {
      seen.add(form.id);
      const had = this.forms.get(form.id);
      if (had) {
        merge(had.state, form);
        had.form = form;
      } else this.forms.set(form.id, { form, state: fresh(form), invalid: {}, el: null, sig: '' });
    }
    // 没了的表单：人改过没存的提示一句
    for (const [id, entry] of [...this.forms]) {
      if (seen.has(id)) continue;
      if (dirty(entry.state)) this.say(this.t('form.gone', { title: this.titleOf(id) ?? entry.form.submit?.label ?? id }));
      this.forms.delete(id);
    }
    this.draw(false);
  }

  /** 一张表单所在那一项的标题（没了的照上一份找）。 @param {string} formId */
  titleOf(formId) {
    for (const seg of this.lastContent ?? []) {
      if (seg?.type !== 'sections') continue;
      const item = (seg.items ?? []).find((/** @type {any} */ it) => (it.blocks ?? []).some((/** @type {any} */ b) => b?.type === 'form' && b.id === formId));
      if (item) return String(item.title ?? '');
    }
    return null;
  }

  /** 整页顶上一句提示，过一会儿收掉。 @param {string} text */
  say(text) {
    this.notice.textContent = text;
    this.notice.hidden = false;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.notice.hidden = true; }, 6000);
  }

  /** 重画（`force` 连没变的表单也重画）。 @param {boolean} force */
  draw(force) {
    const content = Array.isArray(this.block?.content) ? this.block.content : [];
    this.lastContent = content;
    const focus = focusOf(this.el);
    const kids = content.map((/** @type {any} */ seg) => {
      if (seg?.type === 'sections') return this.sections(seg, force);
      if (seg?.type === 'form') return this.formNode(seg.id, force);
      return segment(seg, this.block, { rows: Infinity, text: this.t, act: this.opts.act });
    });
    this.body.replaceChildren(...kids);
    restoreFocus(this.el, focus);
  }

  /** 一组可选的项。 @param {any} seg @param {boolean} force */
  sections(seg, force) {
    const items = Array.isArray(seg.items) ? seg.items : [];
    // 选中的那一项不在（没了，或者刚加的、新内容还没推来）：先露第一项，记着的不改，推来了就是它
    const item = items.find((/** @type {any} */ it) => it.id === this.selected) ?? items[0] ?? null;
    const on = item?.id ?? null;
    const add = seg.add ? this.addButton(seg.add) : null;
    const showList = this.wide || !this.inside || !item;
    const showDetail = item && (this.wide || this.inside);
    const list = showList ? this.list(items, on) : null;
    const detail = showDetail ? this.detail(item, force) : null;
    return h(`div.wg-sections${this.wide ? '.is-wide' : ''}`,
      h('div.wg-sec-top', add),
      h('div.wg-sec-main', list, detail));
  }

  /** 左边的列表。 @param {any[]} items @param {string|null} on 露着的那一项 */
  list(items, on) {
    const search = items.length > SEARCH_FROM ? h('input.wg-input.wg-sec-search', {
      type: 'search', placeholder: this.t('form.search'), 'aria-label': this.t('form.search'), value: this.query,
      oninput: (/** @type {Event} */ e) => { this.query = /** @type {HTMLInputElement} */ (e.target).value; this.draw(false); },
    }) : null;
    const rows = items.filter((it) => matches(it, this.query)).map((it) => {
      const badge = badgeOf(it.badge);
      const state = stateOf(it.state);
      return h(`button.wg-sec-item${it.id === on && this.wide ? '.is-on' : ''}`, { type: 'button', dataset: { id: it.id }, onclick: () => this.pick(it.id) },
        h('span.wg-avatar', initialOf(it.title)),
        h('span.wg-sec-text', h('span.wg-sec-title', String(it.title ?? '')), it.subtitle ? h('span.wg-sec-sub', String(it.subtitle)) : null),
        badge ? h(`span.wg-badge.wg-tone-${toneOf(badge.tone)}`, badge.text) : null,
        state ? h(`span.wg-dot.is-${state}`, { title: this.t(`form.state.${state}`) }) : null);
    });
    return h('nav.wg-sec-list', search, ...rows);
  }

  /** 右边的详情。 @param {any} item @param {boolean} force */
  detail(item, force) {
    const badge = badgeOf(item.badge);
    const state = stateOf(item.state);
    const blocks = (Array.isArray(item.blocks) ? item.blocks : []).map((/** @type {any} */ seg) => (seg?.type === 'form'
      ? this.formNode(seg.id, force) : segment(seg, this.block, { rows: Infinity, text: this.t, act: this.opts.act })));
    return h('section.wg-sec-detail',
      this.wide ? null : h('button.wg-sec-back', { type: 'button', onclick: () => this.goBack() }, icon('arrow-left'), this.t('form.back')),
      h('header.wg-sec-head',
        h('span.wg-avatar.is-big', initialOf(item.title)),
        h('span.wg-sec-text', h('span.wg-sec-name', String(item.title ?? '')), item.subtitle ? h('span.wg-sec-sub', String(item.subtitle)) : null),
        state ? h(`span.wg-dot.is-${state}`, { title: this.t(`form.state.${state}`) }) : null,
        badge ? h(`span.wg-badge.wg-tone-${toneOf(badge.tone)}`, badge.text) : null),
      ...blocks);
  }

  /** 选一项（有没存的先问）。 @param {string} id */
  async pick(id) {
    const on = this.shownId();
    if (id === on && (this.wide || this.inside)) return;
    if (id !== on && !(await this.leave())) return;
    this.selected = id;
    this.inside = true;
    this.draw(false);
  }

  /** 露着的那一项（选中的不在就是第一项）。 */
  shownId() {
    const seg = (this.lastContent ?? []).find((/** @type {any} */ x) => x?.type === 'sections');
    const items = Array.isArray(seg?.items) ? seg.items : [];
    return (items.find((/** @type {any} */ it) => it.id === this.selected) ?? items[0])?.id ?? null;
  }

  /** 窄的时候从详情回列表。 */
  async goBack() {
    if (!(await this.leave())) return;
    this.inside = false;
    this.draw(false);
  }

  /** 右上角「加一个群」：有选项的往下弹一列。 @param {any} add */
  addButton(add) {
    const options = Array.isArray(add.options) ? add.options : null;
    const button = h('button.wg-primary.wg-sec-add', { type: 'button' }, String(add.label ?? ''));
    const send = async (/** @type {any} */ value) => {
      try {
        const got = await this.opts.call(this.block, add.call, value === undefined ? {} : { value });
        if (typeof got?.id === 'string') {
          this.selected = got.id;
          this.inside = true;
          this.draw(false);
        }
      } catch (err) {
        this.say(String(/** @type {any} */ (err)?.message ?? err));
      }
    };
    if (!options) {
      button.onclick = () => send(undefined);
      return button;
    }
    const menu = h('div.wg-menu', { hidden: true, role: 'menu' }, ...options.map((o) => h('button.wg-menu-item', { type: 'button', role: 'menuitem', onclick: () => { close(); send(o.value); } }, String(o.label ?? o.value))));
    const outside = (/** @type {Event} */ e) => { if (!wrap.contains(/** @type {Node} */ (e.target))) close(); };
    const close = () => { menu.hidden = true; document.removeEventListener('pointerdown', outside, true); };
    button.onclick = () => {
      if (!menu.hidden) return close();
      menu.hidden = false;
      document.addEventListener('pointerdown', outside, true);
    };
    menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); button.focus(); } });
    if (!options.length) button.setAttribute('disabled', '');
    const wrap = h('div.wg-add', button, menu);
    return wrap;
  }

  /** 一张表单（节点没变的留着：正在填的框不丢光标）。 @param {string} id @param {boolean} force */
  formNode(id, force) {
    const entry = this.forms.get(id);
    if (!entry) return h('div');
    const sig = JSON.stringify([entry.form, entry.state.edits, [...entry.state.conflicts], entry.state.problems, entry.state.message, entry.state.saving, entry.invalid]);
    if (!force && entry.el && entry.sig === sig) return entry.el;
    entry.sig = sig;
    entry.el = this.drawForm(entry);
    return entry.el;
  }

  /** @param {Entry} entry */
  drawForm(entry) {
    const { form, state } = entry;
    const t = this.t;
    const hooks = {
      t,
      set: (/** @type {string} */ key, /** @type {any} */ value, typing = false) => {
        edit(state, key, value);
        if (value === null && !typing) delete entry.invalid[key];
        // 打字的框不重画（不丢光标），只换旁边的字和底下的按钮；别的控件整张重画
        if (typing) this.touch(entry, key);
        else this.redrawForm(entry);
      },
      bad: (/** @type {string} */ key, /** @type {string|null} */ why) => {
        // 又动了这一格：包上次说的错不算了
        delete state.problems[key];
        if (why) entry.invalid[key] = why;
        else delete entry.invalid[key];
        this.touch(entry, key);
      },
    };
    const rows = form.fields.map((f) => fieldRow(f, state, hooks, entry.invalid[f.key] ?? null));
    const changed = dirty(state);
    const blocked = Object.keys(entry.invalid).length > 0;
    const savedNow = state.saved && Date.now() - state.saved < SAVED_MS;
    return h('form.wg-form', { dataset: { form: form.id }, onsubmit: (/** @type {Event} */ e) => { e.preventDefault(); this.save(entry); } },
      ...rows,
      state.message ? h('div.wg-f-message', state.message) : null,
      h('div.wg-f-actions',
        savedNow ? h('span.wg-f-saved', t('form.saved')) : null,
        h('button.wg-button', { type: 'button', disabled: !changed || state.saving, onclick: () => { revert(state); entry.invalid = {}; this.redrawForm(entry); } }, t('form.revert')),
        h('button.wg-primary', { type: 'submit', disabled: !changed || state.saving || blocked }, state.saving ? t('form.saving') : String(form.submit?.label ?? t('form.save')))));
  }

  /** 整张表单重画（光标照格找回来）。 @param {Entry} entry */
  redrawForm(entry) {
    if (!entry.el?.isConnected) return this.draw(false);
    const focus = focusOf(entry.el);
    const next = this.drawForm(entry);
    entry.el.replaceWith(next);
    entry.el = next;
    entry.sig = '';
    restoreFocus(next, focus);
  }

  /** 打字时：只换那一格旁边的字、底下的按钮。 @param {Entry} entry @param {string} key */
  touch(entry, key) {
    const el = entry.el;
    if (!el) return;
    const field = fieldOf(entry.form, key);
    const row = el.querySelector(`.wg-f-row[data-key="${CSS.escape(key)}"]`);
    if (field && row) {
      const fake = fieldRow(field, entry.state, { t: this.t, set: () => {}, bad: () => {} }, entry.invalid[key] ?? null);
      row.className = fake.className;
      row.querySelector('.wg-f-tail')?.replaceWith(/** @type {Element} */ (fake.querySelector('.wg-f-tail')));
      // 换掉提示那一句：控件留着
      row.querySelector('.wg-f-problem, .wg-f-conflict')?.remove();
      const note = fake.querySelector('.wg-f-problem, .wg-f-conflict');
      if (note) row.querySelector('.wg-f-control')?.append(note);
      // 「恢复默认」点了要整格重画
      const restore = row.querySelector('.wg-f-restore');
      if (restore) /** @type {HTMLElement} */ (restore).onclick = () => { edit(entry.state, key, null); delete entry.invalid[key]; this.redrawForm(entry); };
    }
    const actions = this.drawForm(entry).querySelector('.wg-f-actions');
    if (actions) el.querySelector('.wg-f-actions')?.replaceWith(actions);
    entry.sig = '';
  }

  /** 保存：只交改过的格；包回什么照 `outcome` 写。 @param {Entry} entry */
  async save(entry) {
    const { form, state } = entry;
    if (state.saving || !dirty(state) || Object.keys(entry.invalid).length) return;
    state.saving = true;
    this.redrawForm(entry);
    const sent = changes(state);
    try {
      const got = await this.opts.call(this.block, form.submit.call, { ...(form.submit.params && typeof form.submit.params === 'object' ? form.submit.params : {}), values: sent });
      const result = outcome(got, form);
      state.saving = false;
      if (result.saved) {
        savedAll(state, Date.now());
        setTimeout(() => this.redrawForm(entry), SAVED_MS);
      } else {
        state.problems = result.problems;
        state.message = result.message;
      }
    } catch (err) {
      state.saving = false;
      state.message = this.t('form.save_failed', { why: String(/** @type {any} */ (err)?.message ?? err) });
    }
    this.redrawForm(entry);
  }

  /** 有改了没存的：问一句，放弃的丢掉。交回能不能走。 */
  async leave() {
    const open = [...this.forms.values()].filter((e) => dirty(e.state));
    if (!open.length) return true;
    const ok = await confirmBox(this.el, this.t);
    if (ok) for (const e of open) { revert(e.state); e.invalid = {}; e.sig = ''; }
    return ok;
  }

  /** `Ctrl+S` 保存光标所在的表单（没有的保存唯一改过的那张）。 @param {KeyboardEvent} e */
  onKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || !this.el.isConnected) return;
    e.preventDefault();
    const host = /** @type {HTMLElement|null} */ (document.activeElement)?.closest?.('.wg-form');
    const id = host instanceof HTMLElement && this.el.contains(host) ? host.dataset.form : [...this.forms.values()].filter((x) => dirty(x.state)).map((x) => x.form.id)[0];
    const entry = id ? this.forms.get(id) : null;
    if (entry) this.save(entry);
  }

  /** 整页上按了 `Esc`：窄的看详情时回列表，交回管了没有（没管的整页返回）。 */
  escape() {
    if (this.wide || !this.inside) return false;
    this.goBack();
    return true;
  }

  close() {
    this.observer.disconnect();
    document.removeEventListener('keydown', this.keys);
    clearTimeout(this.noticeTimer);
  }
}

/** 内容里的表单（顶层的、每一项里的）。 @param {any[]} content */
function formsIn(content) {
  /** @type {import('./forms.js').Form[]} */
  const out = [];
  for (const seg of content) {
    if (seg?.type === 'form' && Array.isArray(seg.fields)) out.push(seg);
    if (seg?.type === 'sections') for (const it of seg.items ?? []) for (const b of it.blocks ?? []) if (b?.type === 'form' && Array.isArray(b.fields)) out.push(b);
  }
  return out;
}

/** @param {import('./forms.js').Form} form @param {string} key */
const fieldOf = (form, key) => form.fields.find((f) => f.key === key) ?? null;

/** 光标在哪一张表单的哪一格（重画以后找回来）。 @param {HTMLElement} root */
function focusOf(root) {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || !root.contains(el)) return null;
  const row = el.closest('.wg-f-row');
  const form = el.closest('.wg-form');
  const start = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.selectionStart : null;
  return { form: form instanceof HTMLElement ? form.dataset.form : null, key: row instanceof HTMLElement ? row.dataset.key : null, tag: el.tagName, start, search: el.classList.contains('wg-sec-search') };
}

/** @param {HTMLElement} root @param {ReturnType<typeof focusOf>} at */
function restoreFocus(root, at) {
  if (!at) return;
  if (at.search) {
    const s = /** @type {HTMLInputElement|null} */ (root.querySelector('.wg-sec-search'));
    s?.focus();
    if (s && at.start != null) s.setSelectionRange(at.start, at.start);
    return;
  }
  if (!at.key) return;
  const scope = at.form ? root.querySelector(`.wg-form[data-form="${CSS.escape(at.form)}"]`) ?? root : root;
  const row = scope.querySelector(`.wg-f-row[data-key="${CSS.escape(at.key)}"]`);
  const el = /** @type {HTMLElement|null} */ (row?.querySelector(at.tag.toLowerCase()) ?? row?.querySelector('input, textarea, select, button'));
  el?.focus();
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && at.start != null) el.setSelectionRange(at.start, at.start);
}

/**
 * 「有没保存的修改」：放弃修改、继续编辑。交回是不是放弃。
 * @param {HTMLElement} root @param {(path: string) => string} t
 * @returns {Promise<boolean>}
 */
function confirmBox(root, t) {
  return new Promise((done) => {
    const finish = (/** @type {boolean} */ ok) => { box.remove(); done(ok); };
    const keep = h('button.wg-primary', { type: 'button', onclick: () => finish(false) }, t('form.keep'));
    const box = h('div.wg-confirm', { role: 'alertdialog', 'aria-modal': 'true', onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } } },
      h('div.wg-confirm-card', h('p', t('form.unsaved')),
        h('div.wg-f-actions', h('button.wg-button.is-danger', { type: 'button', onclick: () => finish(true) }, t('form.discard')), keep)));
    root.append(box);
    keep.focus();
  });
}

