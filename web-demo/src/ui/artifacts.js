// @ts-check
//! 预览工作区（蓝图 `web.md`「预览工作区」，照旧版 `index.html:314-362`、`app.js:5475-6448`、`styles.css:4893-5476`）：
//! 右边一栏，打开时顶替会话概况；放这个会话她 `show` 过的东西（`model/artifacts.js`，核心 D-5），一次看一个。
//!
//! - 头上一行：预览、源码的切换（两样都有才露）；标题按钮（标题、类型，点开是展示过的全部，当前的打勾）；复制、下载、最大化、关；
//! - 按类型画：Markdown 照她的回答那一套；代码上色、带行号；HTML 在沙盒 iframe 里直接跑（`srcdoc`，只给脚本和弹窗，
//!   内容安全策略不许联网，照旧版）；图片滚轮缩放、拖动；PDF 交给浏览器自己的阅读器；文字照原文；
//! - 内容是展示那一刻存下的 blob，经桥的 `/blob` 取；同一个路径再展示（blob 变了）才重取；对话里点那张卡片、灯箱里「在右栏打开」
//!   经 `reveal` 打开它；
//! - 宽度能拖，记在这个浏览器里；来了新的、工作区关着时，开关按钮上一个圆点；窗口够宽时自动打开。
//! - 扩展的界面块放进来时（挂载位 `stage.panel`，软件包 `widgets`；2026-10-15 项目主人定）这一栏顶上两个标签「工作区」「面板」，开关按钮
//!   产物、面板有一样就露；面板那一页露没露告诉 `panelShown`（界面块照它订阅、叫不叫程序干活）。没有界面块的和原来一样。

import { h, icon, replace, setUrl } from './dom.js';
import { show, hide, reduced } from '../lib/motion.js';
import { res, t } from '../util/res.js';
import { shownList, panelList, codeLanguage, undismissed } from '../model/artifacts.js';
import { blobUrl } from '../core/host.js';
import { drawMarkdown } from './render.js';
import { paint } from '../markdown/highlight.js';
import { copy } from '../markdown/build.js';
import { richHooks } from './rich.js';

/** 拖到多宽，记在这台设备上的名字（内核的 `storage` 会带上账号；这个终端的状态） */
const WIDTH = 'artifacts_width';
/** 下拉里删掉的（2026-10-17 项目主人定：只是从右栏拿掉，不删文件、不动正文；按会话记在这个浏览器里）：会话 → 路径 → 删的时候那一次展示的序号 */
const DISMISSED = 'artifacts_dismissed';
/** 删掉的最多记几个会话的（多了扔掉最早记的） */
const DISMISSED_SESSIONS = 200;


