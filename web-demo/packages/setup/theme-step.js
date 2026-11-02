// @ts-check
//! 第一次引导里「主题」那一屏（蓝图 `web.md`「第一次引导」第 8 条下面一款；2026-10-13 项目主人：引导里定明暗和配色，当场看到效果，
//! 配色照头像生成），经服务 `personas` 交给软件包 `welcome`。人格那一步存好的人格是默认人格，空会话的样子照它算：
//! - 头像、配色：同设置页人格卡片的外观那两行（`appearance.js`），换了当场存；
//! - 明暗：网页的设置项 `scheme`（软件包 `theme`），当场换。
//! 每存一样重读人格列表，整页照这个人格新的样子画（发 `look.changed`，软件包 `theme-persona` 照它变）。「下一步」不存别的。

import { h, replace, icon } from '../../src/lib/dom.js';
import { field } from './form.js';
import { Appearance } from './appearance.js';
import { personaName } from './model.js';

/** 「跟随人格」那一套主题的编号（软件包 `theme-persona` 挂进 `theme.palettes` 的） */
const PERSONA_PALETTE = 'persona';
/** 「自动」那一套（软件包 `theme-auto`，出厂）：这一刻借跟随人格或跟随壁纸，`source()` 交借的是哪一套 */
const AUTO_PALETTE = 'auto';

export class ThemeStep {
  /**
   * @param {any} ctx `setup` 包的 ctx @param {import('./form.js').Kit} kit @param {import('./catalog.js').Catalog} catalog
   * @param {import('./welcome.js').Host} host @param {string} id 人格那一步存好的人格 @param {() => void} relook 整页照这个人格的样子画
   */
  constructor(ctx, kit, catalog, host, id, relook) {
    this.ctx = ctx;
    this.kit = kit;
    this.catalog = catalog;
    this.host = host;
    this.id = id;
    this.relook = relook;
    this.t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
    this.note = h('p.setup-error', { hidden: true });
    this.schemeBox = h('div');
    /** 「主题」（皮肤）：2026-10-23 项目主人要的，这一屏叫「配置外观」，主题也放进来；没有皮肤包的不出 */
    this.skinBox = h('div');
    this.skinRow = /** @type {HTMLElement|null} */ (null);
    this.skin = '';
    /** 「配色方案」：照 `theme.palettes` 挂进来的几套一套一块（2026-10-19 项目主人：原来没得选） */
    this.paletteBox = h('div.setup-palettes');
    /** 选着的那一套（网页的设置项 `palette`，空着的是第一套） @type {string} */
    this.palette = '';
    this.body = h('div');
    /** 有没有「跟随人格」这一套（停用了 `theme-persona` 的没有，不画配色） */
    this.persona = false;
    this.scheme = 'auto';
    /** 「主色」那一行画的时候「自动」借的是哪一套（换了头像、主色以后借的变了才整张重画） @type {string|null} */
    this.shownSource = null;
    this.look = new Appearance(ctx, kit, catalog, id, {
      saved: () => this.refresh(),
      say: (text) => this.say(text),
      name: () => this.label(),
    });
  }

  /** 读这个人格的外观、网页的主题设置；没选过配色方案的停在出厂的那一套（自动），不写设置项。 */
  async load() {
    await this.catalog.load();
    try {
      this.look.set(await this.ctx.core.request('persona.get', { persona: this.id }));
    } catch (err) {
      this.say(/** @type {any} */ (err)?.message ?? String(err));
    }
    const skin = await this.ctx.packages.settings('skin').catch(() => null);
    this.skin = skin?.values?.pack ?? '';
    const theme = await this.ctx.packages.settings('theme').catch(() => null);
    this.scheme = theme?.values?.scheme ?? 'auto';
    this.persona = this.ctx.slots.list('theme.palettes').some((/** @type {any} */ p) => p.id === PERSONA_PALETTE);
    const list = this.ctx.slots.list('theme.palettes');
    const has = (/** @type {string|undefined} */ id) => !!id && list.some((/** @type {any} */ p) => p.id === id && !p.hidden);
    const want = [theme?.values?.palette, theme?.values?.default_palette].find(has);
    this.palette = want ?? list.find((/** @type {any} */ p) => !p.hidden)?.id ?? '';
    this.relook();
  }

