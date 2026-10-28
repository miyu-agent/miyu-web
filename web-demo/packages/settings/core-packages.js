// @ts-check
//! 「软件包」页（蓝图 `web.md`「设置页」第 13 条；核心 F-6 上，`package-pages.md`）：顶上搜索和一排筛选（2026-10-20 项目主人），
//! 下面照 `package.list` 装了的一个一行（不再分段，一行右边一个小标签写它是哪一种），再下面网页自己的组件。一行是图标、名字、一句说明，右边状态、开关、箭头：
//! 状态只写要人留意的（运行中、已停止、程序未安装……；好好的「已启用」、关着的「已停用」开关已经说了，不写），开关照 `enabled`
//! （有这一格才有开关，发 `package.enable`、`package.disable`，核心照种类办），必需的写「必需」。点一行滑进它的信息页（`subpage.js`，
//! 左上角箭头返回；2026-10-10 项目主人）：版本和状态、启用、它加的功能、权限（扩展的「运行」「权限」两行，`extensions.js`）、
//! 设置项（`config.schema` 里 `package` 是它的）、卸载（管理员自己装的才有）。程序不在的只有状态（界面包核心照旧给设置项，照画）。
//! 带 MCP 服务的（扩展包、`bundle`，核心 X-4）多一组「MCP 服务」：一个服务一行写现在怎样（`mcp-servers.js`），组头「重启」（`package.restart`）；
//! 个人设置里写的服务（F-9 补）2026-10-20 起在「MCP」页（`tool-pages.js`）。

import { confirmIn } from './confirm.js';
import { h, icon, replace } from '../../src/lib/dom.js';
import { coreRow, groupBlock, toggle, textField, findBox, shell } from './rows.js';
import { splitKey, itemFor, plainItem, pkgSwitch, pkgGroupsOf, mcpStopped, mcpNeedsLogin, packageNames, PKG_FILTERS, pkgKinds, pkgTag, pkgMatch, ownerOf, carriedBy } from './model.js';
import { openPage, probeSites } from './backstage.js';
import { serverRow } from './mcp-servers.js';
import { stateText, failed } from './extensions.js';
import { pkgFace } from './logos.js';

/** 列表上不写的状态：开关已经说了 */
const QUIET = new Set(['ready', 'off']);
/** 写成红字的状态：程序不在、依赖的包缺了（核心 F-11：装着、不拉起） */
const BAD = new Set(['program_missing', 'depends_missing']);


/** 包的图标：清单写了、网页认得的照它，不然画一个通用的。 @param {any} p */


/**
 * 整页：搜索、筛选、核心的软件包、对不上哪个包的组，最后网页自己的组件（`web`：`packages.js` 的 `drawPackages`）。
 * 搜什么、筛哪个记在 `dialog.pkgView`（设置框重画、关了再开还是它）；打字、点筛选只换列表，搜索框不重画（光标、输入法不断）。
 * @param {any} dialog @param {any} page `config.schema` 的 `packages` 页 @param {{node: HTMLElement, filter: (query: string) => Promise<number>, count: () => Promise<number>}} web
 */
