// @ts-check
//! 设置页的弹窗（蓝图 `web.md`「设置页」第 1–4、6、9、10、15 条）：框、左边的分页、搜索、右边一页页；核心的配置改一项存一项
//! （`config.set`），别处改了（`config.changed`）重读重画，正在改的那一项不被冲掉。各页怎么画在 `rows.js`、`look.js`、`models.js`。

import { h, icon, replace } from '../../src/lib/dom.js';
import { drawMarket, marketPush } from './market.js';
import { drawAccount } from './account.js';
import { hasPrivate, privateGroup } from './privacy.js';
import { leave } from '../../src/lib/motion.js';
import { buildPages, search, pagesWithErrors, layerOf, expectFor, navGroups, pkgMatch, ownerOf } from './model.js';
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
import { drawAdvanced } from './advanced.js';
import { drawToolPage, hasToolPage } from './tool-pages.js';

/** 刚存成的那一项重画出来还画对勾的时限（毫秒） */
const SAVED_MS = 1000;


/** 上次看的那一页：这个终端记着（蓝图第 3 条），刷新就忘 */
let lastPage = 'general';

export class SettingsDialog {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.isOpen = false;
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

  /** 打开：画框，读配置，到 `page` 那一页（没给的回上次看的）。 */
  async open(page) {
    this.isOpen = true;
    const cfg = this.ctx.config;
    this.search = h('input.set-search', { type: 'search', placeholder: this.ctx.text('search'), 'aria-label': this.ctx.text('search'), oninput: () => { this.query = this.search.value; this.drawBody(); } });
    this.nav = h('nav.set-nav');
    this.title = h('strong.set-title');
    this.body = h('div.set-body');
    /** 管理员模式开着：右边最上面一条淡橙色的窄条（蓝图「管理员模式」第 2 条） */
    this.adminBar = h('div.set-admin-bar', { role: 'status', hidden: !this.ctx.admin?.on }, this.ctx.text('admin_mode.bar'));
    /** 点进去的一层（软件包的设置，`subpage.js`） */
    this.sub = new Subpage();
    this.panel = h('section.set-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': this.ctx.text('title'), style: `--set-w: ${cfg.width}px; --set-h: ${cfg.height}px` },
      h('aside.set-side', h('label.set-search-box', icon('search'), this.search), this.nav),
      h('div.set-main',
        h('header.set-head', h('button.set-back', { type: 'button', onclick: () => this.back() }, icon('chevron-left'), h('span.set-back-text', this.ctx.text('back')), h('span.set-back-sub', this.ctx.text('back_sub'))), this.title,
          h('button.icon-button.set-close', { type: 'button', title: this.ctx.text('close'), 'aria-label': this.ctx.text('close'), onclick: () => this.close() }, icon('x'))),
        this.adminBar,
        this.body));
    // 设置框挡着拖放：拖文件到框上不弹输入框的「拖到这里」（框里自己收文件的那一块照收，`src/host/files.js` 的 `watchDrop`）
    this.root = h('div.set-layer', { dataset: { dropShield: '' } }, h('div.set-scrim', { onclick: () => this.close() }), this.panel);
    this.body.addEventListener('focusout', () => setTimeout(() => this.flush(), 0));
    document.body.append(this.root);
    this.narrow = matchMedia(`(max-width: ${cfg.narrow}px)`);
    document.addEventListener('keydown', this.onKey, true);
    this.ctx.core.onPush(this.onPush);
    // 管理员模式开、关：窄条、左栏的开关、锁着的地方跟着重画
    this.offAdmin = this.ctx.admin?.onChange((/** @type {boolean} */ on) => {
      if (!this.isOpen) return;
      this.adminBar.hidden = !on;
      this.drawNav();
      this.drawBody();
    }) ?? null;
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
    // 窄的时候（第 15 条）：没点名哪一页的先列分页
    if (!page && this.narrow.matches) this.root.classList.remove('is-inside');
  }

  /** 关：淡出、拿掉；焦点回到原来的地方。 */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.removeEventListener('keydown', this.onKey, true);
    this.ctx.core.pushes?.delete(this.onPush);
    this.offAdmin?.();
    this.offAdmin = null;
    this.extensions.stop();
    this.feed.stop();
    this.sub.close();
    // 记着的 MCP 登录「等待」只在弹窗开着时算（蓝图第 20 条）
    this.mcpLogin = null;
    this.pvOff = null;
    this.accounts = null;
    leave(this.root, () => this.root.remove());
  }

  /** 读核心的配置清单、最终值；模型列表另读（可能慢：核心要去供应商那边拉），读完了模型页跟着重画。 */
  async load() {
    const core = this.ctx.core;
    // 成员调不了软件包；老核心上的成员（Y-2下下上）配置清单、模型列表也调不了，不问；左栏只留成员用得上的几页（`entries`，蓝图「连核心」第 1 条「成员」那一款）
    const member = !!this.ctx.host?.member;
    const configless = !!this.ctx.host?.configless;
    const [schema, got, packages, skills, scripts] = await Promise.all([
      configless ? { pages: [], groups: [], items: [] } : core.request('config.schema', {}),
      configless ? { items: {} } : core.request('config.get', { all: true }),
      // 核心的软件包（9-1）：「默认界面」的选项照它列（读不到的旧核心是空的）
      member ? [] : core.request('package.list', {}).then((r) => r?.packages ?? [], () => []),
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
    // 成员只写得了个人设置：只能写在系统那一层的项不露
    this.pages = buildPages(schema, got, { merge: cfg.merge, moveGroups: cfg.move_groups, hide: cfg.hide_prefixes, personal: member });
    if (!configless) this.modelsPromise = this.loadModels();
    // 设了的密钥是哪一份（`secret.list` 的 `layer`，核心 Y-2下下中中）：「已设置」后面标出来；老核心上的成员调不了
    /** @type {Map<string, string|null>} */
    this.secretLayers = new Map();
    if (!configless) await core.request('secret.list', {})
      .then((r) => { this.secretLayers = new Map((r?.secrets ?? []).map((/** @type {any} */ s) => [s.name, s.layer ?? null])); }, () => {});
    // 扩展、软件包的订阅（连 MCP 的列表）成员调不了
    if (!member) await Promise.all([this.extensions.start(), this.feed.start()]);
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
      // 账号（核心 Y-1 上，第 12c 条）：「用户身份」上面一项（2026-10-22 项目主人）；核心有成员这一套才有
      ...(this.ctx.host?.account ? [{ id: 'account', name: named('account') }] : []),
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
    // 成员：下载软件、软件后台、MCP 是整台机器的，不露；没有核心的配置页的（老核心上的成员），主题单开一页「通用」
    const member = !!this.ctx.host?.member;
    const kept = member ? all.filter((e) => !['market', 'backstage', 'mcp'].includes(e.id)) : all;
    const mine = member && !kept.some((e) => e.id === 'general') ? [{ id: 'general', name: named('general') }, ...kept] : kept;
    return mine.sort((a, b) => rank(a.id) - rank(b.id));
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
    this.sub.close();
    this.query = '';
    this.search.value = '';
    this.root.classList.add('is-inside');
    this.drawNav();
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
    // 最下面一行「管理员模式」的开关：只有握手 `admin: true` 的人有（蓝图「管理员模式」第 2 条）
    if (this.ctx.admin?.available) {
      items.push(h('hr.set-nav-rule'), h('div.set-admin-row', h('span', this.ctx.text('admin_mode.label')),
        toggle(!!this.ctx.admin.on, async (/** @type {boolean} */ on) => { this.ctx.admin.set(on); return true; })));
    }
    replace(this.nav, items);
  }

  /** 平时锁着系统那一层（管理员、没开管理员模式）：锁着的地方照它灰着、写「在管理员模式里改」 */
  get adminLocked() {
    return !!this.ctx.admin?.locked;
  }

  /** 锁着的那一处写的一行：暗字「在管理员模式里改」，后面一个文字按钮「进入管理员模式」（蓝图「管理员模式」第 4 条）；`inline` 的放进别的一行字里 @param {boolean} [inline] */
  lockLine(inline = false) {
    return h(inline ? 'span.set-locked' : 'p.set-locked', h('span', this.ctx.text('admin_mode.locked')),
      h('button.set-link', { type: 'button', onclick: () => this.ctx.admin?.set(true) }, this.ctx.text('admin_mode.enter')));
  }

  /** 核心说要先进管理员模式（没锁住的地方）：提示一句，后面「进入管理员模式」，多停一会儿 */
  adminPrompt() {
    this.panel.querySelector('.set-toast')?.remove();
    const el = h('div.set-toast.is-action', { role: 'status' }, h('span', this.ctx.text('admin_mode.required')),
      h('button.set-link', { type: 'button', onclick: () => { this.ctx.admin?.set(true); leave(el, () => el.remove()); } }, this.ctx.text('admin_mode.enter')));
    this.panel.append(el);
    setTimeout(() => { if (el.isConnected) leave(el, () => el.remove()); }, 6000);
  }

  /**
   * 点进一层（软件包的设置、软件后台页）：滑进去，页头写它的名字、左边返回箭头；`bare` 的（里面的卡片已经写了名字）页头只写「返回」。
   * @param {string} title @param {() => any} render @param {{keep?: boolean, leave?: () => void, bare?: boolean}} [opts]
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
   * 右边：搜着的画结果，不然画这一页（开着一层的画那一层）。`dir` 是进出一层时滑的方向，`restore` 是回来时列表滚到哪。
   * @param {import('./subpage.js').Dir|null} [dir] @param {number|null} [restore]
   */
  drawBody(dir = null, restore = null) {
    const scroll = this.body.scrollTop;
    if (this.query.trim()) this.sub.close();
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
    else if (this.current === 'account') kids = drawAccount(this);
    // 高级：一组一行，点进去看（`advanced.js`，2026-10-19 项目主人：不平铺）
    else if (this.current === 'advanced' && page) kids = drawAdvanced(this, page);
    // 老核心上的成员：通用页只有主题，下面一句暗字（配置每人一份在核心 Y-2下下中）；成员的软件包页照下面那一条，核心的软件包没读、是空的，只列网页自己的组件
    else if (this.current === 'general' && !page && this.ctx.host?.member) kids = [drawLook(this), h('p.set-empty', this.ctx.text('member_note'))];
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
        ...page.groups.flatMap((g) => (hasPrivate(g.items)
          // 私密目录（隐私与安全页，核心 5-15 下）：两项并成一张表；这一组别的项照通用的行
          ? privateGroup(this, g.name, g.items)
          : this.extensions.entries.has(g.id)
          ? h('section.set-group', h('h3.set-group-name', g.name), this.extensions.body(g.id, g.items.map((item) => coreRow(this, item)).filter(Boolean)))
          : groupBlock(g.name, g.items.map((item) => coreRow(this, item))))),
      ];
    }
    swap(this.body, kids, dir, restore ?? scroll);
  }

  /**
   * 存一项核心的配置（第 6 条）：写在哪一层照 `layerOf`（管理员模式里能写系统的写系统），带上这一层读到的 `expect`。
   * @param {import('./model.js').Item} item
   * @param {{value?: any, input?: string, unset?: true}} change
   * @returns {Promise<string|null>} 拒了的原因（给人看的一句）；成了是 `null`
   */
  save(item, change) {
    const layer = layerOf(item, !!this.ctx.admin?.on);
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
    try {
      await this.ctx.core.request('config.set', { layer, changes });
    } catch (err) {
      if (err.reason === 'config_conflict' || err.data?.current) {
        await this.reload();
        const now = err.data?.current && 'value' in err.data.current ? JSON.stringify(err.data.current.value) : this.ctx.text('layers.none');
        return this.ctx.text('conflict', { value: now });
      }
      const problems = err.data?.problems ?? [];
      return problems.length ? problems.map((p) => p.message).join('\n') : err.message;
    }
    // 记下刚存成的几项：重画出来的那几行照它画对勾（`rows.js`）
    this.saved = { keys: new Set(changes.map((c) => c.key)), at: performance.now() };
    await this.reload();
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
      // 叠着几层的（浮卡上又弹了问一句的）先关最上面那层：后挂上的在后面
      const open = [...this.panel.querySelectorAll('.set-menu, .set-drawer, .set-form, .set-pool.is-editing, [data-set-dismiss]')].at(-1);
      if (open) {
        open.dispatchEvent(new CustomEvent('set-dismiss'));
        return;
      }
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
