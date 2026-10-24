// @ts-check
//! 第一次引导里人格、预设那两屏（蓝图 `web.md`「第一次引导」第 8、9 条），经服务 `personas` 交给软件包 `welcome`：
//! - 人格：和设置页的人格详情一样几格（头像、背景图、名称、说明、人设、示范对话、角色扮演提示），名称必填；「下一步」一条 `persona.set`
//!   新建（不写编号，头像、背景图一起），再设成默认人格。默认人格已经指着一个在的人格（中途关了重来）：读它填好，只存改了的。
//! - 预设：一个预设一张卡片，写开了、关了哪些功能；最后一张「自定义」原地展开名称和功能开关。「下一步」设成默认预设（自定义的先建）。
//! 每一屏交 `{title, sub, body, next: {ready, run}, focus}`，上一步、下一步的按钮由引导画；`run` 交回出错的字，成了是 `null`。

import { h, icon, replace } from '../../src/lib/dom.js';
import { floatCard } from './float.js';
import { field, area } from './form.js';
import { Pairs } from './pairs.js';
import { personaSave, halfPair, personaName, presetName } from './model.js';
import { shrink, store } from './avatars.js';
import { refusalText } from './persona-editor.js';

/**
 * @typedef {{ready: () => void, mascot?: {hop: () => void}|null}} Host 主按钮能不能点变了；吉祥物（有的话）
 * @typedef {import('./model.js').PersonaDraft} PersonaDraft
 */

/** 新建时的「之前」：都是空的（`personaSave` 照它算出全部要写的） @returns {PersonaDraft} */
const blank = () => ({ name: '', summary: '', persona: '', reminders: '', pairs: [], versions: { persona: null, reminders: null, examples: null } });

export class PersonaStep {
  /**
   * @param {any} ctx `setup` 包的 ctx @param {import('./form.js').Kit} kit @param {import('./catalog.js').Catalog} catalog @param {Host} host
   */
  constructor(ctx, kit, catalog, host) {
    this.ctx = ctx;
    this.kit = kit;
    this.catalog = catalog;
    this.host = host;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    /** 改的是哪个人格（中途关了重来的那一个），新建的是 `null` */
    this.id = /** @type {string|null} */ (null);
    /** 名称空着、点了「跳过」：引导不记这一步 */
    this.skipped = false;
    /** @type {PersonaDraft} */
    this.before = blank();
    /** 选了还没存的头像：blob 的哈希、预览的地址 */
    this.avatar = /** @type {{hash: string, url: string}|null} */ (null);
    /** 改的那个人格原来的头像版本 */
    this.version = /** @type {string|null} */ (null);
    /** 选了还没存的背景图（2026-10-13 项目主人：引导里也要能设）；原来的背景图版本；去掉了原来的那张 */
    this.background = /** @type {{hash: string, url: string}|null} */ (null);
    this.bgVersion = /** @type {string|null} */ (null);
    this.bgDropped = false;
    this.avatarBox = h('div.setup-avatar-box');
    this.backgroundBox = h('div.setup-bg-box');
    this.note = h('p.setup-error', { hidden: true });
  }

  /** 默认人格指着一个在的人格的，读它（改它，不再建一个）。 */
  async load() {
    await this.catalog.load();
    const id = this.catalog.personaDefault;
    if (!id || !this.catalog.personas?.some((p) => p.persona === id && !p.problem)) return;
    const read = (/** @type {string} */ prompt) => this.ctx.core.request('persona.read', { persona: id, prompt });
    try {
      const [got, persona, reminders, examples] = await Promise.all([this.ctx.core.request('persona.get', { persona: id }), read('persona'), read('reminders'), read('examples')]);
      this.id = id;
      this.version = got?.avatar ?? null;
      this.bgVersion = got?.background ?? null;
      this.before = {
        name: typeof got?.name === 'string' ? got.name : '',
        summary: typeof got?.summary === 'string' ? got.summary : '',
        persona: persona?.text ?? '',
        reminders: reminders?.text ?? '',
        pairs: Array.isArray(examples?.pairs) ? examples.pairs : [],
        versions: { persona: persona?.version ?? null, reminders: reminders?.version ?? null, examples: examples?.version ?? null },
      };
    } catch {
      // 读不到的当没有，新建一个
    }
  }

