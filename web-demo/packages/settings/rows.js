// @ts-check
//! 设置页的一行（蓝图 `web.md`「设置页」第 4–8 条）：左边名字、说明，右边控件；名字下面的小字只写和「默认、当场生效」不一样的；
//! 改了当场存，存的时候转圈、成了一个对勾、拒了放回原来的值并写原因；写过的悬停露 ↺ 恢复默认。核心的项（`coreRow`）和网页包的项
//! （`look.js`）共用 `shell`。

import { h, icon, replace } from '../../src/lib/dom.js';
import { envRef, inputText, listElement, LAYER, writtenIn, secretName, referenceOptions, comboState, COMBO_OTHER } from './model.js';

/**
 * 一组：组名，下面一行行。
 * @param {string|null} name
 * @param {Node[]} rows
 */
/** 一组：组名、几行；一行都没有的（专门的编辑器把行都藏了）整组不画。 */
export const groupBlock = (name, rows) => {
  const shown = rows.filter(Boolean);
  // 组名是空的不画头一行（高级页点进去的那一层，页头已经写着组名）
  return shown.length ? h('section.set-group', name ? h('h3.set-group-name', name) : null, h('div.set-rows', shown)) : null;
};

/** 对不上哪一项的问题：那一页顶上一条横幅。 */
export const banner = (p) => h(`div.set-banner.is-${p.level === 'error' ? 'error' : 'warn'}`, icon(p.level === 'error' ? 'circle-alert' : 'triangle-alert'), h('span', p.message));

/** 存了多久还没回来才转圈（毫秒） */
const SPIN_AFTER_MS = 300;

/**
 * 一行的壳：名字、说明、小字（没有就不出这一行）、问题；右边控件和 ↺。交回节点和几个钩子（转圈、对勾、写原因）。
 * @param {{name: string, description?: string, source?: Node|string|null, problems?: {level: string, message: string}[],
 *   control: Node, reset?: (() => void)|null, resetTitle?: string}} o
 */
export function shell(o) {
  const status = h('span.set-status');
  const error = h('p.set-error', { hidden: true });
  const el = h('div.set-row',
    h('div.set-text',
      h('div.set-name', h('span', o.name)),
      o.description ? h('p.set-desc', { title: o.description }, o.description) : null,
      o.source ? h('p.set-source', o.source) : null,
      ...(o.problems ?? []).map((p) => h(`p.set-problem.is-${p.level === 'error' ? 'error' : 'warn'}`, p.message)),
      error),
    h('div.set-control',
      o.reset ? h('button.set-reset', { type: 'button', title: o.resetTitle, 'aria-label': o.resetTitle, onclick: o.reset }, icon('rotate-ccw')) : null,
      status, o.control));
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let spin;
  return {
    el,
    /** 存着：0.3 秒还没回来才转圈（快的不转，2026-10-21 项目主人：切一下也要转一下） */
    busy: () => {
      error.hidden = true;
      clearTimeout(spin);
      spin = setTimeout(() => { replace(status, icon('loader-circle')); status.className = 'set-status is-busy'; }, SPIN_AFTER_MS);
    },
    /** 成了：对勾，1 秒淡出 */
    done: () => { clearTimeout(spin); replace(status, icon('check')); status.className = 'set-status is-done'; },
    /** 拒了：原因写在这一项下面 */
    fail: (why) => { clearTimeout(spin); replace(status); status.className = 'set-status'; error.textContent = why; error.hidden = false; },
  };
}

/**
 * 核心的一项（第 4–8 条）。`compact` 的不写说明、不写生效时机（模型详情里：名字已经说清了，每一项都是下一轮生效）。
 * @param {any} dialog 设置页的弹窗（`dialog.js`）
 * @param {import('./model.js').Item} item
 * @param {{compact?: boolean}} [opts]
 */
