// @ts-check
//! 预设的详情（蓝图 `web.md`「人格、预设、工作区」第 6 条）：浮起来的卡片里（`float.js`）——名字、功能开关（功能树 `feature-tree.js`，照核心
//! 设计 52 的 `sections` 画，第 8 条）；简单描述一行（2026-10-23 项目主人定预设也要描述，推翻 10-08 的「预设不要说明」）；不带默认人格，人格、预设互不引用）。都是点了当场存（`preset.set` 只带改的那一项，不带 `expect`）：名字回车、离开时存，开关点了就存；功能、工具照核心给的
//! 名字（照连接的语言），没装的写「没安装」。图标（核心 P-5，`preset.icon`，Lucide 的名字）：点开一排先列设置项 `preset_icons` 那些，能搜整套，
//! 「不用图标」删掉这一层写的；选了当场存。删除照核心的 `remove`，同人格。

import { h, icon, replace, hasIcon, iconNames } from '../../src/lib/dom.js';
import { field, askFirst } from './form.js';
import { refusalText } from './persona-editor.js';
import { summaryChange } from './model.js';
import { featureTree, filterTree, fallbackSections } from './feature-tree.js';

/** @typedef {{saved: () => void, removed: (remains: boolean) => void, close: () => void}} Hooks */

export class PresetEditor {
  /**
   * @param {any} ctx @param {import('./form.js').Kit} kit @param {import('./catalog.js').Catalog} catalog @param {string} id @param {Hooks} hooks
   * @param {{name?: string}} [look] 列表里那一块写的（读完以前卡片头上先写它的名字）
   */
  constructor(ctx, kit, catalog, id, hooks, look = {}) {
    this.ctx = ctx;
    this.kit = kit;
    this.catalog = catalog;
    this.id = id;
    this.hooks = hooks;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    this.title = h('span', look.name ?? id);
    this.body = h('div.setup-editor', h('p.setup-empty', this.t('page.loading')));
    /** 选图标的那一排开着 */
    this.picking = false;
    /** 功能那一格搜的字（存了一项重画时留着） */
    this.query = '';
    this.findFocused = false;
  }

  async load() {
    try {
      this.draw(await this.ctx.core.request('preset.get', { preset: this.id }));
    } catch (err) {
      replace(this.body, h('p.setup-error', refusalText(err)));
    }
  }

  /** 都是当场存的，没有改了没存的。 */
  dirty() {
    return false;
  }

  /** 点外面、`Esc`、✕：都是当场存的，直接关。 */
  tryClose() {
    this.hooks.close();
  }

