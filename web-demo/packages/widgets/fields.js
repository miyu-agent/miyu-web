// @ts-check
//! 表单的一格（软件包 `widgets`，蓝图 `web.md`「界面块」第 7 条「一格」）：左边名字和暗字说明，中间控件，右边「默认」或「恢复默认」，下面错、
//! 「已在别处修改」。六种控件同配置页：开关、下拉（选项少的画成一排分段按钮）、一行字、数字、能换行的字、一排小块的字。都不描边，`surface_2` 底。
//! 人改了照 `set` 交出去，这里不记状态；整张表单重画时照 `current` 画回人改的。

import { h, icon, append } from '../../src/lib/dom.js';
import { current, numberOf, segmented } from './forms.js';

/**
 * @typedef {{t: (path: string, fields?: any) => string, set: (key: string, value: any, typing?: boolean) => void, bad: (key: string, why: string|null) => void}} Hooks
 *   `set` 的 `typing` 是在框里打字（框不重画、不丢光标）；`bad` 是这一格的字认不出（数字框里填了字母这类）：记下来，保存按钮灰着
 */

/**
 * 一格。
 * @param {import('./forms.js').Field} field @param {import('./forms.js').State} state @param {Hooks} hooks
 * @param {string|null} invalid 这一格字认不出的话
 */
export function fieldRow(field, state, hooks, invalid) {
  const t = hooks.t;
  const value = current(state, field.key);
  const off = value == null;
  const note = state.problems[field.key] ? h('div.wg-f-problem', state.problems[field.key])
    : invalid ? h('div.wg-f-problem', invalid)
      : state.conflicts.has(field.key) ? h('div.wg-f-conflict', t('form.conflict')) : null;
  const tail = off ? h('span.wg-f-default', t('form.default'))
    : h('button.wg-f-restore', { type: 'button', onclick: () => hooks.set(field.key, null) }, t('form.restore'));
  return h(`div.wg-f-row${off ? '.is-default' : ''}`, { dataset: { key: field.key } },
    h('div.wg-f-name', h('div.wg-f-label', field.label), field.hint ? h('div.wg-f-hint', field.hint) : null),
    h('div.wg-f-control', control(field, value, hooks), note),
    h('div.wg-f-tail', tail));
}

/** 中间的控件。 @param {import('./forms.js').Field} field @param {any} value @param {Hooks} hooks */
function control(field, value, hooks) {
  const set = (/** @type {any} */ v) => hooks.set(field.key, v);
  const type = (/** @type {any} */ v) => hooks.set(field.key, v, true);
  const shown = value == null ? (field.default?.text ?? '') : '';
  switch (field.control) {
    case 'toggle':
      return h(`button.wg-switch${value === true ? '.is-on' : ''}${value == null ? '.is-default' : ''}`, {
        type: 'button', role: 'switch', 'aria-checked': String(value === true), 'aria-label': field.label, onclick: () => set(value !== true),
      }, h('i'), value == null && shown ? h('span.wg-f-faint', shown) : null);
    case 'select': return segmented(field) ? segments(field, value, set, shown) : dropdown(field, value, set, shown);
    case 'textarea': {
      const box = /** @type {HTMLTextAreaElement} */ (h('textarea.wg-input.wg-textarea', { rows: 3, placeholder: shown || field.placeholder || '', 'aria-label': field.label }));
      box.value = typeof value === 'string' ? value : '';
      box.oninput = () => type(box.value === '' ? null : box.value);
      return box;
    }
    case 'list': return chips(field, value, set, shown, hooks.t);
    case 'number': {
      const box = /** @type {HTMLInputElement} */ (h('input.wg-input', { type: 'text', inputmode: field.integer ? 'numeric' : 'decimal', placeholder: shown || field.placeholder || '', 'aria-label': field.label }));
      box.value = typeof value === 'number' ? String(value) : '';
      box.oninput = () => {
        const n = numberOf(box.value, field);
        if (n === false) hooks.bad(field.key, rangeText(field, hooks.t));
        else {
          hooks.bad(field.key, null);
          type(n);
        }
      };
      return box;
    }
    default: {
      const box = /** @type {HTMLInputElement} */ (h('input.wg-input', { type: 'text', placeholder: shown || field.placeholder || '', 'aria-label': field.label }));
      box.value = typeof value === 'string' ? value : '';
      box.oninput = () => type(box.value === '' ? null : box.value);
      return box;
    }
  }
}

/** 数字认不出时说要什么样的。 @param {import('./forms.js').Field} field @param {Hooks['t']} t */
function rangeText(field, t) {
  const kind = field.integer ? t('form.integer') : t('form.number');
  if (typeof field.min === 'number' && typeof field.max === 'number') return t('form.range', { kind, min: field.min, max: field.max });
  return kind;
}

/** 选项少的下拉：一排分段按钮；`null` 的哪个都不按下，后面接默认的字。 */
function segments(field, value, set, shown) {
  return h('div.wg-segs-line',
    h('div.wg-segs', { role: 'radiogroup', 'aria-label': field.label },
      ...(field.options ?? []).map((o) => h(`button.wg-seg${value === o.value ? '.is-on' : ''}`, {
        type: 'button', role: 'radio', 'aria-checked': String(value === o.value), onclick: () => set(o.value),
      }, o.label))),
    value == null && shown ? h('span.wg-f-faint', shown) : null);
}

/** 下拉：`null` 的最上面一项写默认的字。 */
function dropdown(field, value, set, shown) {
  const box = /** @type {HTMLSelectElement} */ (h('select.wg-input.wg-select', { 'aria-label': field.label }));
  const options = (field.options ?? []).map((o) => h('option', { value: o.value }, o.label));
  if (value == null) options.unshift(h('option', { value: '', disabled: true }, shown || '—'));
  box.replaceChildren(...options);
  box.value = value == null ? '' : String(value);
  box.onchange = () => set(box.value);
  return box;
}

/** 一排小块的字（`list`）：每个带 ×，末尾「＋ 加一个」点了原地变成框，回车加上、`Esc` 不加。 */
function chips(field, value, set, shown, t) {
  const list = Array.isArray(value) ? value : [];
  const row = h('div.wg-chips');
  const add = h('button.wg-chip-add', { type: 'button', onclick: () => {
    const box = /** @type {HTMLInputElement} */ (h('input.wg-input.wg-chip-input', { type: 'text', 'aria-label': field.label }));
    box.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = box.value.trim();
        if (text && !list.includes(text)) set([...list, text]);
        else box.replaceWith(add);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        box.replaceWith(add);
      }
    };
    box.onblur = () => { if (box.isConnected) box.replaceWith(add); };
    add.replaceWith(box);
    box.focus();
  } }, t('form.add_item'));
  append(row, [
    ...list.map((text, i) => h('span.wg-chip', text,
      h('button.wg-chip-x', { type: 'button', 'aria-label': t('form.remove', { text }), onclick: () => set(list.filter((_, j) => j !== i)) }, icon('x')))),
    value == null && shown ? h('span.wg-f-faint', shown) : null,
    add]);
  return row;
}