/** 开关这一栏时正文那一列淡出、换宽、淡入的：正文、输入框、空会话的首页（套在里面的只动外面那一层） */
const SWAPS = '.chat-scroll > .timeline, .composer-dock, .stage-home';
/** 正文淡掉多久、淡回来多久（毫秒）、从多远挪回来（px）（蓝图「动效」） */
const SWAP_OUT_MS = 90;
const SWAP_IN_MS = 260;
const SWAP_SHIFT = 24;
export class Artifacts {
  /**
   * @param {HTMLElement} shell 整页（`.app-shell`）：开关时换它的类、宽度
   * @param {(text: string, good?: boolean) => void} say 提示（复制了几个字）
   * @param {() => void} changed 开、关以后整页重画（会话概况要让位）
   * @param {import('./rich.js').Ext} ext 软件包接进来的：Markdown 预览里的代码块、图片照它（mermaid、灯箱这类）
   * @param {(shown: boolean) => void} [panelShown] 「面板」那一页露出来、收起来
   */
  constructor(shell, say, changed, ext, panelShown = () => {}) {
    this.ext = ext;
    this.shell = shell;
    this.say = say;
    this.changed = changed;
    this.open = false;
    this.maximized = false;
    this.mode = 'preview';
    /** @type {import('../model/artifacts.js').Shown[]} */
    this.list = [];
    this.current = /** @type {string|null} */ (null);
    /** 每个会话看过的最大序号：比它新的算「来了新的」。 */
    this.seen = new Map();
    this.where = /** @type {import('./rich.js').Where} */ ({ session: null, home: null, cwd: null });
    this.drawn = '';
    /** 当前这一个的原文（复制源码用）；还没取到的是 `null`。 */
    this.text = /** @type {string|null} */ (null);
    this.token = 0;
    this.panelShown = panelShown;
    /** @type {Record<string, Record<string, number>>} 下拉里删掉的：会话 → 路径 → 删的时候那一次展示的序号 */
    this.dismissed = readDismissed(ext.storage?.get(DISMISSED, null));
    /** 最近一次照的条目（删了一样以后照它重算） @type {any[]} */
    this.entries = [];
    /** 开、关、拖完宽度、最大化以后叫（整页看对话那一列够不够宽，不够的收起左栏） */
    this.onLayout = () => {};
    /** 要占右边那一栏时（仪表盘开着的让出来） */
    this.onTakeOver = () => {};
    /** 正文换宽换到第几回（新的一回来了，旧的那一回淡完不再换） */
    this.swapToken = 0;
    /** 看哪一页：`work` 产物、`panel` 界面块 */
    this.tab = 'work';
    /** 面板里挂着几件（`stage.panel`） */
    this.panelItems = 0;
    this.panelOn = false;
    /** 挂载位 `stage.panel` 画进这里（`ui/app.js`） */
    this.panel = h('div.artifact-panel', { hidden: true });
    this.tabWork = h('button.artifact-tab', { type: 'button', onclick: () => this.setTab('work') }, t('artifacts.tab_work'));
    this.tabPanel = h('button.artifact-tab', { type: 'button', onclick: () => this.setTab('panel') }, t('artifacts.tab_panel'));
    this.tabs = h('div.artifact-tabs', { hidden: true }, this.tabWork, this.tabPanel,
      h('button.icon-button.artifact-action', { type: 'button', title: t('artifacts.close'), onclick: () => this.setOpen(false) }, icon('x')));
    this.emptyWork = h('p.artifact-empty', { hidden: true }, t('artifacts.empty'));
    this.headerClose = h('button.icon-button.artifact-action', { type: 'button', title: t('artifacts.close'), onclick: () => this.setOpen(false) }, icon('x'));
    this.toggle = h('button.icon-button.artifact-toggle', { type: 'button', hidden: true, title: t('artifacts.toggle'), onclick: () => this.setOpen(!this.open) }, icon('panel-right'));
    this.previewButton = h('button.artifact-mode', { type: 'button', title: t('artifacts.preview'), onclick: () => this.setMode('preview') }, icon('eye'));
    this.sourceButton = h('button.artifact-mode', { type: 'button', title: t('artifacts.source'), onclick: () => this.setMode('source') }, icon('code-2'));
    this.modes = h('div.artifact-mode-switch', this.previewButton, this.sourceButton);
    this.title = h('strong');
    this.badge = h('small');
    this.menu = h('div.artifact-resource-menu', { role: 'menu', hidden: true });
    this.titleButton = h('button.artifact-title-button', { type: 'button', title: t('artifacts.list'), onclick: () => (this.menu.hidden || this.menu.classList.contains('is-leaving') ? show(this.menu) : hide(this.menu)) },
      this.title, this.badge, icon('chevron-down'));
    this.download = h('a.icon-button.artifact-action', { title: t('artifacts.download'), 'aria-label': t('artifacts.download'), download: '' }, icon('download'));
    this.maxButton = h('button.icon-button.artifact-action', { type: 'button', onclick: () => this.setMaximized(!this.maximized) });
    this.view = h('div.artifact-view');
    this.el = h('aside.artifact-workspace', { hidden: true },
      h('div.artifact-resize-handle', { title: t('artifacts.resize'), onpointerdown: (e) => this.resize(e) }),
      this.tabs,
      this.header = h('header.artifact-header',
        h('div.artifact-leading', this.modes, h('div.artifact-resource-wrap', this.titleButton, this.menu)),
        h('div.artifact-actions',
          h('button.icon-button.artifact-action', { type: 'button', title: t('artifacts.copy'), onclick: () => this.copySource() }, icon('copy')),
          this.download, this.maxButton, this.headerClose)),
      this.view, this.emptyWork, this.panel);
    document.addEventListener('click', (e) => {
      if (!this.menu.hidden && !/** @type {Element} */ (e.target).closest?.('.artifact-resource-wrap')) hide(this.menu);
    });
    this.setWidth(Number(ext.storage?.get(WIDTH, 0)) || res.artifacts.width);
    this.setMaximized(false);
  }