  /** 这一屏。 */
  screen() {
    const t = this.t;
    const d = this.before;
    this.name = this.kit.field(d.name, t('welcome.name_hint'));
    this.summary = this.kit.field(d.summary, t('edit.summary_hint'));
    this.persona = area(d.persona, t('edit.persona_hint'), 4);
    this.reminders = area(d.reminders, t('edit.reminders_hint'), 2);
    const them = () => this.name?.value.trim() || t('edit.them');
    this.pairs = new Pairs(d.pairs, { you: t('edit.you'), them, add: t('edit.add_pair'), drop: t('edit.drop_pair'), userHint: t('edit.user_hint'), replyHint: t('edit.reply_hint') }, () => this.say(''));
    this.name.addEventListener('input', () => {
      this.pairs?.rename(them());
      this.paintAvatar();
      this.host.ready();
    });
    this.paintAvatar();
    this.paintBackground();
    const body = h('div.setup-editor.is-welcome',
      field(t('edit.avatar'), this.avatarBox),
      field(t('edit.background'), this.backgroundBox),
      field(t('edit.name'), this.name),
      field(t('edit.summary'), this.summary),
      field(t('edit.persona'), this.persona),
      field(t('edit.examples'), this.pairs.el),
      field(t('edit.reminders'), this.reminders),
      this.note);
    return {
      title: t(this.id ? 'welcome.persona_edit' : 'welcome.persona_title'),
      sub: t('welcome.persona_sub'),
      body,
      // 新建的、名称空着：主按钮写「跳过」，点了不存、不设默认人格（2026-10-19 项目主人：没填的能跳过）
      next: {
        label: () => (this.blank() ? t('welcome.skip') : undefined),
        ready: () => this.blank() || !!this.name?.value.trim(),
        run: async () => {
          this.skipped = this.blank();
          return this.skipped ? null : this.save();
        },
      },
      focus: this.name,
    };
  }

  /** 还没存过人格、名称也空着：这一步能跳过。 */
  blank() {
    return !this.id && !this.name?.value.trim();
  }