  /** 这一屏。 */
  screen() {
    const t = this.t;
    this.look.paint();
    this.paintScheme();
    this.paintPalettes();
    const skinPick = this.paintSkin();
    const body = h('div.setup-editor.is-welcome',
      // 小窗口：缩小的对话页，照真的主题画，换了当场跟着变（2026-10-19 项目主人：引导页自己是像素的那一套，换了看不到效果）
      h('div.wl-preview', { 'aria-hidden': 'true' },
        h('div.wl-preview-side', h('i'), h('i'), h('i')),
        h('div.wl-preview-chat', h('i.me'), h('i.ai'), h('i.ai'), h('i.ai.short'), h('i.box'), h('i.send'))),
      field(t('edit.avatar'), this.look.avatarBox),
      skinPick ? field(t('welcome.skin'), this.skinBox) : null,
      field(t('welcome.scheme'), this.schemeBox),
      field(t('welcome.palette'), this.paletteBox),
      // 「主色」：照主色生成的那几套都有（跟随人格照头像取、能自选；跟随壁纸照壁纸取；2026-10-19 项目主人：原来叫「配色」，md3 配色的时候都出现）
      this.mainColor(),
      this.note);
    this.body = body;
    return {
      title: t('welcome.theme_title'),
      sub: t('welcome.theme_sub'),
      body,
      next: { ready: () => true, run: async () => null },
      focus: null,
    };
  }

  /** 「主题」：出厂，再照 `skin.packs` 一套一项（同设置页「外观」的「主题」那一行），选了当场换；没有皮肤包的交回假的、不出这一行。 */
  paintSkin() {
    const packs = this.ctx.slots.list('skin.packs').length ? (this.ctx.skin?.list?.() ?? []) : [];
    if (!packs.length) return false;
    const options = [{ value: '', name: this.t('welcome.skin_factory') }, ...packs.map((/** @type {any} */ p) => ({ value: p.id, name: p.name }))];
    const chosen = packs.some((/** @type {any} */ p) => p.id === this.skin) ? this.skin : '';
    replace(this.skinBox, this.kit.select(options, chosen, async (/** @type {string} */ v) => {
      this.skin = v;
      this.paintSkin();
      await this.ctx.packages.set('skin', { config: { pack: v } }).catch((/** @type {any} */ err) => this.say(err?.message ?? String(err)));
    }));
    return true;
  }

  /** 「明暗」：跟随系统、浅色、深色，选了当场写进网页的设置。 */
  paintScheme() {
    const t = this.t;
    const options = ['auto', 'light', 'dark'].map((value) => ({ value, name: t(`welcome.scheme_${value}`) }));
    replace(this.schemeBox, this.kit.select(options, this.scheme, async (/** @type {string} */ v) => {
      this.scheme = v;
      this.paintScheme();
      this.paintPalettes();
      await this.ctx.packages.set('theme', { config: { scheme: v } }).catch((/** @type {any} */ err) => this.say(err?.message ?? String(err)));
    }));
  }

  /**
   * 「配色方案」：一套一块（上面一小块照这一套的颜色画的样子，下面名字），点了当场换；换到、换走跟随头像时「主色」那一行跟着出、收。
   * 出哪几块照服务 `theme` 的 `choices()`（默认不出、人格没颜色的没有跟随人格，2026-11-02 项目主人），没有主题服务的照挂着的、去掉 hidden 的。
   */
  paintPalettes() {
    const list = this.ctx.theme?.choices?.() ?? this.ctx.slots.list('theme.palettes').filter((/** @type {any} */ p) => !p.hidden);
    const scheme = this.scheme === 'light' || this.scheme === 'dark' ? this.scheme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    replace(this.paletteBox, list.map((/** @type {any} */ p) => {
      const colors = (typeof p.render === 'function' ? p.render(scheme) : null)?.page ?? {};
      return h(`button.setup-palette${p.id === this.palette ? '.is-on' : ''}`, { type: 'button', 'aria-pressed': String(p.id === this.palette), onclick: () => this.pickPalette(p.id) },
        h('span.setup-palette-sample', { style: { background: colors.surface ?? '' } },
          h('i', { style: { background: colors.accent ?? '' } }), h('i', { style: { background: colors.text ?? '', opacity: '0.55' } }), h('i', { style: { background: colors.gold ?? colors.accent ?? '' } })),
        h('span.setup-palette-name', String(p.name ?? p.id)));
    }));
  }