  /**
   * 照这个会话的条目更新：列表、开关按钮、自动打开。
   * @param {any[]} entries 视图里的条目
   * @param {import('./rich.js').Where} where
   */
  update(entries, where) {
    this.where = where;
    this.entries = entries;
    const session = where.session;
    this.list = undismissed(panelList(shownList(entries)), session ? this.dismissed[session] : undefined);
    const newest = this.list[0]?.seq ?? 0;
    const seen = session ? this.seen.get(session) : undefined;
    // 打开会话时已经有的不算新来的
    if (session && seen === undefined) this.seen.set(session, newest);
    const fresh = session != null && seen !== undefined && newest > seen;
    if (fresh && session) {
      this.seen.set(session, newest);
      this.current = this.list[0].path;
      this.tab = 'work';
      // 窗口够宽的自动打开；窄的只在开关按钮上点一个圆点
      if (innerWidth > res.artifacts.auto_open_from) this.setOpen(true);
      else this.toggle.classList.add('has-new');
    }
    if (!this.list.some((a) => a.path === this.current)) this.current = this.list[0]?.path ?? null;
    this.syncChrome();
    if (!this.hasContent() && this.open) this.setOpen(false);
    if (this.open && this.tab === 'work') this.draw();
  }

  /** 打开展示过的那一个（对话里点了它的卡片、灯箱里点了「在右栏打开」）；还没进列表的（条目刚到）记下，进了列表再看它。 @param {string} path */
  reveal(path) {
    this.current = path;
    this.tab = 'work';
    if (this.open) this.draw(true);
    else this.setOpen(true);
  }

  /**
   * 开、关。`swap: false` 的不走换宽动画（右边那一栏换给仪表盘时，它自己在动画里，`side.js`）。
   * @param {boolean} open @param {{swap?: boolean}} [opts]
   */
  setOpen(open, { swap = true } = {}) {
    this.open = open && this.hasContent();
    // 没有产物、只有面板的：开着就看面板
    if (this.open && !this.list.length) this.tab = 'panel';
    // 这一栏在自己的位置上浮现、淡掉（`artifacts.css`）；那一列一下子就是最终的宽，正文淡出、换宽、淡入（蓝图「动效」）
    if (this.open) show(this.el);
    else hide(this.el);
    const was = this.shell.classList.contains('has-artifacts');
    // 换宽的那一下（连左栏自动收起、放回）不过渡宽：挂着不过渡的类换，量一下让它生效，再拿掉
    const apply = () => {
      this.shell.classList.add('is-artifact-swapping');
      // 右边那一栏给仪表盘占着的：一下子让出来（服务 `side`）
      if (this.open) this.onTakeOver();
      this.shell.classList.toggle('has-artifacts', this.open);
      this.onLayout();
      void this.shell.offsetWidth;
      this.shell.classList.remove('is-artifact-swapping');
    };
    if (was !== this.open && swap) this.swapWidth(apply, this.open ? SWAP_SHIFT : -SWAP_SHIFT);
    else apply();
    this.toggle.classList.toggle('is-active', this.open);
    if (this.open) this.toggle.classList.remove('has-new');
    if (!this.open && this.maximized) this.setMaximized(false);
    // 里面的东西等这一栏滑完再画（网页那一种载入、跑起来重，滑到一半时做会顿一下）；关上以前看的那一样没变的不重画，直接露出来
    if (this.open) this.settleAt = performance.now() + (parseFloat(getComputedStyle(this.shell).getPropertyValue('--artifact-in')) * 1000 || 0);
    if (this.open && this.tab === 'work') this.draw();
    this.syncChrome();
    this.changed();
  }