  /** @param {any} got `preset.get` 的回应 */
  draw(got) {
    const t = this.t;
    const label = typeof got.name === 'string' ? got.name : '';
    this.title.textContent = label || this.id;
    const name = this.kit.text(label, '', (text) => { if (text) this.set([{ key: 'preset.name', value: text }]); });
    // 简单描述（2026-10-23 项目主人定预设也要描述）：回车、离开框就存，同名字；清空发空字（盖住出厂的那句，同人格的说明）
    let said = typeof got.summary === 'string' ? got.summary : '';
    const summary = this.kit.text(said, t('edit.summary_hint'), (text) => {
      const changes = summaryChange('preset', said, text);
      if (!changes.length) return;
      said = text.trim();
      this.set(changes);
    });
    const list = Array.isArray(got.features) ? got.features : [];
    /** 没列出来的功能默认开不开：`on` 的预设才照全局开关（核心 X-27） */
    this.unlisted = got.unlisted;
    // 功能树（核心设计 52 第四节，FG-1）：组、先后、名字照核心的 `sections`；旧核心不给的照 `features` 拼一组
    const sections = Array.isArray(got.sections) ? got.sections : fallbackSections(list, t('edit.features'));
    const drawFeatures = () => {
      const shown = filterTree(sections, this.query);
      if (!shown.length) return h('p.setup-empty', t('edit.no_match'));
      return featureTree({ sections: shown, t, toggle: (on, change) => this.kit.toggle(on, change), set: (changes) => this.set(changes), unlisted: this.unlisted });
    };
    // 搜索功能（2026-10-27 项目主人：预设列表没法搜）：边打边筛，输入法选字时不筛；存了一项重画时照旧留着搜的字和焦点
    const box = h('div', drawFeatures());
    const input = /** @type {HTMLInputElement} */ (h('input.setup-find-input', { type: 'search', value: this.query, placeholder: t('edit.find'), 'aria-label': t('edit.find'), spellcheck: 'false', autocomplete: 'off' }));
    const refilter = () => { this.query = input.value; replace(box, drawFeatures()); };
    input.addEventListener('input', (e) => { if (!(/** @type {InputEvent} */ (e)).isComposing) refilter(); });
    input.addEventListener('compositionend', refilter);
    const focused = this.findFocused;
    input.addEventListener('focus', () => { this.findFocused = true; });
    input.addEventListener('blur', () => { this.findFocused = false; });
    const features = h('div', h('label.setup-find', icon('search'), input), box);
    if (focused) queueMicrotask(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
    this.note = h('p.setup-error', { hidden: true });
    const remove = got.remove ? askFirst(this.kit, t(`edit.${got.remove}`), () => t(`edit.${got.remove}_ask`, { name: this.title.textContent || this.id }), () => this.drop()) : null;
    replace(this.body,
      field(t('edit.name'), name),
      field(t('edit.summary'), summary),
      field(t('edit.icon'), this.iconRow(got, label)),
      field(t('edit.features'), sections.length ? features : h('p.setup-empty', t('edit.no_features'))),
      this.note,
      remove ? h('div.setup-foot', remove) : null);
  }

  /**
   * 图标那一格：现在的图标（没写的、认不出的画名字的第一个字），点了展开选的那一排：搜索框、「不用图标」、一个个图标（搜的时候照名字找整套，
   * 最多列设置项 `preset_icons` 那么多个）。
   * @param {any} got @param {string} label
   */
  iconRow(got, label) {
    const t = this.t;
    const now = typeof got.icon === 'string' ? got.icon : null;
    const face = now && hasIcon(now) ? icon(now) : h('span', [...label][0] ?? '');
    const toggle = h(`button.setup-icon-now${this.picking ? '.is-open' : ''}`, { type: 'button', title: t('edit.icon'), 'aria-expanded': String(this.picking),
      onclick: () => { this.picking = !this.picking; this.draw(got); } }, face, icon('chevron-down'));
    if (!this.picking) return toggle;
    const shown = /** @type {string[]} */ (this.ctx.config.preset_icons ?? []).filter((n) => hasIcon(n));
    const grid = h('div.setup-icon-grid');
    const pick = (/** @type {string|null} */ name) => {
      this.picking = false;
      this.set([name ? { key: 'preset.icon', value: name } : { key: 'preset.icon', unset: true }]);
    };
    const fill = (/** @type {string[]} */ names) => replace(grid,
      names.length ? names.map((n) => h(`button.setup-icon${n === now ? '.is-on' : ''}`, { type: 'button', title: n, 'aria-label': n, onclick: () => pick(n) }, icon(n)))
        : h('p.setup-empty', t('edit.icon_empty')));
    const find = /** @type {HTMLInputElement} */ (this.kit.field('', t('edit.icon_search')));
    find.addEventListener('input', () => {
      const q = find.value.trim().toLowerCase();
      fill(q ? iconNames().filter((n) => n.includes(q)).slice(0, Math.max(shown.length, 1)) : shown);
    });
    fill(shown);
    return h('div.setup-icon-pick', toggle,
      h('div.setup-icon-panel', h('div.setup-icon-tools', find, h('button.setup-icon-none', { type: 'button', onclick: () => pick(null) }, t('edit.icon_none'))), grid));
  }

  /** 改一项：成了照回应重画（回应同 `preset.get`），拒了写原因；交回存没存成（开关照它拨回去）。 @param {any[]} changes */
  async set(changes) {
    try {
      const got = await this.ctx.core.request('preset.set', { preset: this.id, changes });
      this.draw(got);
      this.hooks.saved();
      return true;
    } catch (err) {
      if (this.note) {
        this.note.hidden = false;
        this.note.textContent = refusalText(err);
      }
      return false;
    }
  }

  async drop() {
    try {
      const got = await this.ctx.core.request('preset.delete', { preset: this.id });
      this.kit.toast(this.t(got?.remains ? 'edit.restored' : 'edit.deleted'));
      this.hooks.removed(!!got?.remains);
    } catch (err) {
      if (this.note) {
        this.note.hidden = false;
        this.note.textContent = refusalText(err);
      }
    }
  }

  focusFirst() {}
}
