// @ts-check
//! 灯箱（软件包 `lightbox`，蓝图 `web.md`「图片」第 3 条）：对话里的图片、mermaid 图点开放大看。整页糊一层毛玻璃，图在正中浮起一张
//! 圆角卡片（2026-10-17 项目主人定，原来是黑底六成八），下面一排四个按钮：下载、复制图片、在右栏打开（她 `show` 过的图才有）、在新
//! 标签页打开。`Esc`、点外面都关上，焦点回到点开之前的地方；关上时松开 `src`，大图不一直占着内存。
//!
//! 图片照原大，放不下才缩（CSS 的最宽最高）；矢量的图（mermaid 图）放大到放得下的最大，窗口变大小跟着重算。
//! 一次加载一个（没有模块级的状态）：第一次打开时才造节点，`destroy` 拿掉节点和挂的事件。

import { h, icon } from '../../src/lib/dom.js';
import { show, leave } from '../../src/lib/motion.js';

/** @typedef {{url: string, name?: string, workspace?: () => void, vector?: boolean, download?: string}} What 打开什么（`download` 下载用的地址，没给的照 `url`） */

export class Lightbox {
  /** @param {(path: string) => string} t 这个包的字 @param {((png: Blob) => Promise<void>)|undefined} clip 宿主写一张图进剪贴板（没有的「复制图片」照出错） */
  constructor(t, clip) {
    this.t = t;
    this.clip = clip;
    /** @type {{root: HTMLElement, image: HTMLImageElement, copy: HTMLElement, workspace: HTMLElement, external: HTMLAnchorElement, download: HTMLAnchorElement}|null} */
    this.box = null;
    /** @type {Element|null} */
    this.lastFocused = null;
    /** @type {(() => void)|null} */
    this.toWorkspace = null;
    this.vector = false;
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    this.marked = undefined;
    this.fit = () => this.resize();
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      // 在捕获阶段接住，别让它再去清空输入框、打断回答
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.close();
    };
  }

  build() {
    const t = this.t;
    const image = /** @type {HTMLImageElement} */ (h('img.lightbox-image', { decoding: 'async', alt: '' }));
    const copy = action('copy', t('copy'));
    copy.addEventListener('click', () => this.copyImage());
    const workspace = action('panel-right', t('workspace'));
    workspace.addEventListener('click', () => {
      const go = this.toWorkspace;
      this.close();
      go?.();
    });
    const external = /** @type {HTMLAnchorElement} */ (action('external-link', t('external'), 'a'));
    external.target = '_blank';
    external.rel = 'noreferrer noopener';
    const download = /** @type {HTMLAnchorElement} */ (action('download', t('download'), 'a'));
    download.setAttribute('download', '');
    image.addEventListener('load', this.fit);
    addEventListener('resize', this.fit);
    const root = h('div.lightbox', { hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': t('label') },
      h('button.lightbox-scrim', { type: 'button', tabindex: '-1', 'aria-label': t('close'), onclick: () => this.close() }),
      h('div.lightbox-frame', h('div.lightbox-card', image), h('div.lightbox-bar', download, copy, workspace, external)));
    document.body.append(root);
    return { root, image, copy, workspace, external, download };
  }

  /**
   * 矢量的图放大到放得下的最大：宽照灯箱里能用的宽，高照图片的最高（CSS 的 `max-height`），照图的宽高比取小的那个。
   * 图片（不是矢量的）交给 CSS：照原大，放不下才缩。
   */
  resize() {
    const box = this.box;
    if (!box || box.root.hidden) return;
    const image = box.image;
    image.style.width = '';
    image.style.height = '';
    if (!this.vector || !image.naturalWidth || !image.naturalHeight) return;
    const pad = getComputedStyle(box.root);
    const room = box.root.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    const tall = parseFloat(getComputedStyle(image).maxHeight) || box.root.clientHeight;
    const scale = Math.min(room / image.naturalWidth, tall / image.naturalHeight);
    image.style.width = `${Math.floor(image.naturalWidth * scale)}px`;
    image.style.height = `${Math.floor(image.naturalHeight * scale)}px`;
  }

  /**
   * 打开一张图。`workspace` 给了的，下面多一个「在预览工作区打开」；`vector` 是矢量的图，放大到放得下的最大。
   * @param {What} what
   */
  open(what) {
    if (!what.url) return;
    this.box ??= this.build();
    const box = this.box;
    this.toWorkspace = what.workspace ?? null;
    this.vector = !!what.vector;
    box.image.src = what.url;
    box.image.alt = what.name ?? '';
    box.external.href = what.url;
    box.download.href = what.download ?? what.url;
    this.mark(null);
    box.workspace.hidden = !this.toWorkspace;
    this.lastFocused = document.activeElement;
    show(box.root);
    document.body.classList.add('has-lightbox');
    document.addEventListener('keydown', this.onKey, true);
  }

  /**
   * 复制图片：取回图的字节，不是 PNG 的（JPEG、WebP、SVG……）先画到画布上换成 PNG（剪贴板普遍只收 PNG），写进剪贴板；按钮上换成
   * 一个勾、出错的换成叹号，一会儿换回来。
   */
  async copyImage() {
    const box = this.box;
    if (!box?.image.src) return;
    try {
      const got = await fetch(box.image.src).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
      const png = got.type === 'image/png' ? got : await toPng(box.image);
      if (!this.clip) throw new Error('clipboard');
      await this.clip(png);
      this.mark(true);
    } catch (err) {
      console.error(`复制不了图片：${/** @type {Error} */ (err).message}`);
      this.mark(false);
    }
  }

  /** 复制按钮上的记号：成了一个勾、没成一个叹号，1.6 秒后换回来；`null` 是换回来。 @param {boolean|null} ok */
  mark(ok) {
    const box = this.box;
    if (!box) return;
    clearTimeout(this.marked);
    box.copy.replaceChildren(icon(ok == null ? 'copy' : ok ? 'check' : 'circle-alert'));
    box.copy.classList.toggle('is-done', ok === true);
    box.copy.classList.toggle('is-failed', ok === false);
    const label = this.t(ok == null ? 'copy' : ok ? 'copied' : 'copy_failed');
    box.copy.title = label;
    box.copy.setAttribute('aria-label', label);
    if (ok != null) this.marked = setTimeout(() => this.mark(null), 1600);
  }

  /** 关上。 */
  close() {
    const box = this.box;
    if (!box || box.root.hidden || box.root.classList.contains('is-leaving')) return;
    // 遮罩淡出、图缩回去，走完再藏、松开大图（蓝图「动效」）
    leave(box.root, () => {
      box.root.hidden = true;
      box.image.removeAttribute('src');
    });
    this.toWorkspace = null;
    document.body.classList.remove('has-lightbox');
    document.removeEventListener('keydown', this.onKey, true);
    if (this.lastFocused instanceof HTMLElement && document.contains(this.lastFocused)) this.lastFocused.focus();
    this.lastFocused = null;
  }

  /** 停用了：关上，拿掉节点和挂的事件。 */
  destroy() {
    this.close();
    removeEventListener('resize', this.fit);
    this.box?.root.remove();
    this.box = null;
  }
}

/** 图画到画布上，交回 PNG（照图的原大；矢量的照它的大小）。 @param {HTMLImageElement} image @returns {Promise<Blob>} */
function toPng(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error('toBlob'))), 'image/png'));
}

/** 一个图标按钮，或者链接。 */
function action(name, label, tag = 'button') {
  return h(`${tag}.icon-button.lightbox-action`, { type: tag === 'button' ? 'button' : null, title: label, 'aria-label': label }, icon(name));
}