  /** 「自动」这一刻借的是哪一套（`theme-auto` 的 `source()`）；选的不是自动的就是选的那一套。 */
  source() {
    if (this.palette !== AUTO_PALETTE) return this.palette;
    const auto = this.ctx.slots.list('theme.palettes').find((/** @type {any} */ p) => p.id === AUTO_PALETTE);
    return typeof auto?.source === 'function' ? auto.source() : null;
  }

  /**
   * 「主色」那一行：跟随人格的（选着自动、这时借的是跟随人格的也算）是这个人格的那一排（头像取的、能自选）；别的照那一套给的候选色（跟随壁纸
   * 照壁纸取的，自动借壁纸的交的是壁纸的）；没有候选的（默认、自动什么都借不到）不画。
   */
  mainColor() {
    const t = this.t;
    this.shownSource = this.source();
    if (this.persona && this.shownSource === PERSONA_PALETTE) return field(t('welcome.colors'), this.look.seedBox);
    const palette = this.ctx.slots.list('theme.palettes').find((/** @type {any} */ p) => p.id === this.palette);
    const seeds = typeof palette?.seeds === 'function' ? palette.seeds() : null;
    if (!seeds?.colors?.length) return null;
    const box = h('div.setup-seed-box');
    const paint = () => replace(box, seeds.colors.map((/** @type {string} */ hex) => h(`button.setup-swatch${hex === seeds.current ? '.is-on' : ''}`, {
      type: 'button', title: hex, 'aria-label': hex, 'aria-pressed': String(hex === seeds.current), style: { background: hex },
      onclick: async () => {
        if (hex === seeds.current) return;
        await Promise.resolve(seeds.pick(hex)).catch((/** @type {any} */ err) => this.say(err?.message ?? String(err)));
        seeds.current = hex;
        paint();
      },
    }, hex === seeds.current ? icon('check') : null)));
    paint();
    return field(t('welcome.colors'), box);
  }

  /** 换一套配色方案：写网页的设置项 `palette`，整页当场换。 @param {string} id */
  async pickPalette(id) {
    if (id === this.palette) return;
    this.palette = id;
    await this.ctx.packages.set('theme', { config: { palette: id } }).catch((/** @type {any} */ err) => this.say(err?.message ?? String(err)));
    // 「主色」那一行跟着出、收：整张表重画
    this.redraw();
    this.relook();
  }

  /**
   * 外观存了一样：重读人格列表（头像、配色的版本），整页照新的样子画。人格的颜色变了，配色卡片的小样跟着重画；选着自动、借的那一套变了
   * （头一回有了头像，从壁纸换成人格）的「主色」那一行也换：整张表重画。
   */
  async refresh() {
    await this.catalog.load();
    this.relook();
    if (this.source() !== this.shownSource) this.redraw();
    else this.paintPalettes();
  }

  /** 整张表重画（「主色」那一行跟着出、收、换）：先记下摆着的那张，screen() 会把几格挪进新的一张、换掉 this.body。 */
  redraw() {
    const old = this.body;
    old.replaceWith(this.screen().body);
  }

  /** @param {string} text */
  say(text) {
    this.note.hidden = !text;
    this.note.textContent = text;
  }

  /** 人格叫什么（没头像时画第一个字）。 */
  label() {
    const p = this.catalog.personas?.find((x) => x.persona === this.id);
    return p ? personaName(p) : this.id;
  }
}