export function coreRow(dialog, item, opts = {}) {
  const ctx = dialog.ctx;
  // 专门的编辑器（挂载位 `settings.editor`，照键）：别的包给这一项的选项（默认人格照人格列表），也可以把这一行藏了（没得选的）
  const editor = ctx.slots.pick('settings.editor', item.key);
  if (editor?.hidden?.()) return null;
  const value = item.entry?.value ?? item.fact?.value;
  /** @type {ReturnType<typeof shell>} */
  let row;
  const save = async (change) => {
    row.busy();
    const why = await dialog.save(item, change);
    if (why) row.fail(why);
    else row.done();
    return !why;
  };
  // 密钥（`type: secret`）：粘贴的先存成一个新名字的密钥（`secret.set`，不覆盖原来的），再把引用写进配置——人不用知道
  // `{ secret = … }` 怎么写（2026-10-10 当用户试「接入QQ的令牌」：写纯文字会被核心拒）
  const saveSecret = async (text) => {
    row.busy();
    const name = secretName(item.key.toLowerCase().replace(/[^a-z0-9]+/g, '-'), Date.now());
    try {
      await ctx.core.request('secret.set', { name, value: text });
    } catch (err) {
      row.fail(err?.message ?? String(err));
      return;
    }
    const why = await dialog.save(item, { value: { secret: name } });
    if (why) row.fail(why);
    else row.done();
  };
  const written = writtenIn(item.entry, LAYER);
  const made = editor?.options ? control(dialog, { ...item, control: 'select', options: editor.options() }, value, save) : control(dialog, item, value, save, saveSecret);
  row = shell({
    name: item.name,
    description: opts.compact ? '' : item.description,
    // 名字下面什么时候生效、谁的默认、盖过了谁都不写（2026-10-24 项目主人）
    source: null,
    problems: item.problems,
    control: made,
    reset: written ? () => save({ unset: true }) : null,
    resetTitle: ctx.text('reset'),
  });
  // 刚存成的：存完整页重读重画了，对勾画在新的这一行上
  if (dialog.justSaved?.(item.key)) row.done();
  return row.el;
}

/**
 * 控件（第 5 条），照 `control`。
 * @param {any} dialog
 * @param {import('./model.js').Item} item
 * @param {any} value 最终值
 * @param {(change: {value?: any, input?: string}) => any} save 存成了交回 `true`
 * @param {(text: string) => void} [saveSecret] 密钥：粘贴的那一串
 */
function control(dialog, item, value, save, saveSecret) {
  const ctx = dialog.ctx;
  if (item.control === 'toggle') return toggle(!!value, (on) => save({ value: on }));
  if (item.control === 'select') {
    const options = (item.options ?? []).map((o) => ({ value: o.value, name: o.name }));
    // 选了值是 `null` 的那一项（「默认」）：从这一层删掉
    return select(dialog, options, value ?? null, (v) => save(v === null ? { unset: true } : { value: v }));
  }
  if (item.control === 'list') return list(dialog, item, Array.isArray(value) ? value : [], (next) => save({ value: next }));
  if (item.control === 'combo') return combo(dialog, Array.isArray(item.suggestions) ? item.suggestions : [], value, (next) => save(next === null ? { unset: true } : { value: next }));
  const env = envRef(value);
  if (item.type === 'reference' && !env) {
    // 选模型的：下拉，第一项「不指定」（照核心的默认，写在说明里）；列表里没有的现值照原样留一项
    const options = [{ value: null, name: ctx.text('ref_unset') }, ...referenceOptions(dialog.models)];
    if (value != null && !options.some((o) => o.value === value)) options.push({ value, name: inputText(value) });
    return select(dialog, options, value ?? null, (v) => save(v === null ? { unset: true } : { value: v }));
  }
  if (item.type === 'secret' && saveSecret) {
    // 密钥：密码框，空着是不改（设了的占位写「已设置」），粘贴了 `Enter`、离开时存
    const kept = value && typeof value === 'object' && !env;
    const field = /** @type {HTMLInputElement} */ (h('input.set-input.is-text', { type: 'password', autocomplete: 'off', spellcheck: 'false',
      placeholder: kept ? ctx.text('secret_paste_keep') : ctx.text('secret_paste') }));
    const done = () => {
      const text = field.value.trim();
      field.value = '';
      if (text) saveSecret(text);
    };
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); field.blur(); } });
    field.addEventListener('blur', done);
    if (!env) return field;
    const label = h('button.set-env', { type: 'button', onclick: () => { label.replaceWith(field); field.focus(); } }, ctx.text('from_env', { name: env }));
    return label;
  }
  // 文字、数：一行字，`Enter`、离开时存，整串交给核心照类型读（`input`）；清空了是从这一层删掉（回到默认）；环境变量引用的先写
  // 「来自环境变量 X」，点了才改
  // 几行的字（控件 `textarea`，核心 P-9 三补：「更多描述」，能分行）：几行的框，占满这一行（`.set-area` 把控件放到名字下面）
  if (item.control === 'textarea' && !env) return areaField(inputText(value), (text) => save(text === '' ? { unset: true } : { value: text }));
  const field = textField(inputText(env ? '' : value), item.control === 'number' ? 'number' : 'text', item.max != null && item.min != null ? `${item.min} – ${item.max}` : '', (text) => save(text === '' ? { unset: true } : { input: text }));
  if (!env) return field;
  const label = h('button.set-env', { type: 'button', onclick: () => { label.replaceWith(field); field.focus(); } }, ctx.text('from_env', { name: env }));
  return label;
}

