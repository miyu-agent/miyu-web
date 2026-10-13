// @ts-check
//! 第一次引导里「主题」那一屏（蓝图 `web.md`「第一次引导」第 8 条下面一款；2026-10-13 项目主人：引导里定明暗和配色，当场看到效果，
//! 配色照头像生成），经服务 `personas` 交给软件包 `welcome`。人格那一步存好的人格是默认人格，空会话的样子照它算：
//! - 头像、配色：同设置页人格卡片的外观那两行（`appearance.js`），换了当场存；
//! - 明暗：网页的设置项 `scheme`（软件包 `theme`），当场换。
//! 每存一样重读人格列表，整页照这个人格新的样子画（发 `look.changed`，软件包 `theme-persona` 照它变）。「下一步」不存别的。

import { h, replace } from '../../src/lib/dom.js';
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
    this.relook();
  }

  /** 这一屏。 */
  screen() {
    const t = this.t;
    this.look.paint();
    this.paintScheme();
    const body = h('div.setup-editor.is-welcome',
      field(t('edit.avatar'), this.look.avatarBox),
      field(t('welcome.scheme'), this.schemeBox),
      this.persona ? field(t('welcome.colors'), this.look.seedBox) : null,
      this.note);
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
      await this.ctx.packages.set('theme', { config: { scheme: v } }).catch((/** @type {any} */ err) => this.say(err?.message ?? String(err)));
    }));
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