export function drawCorePackages(dialog, page, web) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const packages = (dialog.packages ?? []).filter((p) => p.status);
  probeSites(dialog, packages);
  const view = (dialog.pkgView ??= { query: '', filter: 'all' });
  const ids = new Set(packages.map((p) => p.package));
  const carried = carriedBy(dialog.skills, dialog.scripts);
  let webCount = 0;
  const list = h('div.set-rows');
  const coreGroup = h('section.set-group', list);
  const empty = h('p.set-empty', { hidden: true }, t('pkg.no_match'));
  const webPart = h('section.set-part', packages.length ? h('h2.set-part-name', t('packages_web')) : null, web.node);
  // 对不上哪个包的组（核心自己的模块）照旧一组一组摊开；联网搜索的 key 这类照 `ownerOf` 认回它的包，挪进信息页
  const rest = (page?.groups ?? []).filter((g) => g.items.every((item) => !ownerOf(item, ids)))
    .map((g) => groupBlock(g.name, g.items.map((item) => coreRow(dialog, item)))).filter(Boolean);
  const chips = h('div.set-pkg-chips', { role: 'tablist' });
  const count = (/** @type {string} */ f) => (f === 'all' ? packages.length + webCount : f === 'web' ? webCount : packages.filter((p) => pkgKinds(p, carried).includes(f)).length);
  const drawChips = () => {
    const shown = PKG_FILTERS.filter((f) => f === 'all' || count(f) > 0);
    // 筛的那一个没了（包卸了）回到全部
    if (!shown.includes(/** @type {any} */ (view.filter))) view.filter = 'all';
    chips.hidden = shown.length < 2;
    replace(chips, shown.map((f) => h(`button.set-pkg-chip${f === view.filter ? '.is-on' : ''}`, {
      type: 'button', role: 'tab', 'aria-selected': String(f === view.filter),
      onclick: () => {
        view.filter = f;
        drawChips();
        update();
      },
    }, t(`pkg.filter.${f}`), h('span', String(count(f))))));
  };
  let round = 0;
  const update = async () => {
    const mine = ++round;
    const core = view.filter !== 'web';
    const rows = core ? packages.filter((p) => (view.filter === 'all' || pkgKinds(p, carried).includes(view.filter)) && pkgMatch(view.query, p.name, p.summary, p.package)) : [];
    // 组里的包（基础系统）没在搜的时候收成一行，排在最前（2026-10-27 项目主人）
    const split = pkgGroupsOf(rows, dialog.pkgGroups, view.query);
    replace(list, [...split.groups.map((g) => groupRow(dialog, g.group, g.members.length)), ...split.rows.map((p) => packageRow(dialog, p))]);
    coreGroup.hidden = !rows.length;
    const plain = view.filter === 'all' && !view.query.trim();
    for (const g of rest) g.hidden = !plain;
    const webOn = view.filter === 'all' || view.filter === 'web';
    webPart.hidden = !webOn;
    const webRows = webOn ? await web.filter(view.query) : 0;
    if (mine !== round) return;
    webPart.hidden = !webOn || !webRows;
    empty.hidden = rows.length + webRows > 0;
  };
  const find = findBox(view.query, t('pkg.search'), (query) => {
    view.query = query;
    update();
  });
  drawChips();
  update();
  web.count().then((n) => {
    webCount = n;
    drawChips();
  });
  // 搜索框滚的时候钉在上面（2026-10-24 项目主人），筛选那一排跟着滚
  return [h('div.set-pkg-pin', find), h('div.set-pkg-tools', chips), empty, coreGroup, ...rest, webPart].filter(Boolean);
}

/**
 * 扩展的状态变了（订阅 `extensions` 推来的 `extension.changed`）：列表里那一项的状态、开关跟着换（核心不另推软件包的变化）。
 * 状态照图纸：关着的 `off`，`waiting` 算 `starting`。交回换没换。
 * @param {any} dialog @param {any} entry `extension.status` 的一项
 */
export function followExtension(dialog, entry) {
  const p = (dialog.packages ?? []).find((x) => x.package === entry?.package);
  // 程序不在、依赖缺了的核心不拉起，扩展推来的状态不盖它（缺的装回来了，`package.changed` 整项换）
  if (!p || BAD.has(p.status)) return false;
  const status = !entry.on ? 'off' : entry.state === 'waiting' ? 'starting' : entry.state;
  if (p.status === status && p.enabled === entry.on) return false;
  dialog.packages = dialog.packages.map((x) => (x === p ? { ...x, status, enabled: entry.on } : x));
  return true;
}