/**
 * 开关。点了先在原地拨过去、等圆点滑完（照样式里的过渡时长），再交给 `change` 去存：存完多半会重画整块，要是当场就存，
 * 新画的开关一出来就是新的样子，看不到滑（2026-10-10 项目主人：开关没有动画）。`change` 交回 `false`（或者抛错）的是没存成，拨回去；
 * 存着的时候再点不算。
 * @param {boolean} on @param {(on: boolean) => any} change
 */
export function toggle(on, change) {
  const el = /** @type {HTMLButtonElement} */ (h(`button.set-switch${on ? '.is-on' : ''}`, { type: 'button', role: 'switch', 'aria-checked': String(on) }, h('i')));
  const show = (/** @type {boolean} */ v) => {
    el.classList.toggle('is-on', v);
    el.setAttribute('aria-checked', String(v));
  };
  el.addEventListener('click', () => {
    if (el.disabled || el.dataset.busy) return;
    const next = !el.classList.contains('is-on');
    show(next);
    el.dataset.busy = '1';
    const knob = /** @type {HTMLElement} */ (el.firstElementChild);
    const wait = (parseFloat(getComputedStyle(knob).transitionDuration) || 0) * 1000;
    setTimeout(async () => {
      let ok;
      try {
        ok = await change(next);
      } catch {
        ok = false;
      }
      delete el.dataset.busy;
      if (ok === false) show(!next);
    }, wait);
  });
  return el;
}

/**
 * 一行字：改了打个记号（别处改了不冲掉它，`dialog.editing`），`Enter`、离开时字变了才存，`Esc` 放回原来的。
 * @param {string} text @param {'text'|'number'} kind @param {string} hint 悬停写范围 @param {(text: string) => void} commit
 */
export function textField(text, kind, hint, commit) {
  const input = /** @type {HTMLInputElement} */ (h(`input.set-input.is-${kind}`, { type: 'text', value: text, title: hint || null, spellcheck: 'false', inputmode: kind === 'number' ? 'decimal' : null }));
  input.addEventListener('input', () => { input.dataset.dirty = '1'; });
  const done = () => {
    if (input.dataset.dirty !== '1') return;
    input.dataset.dirty = '';
    if (input.value !== text) commit(input.value.trim());
  };
  const revert = () => {
    input.value = text;
    input.dataset.dirty = '';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      done();
    }
    // 引导这类没人在捕获阶段拿 `Esc` 的地方：自己放回
    if (e.key === 'Escape' && input.dataset.dirty === '1') {
      e.stopPropagation();
      revert();
    }
  });
  // 设置弹窗在捕获阶段先拿到 `Esc`，改了没存的交到这里放回
  input.addEventListener('set-revert', revert);
  input.addEventListener('blur', done);
  return input;
}


