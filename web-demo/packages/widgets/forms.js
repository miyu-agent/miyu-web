// @ts-check
//! 整页里的表单（软件包 `widgets`，蓝图 `web.md`「界面块」第 7 条；核心 `widgets.md`「整页里能改」）：一张表单人改到哪了、保存交哪几格、
//! 推来新内容时怎么并、一格的字怎么认。纯的，`sections.js` 照它画。
//!
//! - 只交改过的格（改回默认的交 `null`，没动的不交），包照部分更新办。
//! - 推来新内容：改过没存的格留着人填的，没动的照新的；推来的值和人开始改时的不一样的记下来（「已在别处修改」）；表单上没了的格丢掉。

/**
 * @typedef {{key: string, label: string, hint?: string, control: string, value: any, options?: {value: string, label: string}[],
 *   placeholder?: string, default?: {text?: string}, min?: number, max?: number, integer?: boolean}} Field
 * @typedef {{type: 'form', id: string, fields: Field[], submit: {label: string, call: string, params?: any}}} Form
 * @typedef {{base: Record<string, any>, edits: Record<string, any>, started: Record<string, any>, conflicts: Set<string>,
 *   problems: Record<string, string>, message: string|null, saving: boolean, saved: number}} State
 *   `base` 是包最后推来的值，`edits` 是人改了还没存的，`started` 是人开始改那一格时它的值；`problems` 逐格的错，`message` 整张表单的错；
 *   `saved` 是上一次存成的时候（「已保存」淡出用），没有是 0
 */

/** 两个值一样不一样（值只有布尔、数、字、字的数组、`null`）。 @param {any} a @param {any} b */
export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 表单里每一格的值。 @param {Form} form @returns {Record<string, any>} */
export const valuesOf = (form) => Object.fromEntries((form.fields ?? []).map((f) => [f.key, f.value ?? null]));

/** 一张表单刚画出来：没改过。 @param {Form} form @returns {State} */
export function fresh(form) {
  return { base: valuesOf(form), edits: {}, started: {}, conflicts: new Set(), problems: {}, message: null, saving: false, saved: 0 };
}

/** 这一格现在是什么（人改了的照人改的）。 @param {State} state @param {string} key */
export const current = (state, key) => (key in state.edits ? state.edits[key] : state.base[key] ?? null);

/** 改了一格：改回和推来的一样的不算改过；那一格原来的错收掉。 @param {State} state @param {string} key @param {any} value */
export function edit(state, key, value) {
  if (!(key in state.started)) state.started[key] = state.base[key] ?? null;
  if (same(value, state.base[key])) {
    delete state.edits[key];
    delete state.started[key];
    state.conflicts.delete(key);
  } else state.edits[key] = value;
  delete state.problems[key];
  state.message = null;
}

/** 有没有改了没存的。 @param {State} state */
export const dirty = (state) => Object.keys(state.edits).length > 0;

/** 保存交的：只有改过的格。 @param {State} state */
export const changes = (state) => ({ ...state.edits });

/** 丢掉没存的（「还原」）。 @param {State} state */
export function revert(state) {
  state.edits = {};
  state.started = {};
  state.conflicts.clear();
  state.problems = {};
  state.message = null;
}

/** 存成了：改的当成推来的（包推新内容前不闪回旧值），没存的清掉。 @param {State} state @param {number} now */
export function savedAll(state, now) {
  state.base = { ...state.base, ...state.edits };
  revert(state);
  state.saved = now;
}

/**
 * 推来了同一张表单的新内容：换掉 `base`；人改过的格留着，推来的值和人开始改时的不一样的记成打架；表单上没了的格丢掉。
 * @param {State} state @param {Form} form
 */
export function merge(state, form) {
  const next = valuesOf(form);
  for (const key of Object.keys(state.edits)) {
    if (!(key in next)) {
      delete state.edits[key];
      delete state.started[key];
      state.conflicts.delete(key);
    } else if (!same(next[key], state.started[key])) state.conflicts.add(key);
    // 推来的正好就是人改成的：不算改过了
    if (key in state.edits && same(next[key], state.edits[key])) {
      delete state.edits[key];
      delete state.started[key];
      state.conflicts.delete(key);
    }
  }
  for (const key of Object.keys(state.problems)) if (!(key in next)) delete state.problems[key];
  state.base = next;
}

/**
 * 包回的保存结果：存成了、逐格的错（`key` 不在这张表单上的并进整张表单的错）、整张表单的错。
 * @param {any} got @param {Form} form
 * @returns {{saved: true}|{saved: false, problems: Record<string, string>, message: string|null}}
 */
export function outcome(got, form) {
  if (got?.saved === true) return { saved: true };
  const keys = new Set((form.fields ?? []).map((f) => f.key));
  /** @type {Record<string, string>} */
  const problems = {};
  const stray = [];
  for (const p of Array.isArray(got?.problems) ? got.problems : []) {
    if (typeof p?.message !== 'string') continue;
    if (keys.has(p.key)) problems[p.key] = p.message;
    else stray.push(p.message);
  }
  const message = [typeof got?.message === 'string' ? got.message : '', ...stray].filter(Boolean).join('\n') || null;
  return { saved: false, problems, message };
}

/**
 * 数字框里的字：空的是 `null`（沿用默认）；认不出、出了 `min`/`max`、要整数却不是的交 `false`。
 * @param {string} raw @param {Field} field @returns {number|null|false}
 */
export function numberOf(raw, field) {
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return false;
  if (field.integer && !Number.isInteger(n)) return false;
  if (typeof field.min === 'number' && n < field.min) return false;
  if (typeof field.max === 'number' && n > field.max) return false;
  return n;
}

/** 下拉画成一排分段按钮：选项不多于 4 个、每个不超过 6 个字。 @param {Field} field */
export const segmented = (field) => Array.isArray(field.options) && field.options.length > 0 && field.options.length <= 4
  && field.options.every((o) => [...String(o.label ?? '')].length <= 6);

/** 一项的头像字：标题的第一个字（大写），没有的 `·`。 @param {string} title */
export const initialOf = (title) => ([...String(title ?? '').trim()][0] ?? '·').toUpperCase();

/** 找的框：标题、副标题里有这几个字的（不分大小写）。 @param {{title?: string, subtitle?: string}} item @param {string} query */
export function matches(item, query) {
  const q = query.trim().toLowerCase();
  return !q || `${item.title ?? ''}\n${item.subtitle ?? ''}`.toLowerCase().includes(q);
}

/** 标签：一小段字，或者 `{text, tone}`。 @param {any} badge @returns {{text: string, tone: string}|null} */
export function badgeOf(badge) {
  if (typeof badge === 'string') return badge ? { text: badge, tone: 'normal' } : null;
  if (badge && typeof badge.text === 'string' && badge.text) return { text: badge.text, tone: typeof badge.tone === 'string' ? badge.tone : 'normal' };
  return null;
}

/** 状态点只认这四种。 @param {any} state */
export const stateOf = (state) => (['good', 'warn', 'bad', 'off'].includes(state) ? state : null);
