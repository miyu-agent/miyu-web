// @ts-check
//! 软件的独立整页（软件包 `backstage`，蓝图 `web.md`「软件的页面」；2026-10-15 项目主人定：不嵌在设置里）：盖满整个窗口，顶上一条窄栏（返回、
//! 软件的图标和名字），下面一个隔离的框占满（`<iframe sandbox="allow-scripts allow-forms" allow="clipboard-write">`，不给
//! `allow-same-origin`：来源是空的，读不到网页的存储、登录令牌；能往剪贴板里写、不能读）。框的地址经宿主请网页服务造票据（`host.pages.open`）。
//! 开着的时候标签页的标题换成软件名（收藏、在别的标签页里认得出），关了换回来。焦点不在框里时 `Esc` 返回。
//! 界面块的整页（网址另带 `widget`，核心 `widgets.md`）不放框：交给软件包 `widgets` 画那一块的内容（服务 `widgets` 的 `page`），顶栏软件名后面接它的标题。

import { h, icon, hasIcon } from '../../src/lib/dom.js';
import { FrameHost } from './frame.js';

export class FullPage {
  /**
   * @param {any} ctx 这个包的上下文（`core`、`host`、`text`）
   * @param {() => void} back 点了返回
   */
  constructor(ctx, back) {
    this.ctx = ctx;
    this.back = back;
    /** @type {HTMLElement|null} */
    this.el = null;
    /** @type {FrameHost|null} */
    this.frame = null;
    /** 开着的界面块整页（软件包 `widgets` 交的；`leave` 是关之前问一句：有改了没存的） @type {{el: HTMLElement, close: () => void, leave?: () => Promise<boolean>, escape?: () => boolean}|null} */
    this.blocks = null;
    /** 开着的是哪一页（`package` 加 `widget`） */
    this.shown = '';
    /** 开界面块整页时软件包 `widgets` 还没起来（直接带着网址打开页面时会这样）：等它起来了重开（`index.js` 听 `service.set`） */
    this.awaitWidgets = false;
    /** 打开前的标题 */
    this.title = '';
    this.onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      // 界面块整页里能改的那一页先管（窄的看详情时回列表）
      if (this.blocks?.escape?.()) return;
      this.leave();
    };
  }

  /**
   * 开一页（开着别的换掉，开着同一页不动：框重新载入会丢掉软件页面里的状态）。
   * @param {{package: string, widget: string|null}} route
   */
  async show(route) {
    const key = `${route.package}/${route.widget ?? ''}`;
    if (this.shown === key) return;
    this.close();
    this.shown = key;
    const t = (/** @type {string} */ path) => this.ctx.text(path);
    const listed = await this.ctx.core.request('package.list', {}).then((r) => r?.packages ?? [], () => []);
    // 软件包自己写的图标不在常用那一套里的：先读整套
    const own = listed.find((/** @type {any} */ x) => x.package === route.package)?.icon;
    if (own && !hasIcon(own)) await Promise.resolve(this.ctx.icons?.more()).catch(() => {});
    if (this.shown !== key) return;
    const p = listed.find((/** @type {any} */ x) => x.package === route.package);
    // 界面块的整页：清单里声明了的、位置是 page 的那一块
    const widget = route.widget ? (p?.widgets ?? []).find((/** @type {any} */ w) => w.id === route.widget && w.place === 'page') : null;
    const name = widget?.title ? `${p?.name ?? route.package} · ${widget.title}` : p?.name ?? route.package;
    const bar = h('header.bs-bar',
      h('button.icon-button.bs-back', { type: 'button', title: t('back'), 'aria-label': t('back'), onclick: () => this.leave() }, icon('arrow-left')),
      h('span.bs-face', icon(p?.icon && hasIcon(p.icon) ? p.icon : 'package')),
      h('span.bs-name', name));
    /** @type {HTMLElement} */
    let body;
    if (route.widget) {
      this.awaitWidgets = !!widget && p?.enabled !== false && !this.ctx.widgets;
      if (widget && p?.enabled !== false && this.ctx.widgets) {
        this.blocks = this.ctx.widgets.page(route.package, route.widget);
        body = /** @type {HTMLElement} */ (this.blocks?.el);
      } else body = h('p.bs-empty', t('gone'));
    } else if (p?.page) {
      // 关着的扩展照样看得到页面（页面是包里的静态文件，同原来嵌在设置里时）；调它的方法核心回「程序未运行」
      // 能往剪贴板里写（2026-10-10 接入QQ 的会话要的：令牌要能随时复制）；读剪贴板不给
      const frame = /** @type {HTMLIFrameElement} */ (h('iframe.bs-frame', { sandbox: 'allow-scripts allow-forms', allow: 'clipboard-write', referrerpolicy: 'no-referrer', title: name }));
      this.frame = new FrameHost(this.ctx.core, t, route.package, frame);
      body = frame;
      Promise.resolve(this.ctx.host.pages?.open(route.package)).then((url) => {
        if (this.shown !== key) return;
        if (url) frame.src = url;
        else frame.replaceWith(h('p.bs-empty', t('failed')));
      });
    } else body = h('p.bs-empty', t('gone'));
    this.el = h('div.bs-page', { role: 'main', 'aria-label': name }, bar, body);
    document.body.append(this.el);
    document.body.classList.add('has-backstage');
    document.addEventListener('keydown', this.onKey);
    this.title = document.title;
    document.title = name;
  }

  /** 点了返回、按了 `Esc`：界面块整页里有改了没存的先问一句（核心 `widgets.md`「整页里能改」第 6 条），放弃了才返回。 */
  async leave() {
    if (this.blocks?.leave && !(await this.blocks.leave())) return;
    this.back();
  }

  /** 关掉：通道收掉、标题换回来。 */
  close() {
    if (!this.shown) return;
    this.shown = '';
    this.frame?.close();
    this.frame = null;
    this.blocks?.close();
    this.blocks = null;
    this.el?.remove();
    this.el = null;
    document.body.classList.remove('has-backstage');
    document.removeEventListener('keydown', this.onKey);
    if (this.title) document.title = this.title;
    this.title = '';
  }
}
