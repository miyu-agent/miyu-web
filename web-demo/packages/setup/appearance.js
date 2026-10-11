// @ts-check
//! 人格的外观那几行（蓝图 `web.md`「主题」的「跟着人格的外观」第 4、6、8 条；核心 P-5 头像、P-6 主题色和背景图）：人格的编辑卡片里
//! 最上面三行，换、删都当场存（只带这一样的 `persona.set`），不等「保存」。图本身就是按钮（2026-10-11 项目主人定，不要一排字的按钮）：
//! - 头像：圆的图（没有的画名字的第一个字），点它换，悬停盖一层写「更换」；有头像的右上角一个小 × 移除。不是正方形的先裁（`crop.js`）。
//! - 主题色：一排方块：「自动」（照头像取的第一名，就是不存；块上铺那个颜色、写 A）、头像取到的前四色（点一下存成这个人格的主色）、
//!   「+」（浏览器的取色器；选的不在那四色里的在「+」前面多画一块）；现在用的那一块上画一个勾。
//! - 背景图：16:9 的小图（没有的是一块底色、写「添加」，点它选图）；有图的悬停盖一层，两个按钮「更换」「焦点」（`focus.js`），右上角一个
//!   小 ×；下面一行「透明度」滑杆，拖的时候整页当场跟着变（`look.preview`），松手存（核心 P-7）。大的先缩小、存成 WebP（存不了的
//!   JPEG，照片存 PNG 太大）。

import { h, icon, replace } from '../../src/lib/dom.js';
import { seedsOf, hexOf, inkOf } from '../../src/lib/md3/index.js';
import { pixelsOf } from '../../src/lib/md3/pixels.js';
import { shrink, store } from './avatars.js';
import { cropAvatar } from './crop.js';
import { chooseFocus } from './focus.js';

/** 核心收头像、背景图的上限（P-5 头像 1 MiB；P-6 背景图 5 MiB，`blob.put` 收图就封在 5 MiB）：缩小以后还超的再压（`avatars.js` 的 `shrink`） */
const AVATAR_BYTES = 1024 * 1024;
const BACKGROUND_BYTES = 5 * 1024 * 1024;
/** 列出头像取到的几种颜色 */
const CANDIDATES = 4;
/** 人格没设透明度时画多少（蓝图第 6 条：盖 80% 的底色） */
const OPACITY_DEFAULT = 20;
/** 头像的地址 → 取到的几种颜色（`#rrggbb`）；同一张取过的不再算 @type {Map<string, Promise<string[]>>} */
const picked = new Map();

/** 头像取到的几种颜色，好的在前。 @param {string} url */
function candidatesOf(url) {
  if (!picked.has(url)) picked.set(url, pixelsOf(url).then((rgba) => (rgba ? seedsOf(rgba, CANDIDATES).map(hexOf) : [])));
  return /** @type {Promise<string[]>} */ (picked.get(url));
}

export class Appearance {
  /**
   * @param {any} ctx @param {import('./form.js').Kit} kit @param {import('./catalog.js').Catalog} catalog @param {string} id
   * @param {{saved: () => void, say: (text: string) => void, name: () => string}} hooks 存了（列表重读）、写一句（出错）、现在的名字（没头像时画第一个字）
   */
  constructor(ctx, kit, catalog, id, hooks) {
    this.ctx = ctx;
    this.kit = kit;
    this.catalog = catalog;
    this.id = id;
    this.hooks = hooks;
    this.t = (/** @type {string} */ key) => ctx.text(key);
    /** `persona.get` 的那三格：头像、背景图的版本，自选的主题色；没有的是 `null` */
    this.avatar = /** @type {string|null} */ (null);
    this.background = /** @type {string|null} */ (null);
    this.seed = /** @type {string|null} */ (null);
    /** 背景图的透明度（0–100）、焦点（`[x, y]`）（核心 P-7）；没设的 `null` */
    this.opacity = /** @type {number|null} */ (null);
    this.focus = /** @type {[number, number]|null} */ (null);
    /** 头像取到的几种颜色：哪张图的、取到的（还没取完是空的） */
    this.candidates = { url: /** @type {string|null} */ (null), colors: /** @type {string[]} */ ([]) };
    // 三行各一格（换了、读到了只重画它，不动写了一半的字）
    this.avatarBox = h('div.setup-avatar-box');
    this.seedBox = h('div.setup-seed-box');
    this.backgroundBox = h('div.setup-bg-box');
  }

  /** 照 `persona.get` 的回应记下。 @param {any} got */
  set(got) {
    this.avatar = got?.avatar ?? null;
    this.background = got?.background ?? null;
    this.seed = got?.seed ?? null;
    this.opacity = got?.background_opacity ?? null;
    this.focus = got?.background_focus ?? null;
  }

  /** 三行都画一遍。 */
  paint() {
    this.paintAvatar();
    this.paintSeed();
    this.paintBackground();
  }