/**
 * 几行的框：`Enter` 换行，离开时字变了才存，`Esc` 放回原来的；改了打记号（同 `textField`），存的时候去掉前后的空白。
 * @param {string} text @param {(text: string) => void} commit
 */
export function areaField(text, commit) {
  const area = /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.set-area', { rows: '4', spellcheck: 'false' }));
  area.value = text;
  area.addEventListener('input', () => { area.dataset.dirty = '1'; });
  const revert = () => {
    area.value = text;
    area.dataset.dirty = '';
  };
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && area.dataset.dirty === '1') {
      e.stopPropagation();
      revert();
    }
  });
  // 设置弹窗在捕获阶段先拿到 `Esc`，改了没存的交到这里放回
  area.addEventListener('set-revert', revert);
  area.addEventListener('blur', () => {
    if (area.dataset.dirty !== '1') return;
    area.dataset.dirty = '';
    if (area.value !== text) commit(area.value.trim());
  });
  return area;
}

/**
 * 下拉：按钮写选中那一项，点开一个菜单（照「菜单」的浮层），默认那一项后面暗色写「默认」。
 * @param {any} dialog @param {{value: any, name: string, note?: string}[]} options @param {any} value @param {(v: any) => void} pick
 */
export function select(dialog, options, value, pick) {
  const chosen = options.find((o) => JSON.stringify(o.value) === JSON.stringify(value));
  const button = h('button.set-select', { type: 'button', onclick: () => menu(dialog, button, options, value, pick) }, h('span', chosen?.name ?? inputText(value)), icon('chevron-down'));
  return button;
}

/**
 * 下拉加「其他」手写（`combo`，核心 P-9 补）：第一项「不设」，接着照先后列建议值，最后一项「其他」；选了「其他」下拉旁边出一行字，
 * `Enter`、离开时存那一行。已经写了、不在建议里的值，停在「其他」、那一行字里是它。选「不设」、把那一行清空交 `null`。
 * @param {any} dialog @param {string[]} suggestions @param {any} value 现在的值 @param {(next: string|null) => void} change
 */
export function combo(dialog, suggestions, value, change) {
  const ctx = dialog.ctx;
  const state = comboState(suggestions, value);
  let choice = state.choice;
  const options = [{ value: null, name: ctx.text('combo_unset') }, ...suggestions.map((s) => ({ value: s, name: s })), { value: COMBO_OTHER, name: ctx.text('combo_other') }];
  const field = textField(state.custom, 'text', '', (text) => change(text || null));
  field.hidden = choice !== COMBO_OTHER;
  const box = h('div.set-combo', field);
  const pick = (/** @type {any} */ v) => {
    choice = v;
    draw();
    field.hidden = v !== COMBO_OTHER;
    if (v === COMBO_OTHER) {
      field.focus();
      return;
    }
    field.value = '';
    change(v);
  };
  const draw = () => {
    const button = select(dialog, options, choice, pick);
    if (box.firstChild !== field) box.firstChild?.replaceWith(button);
    else box.prepend(button);
  };
  draw();
  return box;
}