/** 列表上的一行；`child` 的在组那一层里，点了叠一层进信息页。 @param {any} dialog @param {any} p @param {boolean} [child] */
function packageRow(dialog, p, child = false) {
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  const id = p.package;
  const missing = p.status === 'program_missing';
  // 程序不在、依赖缺了的先写这个（核心不拉起，服务自然停着，不另写「服务已停止」）
  const bad = BAD.has(p.status);
  // 包开着、带的 MCP 服务有停下的：写「服务已停止」（核心的状态是好好的也照这个写）
  // 服务全被个人设置里同名的替代了（F-9 补的 `covered`，`status` 照旧 `off`）：写「被个人设置替代」，不当关着
  // 没对这个成员开放的（核心 U23-R修三 的 `available: false`）：写暗字「管理员没开放」，开关灰着（`pkgSwitch`）
  const state = p.available === false ? h('span.set-pkg-status', t('pkg.not_open'))
    : p.covered && !bad ? h('span.set-pkg-status', t('pkg.covered'))
    : mcpStopped(p) && !bad ? h('span.set-pkg-status.is-warn', t('pkg.mcp_stopped'))
    : mcpNeedsLogin(p) && !bad ? h('span.set-pkg-status.is-warn', t('pkg.mcp_login'))
    : QUIET.has(p.status) ? null : h(`span.set-pkg-status${bad ? '.is-bad' : p.status === 'running' ? '.is-on' : ''}`, t(`pkg.status.${p.status}`));
  // 列表那一行的总闸照旧走 `package.enable`（核心照种类办），自己的开关照 `enabled`（扩展的跟着 `followExtension`）
  const control = controlFor(dialog, p, null);
  return h('div.set-row.set-pkg.is-expandable', {
    onclick: (/** @type {MouseEvent} */ e) => {
      if (/** @type {Element} */ (e.target).closest('.set-switch')) return;
      openInfo(dialog, id, child);
    },
  },
  pkgFace(dialog.ctx.core, p),
  h('div.set-text', h('div.set-name', h('span', p.name ?? id)), p.summary ? h('p.set-desc', p.summary) : null),
  state, h('span.set-pkg-tag', t(`pkg.kind.${pkgTag(p)}`)), control ? h('div.set-control', control) : null,
  h('span.set-pkg-arrow', icon('chevron-right')));
}

/** 进一个包的信息页（设置页的搜索点了软件包也走它）；从组那一层点进来的叠在它上面（`child`）。 @param {any} dialog @param {string} id @param {boolean} [child] */
export function openInfo(dialog, id, child = false) {
  const p = (dialog.packages ?? []).find((x) => x.package === id);
  dialog.openSub(p?.name ?? id, () => infoPage(dialog, id), { bare: true, child });
}

/** 列表上组的一行：图标、组名、一句说明，右边暗字几个、箭头，没有开关；点了进组那一层。 @param {any} dialog @param {any} g `groups` 的一项 @param {number} count */
function groupRow(dialog, g, count) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  return h('div.set-row.set-pkg.set-pkg-group.is-expandable', { onclick: () => dialog.openSub(g.name ?? g.id, () => groupPage(dialog, g.id), { bare: true }) },
    h('span.set-pkg-face', icon('package')),
    h('div.set-text', h('div.set-name', h('span', g.name ?? g.id)), g.summary ? h('p.set-desc', g.summary) : null),
    h('span.set-pkg-status', t('pkg.group_count', { n: count })),
    h('span.set-pkg-arrow', icon('chevron-right')));
}

/**
 * 组那一层：顶上卡片写组名、说明、几个软件包，管理员模式里多「全部卸载」「全部装回」（核心 BS-1 下中：`package.remove`、`package.install` 写组名）；
 * 下面组里的包一个一行（同列表），点了叠一层进信息页。每次画都照现在的列表重取（卸了、装回了跟着变）。
 * @param {any} dialog @param {string} id 组的编号
 */
function groupPage(dialog, id) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const g = (dialog.pkgGroups ?? []).find((/** @type {any} */ x) => x.id === id) ?? { id };
  const all = (dialog.packages ?? []).filter((/** @type {any} */ p) => Array.isArray(p.groups) && p.groups.includes(id));
  // 列的同列表：卸掉的出厂包照旧一行（开关关着），个数也照它；卸、装回照装着的、卸掉的有没有
  const shown = all.filter((/** @type {any} */ p) => p.status);
  const installed = shown.filter((/** @type {any} */ p) => !p.removed);
  const removed = all.filter((/** @type {any} */ p) => p.removed);
  const name = g.name ?? id;
  const act = async (/** @type {'package.remove'|'package.install'} */ method, /** @type {HTMLElement} */ button) => {
    if (dialog.adminGuard()) return;
    if (method === 'package.remove' && !await confirmIn(button, { text: t('pkg.group_remove_ask', { name, n: installed.length }), yes: t('ask_yes'), no: t('ask_no') })) return;
    try {
      await dialog.ctx.core.request(method, { package: id });
      await dialog.reload();
    } catch (err) {
      dialog.toast(refusal(dialog, err));
    }
  };
  const actions = dialog.ctx.admin?.on ? [
    installed.length ? h('button.set-btn.is-danger', { type: 'button', onclick: (/** @type {MouseEvent} */ e) => act('package.remove', /** @type {HTMLElement} */ (e.currentTarget)) }, t('pkg.group_remove')) : null,
    removed.length ? h('button.set-btn', { type: 'button', onclick: (/** @type {MouseEvent} */ e) => act('package.install', /** @type {HTMLElement} */ (e.currentTarget)) }, t('pkg.group_install')) : null,
  ].filter(Boolean) : [];
  const card = h('div.set-pkg-info', h('div.set-pkg-card',
    h('span.set-pkg-face', icon('package')),
    h('div.set-pkg-card-text',
      h('div.set-pkg-card-name', name),
      g.summary ? h('p.set-pkg-card-desc', g.summary) : null,
      h('p.set-pkg-card-meta', t('pkg.group_packages', { n: shown.length })),
      actions.length ? h('div.set-pkg-card-actions', actions) : null)));
  return [card, shown.length ? h('section.set-group', h('div.set-rows', shown.map((/** @type {any} */ p) => packageRow(dialog, p, true)))) : null].filter(Boolean);
}

