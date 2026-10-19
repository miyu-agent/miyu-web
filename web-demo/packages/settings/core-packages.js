// @ts-check
//! 「软件包」页上面核心的软件包（蓝图 `web.md`「设置页」第 13 条；核心 F-6 上，`package-pages.md`）：照 `package.list` 装了的一个一行，
//! 按核心核实过的标记分段：接入（带 `connection` 的）、界面（`ui`）、功能（别的）。一行是图标、名字、一句说明，右边状态、开关、箭头：
//! 状态只写要人留意的（运行中、已停止、程序未安装……；好好的「已启用」、关着的「已停用」开关已经说了，不写），开关照 `enabled`
//! （有这一格才有开关，发 `package.enable`、`package.disable`，核心照种类办），必需的写「必需」。点一行滑进它的信息页（`subpage.js`，
//! 左上角箭头返回；2026-10-10 项目主人）：版本和状态、启用、它加的功能、权限（扩展的「运行」「权限」两行，`extensions.js`）、
//! 设置项（`config.schema` 里 `package` 是它的）、卸载（管理员自己装的才有）。程序不在的只有状态（界面包核心照旧给设置项，照画）。
//! 带 MCP 服务的（扩展包、`bundle`，核心 X-4）多一组「MCP 服务」：一个服务一行写现在怎样（`mcp-servers.js`），组头「重启」（`package.restart`）；
//! 个人设置里写的服务（F-9 补）在列表的段后面单列一组。

import { h, icon, hasIcon } from '../../src/lib/dom.js';
import { coreRow, groupBlock, toggle, textField } from './rows.js';
import { splitKey, itemFor, mcpStopped, packageNames } from './model.js';
import { openPage, probeSites } from './backstage.js';
import { serverRow, homeMcpPart } from './mcp-servers.js';
import { stateText } from './extensions.js';

/** 段：照核心核实过的标记分，先后照这里 */
const PARTS = /** @type {const} */ (['connection', 'ui', 'feature']);
/** 列表上不写的状态：开关已经说了 */
const QUIET = new Set(['ready', 'off']);
/** 写成红字的状态：程序不在、依赖的包缺了（核心 F-11：装着、不拉起） */
const BAD = new Set(['program_missing', 'depends_missing']);

/** @param {any} p */
const partOf = (p) => (p.connection ? 'connection' : p.kind === 'ui' ? 'ui' : 'feature');

/** 包的图标：清单写了、网页认得的照它，不然画一个通用的。 @param {any} p */
const faceOf = (p) => h('span.set-pkg-face', icon(p.icon && hasIcon(p.icon) ? p.icon : 'package'));

/** @param {any} dialog @param {any} page `config.schema` 的 `packages` 页 */
export function drawCorePackages(dialog, page) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const packages = (dialog.packages ?? []).filter((p) => p.status);
  probeSites(dialog, packages);
  const parts = PARTS.map((part) => {
    const rows = packages.filter((p) => partOf(p) === part).map((p) => packageRow(dialog, p));
    return rows.length ? h('section.set-part', h('h2.set-part-name', t(`pkg.part.${part}`)), h('section.set-group', h('div.set-rows', rows))) : null;
  });
  // 对不上哪个包的组（核心自己的模块）照旧一组一组摊开
  const all = new Set(packages.map((p) => p.package));
  const rest = (page?.groups ?? []).filter((g) => !all.has(g.id)).map((g) => groupBlock(g.name, g.items.map((item) => coreRow(dialog, item)))).filter(Boolean);
  return [...parts, homeMcpPart(dialog), ...rest].filter(Boolean);
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

/** 列表上的一行。 @param {any} dialog @param {any} p */
function packageRow(dialog, p) {
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  const id = p.package;
  const missing = p.status === 'program_missing';
  // 程序不在、依赖缺了的先写这个（核心不拉起，服务自然停着，不另写「服务已停止」）
  const bad = BAD.has(p.status);
  // 包开着、带的 MCP 服务有停下的：写「服务已停止」（核心的状态是好好的也照这个写）
  // 服务全被个人设置里同名的替代了（F-9 补的 `covered`，`status` 照旧 `off`）：写「被个人设置替代」，不当关着
  const state = p.covered && !bad ? h('span.set-pkg-status', t('pkg.covered'))
    : mcpStopped(p) && !bad ? h('span.set-pkg-status.is-warn', t('pkg.mcp_stopped'))
    : QUIET.has(p.status) ? null : h(`span.set-pkg-status${bad ? '.is-bad' : p.status === 'running' ? '.is-on' : ''}`, t(`pkg.status.${p.status}`));
  const control = p.required ? h('span.set-pkg-status', t('pkg.required'))
    : 'enabled' in p ? switchFor(dialog, p) : null;
  return h('div.set-row.set-pkg.is-expandable', {
    onclick: (/** @type {MouseEvent} */ e) => {
      if (/** @type {Element} */ (e.target).closest('.set-switch')) return;
      openInfo(dialog, id);
    },
  },
  faceOf(p),
  h('div.set-text', h('div.set-name', h('span', p.name ?? id)), p.summary ? h('p.set-desc', p.summary) : null),
  state, control ? h('div.set-control', control) : null,
  h('span.set-pkg-arrow', icon('chevron-right')));
}

