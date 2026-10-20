// @ts-check
//! 「技能」「脚本」「MCP」三页（蓝图 `web.md`「设置页」第 20 条；2026-10-20 项目主人：放在软件包上面统一管理，看过样板定；核心 X-26、X-27）：
//! 三页一个样子——顶上搜索框和一个按钮（技能、脚本「打开目录」，MCP「添加服务」），一排来源筛选（全部、自制、随软件包来的），一项一行：
//! 名字、一句说明，右边来源、加载方式（脚本、MCP）、全局开关、箭头；点一行滑进详情（`subpage.js`）。列表在设置框打开、改了配置时重读
//! （`dialog.js` 的 `load`）；MCP 服务另跟 `mcp.changed`、`package.changed`。添加、编辑服务的小窗在 `mcp-form.js`。

import { h, icon, replace } from '../../src/lib/dom.js';
import { groupBlock, toggle, select, findBox } from './rows.js';
import { stateText } from './extensions.js';
import { openInfo } from './core-packages.js';
import { openServerForm } from './mcp-form.js';
import {
  skillItem, scriptItem, mcpItems, switchValue, featureId, loadingParams, SOURCES, inSource, sourceOf, toolMatch, homeDir, shortTool,
  editable, commandLine, VENUES,
} from './tool-model.js';

/** 三页的图标 */
const FACE = { skills: 'sparkles', scripts: 'square-terminal', mcp: 'plug' };

/** @typedef {import('./tool-model.js').ToolKind} ToolKind @typedef {import('./tool-model.js').ToolItem} ToolItem */

/** 这一页有没有（核心有对应的方法）。 @param {any} dialog @param {ToolKind} kind */
export const hasToolPage = (dialog, kind) => (kind === 'skills' ? !!dialog.skills : kind === 'scripts' ? !!dialog.scripts : Array.isArray(dialog.homeMcp));

/** 一页上的全部项。 @param {any} dialog @param {ToolKind} kind @returns {ToolItem[]} */
function itemsOf(dialog, kind) {
  if (kind === 'skills') return (dialog.skills?.skills ?? []).map(skillItem);
  if (kind === 'scripts') return (dialog.scripts?.scripts ?? []).map(scriptItem);
  return mcpItems(dialog.homeMcp, dialog.packages);
}

/** 来源写成字。 @param {any} dialog @param {ToolItem} item */
function sourceText(dialog, item) {
  const s = sourceOf(item, dialog.packages);
  return 'name' in s ? s.name : dialog.ctx.text(`tools.${s.key}`);
}

/**
 * 整页。搜什么、筛哪个记在 `dialog.toolView`（设置框重画、关了再开还是它）；打字、点筛选只换列表，搜索框不重画。
 * @param {any} dialog @param {ToolKind} kind
 */
export function drawToolPage(dialog, kind) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const views = (dialog.toolView ??= {});
  const view = (views[kind] ??= { query: '', filter: 'all' });
  const items = itemsOf(dialog, kind);
  const list = h('div.set-rows');
  const group = h('section.set-group', list);
  const empty = h('p.set-empty', { hidden: true });
  const chips = h('div.set-pkg-chips', { role: 'tablist' });
  const count = (/** @type {string} */ f) => items.filter((x) => inSource(x, f)).length;
  const drawChips = () => {
    const shown = SOURCES.filter((f) => f === 'all' || count(f) > 0);
    if (!shown.includes(/** @type {any} */ (view.filter))) view.filter = 'all';
    chips.hidden = shown.length < 2;
    replace(chips, shown.map((f) => h(`button.set-pkg-chip${f === view.filter ? '.is-on' : ''}`, {
      type: 'button', role: 'tab', 'aria-selected': String(f === view.filter),
      onclick: () => {
        view.filter = f;
        drawChips();
        update();
      },
    }, t(`tools.source.${f}`), h('span', String(count(f))))));
  };
  const update = () => {
    const rows = items.filter((x) => inSource(x, view.filter) && toolMatch(view.query, x, sourceText(dialog, x)));
    replace(list, rows.map((x) => toolRow(dialog, x)));
    group.hidden = !rows.length;
    empty.hidden = rows.length > 0;
    empty.textContent = items.length ? t('tools.no_match') : t(`tools.none.${kind}`);
  };
  const find = findBox(view.query, t(`tools.search.${kind}`), (query) => {
    view.query = query;
    update();
  });
  drawChips();
  update();
  return [
    h('div.set-pkg-tools', h('div.set-tool-head', find, headButton(dialog, kind)), chips),
    empty, group,
    h('p.set-tool-note', t(kind === 'skills' ? 'tools.note.skills' : 'tools.note.load')),
  ];
}