  /**
   * 正文那一列换宽：先很快淡掉，换（`apply`），再从 `dx` 挪回来淡入（字只重排这一次，被淡出淡入盖住）。正在换的接着换；减少动效的直接换。
   * @param {() => void} apply @param {number} dx
   */
  swapWidth(apply, dx) {
    const els = /** @type {HTMLElement[]} */ ([...this.shell.querySelectorAll(SWAPS)]).filter((el, _, all) => !all.some((o) => o !== el && o.contains(el)));
    const token = ++this.swapToken;
    for (const el of els) for (const a of el.getAnimations()) if (a.id === 'swap') a.cancel();
    if (reduced() || !els.length || typeof els[0].animate !== 'function') return apply();
    const out = els.map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { id: 'swap', duration: SWAP_OUT_MS, easing: 'ease-in', fill: 'forwards' }));
    out[0].finished.then(() => {
      if (token !== this.swapToken) return;
      apply();
      for (const a of out) a.cancel();
      const easing = getComputedStyle(this.shell).getPropertyValue('--artifact-ease-in').trim() || 'ease-out';
      for (const el of els) el.animate([{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: 'none' }], { id: 'swap', duration: SWAP_IN_MS, easing });
    }, () => {});
  }

  /** 产物、面板有一样就有东西可看。 */
  hasContent() {
    return this.list.length > 0 || this.panelItems > 0;
  }

  /** 面板里挂了几件（`ui/app.js` 看着 `stage.panel` 叫）：都拿掉了、产物也没有的收起来。 @param {number} n */
  setPanelItems(n) {
    this.panelItems = n;
    this.syncChrome();
    if (!this.hasContent() && this.open) this.setOpen(false);
  }

  /** 换一页。 @param {'work'|'panel'} tab */
  setTab(tab) {
    this.tab = tab;
    this.syncChrome();
    if (tab === 'work' && this.open) this.draw(true);
  }

  /** 照现在的样子露、藏：标签（面板有东西才有）、产物那一套、「暂无产物」、面板；开关按钮；面板那一页露没露告诉外面。 */
  syncChrome() {
    const tabs = this.panelItems > 0;
    if (!tabs) this.tab = 'work';
    const work = this.tab === 'work';
    this.tabs.hidden = !tabs;
    this.tabWork.classList.toggle('is-active', work);
    this.tabPanel.classList.toggle('is-active', !work);
    this.header.hidden = !work || !this.list.length;
    this.headerClose.hidden = tabs;
    this.view.hidden = !work || !this.list.length;
    this.emptyWork.hidden = !(work && tabs && !this.list.length);
    this.panel.hidden = work;
    this.toggle.hidden = !this.hasContent();
    const shown = this.open && !work;
    if (shown !== this.panelOn) {
      this.panelOn = shown;
      this.panelShown(shown);
    }
  }

  setMaximized(on) {
    this.maximized = on;
    this.el.classList.toggle('is-maximized', on);
    replace(this.maxButton, icon(on ? 'minimize-2' : 'maximize-2'));
    this.maxButton.title = t(on ? 'artifacts.restore' : 'artifacts.maximize');
  }

  setMode(mode) {
    this.mode = mode;
    this.draw(true);
  }

  /** 宽度：窗口宽的几成，夹在 `width_min`、`width_max` 之间。 */
  setWidth(ratio) {
    const a = res.artifacts;
    this.ratio = Math.min(a.width_max, Math.max(a.width_min, ratio));
    this.shell.style.setProperty('--artifact-ratio', String(this.ratio));
  }

  /** 拖左边那条改宽度，松手记下来。 */
  resize(/** @type {PointerEvent} */ e) {
    const handle = /** @type {HTMLElement} */ (e.currentTarget);
    handle.setPointerCapture(e.pointerId);
    this.shell.classList.add('is-artifact-resizing');
    const move = (/** @type {PointerEvent} */ m) => this.setWidth((innerWidth - m.clientX) / innerWidth);
    const up = () => {
      handle.removeEventListener('pointermove', move);
      this.shell.classList.remove('is-artifact-resizing');
      this.onLayout();
      this.ext.storage?.set(WIDTH, this.ratio);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up, { once: true });
  }

  /** 画当前这一个；`force` 为假时，同一个文件没改过就不重画。 */
  async draw(force = false) {
    const a = this.list.find((x) => x.path === this.current);
    const session = this.where.session;
    if (!a || !session) return;
    const sig = `${a.path}\n${a.blob}\n${this.mode}`;
    if (!force && sig === this.drawn) return;
    this.drawn = sig;
    const hasPreview = a.kind !== 'code' && a.kind !== 'text';
    const hasSource = a.kind !== 'image' && a.kind !== 'pdf';
    const mode = hasPreview && hasSource ? this.mode : hasPreview ? 'preview' : 'source';
    this.modes.hidden = !(hasPreview && hasSource);
    this.previewButton.classList.toggle('is-active', mode === 'preview');
    this.sourceButton.classList.toggle('is-active', mode === 'source');
    this.title.textContent = a.title ?? a.name;
    this.title.parentElement?.setAttribute('title', a.path);
    this.badge.textContent = t(`artifacts.types.${a.kind}`);
    setUrl(this.download, 'href', blobUrl(a.blob, blobType(a), { download: true, name: a.name }));
    this.drawMenu();
    const token = ++this.token;
    this.text = null;
    // 地址可能要等（直接连网页软件的先换票据）；blob 按内容定，不会变
    const url = await blobUrl(a.blob, blobType(a));
    if (token !== this.token) return;
    if (a.kind === 'image') return replace(this.view, imageStage(url, a.name));
    // PDF 交给浏览器自己的阅读器
    if (a.kind === 'pdf') {
      replace(this.view, h('div.artifact-loading', icon('loader-circle'), t('artifacts.loading')));
      await this.settled();
      if (token !== this.token) return;
      return replace(this.view, h('iframe.artifact-frame.is-pdf', { src: url, title: a.name }));
    }
    replace(this.view, h('div.artifact-loading', icon('loader-circle'), t('artifacts.loading')));
    await this.settled();
    if (token !== this.token) return;
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then((text) => {
        if (token !== this.token) return;
        this.text = text;
        replace(this.view, mode === 'source' ? source(text, a) : preview(a.kind, text, this.where, this.say, this.ext));
      })
      .catch((err) => {
        if (token !== this.token) return;
        // 没取到的下次打开再试
        this.drawn = '';
        replace(this.view, h('div.artifact-failure', icon('circle-alert'), t('artifacts.failed_with', { reason: err.message })));
      });
  }

  /** 等这一栏滑完（刚打开的；减少动效的不等） */
  settled() {
    const wait = (this.settleAt ?? 0) - performance.now();
    return wait > 0 && !reduced() ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
  }

  /** 展示过的全部：当前的打勾，点哪个看哪个；悬停露出右边的 ✕，点了从右栏拿掉这一样。 */
  drawMenu() {
    replace(this.menu, this.list.map((a) => h('div.artifact-resource-row',
      h(`button.artifact-resource-item${a.path === this.current ? '.is-current' : ''}`, {
        type: 'button', role: 'menuitem', title: a.path,
        onclick: () => { this.current = a.path; hide(this.menu); this.draw(true); },
      }, h('span.artifact-resource-name', a.title ?? a.name), h('small', t(`artifacts.types.${a.kind}`)), a.path === this.current ? icon('check') : h('span')),
      h('button.icon-button.artifact-resource-remove', {
        type: 'button', title: t('artifacts.remove'), 'aria-label': t('artifacts.remove_named', { name: a.title ?? a.name }),
        onclick: (/** @type {MouseEvent} */ e) => { e.stopPropagation(); this.dismiss(a.path); },
      }, icon('x')))));
  }

  /**
   * 从右栏拿掉一样（2026-10-17 项目主人定）：不删文件，正文里的缩略图、卡片照旧；按会话记在这个浏览器里，刷新以后还是拿掉的；同一个
   * 路径再展示一次（序号比记下的新）就回来。拿掉的是正在看的，换成最新的那一样；一样都不剩的收起来。
   * @param {string} path
   */
  dismiss(path) {
    const session = this.where.session;
    const item = this.list.find((x) => x.path === path);
    if (!session || !item) return;
    const mine = { ...(this.dismissed[session] ?? {}), [path]: item.seq };
    // 重新放到最后（最近记的），多了扔掉最早记的会话
    const { [session]: _, ...rest } = this.dismissed;
    const all = Object.entries({ ...rest, [session]: mine });
    this.dismissed = Object.fromEntries(all.slice(-DISMISSED_SESSIONS));
    this.ext.storage?.set(DISMISSED, this.dismissed);
    this.list = this.list.filter((x) => x.path !== path);
    if (this.current === path) this.current = this.list[0]?.path ?? null;
    this.syncChrome();
    if (!this.hasContent()) {
      hide(this.menu);
      this.setOpen(false);
      return;
    }
    this.drawMenu();
    if (this.open && this.tab === 'work') this.draw(true);
  }

  /** 复制源码（图片、PDF 复制路径）。 */
  copySource() {
    const a = this.list.find((x) => x.path === this.current);
    if (!a) return;
    copy(a.kind === 'image' || a.kind === 'pdf' ? a.path : this.text ?? '', this.say);
  }
}

