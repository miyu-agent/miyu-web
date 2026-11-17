// @ts-check
//! 手机上新建会话的「选项」（W-1208，2026-11-17 主人 38）：窄屏上输入框上面人格、预设、工作区三个按钮被吉祥物挤得换行，合成一个「选项」，
//! 点开一张浮起来的卡片（标题「选项」）：三行——人格、预设、工作区，左边名字、右边现在的值和 ›，点了翻进那一页选，选完回到这三行。
//! 工作区那一页照手机做（原来的是电脑上那种贴着按钮弹的小菜单、点不准，系统的选目录对话框又开在电脑上）：先是默认工作区、最近用过的，
//! 再一个能手输路径的框，再「浏览」——一行一个目录（`fs.list`），点进去、「上一级」，下面「选这个目录」。行都是大块的，手指点得准。
//! 桌面照旧三个按钮（`style.css` 照宽度只露一种）。

import { h, icon } from '../../src/lib/dom.js';
import { floatCard } from './float.js';
import { plainPath } from './model.js';

/**
 * @typedef {{title: string, desc?: string, current?: boolean, off?: boolean, pick: () => void}} Pick 一行（同 `index.js` 的 `personaRows`、`presetRows`）
 * @typedef {{
 *   t: (key: string, fields?: any) => string,
 *   persona: () => string, preset: () => string, workspace: () => string,
 *   personaRows: () => Pick[], presetRows: () => Pick[],
 *   workspaces: () => {path: string, title: string, desc: string, current: boolean}[],
 *   now: () => string,
 *   use: (path: string) => Promise<string|null>,
 *   readPath: (text: string) => string|null,
 *   show: (path: string) => string,
 *   list: (dir: string) => Promise<{dirs: {name: string, full: string}[], note: string, bad: boolean}>,
 *   parent: (dir: string) => Promise<string|null>,
 *   personas: boolean, presets: boolean,
 * }} Deps 三样现在写什么、列哪几项、选了怎么办；工作区：列表、现在的、换（交回一句错）、读手写的路径、路径写给人看的样子、列目录、上一级
 */

/**
 * 一行大块的：左边图标（有的话）、名字和下面暗色一行，右边勾或者 ›。
 * @param {{title: string, desc?: string, label?: string, value?: string, iconName?: string, current?: boolean, off?: boolean, more?: boolean, onclick: () => void}} o
 */
function row(o) {
  return h(`button.setup-opt-row${o.current ? '.is-current' : ''}${o.off ? '.is-off' : ''}`, { type: 'button', disabled: o.off ? true : null, onclick: o.onclick },
    o.iconName ? icon(o.iconName) : null,
    o.label != null
      ? [h('span.setup-opt-label', o.label), h('span.setup-opt-value', o.value ?? '')]
      : h('span.setup-opt-text', h('span.setup-opt-title', o.title), o.desc ? h('span.setup-opt-desc', o.desc) : null),
    o.current ? icon('check') : o.more ? icon('chevron-right') : null);
}

/** 一页的头：返回、这一页的名字（三行那一页不画） @param {string} title @param {() => void} back @param {string} backLabel */
function pageHead(title, back, backLabel) {
  return h('div.setup-opt-head', h('button.icon-button.setup-opt-back', { type: 'button', title: backLabel, 'aria-label': backLabel, onclick: back }, icon('chevron-left')),
    h('strong', title));
}

/**
 * 开「选项」卡片。`workspace` 的只有工作区那一页（开着的会话在手机上换工作区，标题「工作区」，选完收起）。
 * @param {Deps} d @param {{workspace?: boolean, closed?: () => void}} [o]
 */
export function openOptions(d, o = {}) {
  const { t } = d;
  const only = !!o.workspace;
  const card = floatCard({ title: t(only ? 'options.workspace' : 'options.title'), body: h('div'), close: t('options.close'), onDismiss: () => done() });
  const done = () => {
    card.close();
    o.closed?.();
  };
  const body = (/** @type {Node[]} */ ...nodes) => card.setBody(h('div.setup-opt', ...nodes));
  const main = () => body(
    d.personas ? row({ title: '', label: t('options.persona'), value: d.persona(), more: true, onclick: personas }) : null,
    d.presets ? row({ title: '', label: t('options.preset'), value: d.preset(), more: true, onclick: presets }) : null,
    row({ title: '', label: t('options.workspace'), value: d.workspace(), more: true, onclick: workspaces }));
  const picks = (/** @type {Pick[]} */ rows) => rows.map((r) => row({ title: r.title, desc: r.desc, current: r.current, off: r.off, onclick: () => { r.pick(); main(); } }));
  const personas = () => body(pageHead(t('options.persona'), main, t('options.back')), ...picks(d.personaRows()));
  const presets = () => body(pageHead(t('options.preset'), main, t('options.back')), ...picks(d.presetRows()));
  const error = h('p.setup-opt-error', { hidden: true });
  const say = (/** @type {string|null} */ why) => {
    error.hidden = !why;
    error.textContent = why ?? '';
  };
  /** 换到这个目录：成了回到三行，不成写在这一页 @param {string} path */
  const choose = async (path) => {
    const why = await d.use(path);
    if (why) return say(why);
    say(null);
    if (only) done();
    else main();
  };
  const workspaces = () => {
    say(null);
    const field = /** @type {HTMLInputElement} */ (h('input.setup-opt-input', { type: 'text', placeholder: t('options.path_hint'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go' }));
    const go = () => {
      const path = d.readPath(field.value);
      if (!path) return say(t('relative'));
      choose(path);
    };
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(); } });
    body(only ? null : pageHead(t('options.workspace'), main, t('options.back')),
      ...d.workspaces().map((w) => row({ title: w.title, desc: w.desc, current: w.current, onclick: () => choose(w.path) })),
      h('div.setup-opt-section', t('options.path')),
      h('div.setup-opt-path', field, h('button.setup-menu-btn.is-primary', { type: 'button', onclick: go }, t('options.use'))),
      error,
      row({ title: t('options.browse'), iconName: 'folder-open', more: true, onclick: () => browse(plainPath(d.now())) }));
  };
  /** 浏览目录：一行一个子目录，点进去；「上一级」；下面「选这个目录」 @param {string} dir */
  const browse = async (dir) => {
    say(null);
    const [got, up] = await Promise.all([d.list(dir), d.parent(dir)]);
    body(pageHead(d.show(dir), workspaces, t('options.back')),
      up && up !== dir ? row({ title: t('folders.up'), iconName: 'arrow-up', onclick: () => browse(up) }) : null,
      ...got.dirs.map((x) => row({ title: x.name, iconName: 'folder', more: true, onclick: () => browse(x.full) })),
      got.note ? h('p.setup-opt-note', got.note) : null,
      error,
      h('div.setup-opt-foot', h('button.setup-menu-btn.is-primary', { type: 'button', disabled: got.bad ? true : null, onclick: () => choose(dir) }, t('folders.choose'))));
  };
  if (only) workspaces();
  else main();
  // 盖整页（同左上角头像开的编辑卡片）；`Esc` 收起，不冒到输入框那边
  card.el.classList.add('is-page');
  card.el.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    done();
  });
  document.body.append(card.el);
  const box = /** @type {HTMLElement|null} */ (card.el.querySelector('.setup-float'));
  if (box) {
    box.tabIndex = -1;
    box.focus({ preventScroll: true });
  }
  return { close: done };
}