  paintAvatar() {
    const t = this.t;
    const url = this.imageUrl(this.catalog.avatars, this.avatar, () => this.paintAvatar(), this.avatarBox);
    const pick = this.filePicker((file) => this.changeImage('avatar', file));
    this.redraw(this.avatarBox,
      this.picture('avatar', url ? h('img', { src: url, alt: '' }) : h('span.setup-pic-initial', [...this.hooks.name()][0] ?? ''), !!url,
        () => pick.click(), this.avatar ? () => this.setPart('avatar', { unset: true }) : null),
      pick);
  }

  paintSeed() {
    const t = this.t;
    const colors = this.candidatesFor(this.imageUrl(this.catalog.avatars, this.avatar, () => this.paintSeed(), this.seedBox));
    const input = /** @type {HTMLInputElement} */ (h('input.setup-color-input', { type: 'color', value: this.seed ?? colors[0] ?? '#3368c0', tabindex: '-1', 'aria-hidden': 'true' }));
    input.addEventListener('change', () => this.setPart('seed', input.value));
    const open = () => (typeof input.showPicker === 'function' ? input.showPicker() : input.click());
    /** 一块：现在用的画一个勾 @param {string} cls @param {string} title @param {boolean} on @param {string|null} fill @param {any} mark @param {() => void} act */
    const block = (cls, title, on, fill, mark, act) => h(`button.setup-swatch${cls}${on ? '.is-on' : ''}`, {
      type: 'button', title, 'aria-label': title, 'aria-pressed': String(on), onclick: act,
      style: fill ? `background: ${fill}; color: ${inkOf(fill)}` : '',
    }, on ? icon('check') : mark);
    const choose = (/** @type {string} */ hex) => () => (this.seed === hex ? undefined : this.setPart('seed', hex));
    // 自选的不在头像那几种里的：在「+」前面多画一块，点它再选
    const own = this.seed && !colors.includes(this.seed) ? this.seed : null;
    this.redraw(this.seedBox,
      block('.is-auto', t('edit.seed_auto'), !this.seed, colors[0] ?? null, 'A', () => (this.seed ? this.setPart('seed', { unset: true }) : undefined)),
      colors.map((hex) => block('', hex, this.seed === hex, hex, null, choose(hex))),
      own ? block('', own, true, own, null, open) : null,
      block('.is-pick', t('edit.seed_pick'), false, null, icon('plus'), open),
      input);
  }

  paintBackground() {
    const t = this.t;
    const url = this.imageUrl(this.catalog.backgrounds, this.background, () => this.paintBackground(), this.backgroundBox);
    const pick = this.filePicker((file) => this.changeImage('background', file));
    this.redraw(this.backgroundBox,
      this.picture('background', url ? h('img', { src: url, alt: '' }) : h('span.setup-pic-empty', icon('image'), t('edit.add_short')), !!url,
        () => pick.click(), this.background ? () => this.setPart('background', { unset: true }) : null,
        url ? [{ label: t('edit.focus'), act: () => this.pickFocus(url) }] : []),
      url ? this.opacityRow() : null,
      pick);
  }

  /** 「透明度」一行：拖的时候整页当场跟着变，松手存。 */
  opacityRow() {
    const value = this.opacity ?? OPACITY_DEFAULT;
    const shown = h('span.setup-opacity-value', `${value}%`);
    const slider = /** @type {HTMLInputElement} */ (h('input.setup-range', { type: 'range', min: '0', max: '100', step: '1', value: String(value), 'aria-label': this.t('edit.opacity') }));
    slider.addEventListener('input', () => {
      shown.textContent = `${slider.value}%`;
      this.ctx.emit('look.preview', { persona: this.id, opacity: Number(slider.value) });
    });
    slider.addEventListener('change', () => this.setPart('background_opacity', Number(slider.value)));
    return h('div.setup-opacity', h('span.setup-opacity-name', this.t('edit.opacity')), slider, shown);
  }

  /** 选焦点：开窗口，「确定」存、「居中」删掉。 @param {string} url */
  async pickFocus(url) {
    const got = await chooseFocus({
      text: this.t, kit: this.kit, from: this.backgroundBox,
      preview: (focus) => this.ctx.emit('look.preview', focus ? { persona: this.id, focus } : null),
    }, url, this.focus);
    if (got === 'center') await this.setPart('background_focus', { unset: true });
    else if (got) await this.setPart('background_focus', got);
  }

