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
import { confirmIn } from './confirm.js';
import {
  skillItem, scriptItem, mcpItems, switchValue, featureId, loadingParams, SOURCES, inSource, sourceOf, toolMatch, homeDir, shortTool,
  editable, commandLine, flip, range, maskedValue, maskedPairs,
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
  const view = (views[kind] ??= { query: '', filter: 'all', selecting: false, selected: new Set(), last: null });
  const items = itemsOf(dialog, kind);
  // 删了的不留在选中里
  view.selected = new Set([...view.selected].filter((id) => items.some((x) => x.id === id && deletable(x))));
  if (view.selecting && !items.some(deletable)) view.selecting = false;
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
    view.order = rows.filter(deletable).map((x) => x.id);
    replace(list, rows.map((x) => toolRow(dialog, x, view)));
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
    h('div.set-pkg-tools', h('div.set-tool-head', find, ...headButtons(dialog, kind, view, items)), chips),
    empty, group,
    // 页底只给技能写一句；脚本、MCP 那句「懒加载：…；完整：…」不要了（2026-10-21 项目主人）
    kind === 'skills' ? h('p.set-tool-note', t('tools.note.skills')) : null,
  ];
}

/**
 * 删得了的：自己写的 MCP 服务（`mcp.remove`）、自己放的技能（`skill.remove`，核心 9ef87384；2026-10-20 项目主人：不用点进详情才能删，还要能多选删）。
 * 随包来的不能删；脚本页不删。
 * @param {ToolItem} item
 */
const deletable = (item) => (item.kind === 'mcp' || item.kind === 'skills') && item.own;

/** 一个小的图标按钮（多选那一排）。 @param {string} name @param {string} title @param {() => void} run @param {string} [cls] */
const iconBtn = (name, title, run, cls = '') => h(`button.icon-button.set-tool-icon${cls}`, { type: 'button', title, 'aria-label': title, onclick: run }, icon(name));

/**
 * 删之前弹窗问一句（`confirm.js`；2026-10-20 项目主人：不要点一下变确认），确认了才删。
 * @param {any} dialog @param {HTMLElement} el @param {string} text @param {() => void} run
 */
function askFirst(dialog, el, text, run) {
  el.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (await confirmIn(el, { text, yes: dialog.ctx.text('ask_yes'), no: dialog.ctx.text('ask_no') })) run();
  });
  return el;
}

/**
 * 顶上右边的按钮：技能、脚本「打开目录」（拿不到文件夹的不出）；MCP「多选」（有删得了的才有）、「添加服务」。多选时换成「已选 N 个」、全选、删除、退出
 * （同全部会话的多选）。
 * @param {any} dialog @param {ToolKind} kind @param {any} view @param {ToolItem[]} items
 */
function headButtons(dialog, kind, view, items) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const dir = kind === 'mcp' ? null : homeDir(kind, kind === 'skills' ? dialog.skills : dialog.scripts);
  const main = kind === 'mcp'
    ? h('button.set-btn.is-primary', { type: 'button', onclick: () => openServerForm(dialog, null) }, icon('plus'), h('span', t('tools.add_server')))
    : dir ? h('button.set-btn', { type: 'button', title: dir, onclick: () => reveal(dialog, dir) }, icon('folder-open'), h('span', t('tools.open_dir'))) : null;
  if (kind === 'scripts') return main ? [main] : [];
  const redraw = () => dialog.drawBody();
  if (view.selecting) {
    const del = iconBtn('trash-2', t('tools.delete'), () => {}, `.is-danger${view.selected.size ? '' : '.is-disabled'}`);
    if (view.selected.size) askFirst(dialog, del, t('tools.delete_many_ask', { count: view.selected.size }), () => removeItems(dialog, kind, items.filter((x) => view.selected.has(x.id))));
    else del.setAttribute('disabled', '');
    return [
      h('span.set-tool-count', t('tools.selected', { count: view.selected.size })),
      iconBtn('check-check', t('tools.select_all'), () => { view.selected = new Set(items.filter(deletable).map((x) => x.id)); redraw(); }),
      del,
      iconBtn('x', t('tools.select_exit'), () => { view.selecting = false; view.selected = new Set(); redraw(); }),
    ];
  }
  return [
    items.some(deletable) ? iconBtn('list-checks', t('tools.select'), () => { view.selecting = true; view.selected = new Set(); view.last = null; redraw(); }) : null,
    main,
  ].filter(Boolean);
}