/** 个人设置里把包 `id` 对自己关掉的那一项（核心 U23 末上：`config.schema` 给每个能关的包现拼一项）；核心没给的是 `null`。 @param {any} dialog @param {string} id */
const offItem = (dialog, id) => (dialog.schema ? plainItem(dialog.schema, dialog.got ?? {}, `packages.${id}.off`) : null);

/**
 * 一个包右边的开关（列表那一行、信息页卡片同一个）：跟着管理员模式换（2026-10-26 项目主人：管理员不是用户，管理员模式里的开关就是总闸）。
 * 平时是自己的「把这个包关掉」（`model.js` 的 `pkgSwitch`）；核心没给那一项的（旧核心、必需的）、管理员模式里是总闸：扩展照 `e`，别的照 `enabled`。
 * @param {any} dialog @param {any} p @param {any} e 扩展的状态（不是扩展的是 `null`）
 */
function controlFor(dialog, p, e) {
  const id = p.package;
  const off = offItem(dialog, id);
  const how = pkgSwitch(p, { admin: !!dialog.ctx.admin?.on, off, ...(e ? { system: !!e.on } : {}) });
  if (!how) return null;
  if (how.kind === 'required') return h('span.set-pkg-status', dialog.ctx.text('pkg.required'));
  if (how.kind === 'own') {
    // 自己的：关了写 `true`（只写个人层），开回来去掉这一项；存完设置页整页重读重画
    const el = toggle(how.on, async (on) => !await dialog.save(off, on ? { unset: true } : { value: true }));
    if (how.disabled) el.setAttribute('disabled', '');
    return el;
  }
  if (e) return lockedIf(dialog, toggle(e.on, (on) => (on ? dialog.extensions.turnOn(e) : dialog.extensions.act('extension.disable', { package: id }))));
  return switchFor(dialog, p);
}

/** 平时锁着系统那一层的控件灰着、点不了 @param {any} dialog @param {HTMLElement} el */
const lockedIf = (dialog, el) => {
  if (dialog.adminLocked) el.classList.add('is-admin-locked');
  return el;
};

/**
 * 总闸：`package.enable`、`package.disable`，回应是那一项，换进列表重画。扩展还有没批的能力（`needs_approval`）的进它的信息页、
 * 展开要批准的那一块（批了照 `extensions.js` 开）。程序不在的灰着。
 * @param {any} dialog @param {any} p
 */
function switchFor(dialog, p) {
  const id = p.package;
  const el = toggle(!!p.enabled, async (on) => {
    try {
      const got = await dialog.ctx.core.request(on ? 'package.enable' : 'package.disable', { package: id });
      dialog.packages = dialog.packages.map((x) => (x.package === id ? got : x));
      dialog.drawBody();
      return true;
    } catch (err) {
      if (err?.reason === 'needs_approval') {
        dialog.extensions.asking.add(id);
        if (!dialog.sub.page) openInfo(dialog, id);
        else dialog.drawBody();
      } else dialog.toast(refusal(dialog, err));
      return false;
    }
  });
  if (p.status === 'program_missing') el.setAttribute('disabled', '');
  // 开关软件包是系统那一层：平时锁着灰着（蓝图「管理员模式」第 4 条）
  if (dialog.adminLocked) el.classList.add('is-admin-locked');
  return el;
}