  /**
   * 一张图（头像、背景图）：图本身是按钮，点了换；有图的悬停盖一层写「更换」；`remove` 有的右上角一个小 ×。`actions` 有的（背景图），悬停
   * 那一层里是一排按钮：「更换」和它们。
   * @param {'avatar'|'background'} part @param {Node} inner @param {boolean} shown 有图 @param {() => void} change
   * @param {(() => void)|null} remove @param {Array<{label: string, act: () => void}>} [actions]
   */
  picture(part, inner, shown, change, remove, actions = []) {
    const t = this.t;
    const changeTitle = t(`edit.${part}_change`);
    const removeTitle = t(`edit.${part}_remove`);
    const main = shown && actions.length
      ? h('div.setup-pic-main.has-actions', inner,
        h('span.setup-pic-hover', [{ label: t('edit.change_short'), act: change }, ...actions].map((a) => h('button.setup-pic-action', { type: 'button', onclick: a.act }, a.label))))
      : h('button.setup-pic-main', { type: 'button', title: changeTitle, 'aria-label': changeTitle, onclick: change },
        inner, shown || part === 'avatar' ? h('span.setup-pic-hover', { 'aria-hidden': 'true' }, t('edit.change_short')) : null);
    return h(`div.setup-pic.is-${part}`, main,
      remove ? h('button.setup-pic-remove', { type: 'button', title: removeTitle, 'aria-label': removeTitle, onclick: remove }, icon('x')) : null);
  }

  /**
   * 这张头像取到的几种颜色：取过的交回，没取的去取、取完重画这一行（这一行不在页面上了、头像又换了的不画）。
   * @param {string|null} url
   */
  candidatesFor(url) {
    if (this.candidates.url === url) return this.candidates.colors;
    this.candidates = { url, colors: [] };
    if (url) {
      candidatesOf(url).then((colors) => {
        if (this.candidates.url !== url) return;
        this.candidates.colors = colors;
        if (this.seedBox.isConnected && colors.length) this.paintSeed();
      });
    }
    return [];
  }

  /**
   * 重画一格。焦点在里面的（刚点的按钮换掉了）放到新画的选中的那一个、没有的第一个按钮上：不然焦点掉到页面上，`Esc` 关不了卡片。
   * @param {HTMLElement} box @param {...any} children
   */
  redraw(box, ...children) {
    const had = box.contains(document.activeElement);
    replace(box, ...children);
    if (had) /** @type {HTMLElement|null} */ (box.querySelector('button.is-on') ?? box.querySelector('button'))?.focus({ preventScroll: true });
  }

  /**
   * 一张图的地址：缓存里没有的去取，取到了重画这一格（这一格不在页面上了就不画）。
   * @param {import('./avatars.js').PersonaImages} images @param {string|null} version @param {() => void} repaint @param {HTMLElement} box
   */
  imageUrl(images, version, repaint, box) {
    const url = images.url(this.id, version);
    if (!url && version) {
      const again = () => {
        this.catalog.listeners.delete(again);
        if (box.isConnected) repaint();
      };
      this.catalog.listeners.add(again);
    }
    return url;
  }

  /** 选图的框（藏着，按钮点它）。 @param {(file: File) => void} onPick */
  filePicker(onPick) {
    const pick = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/*', hidden: true }));
    pick.addEventListener('change', () => {
      const file = pick.files?.[0];
      pick.value = '';
      if (file) onPick(file);
    });
    return pick;
  }

  /** 换成选的这张：大的先缩小，传成 blob，再交给核心。 @param {'avatar'|'background'} part @param {File} file */
  async changeImage(part, file) {
    const cfg = this.ctx.config;
    try {
      // 头像不是正方形的先裁；取消了就不换
      const source = part === 'avatar' ? await cropAvatar({ text: this.t, kit: this.kit, from: this.avatarBox }, file) : file;
      if (!source) return;
      const blob = part === 'avatar'
        ? await shrink(source, cfg.avatar_side, { maxBytes: AVATAR_BYTES })
        : await shrink(source, cfg.background_side, { fallback: 'image/jpeg', maxBytes: BACKGROUND_BYTES });
      const hash = await store(this.ctx.core, blob, { chunk: cfg.avatar_chunk_bytes, tries: cfg.avatar_tries }, part);
      await this.setPart(part, { blob: hash });
    } catch (err) {
      this.hooks.say(/** @type {any} */ (err)?.data?.message ?? /** @type {any} */ (err)?.message ?? String(err));
    }
  }

  /**
   * `persona.set` 只带这一样（头像、背景图 `{blob}` 换、`{unset: true}` 删；主题色 `#rrggbb` 设、`{unset: true}` 回到自动；透明度、焦点（P-7）写数、`{unset: true}` 删），存了重读、
   * 重画这三行，叫列表、左上角、对话区跟着换。
   * @param {'avatar'|'background'|'seed'|'background_opacity'|'background_focus'} part @param {any} value
   */
  async setPart(part, value) {
    try {
      await this.ctx.core.request('persona.set', { persona: this.id, [part]: value });
      this.set(await this.ctx.core.request('persona.get', { persona: this.id }));
      this.hooks.say('');
      this.paint();
      this.hooks.saved();
    } catch (err) {
      // 存不了的：整页回到原来的样子（预览收掉）
      this.ctx.emit('look.preview', null);
      this.hooks.say(/** @type {any} */ (err)?.data?.message ?? /** @type {any} */ (err)?.message ?? String(err));
    }
  }
}