/**
 * 删几个：MCP 服务一个个 `mcp.remove`；技能一次 `skill.remove {names}`（挪进回收站；有一个不行的一个都不删，照核心的话提示）。删完提示几个、重读。
 * @param {any} dialog @param {ToolKind} kind @param {ToolItem[]} list
 */
async function removeItems(dialog, kind, list) {
  let done = 0;
  if (kind === 'skills') {
    try {
      const got = await dialog.ctx.core.request('skill.remove', { names: list.map((x) => x.name) });
      done = Array.isArray(got?.trash) ? got.trash.length : list.length;
    } catch (err) {
      dialog.toast(err?.message ?? String(err));
    }
  } else {
    for (const item of list) {
      try {
        await dialog.ctx.core.request('mcp.remove', { name: item.name });
        done += 1;
      } catch (err) {
        dialog.toast(err?.message ?? String(err));
      }
    }
  }
  const view = dialog.toolView?.[kind];
  if (view) {
    view.selecting = false;
    view.selected = new Set();
  }
  if (done) dialog.toast(dialog.ctx.text(kind === 'skills' ? 'tools.trashed_n' : 'tools.deleted_n', { count: done }));
  await refresh(dialog, kind);
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

/**
 * 列表上的一行。多选时删得了的那几行前面一个勾选框，点一行勾上、再点去掉，`Shift` 连选；删不了的暗着、点不了。平常删得了的悬停时右边多一个删除（点两下）。
 * MCP 页自己写的不写「自制」，只有随包来的写包名（2026-10-20 项目主人）。
 * @param {any} dialog @param {ToolItem} item @param {any} view
 */
function toolRow(dialog, item, view) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const selecting = !!view.selecting;
  const can = deletable(item);
  const picked = selecting && view.selected.has(item.id);
  const controls = selecting ? [] : [
    item.load ? loadSelect(dialog, item) : null,
    item.on !== null ? switchFor(dialog, item) : null,
    can ? askFirst(dialog, iconBtn('trash-2', t('tools.delete'), () => {}, '.is-danger.set-tool-del'), t('tools.delete_ask', { name: item.name }), () => removeItems(dialog, item.kind, [item])) : null,
  ].filter(Boolean);
  const tag = item.kind === 'mcp' && item.own ? null : h('span.set-pkg-tag', sourceText(dialog, item));
  return h(`div.set-row.set-pkg${selecting ? (can ? '.is-expandable.is-picking' : '.is-unpickable') : '.is-expandable'}${picked ? '.is-picked' : ''}`, {
    onclick: (/** @type {MouseEvent} */ e) => {
      if (/** @type {Element} */ (e.target).closest('.set-switch, .set-select, .set-tool-del')) return;
      if (!selecting) return openTool(dialog, item);
      if (!can) return;
      view.selected = e.shiftKey ? range(view.selected, view.order ?? [], view.last, item.id) : flip(view.selected, item.id);
      view.last = item.id;
      dialog.drawBody();
    },
  },
  selecting ? h('span.set-tool-check', icon(picked ? 'square-check' : 'square')) : null,
  h('span.set-pkg-face', icon(FACE[item.kind])),
  h('div.set-text',
    h('div.set-name', h('span', item.title ?? item.name), item.title ? h('code.set-tool-id', item.name) : null),
    descLine(dialog, item)),
  tag,
  controls.length ? h('div.set-control.set-tool-controls', controls) : null,
  selecting ? null : h('span.set-pkg-arrow', icon('chevron-right')));
}

/** 名字下面那一行：技能、脚本是一句说明；MCP 是状态和有几件工具。 @param {any} dialog @param {ToolItem} item */
function descLine(dialog, item) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  if (item.kind !== 'mcp') return item.desc ? h('p.set-desc', item.desc) : null;
  const { text, bad, running } = serverState(dialog, item);
  const tools = Array.isArray(item.raw.tools) ? t('tools.tools_n', { count: item.raw.tools.length }) : null;
  return h('p.set-desc', stateNode(text, bad, running), tools ? ` · ${tools}` : null);
}