/** 顶上右边的按钮：技能、脚本「打开目录」（拿不到文件夹的不出），MCP「添加服务」。 @param {any} dialog @param {ToolKind} kind */
function headButton(dialog, kind) {
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  if (kind === 'mcp') {
    return h('button.set-btn.is-primary', { type: 'button', onclick: () => openServerForm(dialog, null) }, icon('plus'), h('span', t('tools.add_server')));
  }
  const dir = homeDir(kind, kind === 'skills' ? dialog.skills : dialog.scripts);
  if (!dir) return null;
  return h('button.set-btn', { type: 'button', title: dir, onclick: () => reveal(dialog, dir) }, icon('folder-open'), h('span', t('tools.open_dir')));
}

/**
 * 「打开目录」：经桥在这台机器上用文件管理器打开（`host.files.reveal`，桥的 `/reveal`）；不在的提示；开不了的（不经桥、桥那边没有文件管理器）复制路径。
 * @param {any} dialog @param {string} dir
 */
export async function reveal(dialog, dir) {
  const host = dialog.ctx.host;
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const got = host.files?.reveal ? await host.files.reveal(dir).catch(() => null) : null;
  if (got?.ok) return;
  if (got?.missing) {
    dialog.toast(t('tools.reveal_missing', { path: dir }));
    return;
  }
  try {
    await host.clipboard.write(dir);
    dialog.toast(t('tools.copied', { path: dir }));
  } catch {
    dialog.toast(dir);
  }
}

/** 列表上的一行。 @param {any} dialog @param {ToolItem} item */
function toolRow(dialog, item) {
  const controls = [
    item.load ? loadSelect(dialog, item) : null,
    item.on !== null ? switchFor(dialog, item) : null,
  ].filter(Boolean);
  return h('div.set-row.set-pkg.is-expandable', {
    onclick: (/** @type {MouseEvent} */ e) => {
      if (/** @type {Element} */ (e.target).closest('.set-switch, .set-select')) return;
      openTool(dialog, item);
    },
  },
  h('span.set-pkg-face', icon(FACE[item.kind])),
  h('div.set-text',
    h('div.set-name', h('span', item.title ?? item.name), item.title ? h('code.set-tool-id', item.name) : null),
    descLine(dialog, item)),
  h('span.set-pkg-tag', sourceText(dialog, item)),
  controls.length ? h('div.set-control.set-tool-controls', controls) : null,
  h('span.set-pkg-arrow', icon('chevron-right')));
}

/** 名字下面那一行：技能、脚本是一句说明；MCP 是状态和有几件工具。 @param {any} dialog @param {ToolItem} item */
function descLine(dialog, item) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  if (item.kind !== 'mcp') return item.desc ? h('p.set-desc', item.desc) : null;
  const { text, bad } = serverState(dialog, item);
  const tools = Array.isArray(item.raw.tools) ? t('tools.tools_n', { count: item.raw.tools.length }) : null;
  return h('p.set-desc', h(`span${bad ? '.is-error' : ''}`, text), tools ? ` · ${tools}` : null);
}

/**
 * 服务现在怎样（同软件包信息页「MCP 服务」那一行）：被个人设置里同名的替代了的写那一句；包关着的、服务关着的「已停用」；停了的照原因，红字。
 * @param {any} dialog @param {ToolItem} item
 */
function serverState(dialog, item) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const s = item.raw;
  if (item.covered) return { text: t('pkg.mcp_covered'), bad: false };
  const on = s.enabled !== false && s.state !== 'off';
  return { text: stateText(t, { ...s, on }), bad: on && s.state === 'stopped' };
}

/** 加载方式的下拉：懒加载（`need_load` 是真的）、完整。 @param {any} dialog @param {ToolItem} item */
function loadSelect(dialog, item) {
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  const options = [{ value: true, name: t('tools.lazy') }, { value: false, name: t('tools.full') }];
  return select(dialog, options, item.load?.value ?? true, (v) => setLoading(dialog, item, v));
}