/** 记着的删掉的那一份读回来：读不懂的当没有。 @param {any} got @returns {Record<string, Record<string, number>>} */
function readDismissed(got) {
  if (!got || typeof got !== 'object' || Array.isArray(got)) return {};
  return Object.fromEntries(Object.entries(got).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)));
}

/**
 * 取 blob 时写的媒体类型（桥只认 `media.json` 的 `blob_types`）：图片、PDF、音视频照核心认的；字照 `text/plain` 取（页面拿去当字显示，HTML
 * 在沙盒里跑，不在页面的来源里跑）；别的文件照 `application/octet-stream`。
 * @param {import('../model/artifacts.js').Shown} a
 */
export function blobType(a) {
  if (a.kind === 'image' || a.kind === 'pdf') return a.type;
  // 音视频照它的媒体类型取（桥认得的才行，不认得的照别的文件），播放器才能拖进度
  if (a.kind === 'video' || a.kind === 'audio') return res.media?.blob_types?.includes(a.type) ? a.type : 'application/octet-stream';
  if (a.kind === 'file') return 'application/octet-stream';
  return 'text/plain';
}

/** 预览：Markdown 照她的回答那一套；HTML 在沙盒里跑。 */
function preview(kind, text, where, say, ext) {
  if (kind === 'markdown') {
    const body = h('article.markdown-body.artifact-markdown');
    drawMarkdown(body, text, { hooks: richHooks(where, say, ext)('artifact'), say });
    return body;
  }
  // HTML：`srcdoc` 放进沙盒（没有 allow-same-origin，碰不到页面），最前面垫一条不许联网的内容安全策略
  // 内容安全策略照 `artifacts.json` 的 `html_csp`（照旧版 `assets.rs:965-989`，去掉取本站的那几样）
  const doc = `<meta http-equiv="Content-Security-Policy" content="${res.artifacts.html_csp}">${text}`;
  return h('iframe.artifact-frame', { sandbox: 'allow-scripts allow-modals', srcdoc: doc, title: 'artifact' });
}

