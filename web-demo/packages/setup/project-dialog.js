// @ts-check
//! 新建项目、项目设置（蓝图 `web.md`「会话整理和项目」第 8 条；整页的左栏、项目页发事件 `project.edit` 叫它）：一张盖在整页上的卡片（`float.js`），
//! 控件照设置页的（服务 `settings` 的 `kit`：不画描边，聚焦亮底加软影）。一行一项：名称（必填，最多 40 字）、说明（最多 80 字）、颜色（十二色一排，
//! 最后一块「+」自选）、工作区目录（同新会话的工作区菜单：默认工作区、最近用过的，右上角开系统的选目录对话框）、人格、预设（下拉，「默认」照配置）、
//! 附加提示词（几行的框）、留言（开关「能和项目外的会话互相留言」，默认关）。底下「取消」「创建 / 保存」；项目设置左下角「删除项目」点两下才删
//! （里面的会话移出项目，不删会话）。核心拒了的照它的话写在底下；`bad_params` 带 `data.field` 的写在那一格下面。

import { h, icon, replace } from '../../src/lib/dom.js';
import { floatCard } from './float.js';
import { field, switchField, area, twoClick } from './form.js';
import { Menu } from './menu.js';
import { browse } from './folders.js';
import { personaName, presetName, dirName, tilde, remember } from './model.js';
import { formOf, formProblem, createParams, updateParams, chars, NAME_MAX, DESCRIPTION_MAX, PROMPT_MAX } from './project-form.js';

/** 「默认」「无人格」在下拉里的值（下拉照字比，`undefined`、`null` 分不开） */
const DEFAULT = '\u0000default';
const NONE = '\u0000none';

/** 开着的那一张：同一时刻只开一张 @type {{close: () => void}|null} */
let opened = null;

/**
 * @param {any} ctx `setup` 包的 ctx
 * @param {import('./catalog.js').Catalog} catalog
 * @param {{project: import('./project-form.js').Project|null, count: number}} what 改哪个项目（`null` 是新建）、已经有几个项目（新建的颜色照它轮）
 * @param {{recent: () => string[], recentKey: string}} workspaces 最近用过的工作区（同新会话的工作区菜单）
 */
