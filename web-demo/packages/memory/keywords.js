// @ts-check
//! 关键词的框（蓝图 `web.md`「记忆页」第 3、6 条；2026-10-20 项目主人：「逗号隔开」分不清中文、英文逗号）：一个个小块，打一个词按 `Enter`
//! 或者打逗号（中文、英文都行）、顿号就成一块，✕ 删掉，框空着按退格删最后一块。交给外面的照一个框用：`value` 是连回核心那一行的字
//! （`joinKeywords`），改了发 `input`，`dataset.dirty` 照旧打记号。

import { h, icon } from '../../src/lib/dom.js';
import { splitKeywords, joinKeywords } from './model.js';

/**
 * @param {string|null} start 原来的关键词（核心那一行） @param {string} hint 空着时的占位 @param {boolean} [disabled]
 * @returns {HTMLElement & {value: string}}
 */
export function keywordBox(start, hint, disabled = false) {
  /** @type {string[]} */
  let words = splitKeywords(start);
  const input = /** @type {HTMLInputElement} */ (h('input.mem-kw-input', { type: 'text', spellcheck: 'false', autocomplete: 'off', disabled }));
  const chips = h('span.mem-kw-chips');
  const root = /** @type {any} */ (h(`div.set-input.mem-kw-box${disabled ? '.is-disabled' : ''}`, { onclick: () => input.focus() }, chips, input));
  const changed = () => root.dispatchEvent(new Event('input', { bubbles: true }));
  const draw = () => {
    chips.replaceChildren(...words.map((w, i) => h('span.mem-kw-chip', h('span', w), disabled ? null : h('button', {
      type: 'button', 'aria-label': '×', onclick: (/** @type {Event} */ e) => { e.stopPropagation(); words.splice(i, 1); draw(); changed(); },
    }, icon('x')))));
    input.placeholder = words.length ? '' : hint;
  };
  /** 框里打的字里有隔开的记号：前面的几块收进去，最后那一截留在框里接着打 */
  const take = (/** @type {boolean} */ all) => {
    const parts = input.value.split(/[,，、;；\n]/);
    const rest = all ? '' : parts.pop() ?? '';
    const add = splitKeywords(parts.join(','));
    if (!add.length && rest === input.value) return;
    for (const w of add) if (!words.includes(w)) words.push(w);
    input.value = rest;
    draw();
  };
  input.addEventListener('input', (e) => {
    if (/** @type {InputEvent} */ (e).isComposing) return;
    if (/[,，、;；]/.test(input.value)) take(false);
    e.stopPropagation();
    changed();
  });
  input.addEventListener('compositionend', () => input.dispatchEvent(new Event('input')));
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      take(true);
      changed();
    } else if (e.key === 'Backspace' && !input.value && words.length) {
      words.pop();
      draw();
      changed();
    }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) { take(true); changed(); } });
  Object.defineProperty(root, 'value', {
    get: () => joinKeywords([...words, ...splitKeywords(input.value)].filter((w, i, all) => all.indexOf(w) === i)),
  });
  draw();
  return root;
}