/** 源码：左边行号，右边上色的代码（照旧版 `app.js:6204-6230`）。HTML、Markdown 的源码照它们自己的写法上色。 */
function source(text, a) {
  const lines = text.split('\n');
  const code = h('code', text);
  const lang = codeLanguage(a.language) ?? (a.kind === 'html' ? 'html' : a.kind === 'markdown' ? 'markdown' : null);
  if (lang) paint(code, lang, text, true);
  return h('div.artifact-source',
    h('div.artifact-line-numbers', { 'aria-hidden': 'true' }, lines.map((_, i) => h('span', String(i + 1)))),
    h('pre.artifact-code', code));
}

/** 图片：滚轮缩放（倍数照 `artifacts.json` 的 `zoom`），放大了能拖（照旧版 `app.js:6017-6063`）。 */
function imageStage(url, name) {
  const img = h('img', { src: url, alt: name, draggable: 'false' });
  const stage = h('div.artifact-image-stage', img);
  let zoom = 1;
  let x = 0;
  let y = 0;
  const apply = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`; };
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const z = res.artifacts.zoom;
    zoom = Math.min(z.max, Math.max(z.min, zoom * (e.deltaY < 0 ? z.in : z.out)));
    if (zoom <= 1) { x = 0; y = 0; }
    apply();
  }, { passive: false });
  stage.addEventListener('pointerdown', (e) => {
    if (zoom <= 1) return;
    const start = { px: e.clientX, py: e.clientY, x, y };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
    const move = (/** @type {PointerEvent} */ m) => { x = start.x + m.clientX - start.px; y = start.y + m.clientY - start.py; apply(); };
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', () => { stage.removeEventListener('pointermove', move); stage.classList.remove('is-dragging'); }, { once: true });
  });
  return stage;
}