/** 全局开关。 @param {any} dialog @param {ToolItem} item */
function switchFor(dialog, item) {
  return toggle(!!item.on, async (on) => {
    try {
      await dialog.ctx.core.request('feature.set', { feature: featureId(item), on: switchValue(on) });
    } catch (err) {
      dialog.toast(err?.message ?? String(err));
      return false;
    }
    await refresh(dialog, item.kind);
    return true;
  });
}

/** 改加载方式（`null` 是恢复成来处写的）。 @param {any} dialog @param {ToolItem} item @param {boolean|null} needLoad */
async function setLoading(dialog, item, needLoad) {
  try {
    await dialog.ctx.core.request('tool.set_loading', loadingParams(item, needLoad));
  } catch (err) {
    dialog.toast(err?.message ?? String(err));
  }
  await refresh(dialog, item.kind);
}

/**
 * 重读一页的列表再重画（改的是个人设置，核心另推 `config.changed`，那边整个重读；这里先读这一份，改完马上看得到）。
 * @param {any} dialog @param {ToolKind} kind
 */
export async function refresh(dialog, kind) {
  const core = dialog.ctx.core;
  if (kind === 'skills') dialog.skills = await core.request('skill.list', {}).catch(() => dialog.skills);
  else if (kind === 'scripts') dialog.scripts = await core.request('script.list', {}).catch(() => dialog.scripts);
  else {
    const [home, packages] = await Promise.all([
      core.request('mcp.list', {}).then((/** @type {any} */ r) => r?.servers ?? dialog.homeMcp, () => dialog.homeMcp),
      core.request('package.list', {}).then((/** @type {any} */ r) => r?.packages ?? dialog.packages, () => dialog.packages),
    ]);
    dialog.homeMcp = home;
    dialog.packages = packages;
  }
  if (dialog.isOpen && !dialog.editing()) dialog.drawBody();
}

/** 点一行：滑进它的详情。 @param {any} dialog @param {ToolItem} item */
function openTool(dialog, item) {
  const kind = item.kind;
  const id = item.id;
  dialog.openSub(item.title ?? item.name, () => toolDetail(dialog, kind, id));
}

/**
 * 详情：每次画都照现在的列表重找（开关、改了加载方式重画时跟着变）。顶上一块：图标、名字、一句说明、来源（随软件包来的点包名进它的信息页），
 * 右边开关；MCP 多状态和动作（重启；自制的编辑、删除）。下面一组：名字、位置、时限、加载方式；MCP 是命令、会话、工具。
 * @param {any} dialog @param {ToolKind} kind @param {string} id
 */