/**
 * 一个包的信息页（点进去的那一层）：每次画都照现在的列表、配置清单重取，开关、别处改了配置重画时跟着变。
 * @param {any} dialog @param {string} id
 */
/**
 * 一个包的信息页（2026-10-19 项目主人选的「极简：只有信息和动作」）：顶上一块——图标、名字、一句说明，下面一行暗字「版本 · 来源 · 作者 · 状态」（核心 F-12：
 * 来源照 `from`：出厂、官方软件源、社区软件源、本地，不照 `source`（那是装时的本机路径）；作者照 `author`；状态只写要留意的，红字是程序不在、依赖缺了），
 * 再一行上游仓库的地址（`upstream`，https 的才画成链接，新标签页开；2026-10-19 项目主人：每个软件包的页面都要有上游仓库地址），右边开关（必需的写「必需」）；
 * 再一行动作：打开页面（有后台页的；有自己网页的点了在新标签页开它）、重启（在跑的扩展、带 MCP 服务的包）、查看输出（停下的扩展）、卸载（点两下）。功能、权限不再列。
 * 下面：要批准权限的那一块（开的那一下还有没批的）、停下的扩展的输出、带的 MCP 服务；没有自己网页的再接它的设置项（有自己网页的，设置在它自己的网页里）。
 * @param {any} dialog @param {string} id
 */
function infoPage(dialog, id) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const p = (dialog.packages ?? []).find((x) => x.package === id);
  if (!p) return [h('p.set-empty', t('pkg.gone'))];
  const missing = p.status === 'program_missing';
  const site = !!dialog.sites?.get(id);
  // 它的设置项：照每一项归哪个包（`ownerOf`），一组一块；组就是这个包的写「设置」，别的组（联网搜索的「API Key 和地址」）照组名
  const ids = new Set((dialog.packages ?? []).map((/** @type {any} */ x) => x.package));
  const groups = site ? [] : ((dialog.pages ?? []).find((/** @type {any} */ x) => x.id === 'packages')?.groups ?? [])
    .map((/** @type {any} */ g) => ({ g, rows: g.items.filter((/** @type {any} */ item) => ownerOf(item, ids) === id && item.key !== `packages.${id}.off`).map((/** @type {any} */ item) => coreRow(dialog, item)).filter(Boolean) }))
    .filter((/** @type {any} */ x) => x.rows.length);
  const ext = dialog.extensions;
  const head = dialog.extensions.entries.has(id)
    // 扩展的状态跟着推送换（`extensions.js` 照它重画这一块）
    ? ext.custom(id, (/** @type {any} */ e) => infoCard(dialog, p, e))
    : infoCard(dialog, p, null);
  return [
    head,
    typeof p.members === 'boolean' ? membersRow(dialog, p) : null,
    missing ? null : mcpGroup(dialog, p),
    ...groups.map((/** @type {any} */ x) => groupBlock(x.g.id === id ? t('pkg.settings') : x.g.name, x.rows)),
    // 平台接入的（没有自己网页的）：终端管理员在这个平台上的号，接在它的设置项后面
    !site && !missing && !dialog.ctx.host?.member && p.connection?.platform ? ownerAccounts(dialog, p.connection.platform) : null,
  ].filter(Boolean);
}

/**
 * 信息页顶上那一块。`e` 是扩展的状态（不是扩展的是 `null`）：开关、重启、查看输出、要批准的那一块照它。
 * @param {any} dialog @param {any} p @param {any} e
 */
