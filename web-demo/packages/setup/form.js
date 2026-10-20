// @ts-check
//! 人格、预设编辑器共用的几样（软件包 `setup`，蓝图 `web.md`「人格、预设、工作区」第 6 条）：一个字段（字段名和控件）、跟着字长高的
//! 多行框（空着时占位字说写什么，不另加说明行）、点两次才做的按钮（删除、恢复出厂，不弹窗）、新建时只填名字的那一块。控件照设置页给的
//! `kit`（`settings/kit.js`），和设置页长一个样。

import { h } from '../../src/lib/dom.js';

/**
 * 设置页交来的控件（`settings.section` 的 `render(kit)`；软件包之间不互相 import，这里照用到的写一份形状）。
 * @typedef {{
 *   toggle: (on: boolean, change: (on: boolean) => void) => HTMLElement,
 *   select: (options: {value: any, name: string, note?: string}[], value: any, pick: (v: any) => void) => HTMLElement,
 *   text: (text: string, hint: string, commit: (text: string) => void) => HTMLInputElement,
 *   field: (text: string, hint: string) => HTMLInputElement,
 *   button: (label: string, opts: {primary?: boolean, danger?: boolean}, onclick: () => void) => HTMLButtonElement,
 *   toast: (text: string) => void,
 *   confirm: (from: Element, text: string) => Promise<boolean>,
 * }} Kit
 */

/**
 * 一个字段：左边字段名（下面可以有一行暗色的说明），右边控件；照设置页编辑供应商的表单（2026-10-08 项目主人：铺在页面上，不用白卡片）。
 * @param {string} name @param {HTMLElement} control @param {string|null} [desc]
 */
export const field = (name, control, desc = null) => h('div.setup-field', h('div.setup-field-name', h('span', name), desc ? h('small', desc) : null), h('div.setup-field-control', control));

/** 一行开关：名字和开关上下居中（字的框照文字框留了上边距，开关矮，对不齐）。 @param {string} name @param {HTMLElement} control */
export const switchField = (name, control) => {
  const el = field(name, control);
  el.classList.add('is-switch');
  return el;
};

/**
 * 多行框：跟着字长高；输入时打记号（设置页重画时不冲掉正在写的，`settings` 的 `editing`）。
 * @param {string} text @param {string} hint 空着时的占位字 @param {number} [rows] 最少几行
 */
export function area(text, hint, rows = 3) {
  const el = /** @type {HTMLTextAreaElement} */ (h('textarea.setup-area', { rows, placeholder: hint, spellcheck: 'false' }));
  el.value = text;
  const grow = () => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  el.addEventListener('input', () => {
    el.dataset.dirty = '1';
    grow();
  });
  // 放进页面以后才量得出高
  requestAnimationFrame(grow);
  return el;
}

/**
 * 删除、恢复出厂的按钮：点了先弹窗问一句（`kit.confirm`；2026-10-20 项目主人：「点一下变确认」不好，要弹窗确认），确认了才做。
 * @param {Kit} kit @param {string} label @param {() => string} ask 问的那句（点的时候现取，名字可能改过） @param {() => void} run
 */
export function askFirst(kit, label, ask, run) {
  const btn = kit.button(label, { danger: true }, async () => {
    if (await kit.confirm(btn, ask())) run();
  });
  return btn;
}

/**
 * 新建：只填名字的那一步（2026-10-08 项目主人：人格先填名字，建好接着在详情里写；预设填名字，功能先全开），放在浮卡里。名字空着「建好」
 * 点不了；`create` 交回一句错就写在下面、字留着。
 * @param {Kit} kit @param {(key: string) => string} t @param {string} hint
 * @param {(name: string) => Promise<string|null>} create @param {() => void} cancel
 */
export function nameFirst(kit, t, hint, create, cancel) {
  const input = kit.field('', hint);
  const err = h('p.setup-error', { hidden: true });
  const submit = async () => {
    const name = input.value.trim();
    if (!name) return;
    ok.disabled = true;
    const why = await create(name);
    err.hidden = !why;
    err.textContent = why ?? '';
    ok.disabled = false;
  };
  const ok = kit.button(t('edit.create'), { primary: true }, submit);
  ok.disabled = true;
  input.addEventListener('input', () => { ok.disabled = !input.value.trim(); });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    submit();
  });
  requestAnimationFrame(() => input.focus());
  return h('div.setup-editor', field(t('edit.name'), input), err, h('div.setup-foot', h('span.setup-grow'), kit.button(t('edit.cancel'), {}, cancel), ok));
}
