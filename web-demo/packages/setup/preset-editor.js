// @ts-check
//! 预设的详情（蓝图 `web.md`「人格、预设、工作区」第 6 条）：浮起来的卡片里（`float.js`）——名字、功能开关（功能照核心 F-3 下的 `features`：
//! 一个功能一个开关，有几件工具的把工具平铺在下面、一件一个开关——2026-10-09 项目主人：「每一个工具都是一个功能，直接平铺，用组名做分隔线」，
//! 和终端对齐；简单描述一行（2026-10-23 项目主人定预设也要描述，推翻 10-08 的「预设不要说明」）；不带默认人格，人格、预设互不引用）。都是点了当场存（`preset.set` 只带改的那一项，不带 `expect`）：名字回车、离开时存，开关点了就存；功能、工具照核心给的
//! 名字（照连接的语言），没装的写「没安装」。图标（核心 P-5，`preset.icon`，Lucide 的名字）：点开一排先列设置项 `preset_icons` 那些，能搜整套，
//! 「不用图标」删掉这一层写的；选了当场存。删除照核心的 `remove`，同人格。

import { h, icon, replace, hasIcon, iconNames } from '../../src/lib/dom.js';
import { field, askFirst } from './form.js';
import { refusalText } from './persona-editor.js';
import { featureGroups, presetSections, summaryChange } from './model.js';