/** 在 `anchor` 下面开一个菜单；点外面、`Esc`、选了一项关上。 */
export function menu(dialog, anchor, options, value, pick) {
  dialog.panel.querySelector('.set-menu')?.dispatchEvent(new CustomEvent('set-dismiss'));
  // `off` 的（用不了：没装的这类）暗着、点不了，暗字写为什么
  const items = options.map((o) => h(`button.set-menu-item${JSON.stringify(o.value) === JSON.stringify(value) ? '.is-on' : ''}${o.off ? '.is-off' : ''}`, {
    type: 'button',
    role: 'option',
    disabled: o.off ? true : null,
    onclick: () => { close(); if (JSON.stringify(o.value) !== JSON.stringify(value)) pick(o.value); },
  }, h('span', o.name), o.note ? h('em', o.note) : null, JSON.stringify(o.value) === JSON.stringify(value) ? icon('check') : null));
  // 选项多的（选模型的那种，上百个）顶上一个搜索框：照名字、暗字找，不分大小写；回车选第一个对得上的
  const many = options.length > (dialog.ctx.config.menu_search_after ?? Infinity);
  const find = many ? /** @type {HTMLInputElement} */ (h('input.set-input.set-menu-search', { type: 'search', placeholder: dialog.ctx.text('menu_search'), spellcheck: 'false', autocomplete: 'off' })) : null;
  find?.addEventListener('input', () => {
    const q = find.value.trim().toLowerCase();
    for (const item of items) item.hidden = !!q && !item.textContent.toLowerCase().includes(q);
  });
  find?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    items.find((item) => !item.hidden)?.click();
  });
  const el = h('div.set-menu', { role: 'listbox' }, find, items);
  const outside = (e) => { if (!el.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
  const close = () => {
    document.removeEventListener('pointerdown', outside, true);
    el.remove();
  };
  el.addEventListener('set-dismiss', close);
  const box = dialog.panel.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const scale = box.width / dialog.panel.offsetWidth || 1;
  el.style.right = `${(box.right - at.right) / scale}px`;
  el.style.top = `${(at.bottom - box.top) / scale + 4}px`;
  dialog.panel.append(el);
  // 下面放不下往上开
  if (el.getBoundingClientRect().bottom > box.bottom - 8) el.style.top = `${(at.top - box.top) / scale - el.offsetHeight - 4}px`;
  document.addEventListener('pointerdown', outside, true);
  find?.focus();
  return el;
}

/**
 * 列表：一个个小块，每块 ✕，最后一个「＋」（元素是选项的开菜单，别的开一个小框；元素是数的照数存，`listElement`）。
 * @param {any} dialog @param {import('./model.js').Item} item @param {any[]} values @param {(next: any[]) => void} change
 */
function list(dialog, item, values, change) {
  const ctx = dialog.ctx;
  const nameOf = (v) => item.options?.find((o) => o.value === v)?.name ?? inputText(v);
  const chips = values.map((v, i) => h('span.set-chip', h('span', nameOf(v)), h('button', { type: 'button', 'aria-label': '×', onclick: () => change(values.filter((_, n) => n !== i)) }, icon('x'))));
  const add = h('button.set-chip.is-add', { type: 'button', title: ctx.text('add'), 'aria-label': ctx.text('add') }, icon('plus'));
  add.addEventListener('click', () => {
    if (item.options?.length) {
      const rest = item.options.filter((o) => !values.includes(o.value)).map((o) => ({ value: o.value, name: o.name }));
      if (rest.length) menu(dialog, add, rest, null, (v) => change([...values, v]));
      return;
    }
    const numeric = item.element === 'int' || item.element === 'float';
    const field = textField('', numeric ? 'number' : 'text', '', (text) => {
      if (!text) return;
      const value = listElement(item.element, text);
      // 已经在列表里的不再存一份（同一个群号写两遍没有意思），框收回成「＋」
      if (values.includes(value)) field.replaceWith(add);
      else change([...values, value]);
    });
    add.replaceWith(field);
    field.focus();
  });
  return h('div.set-chips', chips, add);
}

/** 搜索框停多久再筛（边打边筛；输入法选字时不筛） */
const TYPE_MS = 120;

/**
 * 一页顶上的搜索框（软件包页、技能、脚本、MCP 三页）：边打边筛，停一下再交 `change`；输入法选字时不交。框自己不重画（光标、输入法不断）。
 * @param {string} value @param {string} hint 占位字 @param {(query: string) => void} change
 */
export function findBox(value, hint, change) {
  const input = /** @type {HTMLInputElement} */ (h('input.set-pkg-find-input', { type: 'search', value, placeholder: hint, 'aria-label': hint, spellcheck: 'false', autocomplete: 'off' }));
  let composing = false;
  /** @type {any} */
  let timer = 0;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; input.dispatchEvent(new Event('input')); });
  input.addEventListener('input', () => {
    if (composing) return;
    clearTimeout(timer);
    timer = setTimeout(() => change(input.value), TYPE_MS);
  });
  return h('label.set-pkg-find', icon('search'), input);
}