/**
 * 服务现在怎样（同软件包信息页「MCP 服务」那一行）：被个人设置里同名的替代了的写那一句；包关着的、服务关着的「已停用」；停了的照原因，红字。
 * @param {any} dialog @param {ToolItem} item
 */
function serverState(dialog, item) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  const s = item.raw;
  if (item.covered) return { text: t('pkg.mcp_covered'), bad: false, running: false };
  const on = s.enabled !== false && s.state !== 'off';
  return { text: stateText(t, { ...s, on }), bad: on && s.state === 'stopped', running: on && s.state === 'running' };
}

/** 状态的字：运行中前面一个绿点（同软件包页，2026-10-20 项目主人），停了的红字。 @param {string} text @param {boolean} bad @param {boolean} running */
const stateNode = (text, bad, running) => h(`span.set-tool-state${bad ? '.is-error' : ''}${running ? '.is-on' : ''}`, text);

/** 加载方式的下拉：懒加载（`need_load` 是真的）、完整。 @param {any} dialog @param {ToolItem} item */
function loadSelect(dialog, item) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
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
  // MCP 自己写的不写「来源 · 自制」（同列表），只写状态
  const ownMcp = kind === 'mcp' && item.own;
  const meta = h('p.set-pkg-card-meta', ownMcp ? null : [t('tools.field.source'), ' · ', sourceNode], state ? [ownMcp ? null : ' · ', stateNode(state.text, state.bad, state.running)] : null);
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
    // 网址的服务（核心 X-32 上）没有命令、带 `url`：写地址；令牌、请求头、环境变量照约定遮住（引用照常写名字）
    if (typeof s.url === 'string') rows.push(line(t('tools.field.url'), h('code.set-tool-code', { title: s.url }, s.url)));
    else rows.push(line(t('tools.field.command'), h('code.set-tool-code', { title: commandLine(s.command) }, commandLine(s.command))));
    if (s.bearer != null) rows.push(line(t('tools.field.bearer'), h('code.set-tool-code', maskedValue(s.bearer))));
    if (s.headers && Object.keys(s.headers).length) rows.push(line(t('tools.field.headers'), h('code.set-tool-code', maskedPairs(s.headers))));
    if (s.env && Object.keys(s.env).length) rows.push(line(t('tools.field.env'), h('code.set-tool-code', maskedPairs(s.env))));
    if (Array.isArray(s.tools) && s.tools.length) {
      rows.push(h('div.set-row.is-wide', h('div.set-text', h('div.set-name', h('span', t('tools.field.tools')))),
        h('div.set-tool-list', s.tools.map((/** @type {string} */ name) => h('code.set-tool-chip', shortTool(item.name, name))))));
    }
    // 服务列出来了、核心没登记的工具（核心 X-37 的 `skipped`）：一个一行，写原名和为什么
    if (Array.isArray(s.skipped) && s.skipped.length) {
      rows.push(h('div.set-row.is-wide', h('div.set-text', h('div.set-name', h('span', t('tools.field.skipped'))), h('p.set-desc', t('tools.skipped_note'))),
        h('div.set-tool-skips', s.skipped.map((/** @type {any} */ x) => h('div.set-tool-skip', h('code.set-tool-chip', String(x.tool ?? '')),
          h('span', skippedWhy(t, x.why)))))));
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
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
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
  // 网址的服务也能编辑（核心 X-32 下：`mcp.set` 收 `url`、`bearer`、`headers`）
  if (editable(dialog.skills)) out.push(h('button.set-btn', { type: 'button', onclick: () => openServerForm(dialog, s) }, t('tools.edit')));
  const remove = h('button.set-btn.is-danger', { type: 'button', onclick: async () => {
    if (!await confirmIn(remove, { text: t('tools.delete_ask', { name: item.name }), yes: t('ask_yes'), no: t('ask_no') })) return;
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

/** 没登记的为什么（核心 X-37）：认得的写成话，别的照原样 @param {(k: string, f?: any) => string} t @param {any} why */
function skippedWhy(t, why) {
  const known = ['name_taken', 'parameters'];
  return known.includes(why) ? t(`tools.skipped_why.${why}`) : String(why ?? '');
}
