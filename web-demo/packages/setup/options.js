// @ts-check
//! 新建会话的「选项」（W-1208，2026-11-17 主人 38；W-1209 桌面也收成这一个）：输入框上面人格、预设、工作区三个按钮合成一个「选项」，
//! 按钮上只写图标和「选项」（2026-11-20 主人验收：不写里面选了什么）。点了贴着按钮往上弹一个小菜单（`menu.js`：宽度跟着字、一行 32px，
//! 同换模型那个菜单里「思考程度　默认 ›」那一行的样子），三行：左边名字，右边暗字写现在的值、›——人格、预设、工作区，点了在菜单里翻进
//! 那一页选，选完回到三行（2026-11-20 主人验收：原来是一张盖整页的大卡片，又宽又空）。
//! 手机上（主要指针是手指）工作区那一页开一张大块的卡片（`openWorkspaceCard`，原来贴着按钮弹的小菜单点不准、系统的选目录对话框又开在
//! 电脑上）：先是默认工作区、最近用过的，再一个能手输路径的框，再「浏览」——一行一个目录（`fs.list`），点进去、「上一级」，下面
//! 「选这个目录」。行都是大块的，手指点得准。开着的会话在手机上换工作区、空会话里不带路径的 `/workspace` 也开它。桌面上「浏览」那一行是
//! 「选择文件夹…」：照旧开系统的选目录对话框（`folders.js` 的 `askDir`），开不了的才在卡片里一行一个目录地浏览。

import { h, icon } from '../../src/lib/dom.js';
import { floatCard } from './float.js';
import { plainPath } from './model.js';

/**
 * 「选项」小菜单的第一屏：三行「名字　暗字的值 ›」，读不到列表的那一样（旧核心）不列。点一行翻进那一页（`keep`：菜单不收）。
 * @param {{t: (key: string) => string, personas: boolean, presets: boolean, persona: () => string, preset: () => string, workspace: () => string,
 *   openPersona: () => void, openPreset: () => void, openWorkspace: () => void}} d
 * @returns {import('./menu.js').View}
 */
export function optionsView(d) {
  const line = (/** @type {string} */ key, /** @type {string} */ value, /** @type {() => void} */ open) => ({ title: d.t(`options.${key}`), side: value, more: true, keep: true, pick: open });
  return {
    title: '',
    rows: [
      ...(d.personas ? [line('persona', d.persona(), d.openPersona)] : []),
      ...(d.presets ? [line('preset', d.preset(), d.openPreset)] : []),
      line('workspace', d.workspace(), d.openWorkspace),
    ],
  };
}

/**
 * @typedef {{
 *   t: (key: string, fields?: any) => string,
 *   workspaces: () => {path: string, title: string, desc: string, current: boolean}[],
 *   now: () => string,
 *   use: (path: string) => Promise<string|null>,
 *   readPath: (text: string) => string|null,
 *   show: (path: string) => string,
 *   list: (dir: string) => Promise<{dirs: {name: string, full: string}[], note: string, bad: boolean}>,
 *   parent: (dir: string) => Promise<string|null>,
 *   ask?: ((start: string) => Promise<any>)|null,
 * }} Deps 工作区：列表、现在的、换（交回一句错）、读手写的路径、路径写给人看的样子、列目录、上一级；
 *   `ask` 开系统的选目录对话框（桌面才有，交回选的路径、`false` 取消、`{busy}` 已经开着一个、`null` 开不了）
 */

/**
 * 一行大块的：左边图标（有的话）、名字和下面暗色一行，右边勾或者 ›。
 * @param {{title: string, desc?: string, iconName?: string, current?: boolean, more?: boolean, onclick: () => void}} o
 */
function row(o) {
  return h(`button.setup-opt-row${o.current ? '.is-current' : ''}`, { type: 'button', onclick: o.onclick },
    o.iconName ? icon(o.iconName) : null,
    h('span.setup-opt-text', h('span.setup-opt-title', o.title), o.desc ? h('span.setup-opt-desc', o.desc) : null),
    o.current ? icon('check') : o.more ? icon('chevron-right') : null);
}

/** 一页的头：返回、这一页的名字 @param {string} title @param {() => void} back @param {string} backLabel */
function pageHead(title, back, backLabel) {
  return h('div.setup-opt-head', h('button.icon-button.setup-opt-back', { type: 'button', title: backLabel, 'aria-label': backLabel, onclick: back }, icon('chevron-left')),
    h('strong', title));
}

/**
 * 开工作区的卡片（标题「工作区」，选完收起）：手机上换工作区、空会话里不带路径的 `/workspace`。
 * @param {Deps} d @param {{closed?: () => void}} [o]
 */
export function openWorkspaceCard(d, o = {}) {
  const { t } = d;
  const card = floatCard({ title: t('options.workspace'), body: h('div'), close: t('options.close'), onDismiss: () => done() });
  const done = () => {
    card.close();
    o.closed?.();
  };
  const body = (/** @type {Node[]} */ ...nodes) => card.setBody(h('div.setup-opt', ...nodes));
  const error = h('p.setup-opt-error', { hidden: true });
  const say = (/** @type {string|null} */ why) => {
    error.hidden = !why;
    error.textContent = why ?? '';
    waiting.hidden = true;
  };
  /** 等系统的选目录对话框回来时写的一句（暗字，不是出错） */
  const waiting = h('p.setup-opt-note', { hidden: true });
  /** 换到这个目录：成了收起，不成写在这一页 @param {string} path */
  const choose = async (path) => {
    const why = await d.use(path);
    if (why) return say(why);
    say(null);
    done();
  };
  /** 桌面：开系统的选目录对话框；开不了的在卡片里浏览 */
  const ask = async () => {
    if (!d.ask) return browse(plainPath(d.now()));
    say(null);
    waiting.textContent = t('folders.opening');
    waiting.hidden = false;
    const picked = await d.ask(plainPath(d.now()));
    waiting.hidden = true;
    if (typeof picked === 'string') return choose(plainPath(picked));
    if (picked === false) return say(null);
    if (picked?.busy) return say(t('folders.busy'));
    return browse(plainPath(d.now()));
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
    body(...d.workspaces().map((w) => row({ title: w.title, desc: w.desc, current: w.current, onclick: () => choose(w.path) })),
      h('div.setup-opt-section', t('options.path')),
      h('div.setup-opt-path', field, h('button.setup-menu-btn.is-primary', { type: 'button', onclick: go }, t('options.use'))),
      error,
      waiting,
      d.ask ? row({ title: t('folders.open'), iconName: 'folder-open', onclick: ask }) : row({ title: t('options.browse'), iconName: 'folder-open', more: true, onclick: () => browse(plainPath(d.now())) }));
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
  workspaces();
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