function toolDetail(dialog, kind, id) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const item = itemsOf(dialog, kind).find((x) => x.id === id);
  if (!item) return [h('p.set-empty', t('tools.gone'))];
  const s = item.raw;
  const source = sourceText(dialog, item);
  const installed = item.package && (dialog.packages ?? []).some((/** @type {any} */ p) => p.package === item.package && p.status);
  const sourceNode = installed ? h('button.set-link', { type: 'button', onclick: () => { dialog.show('packages'); openInfo(dialog, item.package); } }, source) : source;
  const state = kind === 'mcp' ? serverState(dialog, item) : null;
  const meta = h('p.set-pkg-card-meta', t('tools.field.source'), ' · ', sourceNode, state ? [' · ', h(`span${state.bad ? '.is-bad' : ''}`, state.text)] : null);
  const actions = kind === 'mcp' ? serverActions(dialog, item) : [];
  const stderr = Array.isArray(s.stderr) ? s.stderr.join('\n') : s.stderr ?? '';
  dialog.mcpShowing ??= new Set();
  const showing = kind === 'mcp' && !!state?.bad && !!stderr && dialog.mcpShowing.has(id);
  if (kind === 'mcp' && state?.bad && stderr) {
    actions.push(h('button.set-btn', { type: 'button', onclick: () => {
      if (dialog.mcpShowing.has(id)) dialog.mcpShowing.delete(id);
      else dialog.mcpShowing.add(id);
      dialog.drawBody();
    } }, t(showing ? 'ext.hide_output' : 'ext.show_output')));
  }
  const card = h('div.set-pkg-info',
    h('div.set-pkg-card',
      h('span.set-pkg-face', icon(FACE[kind])),
      h('div.set-pkg-card-text',
        h('div.set-pkg-card-name', item.title ?? item.name),
        item.desc ? h('p.set-pkg-card-desc', item.desc) : null,
        meta,
        actions.length ? h('div.set-pkg-card-actions', actions) : null),
      item.on !== null ? h('div.set-control', switchFor(dialog, item)) : null),
    showing ? h('pre.set-ext-output', stderr) : null);
  const line = (/** @type {string} */ name, /** @type {any} */ value, /** @type {any} */ note = null) => h('div.set-row',
    h('div.set-text', h('div.set-name', h('span', name)), note ? h('p.set-desc', note) : null), h('div.set-control.set-tool-value', value));
  const rows = [];
  if (kind !== 'mcp') {
    rows.push(line(t('tools.field.name'), h('code.set-tool-code', item.name)));
    if (typeof s.path === 'string') rows.push(line(t('tools.field.path'), h('code.set-tool-code', { title: s.path }, s.path)));
    if (kind === 'scripts' && typeof s.timeout === 'number') rows.push(line(t('tools.field.timeout'), t('tools.timeout_s', { seconds: s.timeout })));
  } else {
    rows.push(line(t('tools.field.command'), h('code.set-tool-code', { title: commandLine(s.command) }, commandLine(s.command))));
    const venues = VENUES.filter((v) => (Array.isArray(s.venues) && s.venues.length ? s.venues : ['local']).includes(v));
    rows.push(line(t('tools.field.venues'), venues.map((v) => t(`tools.venue.${v}`)).join(t('pkg.sep'))));
    if (Array.isArray(s.tools) && s.tools.length) {
      rows.push(h('div.set-row.is-wide', h('div.set-text', h('div.set-name', h('span', t('tools.field.tools')))),
        h('div.set-tool-list', s.tools.map((/** @type {string} */ name) => h('code.set-tool-chip', shortTool(item.name, name))))));
    }
  }
  if (item.load) {
    const reset = item.load.by === 'setting' ? h('button.set-link', { type: 'button', onclick: () => setLoading(dialog, item, null) }, t('tools.load_reset')) : null;
    rows.push(line(t('tools.field.load'), loadSelect(dialog, item), item.load.by === 'setting' ? [t('tools.load_set'), ' · ', reset] : null));
  }
  return [
    card,
    groupBlock('', rows),
    kind === 'mcp' && !item.own ? h('p.set-tool-note', t('tools.from_package')) : null,
  ].filter(Boolean);
}

/**
 * MCP 详情的动作：重启（个人设置里的 `mcp.restart`，包里的 `package.restart`，包关着的、被替代了的不出）；自制的多编辑（核心照写的交了
 * 环境变量、时限才有，`editable`）、删除（点两下）。
 * @param {any} dialog @param {ToolItem} item
 */
function serverActions(dialog, item) {
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  const s = item.raw;
  const out = [];
  if (!item.covered && s.enabled !== false) {
    out.push(h('button.set-btn', { type: 'button', onclick: async () => {
      try {
        if (item.own) await dialog.ctx.core.request('mcp.restart', { name: item.name });
        else await dialog.ctx.core.request('package.restart', { package: item.package });
      } catch (err) {
        dialog.toast(err?.message ?? String(err));
      }
      await refresh(dialog, 'mcp');
    } }, t('tools.restart')));
  }
  if (!item.own) return out;
  if (editable(dialog.skills)) out.push(h('button.set-btn', { type: 'button', onclick: () => openServerForm(dialog, s) }, t('tools.edit')));
  let armed = false;
  const remove = h('button.set-btn.is-danger', { type: 'button', onclick: async () => {
    if (!armed) {
      armed = true;
      remove.classList.add('is-armed');
      remove.textContent = t('tools.remove_again');
      return;
    }
    try {
      await dialog.ctx.core.request('mcp.remove', { name: item.name });
    } catch (err) {
      dialog.toast(err?.message ?? String(err));
      return;
    }
    dialog.back();
    await refresh(dialog, 'mcp');
  } }, t('tools.remove'));
  out.push(remove);
  return out;
}
