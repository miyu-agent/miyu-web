// @ts-check
//! 直接在页面上开一个人格、预设的编辑卡片（左栏左上角的头像点进来的，2026-10-10 项目主人：直接打开编辑卡片，不先开设置页；列人格、预设的
//! 列表里点编辑图标、按 `e` 的，2026-10-20 项目主人，蓝图「人格、预设、工作区」第 10 条）：和设置页「人格」「预设」页里点一块开的是同一张卡片、
//! 同一个编辑器（`float.js`、`persona-editor.js`、`preset-editor.js`），只是盖在整页上。控件照设置页的（服务 `settings` 的 `kit`）。
//! 点卡片外面、`Esc`、✕ 交给编辑器（改了没存的不关、提示一句）；存了重读列表，左上角、对话区的头像跟着换；关了叫 `closed`，带上这一回存没存过
//! （存了、删了、恢复了都算，只换外观的不算：列表那边照它问要不要压缩，蓝图「人格、预设、工作区」第 10 条）。

import { floatCard } from './float.js';
import { PersonaEditor } from './persona-editor.js';
import { PresetEditor } from './preset-editor.js';
import { personaName, presetName } from './model.js';

/** 开着的那一张：同一时刻只开一张 @type {{close: () => void}|null} */
let opened = null;

/**
 * @param {any} ctx `setup` 包的 ctx
 * @param {import('./catalog.js').Catalog} catalog
 * @param {string} id 人格的编号
 * @param {(panel: HTMLElement, toast: (text: string) => void) => import('./form.js').Kit} kitOf 服务 `settings` 的 `kit`
 * @param {{closed?: (how: {changed: boolean}) => void}} [opts] 卡片关了以后做什么
 */
export function editPersona(ctx, catalog, id, kitOf, opts = {}) {
  return editItem(ctx, catalog, 'persona', id, kitOf, opts);
}

/** 预设的编辑卡片（同 `editPersona`）。 @param {any} ctx @param {import('./catalog.js').Catalog} catalog @param {string} id @param {any} kitOf @param {{closed?: (how: {changed: boolean}) => void}} [opts] */
export function editPreset(ctx, catalog, id, kitOf, opts = {}) {
  return editItem(ctx, catalog, 'preset', id, kitOf, opts);
}

/**
 * @param {any} ctx @param {import('./catalog.js').Catalog} catalog @param {'persona'|'preset'} kind @param {string} id @param {any} kitOf
 * @param {{closed?: (how: {changed: boolean}) => void}} opts
 */
async function editItem(ctx, catalog, kind, id, kitOf, opts) {
  if (opened) return;
  const t = (/** @type {string} */ key) => ctx.text(key);
  /** @type {PersonaEditor|PresetEditor|null} */
  let editor = null;
  /** 这一回存过没有 */
  let changed = false;
  const dismiss = () => (editor ? editor.tryClose() : close());
  const card = floatCard({ title: '', body: document.createElement('div'), close: t('edit.close'), onDismiss: dismiss });
  const close = () => {
    if (opened !== handle) return;
    opened = null;
    card.close();
    opts.closed?.({ changed });
  };
  const handle = { close };
  opened = handle;
  card.el.classList.add('is-page');
  // `Esc`：开着的下拉先收（同设置页），没有的交给编辑器；不让它冒到输入框那边（两下 `Esc` 是打断）
  card.el.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    const menu = card.el.querySelector('.set-menu');
    if (menu) menu.dispatchEvent(new CustomEvent('set-dismiss'));
    else dismiss();
  });
  document.body.append(card.el);
  const box = /** @type {HTMLElement} */ (card.el.querySelector('.setup-float'));
  box.tabIndex = -1;
  box.focus({ preventScroll: true });
  const hooks = {
    // 只换头像、主题色、背景图的（`look`）不算改了：模型看的字没变，缓存不受影响（终端同样）
    saved: (/** @type {{look?: boolean}} */ how = {}) => {
      if (!how.look) changed = true;
      return catalog.load();
    },
    removed: (/** @type {boolean} */ remains) => {
      changed = true;
      // 恢复出厂的还在，照出厂的样子重读；删掉的关掉卡片
      if (remains) editor?.load();
      else close();
      catalog.load();
    },
    close,
  };
  const kit = kitOf(card.el, (/** @type {string} */ text) => ctx.composer.say(text));
  if (kind === 'persona') {
    const item = catalog.personas?.find((p) => p.persona === id);
    editor = new PersonaEditor(ctx, kit, catalog, id, hooks, item ? { name: personaName(item) } : {});
  } else {
    const item = catalog.presets?.find((p) => p.preset === id);
    editor = new PresetEditor(ctx, kit, catalog, id, hooks, item ? { name: presetName(item) } : {});
  }
  card.setTitle(editor.title);
  card.setBody(editor.body);
  await editor.load();
}