function infoCard(dialog, p, e) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const id = p.package;
  const bad = BAD.has(p.status);
  // 成员（U23-R 起读得到列表）：管理员才有的动作不出
  const member = !!dialog.ctx.host?.member;
  // 状态：扩展照它跑得怎样（停下的写为什么）；别的只写要留意的（好好的「已启用」、关着的「已停用」开关已经说了）
  const status = e ? stateText(t, e)
    : p.status === 'depends_missing' && p.missing?.length ? t('pkg.depends_missing', { names: packageNames(dialog.packages, p.missing).join(t('pkg.sep')) })
    : p.available === false ? t('pkg.not_open')
    : p.covered && !bad ? t('pkg.covered')
    : QUIET.has(p.status) ? null : t(`pkg.status.${p.status}`);
  const alarm = bad || failed(e);
  const from = typeof p.from === 'string' ? t(`pkg.from.${p.from}`) : null;
  const author = typeof p.author === 'string' && p.author.trim() ? p.author.trim() : null;
  // 每人一份的扩展（核心 IM-1 上：`process.scope` 是 `account`）暗字里接「每人一份」
  const perAccount = p.process?.scope === 'account' ? t('pkg.per_account') : null;
  const meta = [p.version ? t('pkg.version', { version: p.version }) : null, from && !from.startsWith('pkg.') ? from : null, author, perAccount].filter(Boolean).join(' · ');
  const upstream = typeof p.upstream === 'string' && /^https:\/\/[^\s]+$/.test(p.upstream) ? p.upstream : null;
  const control = controlFor(dialog, p, e);
  const stderr = e ? (Array.isArray(e.stderr) ? e.stderr.join('\n') : e.stderr ?? '') : '';
  const showing = !!e && dialog.extensions.showing.has(id);
  const actions = [
    // 成员拿到的只有他打得开的带 `page`（核心 IM-1 中下），照样给按钮
    p.page && !bad && dialog.ctx.backstage ? openButton(dialog, id) : null,
    e && e.state === 'running' ? h('button.set-btn', { type: 'button', onclick: () => dialog.extensions.act('extension.restart', { package: id }) }, t('ext.restart')) : null,
    e && e.on && e.state === 'stopped' && stderr
      ? h('button.set-btn', { type: 'button', onclick: () => { dialog.extensions.toggleSet(dialog.extensions.showing, id); dialog.extensions.redraw(id); } }, t(showing ? 'ext.hide_output' : 'ext.show_output')) : null,
    removeButton(dialog, p),
  ].filter(Boolean);
  const caps = e?.capabilities ?? [];
  const unapproved = new Set(e?.unapproved ?? []);
  const ask = e && (dialog.extensions.asking.has(id) || (e.on && e.reason === 'needs_approval')) ? dialog.extensions.approval(e, caps, unapproved) : null;
  return h('div.set-pkg-info',
    h('div.set-pkg-card',
      pkgFace(dialog.ctx.core, p),
      h('div.set-pkg-card-text',
        h('div.set-pkg-card-name', p.name ?? id),
        p.summary ? h('p.set-pkg-card-desc', p.summary) : null,
        meta || status ? h('p.set-pkg-card-meta', meta, meta && status ? ' · ' : null, status ? h(`span${alarm ? '.is-bad' : ''}`, status) : null) : null,
        upstream ? h('p.set-pkg-card-meta.set-pkg-upstream', h('span', t('pkg.upstream')),
          h('a', { href: upstream, target: '_blank', rel: 'noopener noreferrer', title: upstream }, h('span', upstream.replace(/^https:\/\//, '').replace(/\/$/, '')), icon('external-link'))) : null,
        actions.length ? h('div.set-pkg-card-actions', actions) : null),
      control ? h('div.set-control', control) : null),
    showing && stderr ? h('pre.set-ext-output', stderr) : null,
    ask,
    member ? null : copiesGroup(dialog, e));
}

/**
 * 每人一份的扩展各账号那一份（核心 IM-1 中下四：管理员拿到的 `copies`，拉起过的每一份，照账号排）：一份一行，账号名、右边状态，停了有标准错误的
 * 能「查看输出」；没有的不出。
 * @param {any} dialog @param {any} e
 */
function copiesGroup(dialog, e) {
  const copies = Array.isArray(e?.copies) ? e.copies.filter((/** @type {any} */ c) => typeof c?.account === 'string') : [];
  if (!copies.length) return null;
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const ext = dialog.extensions;
  const rows = copies.map((/** @type {any} */ c) => {
    const key = `${e.package}:${c.account}`;
    const stderr = Array.isArray(c.stderr) ? c.stderr.join('\n') : c.stderr ?? '';
    const stopped = failed({ ...c, on: e.on });
    const peek = stopped && stderr
      ? h('button.set-link', { type: 'button', onclick: () => { ext.toggleSet(ext.showing, key); ext.redraw(e.package); } }, t(ext.showing.has(key) ? 'ext.hide_output' : 'ext.show_output')) : null;
    return [
      h('div.set-row',
        h('div.set-text', h('div.set-name', h('span', c.account)), peek),
        h('div.set-control', h(`span.set-pkg-status${c.state === 'running' ? '.is-on' : stopped ? '.is-bad' : ''}`, stateText(t, { ...c, on: e.on, scope: 'account' })))),
      ext.showing.has(key) && stderr ? h('pre.set-ext-output', stderr) : null,
    ];
  }).flat().filter(Boolean);
  return groupBlock(t('ext.copies'), rows);
}

/**
 * 「成员也能用」（核心 IM-1 上：带进程的包默认只给管理员组，`members` 只给管理员）：一行开关，发 `package.members`，回应是那一项、换进列表；
 * 改的是系统那一层，平时锁着（同总闸）。
 * @param {any} dialog @param {any} p
 */
function membersRow(dialog, p) {
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  /** @type {ReturnType<typeof shell>} */
  let row;
  const el = lockedIf(dialog, toggle(p.members, async (on) => {
    if (dialog.adminGuard()) return false;
    row.busy();
    try {
      const got = await dialog.ctx.core.request('package.members', { package: p.package, on });
      dialog.packages = dialog.packages.map((/** @type {any} */ x) => (x.package === p.package ? got : x));
      row.done();
      return true;
    } catch (err) {
      row.fail(refusal(dialog, err));
      return false;
    }
  }));
  row = shell({ name: t('pkg.members'), description: t('pkg.members_desc'), source: dialog.adminLocked ? dialog.lockLine(true) : null, control: el });
  return groupBlock(null, [row.el]);
}

/**
 * 「打开页面」：有自己网页的（接入通讯平台的页面服务，`status` 问得到端口；`dialog.sites` 记着）点了在新标签页打开那个网页（2026-10-19 项目主人：只留一个
 * 「打开页面」，新标签页打开就够了）；别的照旧跳到后台页的独立整页。
 * @param {any} dialog @param {string} id
 */
function openButton(dialog, id) {
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  const pages = dialog.ctx.backstage;
  const open = (/** @type {MouseEvent} */ e) => {
    if (!dialog.sites?.get(id)) return openPage(dialog, id, e);
    e.preventDefault();
    pages.site.open(id).then((/** @type {string|null} */ why) => { if (why) dialog.toast(why); });
  };
  return h('a.set-btn.is-anchor', { href: pages.href(id), onclick: open }, t('pkg.open_backstage'));
}

/**
 * 卸载：只有管理员自己装的、不是必需的才有（出厂的卸掉和关掉是一回事，照列表的开关）。先弹窗问一句（2026-10-20 项目主人：不要点两下）。
 * @param {any} dialog @param {any} p
 */
function removeButton(dialog, p) {
  if (p.required || p.layer === 'shipped') return null;
  // 自己那一层装的（核心 U23下上 `layer: user`）：卸的是自己那一份，不用管理员模式，成员也有
  const own = p.layer === 'user';
  if (!own && dialog.ctx.host?.member) return null;
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const button = h('button.set-btn.is-danger', { type: 'button', onclick: async () => {
    if (!own && dialog.adminGuard()) return;
    if (!await confirmIn(button, { text: t('pkg.uninstall_ask', { name: p.name ?? p.package }), yes: t('ask_yes'), no: t('ask_no') })) return;
    try {
      await dialog.ctx.core.request('package.remove', { package: p.package });
      dialog.back();
      await dialog.reload();
    } catch (err) {
      dialog.toast(refusal(dialog, err));
    }
  } }, t('pkg.uninstall'));
  return button;
}

/**
 * 拒绝时提示的话：别的包依赖它、卸不掉的（`package_depended`，卸载、关出厂的内置包时）写是哪几个依赖它（照名字）；别的照核心的话。
 * @param {any} dialog @param {any} err
 */
function refusal(dialog, err) {
  const by = err?.reason === 'package_depended' ? err.data?.by : null;
  if (Array.isArray(by) && by.length) return dialog.ctx.text('pkg.depended', { names: packageNames(dialog.packages, by).join(dialog.ctx.text('pkg.sep')) });
  return err?.message ?? String(err);
}

/** 平台接入那个软件的信息页上，终端管理员在这个平台上的号用的配置项（带占位，核心 O-3）。 */
const BINDING = 'external.bindings.<external>';
/**
 * 终端管理员是哪个本机账号（核心 `package-pages.md`「平台接入的软件」第 2 条）：核心 Y-12 中上起是机主，账号编号是注册时起的，不再固定叫
 * `admin`；改系统配置的只有机主，就是这个页面登录的账号。旧核心没有账号的照旧写 `admin`。
 * @param {any} ctx
 */
const machineOwner = (ctx) => ctx.host?.account ?? 'admin';

/**
 * 「终端管理员的 QQ 号」（2026-10-10 项目主人选 B：放在平台接入那个软件的信息页上，只填号码）：一个号一块，✕ 删掉，＋ 加一个。头替人写成
 * `external.bindings.<平台>:<号>`，值是本机账号：标的是终端管理员（机主，`machineOwner`）；账号那一列不画，多用户以后再加。平台照 `package.list` 的
 * `connection.platform`，不写死 QQ。写在系统配置，当场生效。
 * @param {any} dialog @param {string} platform
 */
function ownerAccounts(dialog, platform) {
  const ctx = dialog.ctx;
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  const prefix = `${platform}:`;
  const numbers = Object.keys(dialog.got?.items ?? {})
    .map((key) => splitKey(key))
    .filter((parts) => parts.length === 3 && parts[0] === 'external' && parts[1] === 'bindings' && parts[2].startsWith(prefix))
    .map((parts) => parts[2].slice(prefix.length));
  const item = (/** @type {string} */ number) => itemFor(dialog.schema, dialog.got, BINDING, { external: `${prefix}${number}` });
  const save = async (/** @type {string} */ number, /** @type {any} */ change) => {
    const it = item(number);
    if (!it) return;
    const why = await dialog.save(it, change);
    if (why) dialog.toast(why);
  };
  const name = ctx.text(`platforms.${platform}`);
  const label = t('pkg.owner_accounts', { platform: name.startsWith('platforms.') ? platform : name });
  const chips = numbers.map((n) => h('span.set-chip', h('span', n), h('button', { type: 'button', 'aria-label': '×', onclick: () => save(n, { unset: true }) }, icon('x'))));
  const add = h('button.set-chip.is-add', { type: 'button', title: ctx.text('add'), 'aria-label': ctx.text('add') }, icon('plus'));
  add.addEventListener('click', () => {
    const field = textField('', 'text', '', (text) => {
      const n = text.trim();
      if (!n) return;
      if (!/^[^\s]{1,64}$/u.test(n)) {
        dialog.toast(t('pkg.owner_bad'));
        return;
      }
      if (!numbers.includes(n)) save(n, { value: machineOwner(ctx) });
    });
    field.placeholder = t('pkg.owner_hint');
    add.replaceWith(field);
    field.focus();
  });
  return h('section.set-group', h('div.set-rows', h('div.set-row',
    h('div.set-text', h('div.set-name', h('span', label)), h('p.set-desc', t('pkg.owner_desc'))),
    h('div.set-control', h('div.set-chips', chips, add)))));
}

/**
 * 「MCP 服务」一组（核心 X-4）：一个服务一行，名字，下面写现在怎样（同扩展的「运行」），停了有标准错误的能点开看；组头「重启」
 * （`package.restart`：扩展连进程带服务，`bundle` 重启它的服务；包关着的不出）。状态照推送来的列表当场换（`packages-feed.js`）。
 * @param {any} dialog @param {any} p
 */
function mcpGroup(dialog, p) {
  const list = p.mcp ?? [];
  if (!list.length) return null;
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const on = p.enabled !== false;
  // 都被个人设置里同名的替代了的不给「重启」：重启的是这个包的服务，它们不起
  const restart = on && !dialog.ctx.host?.member && !list.every((s) => s.covered) ? h('button.set-btn.is-small', { type: 'button', onclick: async () => {
    if (dialog.adminGuard()) return;
    try {
      const got = await dialog.ctx.core.request('package.restart', { package: p.package });
      if (got?.package) dialog.packages = dialog.packages.map((x) => (x.package === got.package ? got : x));
    } catch (err) {
      dialog.toast(err?.message ?? String(err));
    }
    dialog.drawBody();
  } }, t('pkg.mcp_restart')) : null;
  const rows = list.map((s) => serverRow(dialog, `${p.package}/${s.name}`, s, { on }));
  return h('section.set-group', h('div.set-group-head', h('h3.set-group-name', t('pkg.mcp')), restart), h('div.set-rows', rows));
}
