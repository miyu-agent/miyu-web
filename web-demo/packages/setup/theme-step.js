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
    /** 「配色方案」：照 `theme.palettes` 挂进来的几套一套一块（2026-10-19 项目主人：原来没得选） */
    this.paletteBox = h('div.setup-palettes');
    /** 选着的那一套（网页的设置项 `palette`，空着的是第一套） @type {string} */
    this.palette = '';
    this.body = h('div');
    /** 有没有「跟随人格」这一套（停用了 `theme-persona` 的没有，不画配色） */
    this.persona = false;
    this.scheme = 'auto';
    this.look = new Appearance(ctx, kit, catalog, id, {
      saved: () => this.refresh(),
      say: (text) => this.say(text),
      name: () => this.label(),
    });
  }

  /** 读这个人格的外观、网页的主题设置；主题还是默认的先换成「跟随人格」（配色才看得到）。 */
  async load() {
    await this.catalog.load();
    try {
      this.look.set(await this.ctx.core.request('persona.get', { persona: this.id }));
    } catch (err) {
      this.say(/** @type {any} */ (err)?.message ?? String(err));
    }
    const theme = await this.ctx.packages.settings('theme').catch(() => null);
    this.scheme = theme?.values?.scheme ?? 'auto';
    this.persona = this.ctx.slots.list('theme.palettes').some((/** @type {any} */ p) => p.id === PERSONA_PALETTE);
    if (this.persona && !theme?.values?.palette) await this.ctx.packages.set('theme', { config: { palette: PERSONA_PALETTE } }).catch(() => {});
    const list = this.ctx.slots.list('theme.palettes');
    const want = this.persona && !theme?.values?.palette ? PERSONA_PALETTE : theme?.values?.palette;
    this.palette = list.some((/** @type {any} */ p) => p.id === want) ? want : list[0]?.id ?? '';
    this.relook();
  }

  /** 这一屏。 */
  screen() {
    const t = this.t;
    this.look.paint();
    this.paintScheme();
    this.paintPalettes();
    const body = h('div.setup-editor.is-welcome',
      // 小窗口：缩小的对话页，照真的主题画，换了当场跟着变（2026-10-19 项目主人：引导页自己是像素的那一套，换了看不到效果）
      h('div.wl-preview', { 'aria-hidden': 'true' },
        h('div.wl-preview-side', h('i'), h('i'), h('i')),
        h('div.wl-preview-chat', h('i.me'), h('i.ai'), h('i.ai'), h('i.ai.short'), h('i.box'), h('i.send'))),
      field(t('edit.avatar'), this.look.avatarBox),
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

  /** 「配色方案」：一套一块（上面一小块照这一套的颜色画的样子，下面名字），点了当场换；换到、换走跟随头像时「主色」那一行跟着出、收。 */
  paintPalettes() {
    const list = this.ctx.slots.list('theme.palettes');
    const scheme = this.scheme === 'light' || this.scheme === 'dark' ? this.scheme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    replace(this.paletteBox, list.map((/** @type {any} */ p) => {
      const colors = (typeof p.render === 'function' ? p.render(scheme) : null)?.page ?? {};
      return h(`button.setup-palette${p.id === this.palette ? '.is-on' : ''}`, { type: 'button', 'aria-pressed': String(p.id === this.palette), onclick: () => this.pickPalette(p.id) },
        h('span.setup-palette-sample', { style: { background: colors.surface ?? '' } },
          h('i', { style: { background: colors.accent ?? '' } }), h('i', { style: { background: colors.text ?? '', opacity: '0.55' } }), h('i', { style: { background: colors.gold ?? colors.accent ?? '' } })),
        h('span.setup-palette-name', String(p.name ?? p.id)));
    }));
  }

  /** 「主色」那一行：跟随人格的是这个人格的那一排（头像取的、能自选）；别的照那一套给的候选色（跟随壁纸照壁纸取的）；没有候选的（默认）不画。 */
  mainColor() {
    const t = this.t;
    if (this.persona && this.palette === PERSONA_PALETTE) return field(t('welcome.colors'), this.look.seedBox);
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
    // 先记下摆着的那张：screen() 会把几格挪进新的一张、换掉 this.body
    const old = this.body;
    old.replaceWith(this.screen().body);
    this.relook();
  }

  /** 外观存了一样：重读人格列表（头像、配色的版本），整页照新的样子画。 */
  async refresh() {
    await this.catalog.load();
    this.relook();
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