/** 进一个包的信息页。 @param {any} dialog @param {string} id */
function openInfo(dialog, id) {
  const p = (dialog.packages ?? []).find((x) => x.package === id);
  dialog.openSub(p?.name ?? id, () => infoPage(dialog, id));
}

/**
 * 开关：`package.enable`、`package.disable`，回应是那一项，换进列表重画。扩展还有没批的能力（`needs_approval`）的进它的信息页、
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
  const group = (dialog.pages ?? []).find((x) => x.id === 'packages')?.groups.find((g) => g.id === id);
  const settings = site ? [] : (group?.items ?? []).map((item) => coreRow(dialog, item)).filter(Boolean);
  const ext = dialog.extensions;
  const head = dialog.extensions.entries.has(id)
    // 扩展的状态跟着推送换（`extensions.js` 照它重画这一块）
    ? ext.custom(id, (/** @type {any} */ e) => infoCard(dialog, p, e))
    : infoCard(dialog, p, null);
  return [
    head,
    missing ? null : mcpGroup(dialog, p),
    settings.length ? groupBlock(t('pkg.settings'), settings) : null,
    // 平台接入的（没有自己网页的）：终端管理员在这个平台上的号，接在它的设置项后面
    !site && !missing && p.connection?.platform ? ownerAccounts(dialog, p.connection.platform) : null,
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
  // 状态：扩展照它跑得怎样（停下的写为什么）；别的只写要留意的（好好的「已启用」、关着的「已停用」开关已经说了）
  const status = e ? stateText(t, e)
    : p.status === 'depends_missing' && p.missing?.length ? t('pkg.depends_missing', { names: packageNames(dialog.packages, p.missing).join(t('pkg.sep')) })
    : p.covered && !bad ? t('pkg.covered')
    : QUIET.has(p.status) ? null : t(`pkg.status.${p.status}`);
  const alarm = bad || (e && e.on && e.state === 'stopped');
  const from = typeof p.from === 'string' ? t(`pkg.from.${p.from}`) : null;
  const author = typeof p.author === 'string' && p.author.trim() ? p.author.trim() : null;
  const meta = [p.version ? t('pkg.version', { version: p.version }) : null, from && !from.startsWith('pkg.') ? from : null, author].filter(Boolean).join(' · ');
  const upstream = typeof p.upstream === 'string' && /^https:\/\/[^\s]+$/.test(p.upstream) ? p.upstream : null;
  const control = p.required ? h('span.set-pkg-status', t('pkg.required'))
    : e ? toggle(e.on, (on) => (on ? dialog.extensions.turnOn(e) : dialog.extensions.act('extension.disable', { package: id })))
    : 'enabled' in p ? switchFor(dialog, p) : null;
  const stderr = e ? (Array.isArray(e.stderr) ? e.stderr.join('\n') : e.stderr ?? '') : '';
  const showing = !!e && dialog.extensions.showing.has(id);
  const actions = [
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
      faceOf(p),
      h('div.set-pkg-card-text',
        h('div.set-pkg-card-name', p.name ?? id),
        p.summary ? h('p.set-pkg-card-desc', p.summary) : null,
        meta || status ? h('p.set-pkg-card-meta', meta, meta && status ? ' · ' : null, status ? h(`span${alarm ? '.is-bad' : ''}`, status) : null) : null,
        upstream ? h('p.set-pkg-card-meta.set-pkg-upstream', h('span', t('pkg.upstream')),
          h('a', { href: upstream, target: '_blank', rel: 'noopener noreferrer', title: upstream }, h('span', upstream.replace(/^https:\/\//, '').replace(/\/$/, '')), icon('external-link'))) : null,
        actions.length ? h('div.set-pkg-card-actions', actions) : null),
      control ? h('div.set-control', control) : null),
    showing && stderr ? h('pre.set-ext-output', stderr) : null,
    ask);
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
 * 卸载：只有管理员自己装的、不是必需的才有（出厂的卸掉和关掉是一回事，照列表的开关）。点一下变成「再点一次卸载」，再点才卸。
 * @param {any} dialog @param {any} p
 */
function removeButton(dialog, p) {
  if (p.required || p.layer === 'shipped') return null;
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  let armed = false;
  const button = h('button.set-btn.is-danger', { type: 'button', onclick: async () => {
    if (!armed) {
      armed = true;
      button.textContent = t('pkg.uninstall_again');
      return;
    }
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
/** 终端管理员是哪个本机账号：现在只有这一个（核心 `package-pages.md`「平台接入的软件」第 2 条） */
const ADMIN = 'admin';

/**
 * 「终端管理员的 QQ 号」（2026-10-10 项目主人选 B：放在平台接入那个软件的信息页上，只填号码）：一个号一块，✕ 删掉，＋ 加一个。头替人写成
 * `external.bindings.<平台>:<号>`，值是本机账号：标的是终端管理员，写 `admin`，不照这个页面登录的是谁；账号那一列不画，多用户以后再加。平台照 `package.list` 的
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
      if (!numbers.includes(n)) save(n, { value: ADMIN });
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
  const restart = on && !list.every((s) => s.covered) ? h('button.set-btn.is-small', { type: 'button', onclick: async () => {
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
