// @ts-check
//! 交给别的包那一页的控件（挂载位 `settings.section` 的 `render(kit)`，蓝图 `web/architecture.md`「设置页」）：别的包画的页和设置页
//! 长一个样，控件不各抄一份。一行字的 `hint` 是空着时的占位字。`text` 是改完就存的一行字（`Enter`、离开时），`field` 是只记着、等那一页自己存的一行字；输入时打记号，
//! 别处改了配置重画时不冲掉正在写的（`dialog.editing`）。页里带 `data-set-dismiss` 的那一块，`Esc` 先发给它一个 `set-dismiss`
//! （它自己定收不收），没有的才关弹窗。删除、清空前问一句用 `confirm`（弹窗，2026-10-20 项目主人：不要「点一下变确认」）。

import { h } from '../../src/lib/dom.js';
import { toggle, textField, select, combo } from './rows.js';
import { confirmIn } from './confirm.js';

/**
 * @typedef {{
 *   toggle: (on: boolean, change: (on: boolean) => any) => HTMLElement,
 *   select: (options: {value: any, name: string, note?: string}[], value: any, pick: (v: any) => void) => HTMLElement,
 *   combo: (suggestions: string[], value: string|null, change: (next: string|null) => void) => HTMLElement,
 *   text: (text: string, hint: string, commit: (text: string) => void) => HTMLInputElement,
 *   field: (text: string, hint: string) => HTMLInputElement,
 *   button: (label: string, opts: {primary?: boolean, danger?: boolean}, onclick: () => void) => HTMLButtonElement,
 *   toast: (text: string) => void,
 *   confirm: (from: Element, text: string) => Promise<boolean>,
 *   number: (value: number, min: number, max: number, change: (n: number) => void) => HTMLInputElement,
 *   row: (opts: {lead?: Node|null, name: string, desc?: string, control?: Node|Node[]|null}) => HTMLElement,
 *   group: (title: string|null, ...rows: Node[]) => HTMLElement,
 * }} Kit
 */

/** @param {any} dialog @returns {Kit} */
export function sectionKit(dialog) {
  return {
    toggle,
    select: (options, value, pick) => select(dialog, options, value, pick),
    combo: (suggestions, value, change) => combo(dialog, suggestions, value, change),
    text: (text, hint, commit) => {
      const input = textField(text, 'text', '', commit);
      if (hint) input.placeholder = hint;
      return input;
    },
    field: (text, hint) => {
      const input = /** @type {HTMLInputElement} */ (h('input.set-input.is-text', { type: 'text', value: text, placeholder: hint || null, spellcheck: 'false', autocomplete: 'off' }));
      input.addEventListener('input', () => { input.dataset.dirty = '1'; });
      return input;
    },
    button: (label, opts, onclick) => /** @type {HTMLButtonElement} */ (h(`button.set-btn${opts.primary ? '.is-primary' : ''}${opts.danger ? '.is-danger' : ''}`, { type: 'button', onclick }, label)),
    toast: (text) => dialog.toast(text),
    /** 删除、清空前弹窗问一句（`confirm.js`），答了「确认」才是 `true` */
    confirm: (from, text) => confirmIn(from, { text, yes: dialog.ctx.text('ask_yes'), no: dialog.ctx.text('ask_no') }),
    /** 整数的数字框（悬停写范围）：改完（`Enter`、离开）照范围收下，写错的、出了范围的退回原来的 */
    number: (value, min, max, change) => {
      let now = value;
      const input = textField(String(value), 'number', `${min} – ${max}`, (text) => {
        const n = Number(text.trim());
        if (!Number.isInteger(n) || n < min || n > max) {
          input.value = String(now);
          return;
        }
        if (n === now) return;
        now = n;
        change(n);
      });
      return input;
    },
    /** 一行（同设置页的一行：左边名字和一句说明，右边控件；`lead` 放在最左边，拖动把手这类） */
    row: ({ lead = null, name, desc = '', control = null }) => h('div.set-row', lead,
      h('div.set-text', h('div.set-name', h('span', name)), desc ? h('p.set-desc', desc) : null),
      control ? h('div.set-control', control) : null),
    /** 一组（同设置页的一组：组名，下面一行行） */
    group: (title, ...rows) => h('section.set-group', title ? h('h3.set-group-name', title) : null, h('div.set-rows', rows)),
  };
}
