// @ts-check
//! 设置页的弹窗（蓝图 `web.md`「设置页」第 1–4、6、9、10、15 条）：框、左边的分页、搜索、右边一页页；核心的配置改一项存一项
//! （`config.set`），别处改了（`config.changed`）重读重画，正在改的那一项不被冲掉。各页怎么画在 `rows.js`、`look.js`、`models.js`。

import { h, icon, replace } from '../../src/lib/dom.js';
import { BackHistory } from './back-history.js';
import { drawMarket, marketPush } from './market.js';
import { accessGroup, avatarGroup, relisten, LISTEN_KEYS } from './account.js';
import { hasPrivate, privateGroup } from './privacy.js';
import { leave } from '../../src/lib/motion.js';
import { keepTypingVisible } from '../../src/lib/touch.js';
import { buildPages, search, pagesWithErrors, LAYER, expectFor, navGroups, pkgMatch, ownerOf, headless, needsRestart } from './model.js';
import { coreRow, groupBlock, banner, toggle } from './rows.js';
import { drawLook } from './look.js';
import { drawPackages } from './packages.js';
import { drawModels } from './models.js';
import { sectionKit } from './kit.js';
import { Extensions } from './extensions.js';
import { PackageFeed } from './packages-feed.js';
import { drawCorePackages, followExtension, openInfo } from './core-packages.js';
import { drawBackstage } from './backstage.js';
import { Subpage, swap } from './subpage.js';
import { ScrollKeeper } from './keep-scroll.js';
import { drawAdvanced } from './advanced.js';
import { drawToolPage, hasToolPage } from './tool-pages.js';
import { EXTERNAL_PREFIX } from './tool-model.js';
import { foldCovered } from '../../src/lib/packages.js';

/** 刚存成的那一项重画出来还画对勾的时限（毫秒） */
const SAVED_MS = 1000;


/** 上次看的那一页：这个终端记着（蓝图第 3 条），刷新就忘 */
let lastPage = 'general';
/** 网页的源码在哪（AGPL 第 13 条）：改了的版本照自己的源码地址换掉这一行 */
const SOURCE_URL = 'https://github.com/miyu-agent/miyu-web';


/** 滚到一组以后多久里跟着内容长高、整页重画再对齐（`reveal`）；人一动就不管了，所以宽一点（W-1097：原来 1.5 秒，慢的机器上读回来更晚） */
const REVEAL_MS = 4000;
/** 人动了就不再替他对齐的那几种事件 */
const HANDS = ['wheel', 'pointerdown', 'keydown', 'touchstart'];