/** 预设页展开着的块记在浏览器里的名字 */
const OPEN_KEY = 'preset_open';

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
    /** `package.list` 的回应（包名、出厂还是装的、装的时刻、组和组内先后） @type {{packages?: any[], groups?: any[]}} */
    this.packageInfo = {};
    /** 展开着的块（包编号、单个功能的 `f:<编号>`），记在这个浏览器里（2026-10-27 项目主人：默认收起，记住展开过的） @type {Set<string>} */
    this.open = new Set(/** @type {string[]} */ (ctx.storage?.get?.(OPEN_KEY, []) ?? []));
  }

  async load() {
    try {
      // 包名（功能照包分组的组名，核心 ENV-1）：读不到的写编号
      const [got, packages] = await Promise.all([
        this.ctx.core.request('preset.get', { preset: this.id }),
        this.ctx.core.request('package.list', {}).then((/** @type {any} */ r) => r ?? {}, () => ({})),
      ]);
      this.packageInfo = packages;
      this.draw(got);
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
    // 一个包一块：包名是总开关，功能缩进暗字各有开关；只有一个同名功能的只有一行（2026-10-27 项目主人）。组（基础系统）只当段名；
    // 段的先后、块的先后照 `presetSections`（内置的在前，别的按安装先后）；一段里排两列。旧核心分五段，包的功能那一段不写段名
    const titleOf = (/** @type {string|null} */ kind, /** @type {string|null} */ title) => (kind === 'group' ? title
      : kind === 'package' || kind === 'feature' || kind === 'home' ? null : t(`edit.feature_groups.${kind}`));
    const features = h('div.setup-features', presetSections(featureGroups(list), this.packageInfo).map((sec) => {
      const title = titleOf(sec.kind, sec.title);
      return h('section.setup-feature-section', title ? h('div.setup-feature-group', title) : null,
        h('div.setup-feature-cols', sec.blocks.map((b) => this.featureBlock(b, sec.kind === 'home' ? t('edit.feature_groups.home') : b.name))));
    }));
    this.note = h('p.setup-error', { hidden: true });
    const remove = got.remove ? askFirst(this.kit, t(`edit.${got.remove}`), () => t(`edit.${got.remove}_ask`, { name: this.title.textContent || this.id }), () => this.drop()) : null;
    replace(this.body,
      field(t('edit.name'), name),
      field(t('edit.summary'), summary),
      field(t('edit.icon'), this.iconRow(got, label)),
      field(t('edit.features'), list.length ? features : h('p.setup-empty', t('edit.no_features'))),
      this.note,
      remove ? h('div.setup-foot', remove) : null);
  }

  /**
   * 一块：一个包（或「我的」）。有名字、不是只有一个同名功能的，头一行名字和总开关（有一个开着就开着；拨了一次写这几个功能全开、全关），
   * 下面功能缩进、暗字；只有一个同名功能的就是那一行；没有名字的（不归包的那几段）只列功能。
   * @param {{items: any[], single: boolean}} b @param {string|null} name
   */
  featureBlock(b, name) {
    const live = b.items.filter((f) => f.installed !== false);
    if (b.single || !name || !live.length) return h('div.setup-feature-block', b.items.map((f) => this.featureRow(f, false)));
    const on = live.some((f) => f.on);
    const all = this.kit.toggle(on, (next) => {
      const changes = live.filter((f) => !!f.on !== next).map((f) => ({ key: `features.${f.id}`, value: next }));
      return changes.length ? this.set(changes) : true;
    });
    const kids = h('div.setup-feature-kids', b.items.map((f) => this.featureRow(f, true)));
    const count = live.filter((f) => f.on).length;
    return this.fold(`p:${b.items[0]?.package ?? name}`, h('span.setup-feature-name', name), `${count}/${live.length}`, all, kids, 'div.setup-feature-block');
  }

  /**
   * 能展开收起的一块（2026-10-27 项目主人：默认收起、记住展开过的；箭头在右边、悬停才露）：头一行名字、暗字「开了几项」、箭头、开关，
   * 下面是收着的那几行；点头一行（开关以外）展开、收起。
   * @param {string} key 记展开的键 @param {Node} name @param {string} count @param {HTMLElement} toggle @param {HTMLElement} body @param {string} tag 外面那一层
   */
  fold(key, name, count, toggle, body, tag) {
    const opened = () => this.open.has(key);
    const arrow = h('span.setup-fold-arrow', icon(opened() ? 'chevron-down' : 'chevron-right'));
    const head = h('div.setup-feature.is-head', { role: 'button', tabindex: '0', 'aria-expanded': String(opened()) }, name, h('span.setup-fold-count', count), arrow, toggle);
    const el = h(`${tag}.is-fold${opened() ? '.is-open' : ''}`, head, body);
    body.hidden = !opened();
    const flip = () => {
      if (opened()) this.open.delete(key); else this.open.add(key);
      this.ctx.storage?.set?.(OPEN_KEY, [...this.open]);
      body.hidden = !opened();
      el.classList.toggle('is-open', opened());
      head.setAttribute('aria-expanded', String(opened()));
      replace(arrow, icon(opened() ? 'chevron-down' : 'chevron-right'));
    };
    head.addEventListener('click', (e) => { if (!/** @type {Element} */ (e.target).closest('.set-switch, button')) flip(); });
    head.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === head) { e.preventDefault(); flip(); } });
    return el;
  }

  /**
   * 一个功能一行：名字（悬停看说明）、开关；没装的写「没安装」。`kid` 的是包下面的子项（暗字）。有不止一件工具的，工具平铺在下面、缩进一格，一件一个开关（设计 30 第四节：
   * `[tools]` 能在开着的功能里关掉单件）；功能关着时工具暗着、点不了。开关写 `features.<编号>`，单件写 `tools.<工具名>`，编号、工具名不往界面上露。
   * @param {any} f @param {boolean} [kid]
   */
  featureRow(f, kid = false) {
    if (f.installed === false) return h(`div.setup-feature.is-missing${kid ? '.is-kid' : ''}`, h('span.setup-feature-name', f.name ?? f.id), h('span.setup-missing', this.t('edit.not_installed')));
    const name = h('span.setup-feature-name', { title: f.summary ?? null }, f.name ?? f.id);
    const toggle = this.kit.toggle(!!f.on, (on) => this.set([{ key: `features.${f.id}`, value: on }]));
    const tools = f.tools ?? [];
    if (tools.length < 2) return h(`div.setup-feature${kid ? '.is-kid' : ''}`, name, ...this.byMarks(f), toggle);
    const list = h(`div.setup-tools${f.on ? '' : '.is-off'}`, tools.map((tool) => {
      const one = this.kit.toggle(!!tool.on, (on) => this.set([{ key: `tools.${tool.name}`, value: on }]));
      if (!f.on) one.setAttribute('disabled', '');
      return h('div.setup-tool', h('span', tool.label ?? tool.name), one);
    }));
    // 一个功能下面几件工具：同包那一块，能展开收起（功能关着的，工具算没开）
    const on = f.on ? tools.filter((tool) => tool.on).length : 0;
    const el = this.fold(`f:${f.id}`, h('span.setup-feature-name', { title: f.summary ?? null }, f.name ?? f.id, ...this.byMarks(f)), `${on}/${tools.length}`, toggle, list, 'div.setup-feature-fold');
    if (kid) el.firstElementChild?.classList.add('is-kid');
    return el;
  }

  /**
   * 技能、脚本、MCP 服务开不开谁定的（核心 X-27 的 `by`；2026-10-20 项目主人）：`global` 写「跟随全局」；预设里写了的（`preset`）在 `unlisted` 是 `on`
   * 的预设里给一个「跟随全局默认」（删掉预设里写的那一项）；`default` 不写。
   * 包自己的功能不接全局开关，不写。
   * @param {any} f
   */
  byMarks(f) {
    if (!/^(skill|script|mcp)-/.test(f.id ?? '')) return [];
    if (f.by === 'global') return [h('span.setup-feature-by', this.t('edit.by_global'))];
    // 预设里写了的不另标（2026-10-20 项目主人：「预设里定的」没用），只给「跟随全局默认」（同一天改名，原来叫「恢复全局默认」）
    if (f.by !== 'preset' || this.unlisted !== 'on') return [];
    return [h('button.setup-feature-back', { type: 'button', onclick: () => this.set([{ key: `features.${f.id}`, unset: true }]) }, this.t('edit.follow_global'))];
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