  /** 头像那一格：圆的图（还没选的画名字的第一个字），「选择图片」。 */
  paintAvatar() {
    const name = this.name?.value.trim() || this.before.name;
    const url = this.avatar?.url ?? (this.id ? this.catalog.avatars.url(this.id, this.version) : null);
    const pick = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/*', hidden: true }));
    pick.addEventListener('change', () => {
      const file = pick.files?.[0];
      pick.value = '';
      if (file) this.choose(file);
    });
    replace(this.avatarBox,
      h('span.setup-face.is-persona.is-big', { 'aria-hidden': 'true' }, url ? h('img', { src: url, alt: '' }) : [...name][0] ?? ''),
      this.kit.button(this.t(url ? 'edit.avatar_change' : 'welcome.avatar_pick'), {}, () => pick.click()),
      pick);
  }

  /** 背景图那一格：16:9 的小图（没有的一块底色写「添加」），点它选图；有图的右上角一个小 × 去掉（同设置页人格卡片的外观那一行）。 */
  paintBackground() {
    const t = this.t;
    const url = this.background?.url ?? (this.id && !this.bgDropped ? this.catalog.backgrounds.url(this.id, this.bgVersion) : null);
    const pick = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/*', hidden: true }));
    pick.addEventListener('change', () => {
      const file = pick.files?.[0];
      pick.value = '';
      if (file) this.chooseBackground(file);
    });
    const title = t(url ? 'edit.background_change' : 'edit.background');
    const drop = () => {
      if (this.background) URL.revokeObjectURL(this.background.url);
      this.background = null;
      this.bgDropped = !!this.bgVersion;
      this.paintBackground();
    };
    replace(this.backgroundBox,
      h('div.setup-pic.is-background',
        h('button.setup-pic-main', { type: 'button', title, 'aria-label': title, onclick: () => pick.click() },
          url ? h('img', { src: url, alt: '' }) : h('span.setup-pic-empty', icon('image'), t('edit.add_short')),
          url ? h('span.setup-pic-hover', { 'aria-hidden': 'true' }, t('edit.change_short')) : null),
        url ? h('button.setup-pic-remove', { type: 'button', title: t('edit.background_remove'), 'aria-label': t('edit.background_remove'), onclick: drop }, icon('x')) : null),
      pick);
  }

  /** 选了一张背景图：缩小（存成 WebP，存不了的 JPEG）、传成 blob，存的时候一起交。 @param {File} file */
  async chooseBackground(file) {
    const cfg = this.ctx.config;
    try {
      const blob = await shrink(file, cfg.background_side, { fallback: 'image/jpeg', maxBytes: 5 * 1024 * 1024 });
      const hash = await store(this.ctx.core, blob, { chunk: cfg.avatar_chunk_bytes, tries: cfg.avatar_tries }, 'background');
      if (this.background) URL.revokeObjectURL(this.background.url);
      this.background = { hash, url: URL.createObjectURL(blob) };
      this.say('');
      this.paintBackground();
    } catch (err) {
      this.say(refusalText(err));
    }
  }

  /** 选了一张：缩小、传成 blob，存的时候一起交。 @param {File} file */
  async choose(file) {
    const cfg = this.ctx.config;
    try {
      const blob = await shrink(file, cfg.avatar_side, { maxBytes: 1024 * 1024 });
      const hash = await store(this.ctx.core, blob, { chunk: cfg.avatar_chunk_bytes, tries: cfg.avatar_tries });
      if (this.avatar) URL.revokeObjectURL(this.avatar.url);
      this.avatar = { hash, url: URL.createObjectURL(blob) };
      this.say('');
      this.paintAvatar();
    } catch (err) {
      this.say(refusalText(err));
    }
  }

  /** @param {string} text */
  say(text) {
    this.note.hidden = !text;
    this.note.textContent = text;
  }

  /** 存：新建或者改，再设成默认人格。 */
  async save() {
    const t = this.t;
    const pairs = this.pairs?.value() ?? [];
    const half = halfPair(pairs);
    if (half >= 0) {
      this.pairs?.mark(half);
      return t('edit.half_pair', { n: half + 1 });
    }
    const now = { ...this.before, name: this.name?.value ?? '', summary: this.summary?.value ?? '', persona: this.persona?.value ?? '', reminders: this.reminders?.value ?? '', pairs };
    const payload = personaSave(this.before, now) ?? {};
    const avatar = this.avatar ? { avatar: { blob: this.avatar.hash } } : {};
    const background = this.background ? { background: { blob: this.background.hash } } : this.bgDropped ? { background: { unset: true } } : {};
    try {
      let id = this.id;
      if (!id || Object.keys(payload).length || this.avatar || Object.keys(background).length) {
        const got = await this.ctx.core.request('persona.set', { ...(id ? { persona: id } : {}), ...payload, ...avatar, ...background });
        id = id ?? got?.persona ?? null;
      }
      if (!id) return t('welcome.save_failed');
      // 老核心上的成员写不了配置（Y-2下下上）：不设成默认，引导走完新会话照它开
      if (!this.ctx.host?.configless && this.catalog.personaDefault !== id) await this.ctx.core.request('config.set', { layer: 'personal', changes: [{ key: 'persona.default', value: id }] });
      this.id = id;
      this.before = now;
      this.avatar = null;
      this.background = null;
      this.bgDropped = false;
      this.host.mascot?.hop();
      await this.catalog.load();
      return null;
    } catch (err) {
      return refusalText(err);
    }
  }

  /** 存好了的人格叫什么（完成那一屏写）。 */
  label() {
    const p = this.catalog.personas?.find((x) => x.persona === this.id);
    return p ? personaName(p) : this.name?.value.trim() ?? '';
  }
}

export class PresetStep {
  /**
   * @param {any} ctx @param {import('./form.js').Kit} kit @param {import('./catalog.js').Catalog} catalog @param {Host} host
   */
  constructor(ctx, kit, catalog, host) {
    this.ctx = ctx;
    this.kit = kit;
    this.catalog = catalog;
    this.host = host;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    /** 每个预设开了哪些功能（`preset.get` 的 `features`，没装的不列） @type {Map<string, any[]>} */
    this.features = new Map();
    /** 选了哪一张：预设的编号，或者 `custom` */
    this.chosen = 'full';
    /** 自定义：名字、每个功能开不开 */
    this.customOn = /** @type {Map<string, boolean>} */ (new Map());
    /** 装了的全部功能（自定义那一块列的） @type {any[]} */
    this.all = [];
    this.id = /** @type {string|null} */ (null);
  }

  async load() {
    await this.catalog.load();
    const list = (this.catalog.presets ?? []).filter((p) => !p.problem);
    const got = await Promise.all(list.map((p) => this.ctx.core.request('preset.get', { preset: p.preset }).catch(() => null)));
    list.forEach((p, i) => this.features.set(p.preset, (got[i]?.features ?? []).filter((/** @type {any} */ f) => f.installed !== false)));
    const def = this.catalog.presetDefault;
    this.chosen = def && this.features.has(def) ? def : this.features.has('full') ? 'full' : list[0]?.preset ?? 'custom';
    // 自定义先照全部开着
    const all = [...this.features.values()].reduce((a, f) => (f.length > a.length ? f : a), /** @type {any[]} */ ([]));
    this.customOn = new Map(all.map((f) => [f.id, true]));
    this.all = all;
  }

  /**
   * 选预设那一屏（2026-10-23 项目主人：卡片只写名字和描述，功能的开关点「查看功能」浮出来看；自定义点了浮出来改，关得上）：一张卡片
   * 一个预设，名字、简单描述（软换行），右下「查看功能」；最后一张「自定义」，选了以后写起的名字和开着几项。
   */
  screen() {
    const t = this.t;
    const box = h('div.setup-choices.is-compact');
    this.customName = this.kit.field('', t('welcome.name_hint'));
    this.customName.addEventListener('input', () => this.host.ready());
    const draw = () => {
      const cards = (this.catalog.presets ?? []).filter((p) => this.features.has(p.preset)).map((p) => {
        const on = this.chosen === p.preset;
        return h(`button.setup-choice${on ? '.is-on' : ''}`, { type: 'button', onclick: () => { this.chosen = p.preset; draw(); this.host.ready(); } },
          h('span.setup-choice-name', presetName(p)),
          // 简单描述（2026-10-23 项目主人定预设也要描述）：没有的不写
          p.summary ? h('span.setup-choice-hint', p.summary) : null,
          h('span.setup-choice-more', { role: 'button', tabindex: '0',
            onclick: (/** @type {Event} */ e) => { e.stopPropagation(); this.showFeatures(box, presetName(p), this.features.get(p.preset) ?? []); },
            onkeydown: (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.showFeatures(box, presetName(p), this.features.get(p.preset) ?? []); } },
          }, t('welcome.preset_features')),
          on ? h('span.setup-choice-check', '✓') : null);
      });
      const custom = this.chosen === 'custom';
      const named = this.customName?.value.trim() ?? '';
      const onCount = [...this.customOn.values()].filter(Boolean).length;
      const head = h(`button.setup-choice${custom ? '.is-on' : ''}`, { type: 'button', onclick: () => this.editCustom(box, draw) },
        h('span.setup-choice-name', custom && named ? `${t('welcome.custom')} · ${named}` : t('welcome.custom')),
        h('span.setup-choice-hint', custom ? t('welcome.custom_on', { n: onCount }) : t('welcome.custom_hint')),
        custom ? h('span.setup-choice-check', '✓') : null);
      replace(box, cards, head);
    };
    this.redraw = draw;
    draw();
    return {
      title: t('welcome.preset_title'),
      sub: t('welcome.preset_sub'),
      body: box,
      next: { ready: () => this.chosen !== 'custom' || !!this.customName?.value.trim(), run: () => this.save() },
      focus: /** @type {HTMLElement|null} */ (box.querySelector('.setup-choice.is-on')),
    };
  }

  /** 一个预设开了哪些功能：浮出来一张卡片，一项一行，开着的 ✓、关着的 — 暗着；只看不改。 @param {HTMLElement} from @param {string} name @param {any[]} list */
  showFeatures(from, name, list) {
    const t = this.t;
    const rows = h('div.setup-feature-list', (this.all ?? []).map((f) => {
      const on = list.find((x) => x.id === f.id)?.on ?? false;
      return h(`div.setup-feature-item${on ? '' : '.is-off'}`, { title: f.summary ?? null }, h('span.setup-feature-mark', on ? '✓' : '—'), h('span', f.name ?? f.id));
    }));
    const card = floatCard({ title: name, body: rows, close: t('welcome.close'), onDismiss: () => { off(); card.close(); } });
    const off = this.escCloses(() => { off(); card.close(); });
    card.mount(from);
  }

  /** 自定义：浮出来改名字、一项一项开关，「完成」收起、选上它；名字空着的「完成」灰着。 @param {HTMLElement} from @param {() => void} draw */
  editCustom(from, draw) {
    const t = this.t;
    const name = /** @type {HTMLInputElement} */ (this.customName);
    const done = /** @type {HTMLButtonElement} */ (h('button.setup-float-done.wl-btn.is-primary', { type: 'button', disabled: !name.value.trim(), onclick: () => finish() }, t('welcome.custom_done')));
    const sync = () => { done.disabled = !name.value.trim(); };
    name.addEventListener('input', sync);
    const body = h('div.setup-choice-open',
      field(t('edit.name'), name),
      h('div.setup-features', (this.all ?? []).map((f) => h('div.setup-feature', h('span.setup-feature-name', { title: f.summary ?? null }, f.name ?? f.id),
        this.kit.toggle(this.customOn.get(f.id) !== false, (v) => { this.customOn.set(f.id, v); return true; })))),
      h('div.setup-float-foot', done));
    const close = () => { off(); name.removeEventListener('input', sync); card.close(); };
    const finish = () => {
      if (!name.value.trim()) return;
      this.chosen = 'custom';
      close();
      draw();
      this.host.ready();
    };
    const card = floatCard({ title: t('welcome.custom'), body, close: t('welcome.close'), onDismiss: () => { close(); draw(); } });
    const off = this.escCloses(() => { close(); draw(); });
    card.mount(from);
    queueMicrotask(() => name.focus());
  }

  /** 浮着的卡片开着时 `Esc` 先收它（引导自己的 `Esc` 不往下走）；交回拿掉的函数。 @param {() => void} run */
  escCloses(run) {
    const key = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      run();
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }

  /** 存：自定义的先建；和现在的默认不一样的设成默认预设。 */
  async save() {
    try {
      let id = this.chosen;
      if (id === 'custom') {
        const changes = [{ key: 'preset.name', value: this.customName?.value.trim() }];
        for (const [f, on] of this.customOn) if (!on) changes.push({ key: `features.${f}`, value: false });
        const got = await this.ctx.core.request('preset.set', { changes });
        id = got?.preset;
        if (!id) return this.t('welcome.save_failed');
        // 建好了：回到这一屏时它是一张卡片，不再建一个
        this.features.set(id, (got.features ?? []).filter((/** @type {any} */ f) => f.installed !== false));
        this.chosen = id;
      }
      if (this.catalog.presetDefault !== id) await this.ctx.core.request('config.set', { layer: 'personal', changes: [{ key: 'preset.default', value: id }] });
      this.id = id;
      await this.catalog.load();
      return null;
    } catch (err) {
      return refusalText(err);
    }
  }

  /** 选的预设叫什么（完成那一屏写）。 */
  label() {
    const p = this.catalog.presets?.find((x) => x.preset === this.id);
    return p ? presetName(p) : this.id ?? '';
  }
}