export async function editProject(ctx, catalog, what, workspaces) {
  if (opened || !ctx.settings) return;
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(`project.${key}`, fields);
  const chat = ctx.chat;
  const editing = what.project;
  const palette = /** @type {readonly (readonly [string, string])[]} */ (chat.projectPalette?.() ?? []);
  const form = formOf(editing, palette.length ? palette[what.count % palette.length][0] : '');
  const was = formOf(editing);
  const home = () => chat.home() ?? null;
  const def = chat.defaultWorkdir();
  if (!catalog.personas || !catalog.presets) await catalog.load().catch(() => {});

  let busy = false;
  const close = () => {
    if (opened !== handle) return;
    opened = null;
    menu.close();
    card.close();
  };
  const handle = { close };
  const card = floatCard({ title: t(editing ? 'title_edit' : 'title_new'), body: h('div'), close: t('close'), onDismiss: () => close() });
  opened = handle;
  card.el.classList.add('is-page', 'is-project');
  card.el.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    const open = card.el.querySelector('.set-menu');
    if (open) open.dispatchEvent(new CustomEvent('set-dismiss'));
    else if (menu.open) menu.close();
    else close();
  });
  const kit = ctx.settings.kit(card.el, (/** @type {string} */ text) => ctx.composer.say(text));

  /** 一格下面的小字：字数、核心说这一格不对 */
  const notes = /** @type {Record<string, HTMLElement>} */ ({});
  const note = (/** @type {string} */ key) => (notes[key] = h('small.project-note', { hidden: true }));
  const count = (/** @type {string} */ key, /** @type {string} */ text, /** @type {number} */ max) => {
    const n = chars(text);
    const el = notes[key];
    el.hidden = n <= max * 0.8;
    el.textContent = t('count', { n, max });
    el.classList.toggle('is-over', n > max);
  };

  // 名称、说明
  const name = kit.field(form.name, t('name_hint'));
  name.maxLength = NAME_MAX * 2;
  name.addEventListener('input', () => { form.name = name.value; count('name', name.value, NAME_MAX); sync(); });
  const description = kit.field(form.description, t('description_hint'));
  description.addEventListener('input', () => { form.description = description.value; count('description', description.value, DESCRIPTION_MAX); sync(); });

  // 颜色：十二色一排，最后一块「+」自选（系统的取色器）
  const swatches = h('div.project-swatches');
  const drawSwatches = () => {
    const custom = !!form.color && !palette.some(([light]) => light === form.color.toLowerCase());
    const picker = /** @type {HTMLInputElement} */ (h('input', { type: 'color', value: custom ? form.color : palette[0]?.[0] ?? '#c0603f', 'aria-label': t('color_pick') }));
    picker.addEventListener('input', () => { form.color = picker.value; drawSwatches(); });
    replace(swatches,
      palette.map(([light]) => h(`button.project-swatch${form.color.toLowerCase() === light ? '.is-on' : ''}`, {
        type: 'button', style: `--swatch: ${chat.projectColor?.(light) ?? light}`, title: light, 'aria-label': light,
        'aria-pressed': String(form.color.toLowerCase() === light),
        onclick: () => { form.color = light; drawSwatches(); },
      })),
      h(`label.project-swatch.is-pick${custom ? '.is-on' : ''}`, { title: t('color_pick'), style: custom ? `--swatch: ${form.color}` : null }, custom ? null : icon('plus'), picker));
  };
  drawSwatches();

  // 工作区目录：一个按钮，点开同新会话的工作区菜单（默认工作区、最近用过的；右上角开系统的选目录对话框）
  const menu = new Menu();
  const workBtn = h('button.set-btn.project-work', { type: 'button', onclick: () => openWorkspaces() });
  const drawWork = () => {
    const path = form.workspace;
    replace(workBtn, icon('folder'), h('span', path ? dirName(path) : t('default_workspace')), path ? h('small', path) : null);
    workBtn.title = path || tilde(def, home());
  };
  drawWork();
  /** 选了一个目录：先问核心能不能用（同新会话），记进最近用过的；存成人看到的写法（`~/…`） @param {string} path */
  const pickDir = async (path) => {
    const human = path === def ? '' : tilde(path, home());
    try {
      if (human) await ctx.core.request('fs.list', { cwd: path, dir: '' });
    } catch (err) {
      return say(err?.reason === 'path_forbidden' ? ctx.text('forbidden') : ctx.text('not_dir'));
    }
    form.workspace = human;
    ctx.storage.set(workspaces.recentKey, remember(workspaces.recent(), path, def, 5));
    drawWork();
  };
  const openWorkspaces = () => {
    const now = form.workspace || def;
    const others = workspaces.recent().filter((p) => p !== def);
    const same = (/** @type {string} */ p) => tilde(p, home()) === tilde(now, home());
    menu.show(workBtn, {
      title: ctx.text('set_workspace'),
      below: true,
      action: { icon: 'folder-open', title: ctx.text('folders.open_short'), run: () => browse(ctx, menu, workBtn, true, now, pickDir, (p) => tilde(p, home())) },
      rows: [
        { title: ctx.text('default_workspace'), desc: tilde(def, home()), current: !form.workspace, pick: () => pickDir(def) },
        ...(others.length ? [{ section: ctx.text('recent') }] : []),
        ...others.map((p) => ({ title: dirName(tilde(p, home())), desc: tilde(p, home()), current: same(p), pick: () => pickDir(p) })),
      ],
    });
  };

  // 人格、预设：下拉，「默认」照配置（`persona.default`、`preset.default`），人格多一个「无人格」
  const personaValue = form.persona === undefined ? DEFAULT : form.persona === null ? NONE : form.persona;
  const persona = kit.select([
    { value: DEFAULT, name: t('default') },
    { value: NONE, name: ctx.text('no_persona') },
    ...(catalog.personas ?? []).filter((p) => !p.problem || p.persona === form.persona).map((p) => ({ value: p.persona, name: personaName(p) })),
  ], personaValue, (/** @type {string} */ v) => { form.persona = v === DEFAULT ? undefined : v === NONE ? null : v; });
  const preset = kit.select([
    { value: DEFAULT, name: t('default') },
    ...(catalog.presets ?? []).filter((p) => !p.problem || p.preset === form.preset).map((p) => ({ value: p.preset, name: presetName(p) })),
  ], form.preset ?? DEFAULT, (/** @type {string} */ v) => { form.preset = v === DEFAULT ? undefined : v; });

  // 附加提示词、留言
  const prompt = area(form.prompt, t('prompt_hint'), 3);
  prompt.addEventListener('input', () => { form.prompt = prompt.value; count('prompt', prompt.value, PROMPT_MAX); sync(); });
  const open = kit.toggle(form.open, (/** @type {boolean} */ on) => { form.open = on; return true; });

  const error = h('p.setup-error', { hidden: true });
  /** @param {string} text */
  const say = (text) => {
    error.hidden = !text;
    error.textContent = text;
  };
  const ok = kit.button(t(editing ? 'save' : 'create'), { primary: true }, () => save());
  const sync = () => { ok.disabled = busy || !!formProblem(form); };
  const save = async () => {
    if (busy || formProblem(form)) return;
    const params = editing ? updateParams(editing.project, was, form) : createParams(form);
    if (!params) return close();
    busy = true;
    sync();
    say('');
    try {
      await ctx.core.request(editing ? 'project.update' : 'project.create', params);
      close();
    } catch (err) {
      busy = false;
      sync();
      const at = err?.reason === 'bad_params' ? err?.data?.field : null;
      if (at && notes[at]) {
        notes[at].hidden = false;
        notes[at].classList.add('is-over');
        notes[at].textContent = err.message;
      } else say(err?.message ?? String(err));
    }
  };
  const remove = editing ? twoClick(kit, t('delete'), t('delete_again'), async () => {
    try {
      await ctx.core.request('project.delete', { project: editing.project });
      close();
    } catch (err) {
      say(err?.message ?? String(err));
    }
  }) : null;

  card.setBody(h('div.setup-editor.project-editor',
    field(t('name'), h('div.project-cell', name, note('name'))),
    field(t('description'), h('div.project-cell', description, note('description')), t('description_desc')),
    field(t('color'), swatches),
    field(t('workspace'), h('div.project-work-wrap', workBtn, menu.el), t('workspace_desc')),
    field(t('persona'), persona),
    field(t('preset'), preset),
    field(t('prompt'), h('div.project-cell', prompt, note('prompt')), t('prompt_desc')),
    switchField(t('messages'), h('div.project-toggle', open, h('span', t('open')))),
    error,
    h('div.setup-foot', remove, h('span.setup-grow'), kit.button(t('cancel'), {}, close), ok)));
  sync();
  document.body.append(card.el);
  requestAnimationFrame(() => name.focus());
}