/** 选人格、预设、知识库的项照哪个方法读列表（`pickList`） */
const LIST_METHODS = { persona: 'persona.list', preset: 'preset.list', knowledge: 'kb.list' };
export class SettingsDialog {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.isOpen = false;
    /** 停下「打字的框别被输入法盖住」（`keepTypingVisible`），开着时才有 @type {(() => void)|null} */
    this.unkeep = null;
    /** 重画「通用」页的「主题」一组（`look.js` 画的时候填；主题那几套换了时设置包叫它） @type {(() => void)|null} */
    this.refreshLook = null;
    /** @type {import('./model.js').Page[]} */
    this.pages = [];
    this.schema = null;
    this.got = null;
    this.models = null;
    this.current = lastPage;
    this.query = '';
    /** 别处改了、正在改的那一项有焦点：等焦点走了再重画 */
    this.pending = false;
    this.onKey = this.onKey.bind(this);
    this.onPush = this.onPush.bind(this);
    /** 核心拉起的扩展（「软件包」页）：开着弹窗时订阅它们的状态 */
    this.extensions = new Extensions(this);
    /** 软件包列表的推送（服务起了、停了当场换） */
    this.feed = new PackageFeed(this);
  }

  /** 打开：画框，读配置，到 `page` 那一页（没给的回上次看的）；点名了一组的（`group`）滚到那一组。 @param {string|null} page @param {string|null} [group] */
  async open(page, group = null) {
    /** 包在运行时给的选项（核心 SG-2 的 `choices_from`，`rows.js` 的 `fromPackage`）：每次打开设置重新问 */
    this.packageChoices = new Map();
    this.isOpen = true;
    const cfg = this.ctx.config;
    this.search = h('input.set-search', { type: 'search', placeholder: this.ctx.text('search'), 'aria-label': this.ctx.text('search'), oninput: () => { this.query = this.search.value; this.drawBody(); } });
    this.nav = h('nav.set-nav');
    this.title = h('strong.set-title');
    this.body = h('div.set-body');
    /** 重画以后回到原来滚到的地方（`keep-scroll.js`，W-1153）；`revealing` 是正对着某一组的时候（`reveal`） */
    this.keep = new ScrollKeeper(this.body, (again, drop) => this.watchBody(again, drop));
    this.revealing = false;
    /** 点进去的一层（软件包的设置，`subpage.js`） */
    this.sub = new Subpage();
    this.panel = h('section.set-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': this.ctx.text('title'), style: `--set-w: ${cfg.width}px; --set-h: ${cfg.height}px` },
      // 窄屏的分页列表顶上一行：「设置」和关掉（2026-11-13 主人验 check 7：手机上列表这一层没有关的按钮，回不到对话）
      h('aside.set-side', h('div.set-side-head', h('strong.set-side-title', this.ctx.text('title')),
        h('button.icon-button.set-close', { type: 'button', title: this.ctx.text('close'), 'aria-label': this.ctx.text('close'), onclick: () => this.close() }, icon('x'))),
      h('label.set-search-box', icon('search'), this.search), this.nav),
      h('div.set-main',
        h('header.set-head', h('button.set-back', { type: 'button', onclick: () => this.back() }, icon('chevron-left'), h('span.set-back-text', this.ctx.text('back')), h('span.set-back-sub', this.ctx.text('back_sub'))), this.title,
          h('button.icon-button.set-close', { type: 'button', title: this.ctx.text('close'), 'aria-label': this.ctx.text('close'), onclick: () => this.close() }, icon('x'))),
        this.body));
    // 设置框挡着拖放：拖文件到框上不弹输入框的「拖到这里」（框里自己收文件的那一块照收，`src/host/files.js` 的 `watchDrop`）
    this.root = h('div.set-layer', { dataset: { dropShield: '' } }, h('div.set-scrim', { onclick: () => this.close() }), this.panel);
    this.body.addEventListener('focusout', () => setTimeout(() => this.flush(), 0));
    document.body.append(this.root);
    this.narrow = matchMedia(`(max-width: ${cfg.narrow}px)`);
    // 窄屏：手机的返回键一层层退（`back-history.js`）
    this.backs = this.narrow.matches ? new BackHistory(() => this.backStep()) : null;
    this.backs?.start();
    document.addEventListener('keydown', this.onKey, true);
    // 手机上输入法盖在设置窗上面、窗不跟着缩（`--app-height-rest`）：打字的框被盖住时把它滚出来
    this.unkeep = keepTypingVisible(this.root);
    this.ctx.core.onPush(this.onPush);
    this.current = page ?? lastPage;
    this.body.replaceChildren(h('p.set-empty', this.ctx.text('loading')));
    this.search.focus();
    try {
      await this.load();
    } catch (err) {
      this.body.replaceChildren(h('p.set-empty.is-bad', this.ctx.text('load_failed', { reason: err.message })));
      return;
    }
    this.show(this.current);
    if (group) this.reveal(group);
    // 窄的时候（第 15 条）：没点名哪一页的先列分页
    if (!page && this.narrow.matches) this.root.classList.remove('is-inside');
  }

  /**
   * 滚到这一页里的一组（`data-group`：「访问」，`miyu web --settings access`，W-1085）；这一页没有的不动。上面几组这时还在读（配色的图、
   * 核心的配置），读好了长高会把它挤下去：`REVEAL_MS` 里内容一变高就再对一次，人一动（滚轮、点、按键、触摸）就不再管。
   * 读好了配置、模型、局域网的状态会整页重画（`drawBody`），那一组换成了新的节点：每次对之前照编号重找，重画了照新的那几块再看
   * （W-1097，2026-11-04 Windows 虚拟机上托盘「在手机上打开…」打开的设置停在「访问」上面：局域网的状态读回来重画了一次，原来一直对着换下去的旧节点）。
   * `block` 是对到哪：`start` 顶到最上面（从外面点名来的）；`nearest` 只挪到整组露得出来为止、本来就露着的不动（刚打开局域网，卡片往下展开，W-1153）。
   * @param {string} group @param {'start'|'nearest'} [block]
   */
  reveal(group, block = 'start') {
    const find = () => /** @type {HTMLElement|null} */ (this.body.querySelector(`[data-group="${group}"]`));
    if (!find()) return;
    const pin = () => find()?.scrollIntoView({ block });
    const grown = new ResizeObserver(pin);
    const follow = () => {
      grown.disconnect();
      for (const child of this.body.children) grown.observe(child);
      pin();
    };
    // 整页重画换掉了里面的几块：照新的再看、再对一次（`drawBody` 放回原来滚到的地方以后才轮到它）
    const swapped = new MutationObserver(follow);
    swapped.observe(this.body, { childList: true });
    const quit = () => {
      this.revealing = false;
      clearTimeout(timer);
      grown.disconnect();
      swapped.disconnect();
      for (const type of HANDS) this.body.removeEventListener(type, quit);
    };
    // 正对着这一组的时候，重画以后回到哪由这里管（`drawBody` 不另守滚动位置）
    this.revealing = true;
    this.keep.drop();
    for (const type of HANDS) this.body.addEventListener(type, quit, { passive: true });
    const timer = setTimeout(quit, REVEAL_MS);
    follow();
  }

  /** 关：淡出、拿掉；焦点回到原来的地方。 */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.backs?.stop();
    this.backs = null;
    document.removeEventListener('keydown', this.onKey, true);
    this.unkeep?.();
    this.unkeep = null;
    this.ctx.core.pushes?.delete(this.onPush);
    this.extensions.stop();
    this.feed.stop();
    this.sub.closeAll();
    this.keep?.drop();
    // 记着的 MCP 登录「等待」只在弹窗开着时算（蓝图第 20 条）
    this.mcpLogin = null;
    this.pvOff = null;
    this.accounts = null;
    leave(this.root, () => this.root.remove());
  }

  /** 读核心的配置清单、最终值；模型列表另读（可能慢：核心要去供应商那边拉），读完了模型页跟着重画。 */
  async load() {
    const core = this.ctx.core;
    const [schema, got, packages, skills, scripts] = await Promise.all([
      core.request('config.schema', {}),
      core.request('config.get', { all: true }),
      // 核心的软件包（9-1）：「默认界面」的选项照它列（读不到的旧核心是空的）
      core.request('package.list', {}).then((r) => { this.pkgGroups = Array.isArray(r?.groups) ? r.groups : []; return foldCovered(r?.packages ?? []); }, () => []),
      // 技能、脚本两页（核心 X-26、X-27；没有推送，打开、改了配置时重读）：旧核心没有的是 `null`，不出那一页
      core.request('skill.list', {}).then((r) => (Array.isArray(r?.skills) ? r : null), () => null),
      core.request('script.list', {}).then((r) => (Array.isArray(r?.scripts) ? r : null), () => null),
      // 软件包自己写的图标（清单的 `icon`，F-6 上）照整套图标画
      this.ctx.icons.more()]);
    /** 能直接敲 `miyu` 打开的界面（`kind` 是 `ui`、有命令的包，核心 9-3） */
    this.heads = packages.filter((p) => p.kind === 'ui' && p.command);
    /** 核心认的软件包（「软件包」页上面那一段照它列） */
    this.packages = packages;
    this.skills = skills;
    this.scripts = scripts;
    this.schema = schema;
    this.got = got;
    const cfg = this.ctx.config;
    // 「读取其他目录的 Skills」两项画在技能页顶上（`tool-pages.js`），通用的页不列
    this.pages = buildPages(schema, got, { merge: cfg.merge, moveGroups: cfg.move_groups, hide: [...(cfg.hide_prefixes ?? []), EXTERNAL_PREFIX, ...headless(this.heads)] });
    this.modelsPromise = this.loadModels();
    // 选人格、知识库的列表每次打开重读（`pickList`）
    this.picks = new Map();
    // 扩展、软件包的订阅（连 MCP 的列表）
    await Promise.all([this.extensions.start(), this.feed.start()]);
  }

  /**
   * 选人格、预设、知识库的项要的列表（核心设计 53 第四节，PC-3；预设 W-1096）：第一次要的时候去读，读完了没在改字的重画一次；读着、读不到的交 `null`。
   * @param {'persona'|'preset'|'knowledge'} kind
   */
  pickList(kind) {
    this.picks ??= new Map();
    if (this.picks.has(kind)) return this.picks.get(kind);
    this.picks.set(kind, null);
    this.ctx.core.request(LIST_METHODS[kind], {}).then((got) => {
      this.picks.set(kind, got);
      if (this.isOpen && !this.query && !this.editing()) this.drawBody();
    }, () => {});
    return null;
  }

  /** 读模型列表：读着的时候 `modelsLoading`，读完了在模型页的重画一次（正在改一项的不打断）。 */
  async loadModels() {
    this.modelsLoading = true;
    try {
      this.models = await this.ctx.core.request('model.list', {});
    } catch {
      // 读不到的留着上一次的；第一次就读不到的，模型页写读不到
    } finally {
      this.modelsLoading = false;
      // 模型页、选模型的项（下拉的选项照模型列表）都要：读完了没在改字的重画
      if (this.isOpen && !this.query && !this.editing()) this.drawBody();
    }
  }

  /** 左栏的分页：核心的照 `pages`，网页的「软件包」，挂进 `settings.section` 的；先后照设置项 `order`。主题在通用页最上面，不单开一页。 */
  entries() {
    const order = this.ctx.config.order;
    const named = (id) => this.ctx.text(`pages.${id}`);
    const all = [
      ...this.pages.map((p) => ({ id: p.id, name: p.name })),
      // 核心也有一页「软件包」（9-1 下，一个包一组）：和网页自己的组件合成一页，上面核心、下面网页（2026-10-07 项目主人定）
      ...(this.pages.some((p) => p.id === 'packages') ? [] : [{ id: 'packages', name: named('packages') }]),
      // 下载软件（软件市场，核心 G-3 到 G-5）：「软件包」上面一项（2026-10-21 项目主人）
      { id: 'market', name: named('market') },
      // 软件后台（核心 F-6 中）：带自己页面的软件，点进去是它的页面
      { id: 'backstage', name: named('backstage') },
      // 技能、脚本、MCP（第 20 条，核心 X-26、X-27）：核心有对应方法的才有
      ...(/** @type {const} */ (['skills', 'scripts', 'mcp'])).filter((id) => hasToolPage(this, id)).map((id) => ({ id, name: named(id) })),
      ...this.ctx.slots.list('settings.section').map((s) => ({ id: s.id, name: s.name, section: s })),
    ];
    const rank = (id) => {
      const i = order.indexOf(id);
      return i >= 0 ? i : order.indexOf('advanced') - 0.5;
    };
    return all.sort((a, b) => rank(a.id) - rank(b.id));
  }

  /**
   * 搜索的结果（2026-10-20 项目主人：左上角的搜索不好用——原来只搜配置项、组名只写页名）：先是名字对得上的页（点了去那一页）、软件包（点了进它的信息页），
   * 再是配置项，一组一块，组名写全「页 · 包 · 组」（照 `ownerOf` 认是哪个包的；组名就是包名的不重写）。
   * @param {string} query
   */
  searchResults(query) {
    const t = (/** @type {string} */ key, /** @type {any} */ fields) => this.ctx.text(key, fields);
    const leave = () => { this.query = ''; this.search.value = ''; };
    const jump = (/** @type {string} */ name, /** @type {string} */ sub, /** @type {() => void} */ go) => h('div.set-row.set-pkg.is-expandable', { onclick: go },
      h('div.set-text', h('div.set-name', h('span', name)), sub ? h('p.set-desc', sub) : null), h('span.set-pkg-arrow', icon('chevron-right')));
    const pages = this.entries().filter((e) => pkgMatch(query, e.name, e.id))
      .map((e) => jump(e.name, '', () => { leave(); this.show(e.id); }));
    const packages = (this.packages ?? []).filter((p) => p.status && pkgMatch(query, p.name, p.summary, p.package))
      .map((p) => jump(p.name ?? p.package, p.summary ?? '', () => { leave(); this.show('packages'); openInfo(this, p.package); }));
    const ids = new Set((this.packages ?? []).map((/** @type {any} */ p) => p.package));
    const nameOf = (/** @type {string} */ id) => (this.packages ?? []).find((/** @type {any} */ p) => p.package === id)?.name ?? id;
    /** @type {Map<string, {label: string, items: any[]}>} */
    const groups = new Map();
    for (const f of search(this.pages, query)) {
      const owner = ownerOf(f.item, ids);
      const parts = [f.page.name, owner && nameOf(owner) !== f.group.name ? nameOf(owner) : null, f.group.name !== f.page.name ? f.group.name : null].filter(Boolean);
      const key = `${f.page.id}|${f.group.id}`;
      const g = groups.get(key) ?? { label: parts.join(' · '), items: [] };
      g.items.push(f.item);
      groups.set(key, g);
    }
    const out = [
      pages.length ? groupBlock(t('search_pages'), pages) : null,
      packages.length ? groupBlock(t('search_packages'), packages) : null,
      ...[...groups.values()].map((g) => groupBlock(g.label, g.items.map((item) => coreRow(this, item)))),
    ].filter(Boolean);
    return out.length ? out : [h('p.set-empty', t('no_match', { query: query.trim() }))];
  }

  /** 到某一页：左栏选中它，右边画它；窄的时候点进去。 */
  show(id) {
    if (!this.entries().some((e) => e.id === id)) id = 'general';
    this.current = id;
    lastPage = id;
    this.sub.closeAll();
    this.query = '';
    this.search.value = '';
    this.root.classList.add('is-inside');
    this.drawNav();
    // 换了一页：上一页没回到的那一处不带过来，这一页长高了也不替它往下滚
    this.keep.drop();
    this.turned = true;
    this.drawBody();
  }

  drawNav() {
    const bad = pagesWithErrors(this.pages);
    const icons = this.ctx.config.icons;
    const groupOf = navGroups(this.ctx.config.order, this.ctx.config.nav_groups ?? []);
    let last = -1;
    const items = [];
    for (const e of this.entries()) {
      // 组与组之间一道细线（2026-10-20 项目主人分的四组）；一页都没有的组不画
      const group = groupOf(e.id);
      if (last >= 0 && group !== last) items.push(h('hr.set-nav-rule'));
      last = group;
      items.push(h(`button.set-tab${e.id === this.current && !this.query ? '.is-on' : ''}`, { type: 'button', onclick: () => this.show(e.id) },
        icon(icons[e.id] ?? 'sliders-horizontal'), h('span', e.name), bad.has(e.id) ? h('i.set-dot') : null));
    }
    replace(this.nav, items);
  }

  /**
   * 点进一层（软件包的设置、软件后台页）：滑进去，页头写它的名字、左边返回箭头；`bare` 的（里面的卡片已经写了名字）页头只写「返回」。
   * `child` 的叠在开着的那一层上面，返回一层一层退。
   * @param {string} title @param {() => any} render @param {{keep?: boolean, leave?: () => void, bare?: boolean, child?: boolean}} [opts]
   */
  openSub(title, render, opts) {
    this.sub.open(title, render, this.body.scrollTop, opts);
    this.drawBody('push');
  }

  /** 页头的返回：开着一层的回到列表（滑回来），窄的时候回到分页。 */
  back() {
    if (this.sub.page) this.drawBody('pop', this.sub.close());
    else this.root.classList.remove('is-inside');
  }

  /**
   * 叠在上面的一层（菜单、详情、浮卡，浮卡上又弹了问一句的）先收最上面那层：后挂上的在后面。藏着的表单不算（「访问密码」那一格没
   * 点开时也在页面里：原来它一直占着 `Esc`，「通用」页按 `Esc` 关不掉设置，W-1153）。`Esc`、手机的返回键都先走它。交回收了没有。
   * @returns {boolean}
   */
  dismissTop() {
    const open = [...this.panel.querySelectorAll('.set-menu, .set-drawer, .set-form:not([hidden]), .set-pool.is-editing, [data-set-dismiss]')].at(-1);
    if (!open) return false;
    open.dispatchEvent(new CustomEvent('set-dismiss'));
    return true;
  }

  /**
   * 手机的返回键退一步（`back-history.js`）：点进去的一层先退，再从这一页回分页列表，列表上再按就关掉设置。交回退完还开着没有。
   * @returns {boolean}
   */
  backStep() {
    if (this.dismissTop()) return true;
    if (this.sub.page || (this.narrow.matches && this.root.classList.contains('is-inside'))) {
      this.back();
      return true;
    }
    this.close();
    return false;
  }

  /**
   * 右边：搜着的画结果，不然画这一页（开着一层的画那一层）。`dir` 是进出一层时滑的方向，`restore` 是回来时列表滚到哪。
   * @param {import('./subpage.js').Dir|null} [dir] @param {number|null} [restore]
   */
  drawBody(dir = null, restore = null) {
    // 上一次重画没回到的那一处照旧要回去（`keep-scroll.js`，W-1153）；搜着的、开着一层的不守
    if (this.query.trim() || this.sub.page) this.keep.drop();
    const scroll = this.keep.wanted();
    if (this.query.trim()) this.sub.closeAll();
    this.root.classList.toggle('has-sub', !!this.sub.page);
    this.root.classList.toggle('is-bare-sub', !!this.sub.page?.bare);
    // 模型的详情挂在右边整栏上：换页、搜索时收掉，模型页自己再挂
    this.panel.querySelector('.set-drawer')?.remove();
    if (this.query.trim()) {
      this.title.textContent = this.ctx.text('search');
      this.drawNav();
      replace(this.body, this.searchResults(this.query));
      return;
    }
    if (this.sub.page) {
      this.title.textContent = this.sub.page.bare ? '' : this.sub.page.title;
      // 画过一次就不重画的（软件后台页的框）：别处改了配置、重读完也不动它
      if (this.sub.page.keep && this.sub.page.shown && !dir) return;
      swap(this.body, this.sub.page.render(), dir, dir === 'push' ? 0 : scroll);
      this.sub.page.shown = true;
      return;
    }
    const entry = this.entries().find((e) => e.id === this.current);
    this.title.textContent = entry?.name ?? '';
    const page = this.pages.find((p) => p.id === this.current);
    let kids;
    if (this.current === 'models') kids = drawModels(this);
    else if (this.current === 'backstage') kids = drawBackstage(this);
    else if (this.current === 'market') kids = drawMarket(this);
    // 高级：一组一行，点进去看（`advanced.js`，2026-10-19 项目主人：不平铺）
    else if (this.current === 'advanced' && page) kids = drawAdvanced(this, page);
    // 老核心上的成员：通用页只有主题，下面一句暗字（配置每人一份在核心 Y-2下下中）；成员的软件包页照下面那一条，核心的软件包没读、是空的，只列网页自己的组件
    else if (this.current === 'packages') {
      // 顶上搜索、筛选，核心的软件包一个一行、点进去是它的信息页，最后一段网页自己的组件（`core-packages.js`）
      kids = [
        ...(page?.problems ?? []).map((p) => banner(p)),
        ...drawCorePackages(this, page, drawPackages(this)),
      ];
    }
    else if (this.current === 'skills' || this.current === 'scripts' || this.current === 'mcp') kids = drawToolPage(this, this.current);
    else if (entry?.section) kids = entry.section.render?.(sectionKit(this)) ?? null;
    else if (page) {
      // 通用页最上面是主题卡片（2026-10-10 项目主人：外观页只有主题三个选择，并进通用、放在最上面）。
      // 一组就是一个核心拉起的扩展的（「接入」页的接入QQ，设计 30 第五节）：组名下面先是运行、权限两行，再是它的设置项
      kids = [
        ...page.problems.map((p) => banner(p)),
        this.current === 'general' ? drawLook(this) : null,
        // 用户身份页最上面是头像（第 12d 条，2026-10-30 随「访问」并进通用挪过来）
        this.current === 'user' ? avatarGroup(this) : null,
        ...page.groups.flatMap((g) => (hasPrivate(g.items)
          // 私密目录（隐私与安全页，核心 5-15 下）：两项并成一张表；这一组别的项照通用的行
          ? privateGroup(this, g.name, g.items)
          : this.extensions.entries.has(g.id)
          ? h('section.set-group', h('h3.set-group-name', g.name), g.description ? h('p.set-group-desc', g.description) : null, this.extensions.body(g.id, g.items.map((item) => coreRow(this, item)).filter(Boolean)))
          : groupBlock(g.name, g.items.map((item) => coreRow(this, item)), g.description))),
        // 「访问」一组（第 12c 条，2026-10-30 项目主人：原来单独一页，放进通用）：核心没有「用户身份」页的头像也放这里
        this.current === 'general' ? accessGroup(this, !this.pages.some((p) => p.id === 'user')) : null,
        // 最底下一行源码链接（蓝图「设置」第 12a 条，2026-10-26 许可证换成 AGPL-3.0-or-later：第 13 条要让用网页的人拿得到源码）
        this.current === 'general' ? h('p.set-repo', this.ctx.text('source_line'),
          h('a.set-repo-link', { href: SOURCE_URL, target: '_blank', rel: 'noopener noreferrer' }, this.ctx.text('source_link'))) : null,
      ];
    }
    swap(this.body, kids, dir, restore ?? scroll);
    // 这一页最上面有晚一步才画出来的（主题卡片）：换上去那一刻矮一截、滚不到原来那么低，长高了接着回去。进出一层、正对着某一组
    // （`reveal`，它自己跟着长高对）的不管
    if (dir || this.revealing || this.turned) this.keep.drop();
    else this.keep.restore(restore ?? scroll);
    this.turned = false;
  }

  /**
   * 给 `ScrollKeeper` 看右边那一栏：里面哪一块长高了、换了一批都叫 `again`；人动了（滚轮、点、按键、触摸）、过了 `REVEAL_MS` 叫 `drop`。
   * @param {() => void} again @param {() => void} drop @returns {() => void}
   */
  watchBody(again, drop) {
    const grown = new ResizeObserver(again);
    const follow = () => {
      grown.disconnect();
      for (const child of this.body.children) grown.observe(child);
    };
    follow();
    const swapped = new MutationObserver(follow);
    swapped.observe(this.body, { childList: true });
    for (const type of HANDS) this.body.addEventListener(type, drop, { passive: true });
    const timer = setTimeout(drop, REVEAL_MS);
    return () => {
      clearTimeout(timer);
      grown.disconnect();
      swapped.disconnect();
      for (const type of HANDS) this.body.removeEventListener(type, drop);
    };
  }

  /**
   * 存一项核心的配置（第 6 条）：写在系统配置（`LAYER`，核心 SU-3上起只有这一份），带上这一层读到的 `expect`。
   * @param {import('./model.js').Item} item
   * @param {{value?: any, input?: string, unset?: true}} change
   * @returns {Promise<string|null>} 拒了的原因（给人看的一句）；成了是 `null`
   */
  save(item, change) {
    const layer = LAYER;
    return this.saveMany(layer, [{ key: item.key, ...change, expect: expectFor(item.entry, layer) }]);
  }

  /**
   * 一条 `config.set` 改几项（全收或者全不收）：成了重读重画，拒了交回原因（冲突的先重读，写「别处改过了，现在是 X」）。
   * @param {string} layer
   * @param {{key: string, value?: any, input?: string, unset?: true, expect?: any}[]} changes
   * @returns {Promise<string|null>}
   */
  async saveMany(layer, changes) {
    if (!changes.length) return null;
    this.lastProblems = [];
    /** @type {any} */
    let got = null;
    try {
      got = await this.ctx.core.request('config.set', { layer, changes });
    } catch (err) {
      if (err.reason === 'config_conflict' || err.data?.current) {
        await this.reload();
        const now = err.data?.current && 'value' in err.data.current ? JSON.stringify(err.data.current.value) : this.ctx.text('layers.none');
        return this.ctx.text('conflict', { value: now });
      }
      const problems = err.data?.problems ?? [];
      // 一组字段的列表照问题的键把红字写到那张卡片的那一格（`records.js`）
      this.lastProblems = problems;
      return problems.length ? problems.map((p) => p.message).join('\n') : err.message;
    }
    // 记下刚存成的几项：重画出来的那几行照它画对勾（`rows.js`）
    this.saved = { keys: new Set(changes.map((c) => c.key)), at: performance.now() };
    await this.reload();
    // 监听地址、端口：请网页软件当场换（第 12c 条第 1 款；这一组、「软件包」页都算）
    if (changes.some((c) => LISTEN_KEYS.includes(c.key))) void relisten(this, changes.map((c) => c.key));
    // 要重启核心才生效的（`applies: restart`，核心 CPU-1 的 `core.workers` 头一个）：名字下面照旧不写生效时机，存成了提示一句
    // （2026-11-12 项目主人：「改完弹一句提示」，不然改了以为没反应）
    if (needsRestart(got)) this.toast(this.ctx.text('applies_restart'));
    return null;
  }

  /** 这一项是不是刚存成的（1 秒以内） @param {string} key */
  justSaved(key) {
    return !!this.saved && this.saved.keys.has(key) && performance.now() - this.saved.at < SAVED_MS;
  }

  /** 重读核心的配置、重画；正在改的那一项有焦点的，等焦点走了再画（第 9 条）。 */
  async reload() {
    // 已经收到、还没重读的推送并进这一遍（存完自己重读，核心推来的 `config.changed` 不再另读一遍）
    clearTimeout(this.pushTimer);
    await this.load();
    if (this.editing()) {
      this.pending = true;
      return;
    }
    this.drawNav();
    this.drawBody();
  }

  /** 右边有输入框正有焦点、改了还没存。 */
  editing() {
    const el = /** @type {HTMLElement|null} */ (document.activeElement);
    return !!el && this.body.contains(el) && el.matches('input:not([type=checkbox]), textarea') && el.dataset.dirty === '1';
  }

  /** 焦点走了：攒着的重画补上。 */
  flush() {
    if (!this.pending || this.editing()) return;
    this.pending = false;
    this.drawNav();
    this.drawBody();
  }

  /** 框底下提示一句，停 2 秒（照「提示」）。 */
  toast(text) {
    this.panel.querySelector('.set-toast')?.remove();
    const el = h('div.set-toast', { role: 'status' }, text);
    this.panel.append(el);
    setTimeout(() => leave(el, () => el.remove()), 2000);
  }

  /** 别处改了配置（别的终端、命令行、手改文件）：重读重画；扩展的状态变了只重画那一组。 */
  onPush(method, params) {
    if (!this.isOpen) return;
    // 下载软件页：下载进度、装了卸了（先看一眼，不吃掉）
    marketPush(this, method, params);
    if (this.feed.push(method, params)) return;
    if (this.extensions.push(method, params)) {
      // 扩展开了、停了：软件包列表那一行的状态、开关跟着换
      if (method === 'extension.changed' && followExtension(this, params.entry) && this.current === 'packages' && !this.editing()) this.drawBody();
      return;
    }
    // 模型列表自己变了（核心 V-26）：整份重问，读完了没在改字的重画（`loadModels`）
    if (method === 'models.changed') {
      this.modelsPromise = this.loadModels();
      return;
    }
    if (method !== 'config.changed') return;
    // 一阵改动收齐了再重读
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.reload().catch(() => {});
    }, 80);
  }

  /** `Esc`：先把正在改的字放回原来的，再关框里开着的菜单、详情，再关弹窗；焦点关在框里（`Tab` 不跑到后面）。 */
  onKey(/** @type {KeyboardEvent} */ e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      // 这里在捕获阶段先拿到 `Esc`，框自己听不到：改了没存的框交给它放回（`rows.js` 的 `textField`、`areaField`），弹窗不关
      const typing = /** @type {HTMLElement|null} */ (document.activeElement);
      if (typing && this.panel.contains(typing) && typing.dataset.dirty === '1') {
        typing.dispatchEvent(new CustomEvent('set-revert'));
        return;
      }
      if (this.dismissTop()) return;
      if (this.query) {
        this.query = '';
        this.search.value = '';
        this.drawNav();
        this.drawBody();
        return;
      }
      if (this.sub.page) {
        this.back();
        return;
      }
      this.close();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = [...this.panel.querySelectorAll('button, input, select, [tabindex="0"]')].filter((el) => /** @type {HTMLElement} */ (el).offsetParent);
      if (!focusable.length) return;
      const first = /** @type {HTMLElement} */ (focusable[0]);
      const last = /** @type {HTMLElement} */ (focusable.at(-1));
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}
