// @ts-check
//! 一组字段的列表（蓝图 `web.md`「设置页」第 5 条「软件包配置项的词汇」，核心设计 53 第二节、PC-2）：`type: "list"`、`element: "record"`
//! 的项，`config.schema` 带 `fields`（每个字段一张，格同普通的项）、`title`（拿哪个字段当每一项的标题）。一项一张卡片：头一行写标题，
//! 右边上移、下移、删掉；点头一行展开、收起，展开了是这几个字段的表单（控件照字段的类型，同普通的项；密钥字段粘贴的先存成新的密钥名、
//! 只记引用）；最下面「加一项」。改一格、加、删、挪都把整条列表一起存；核心拒的照它说的「第几项的哪个字段」把红字写在那张卡片的那一格下面、
//! 展开那一张。

import { h, icon, replace } from '../../src/lib/dom.js';
import { confirmIn } from './confirm.js';
import { secretName } from './model.js';

/** 最多几项（核心设计 53 第二节第 4 条） */
export const MOST = 100;

/** 展开着的几张（按项的键记，存完整页重画也留着） @type {Map<string, Set<number>>} */
const opened = new Map();

/**
 * 字段：`[名字, 字段]` 的数组。核心给对象的照键的先后，给数组的照先后（名字照 `field`、`id`，或者键的最后一截）。
 * @param {{fields?: any}} item @returns {[string, any][]}
 */
export function fieldsOf(item) {
  const f = item.fields;
  if (Array.isArray(f)) {
    return /** @type {[string, any][]} */ (f.map((x) => [String(x?.field ?? x?.id ?? x?.key ?? '').split('.').pop() ?? '', x]).filter(([k]) => k));
  }
  return f && typeof f === 'object' ? Object.entries(f) : [];
}

/**
 * 卡片的标题：`title` 那个字段的值（选项照显示名）；没写 `title`、那一格空着的交 `null`（写「第 N 项」）。
 * @param {{title?: string|null, fields?: any}} item @param {any} record @returns {string|null}
 */
export function titleOf(item, record) {
  if (!item.title || !record || typeof record !== 'object') return null;
  const v = record[item.title];
  if (v == null || v === '') return null;
  const field = fieldsOf(item).find(([k]) => k === item.title)?.[1];
  const named = field?.options?.find((/** @type {any} */ o) => o.value === v)?.name;
  return String(named ?? v);
}

/** 新加的一项：有默认值的字段照默认值填，别的空着（核心照字段的默认补，必写的没写会说）。 @param {[string, any][]} fields */
export function blankRecord(fields) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, f] of fields) if (f?.default !== undefined && f.default !== null) out[k] = structuredClone(f.default);
  return out;
}

/**
 * 核心报的问题挂到哪张卡片的哪一格：键写成 `<项>[2].<字段>`（第几项从 0 数）；只写到 `<项>[2]` 的挂在那张卡片头上（字段是 `''`）。
 * @param {string} key @param {{key?: string, message: string}[]} problems @returns {Map<number, Map<string, string[]>>}
 */
export function problemSpots(key, problems) {
  /** @type {Map<number, Map<string, string[]>>} */
  const spots = new Map();
  for (const p of problems) {
    if (!p.key?.startsWith(`${key}[`)) continue;
    const m = /^\[(\d+)\](?:\.([^.[\]]+))?/.exec(p.key.slice(key.length));
    if (!m) continue;
    const i = Number(m[1]);
    const field = m[2] ?? '';
    if (!spots.has(i)) spots.set(i, new Map());
    const at = /** @type {Map<string, string[]>} */ (spots.get(i));
    // 写在那一格下面了，开头的键（`draw.accounts[0].name 没写：…`）不再写
    const text = p.message.startsWith(p.key) ? p.message.slice(p.key.length).replace(/^[\s:：]+/, '') : p.message;
    at.set(field, [...(at.get(field) ?? []), text]);
  }
  return spots;
}

/**
 * 改一格以后的整条列表（不动原来的）：`unset` 去掉那一格（核心照默认补），别的写上值。
 * @param {any[]} records @param {number} i @param {string} name @param {{value?: any, unset?: true}} change
 */
export function withField(records, i, name, change) {
  return records.map((r, n) => {
    if (n !== i) return r;
    const next = { ...(r && typeof r === 'object' ? r : {}) };
    if (change.unset) delete next[name];
    else next[name] = change.value;
    return next;
  });
}

/** 挪一项（`d` 是 -1 上移、1 下移）；挪不动的原样交回。 @param {any[]} records @param {number} i @param {number} d */
export function moved(records, i, d) {
  const j = i + d;
  if (j < 0 || j >= records.length) return records;
  const next = [...records];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * 字段的框里写的字照字段的类型读：数的读成数，读不成的照原样交给核心、由它说错在哪；别的照字。
 * @param {any} field @param {string} text
 */
export function fieldValue(field, text) {
  if (field?.type === 'int' || field?.type === 'number' || field?.type === 'float') {
    const n = Number(text);
    return text.trim() !== '' && Number.isFinite(n) ? n : text;
  }
  return text;
}

/**
 * 画这一项的卡片列表。`control` 是设置页画一格控件的那个（`rows.js`），字段照它画。
 * @param {any} dialog @param {any} item @param {any} value
 * @param {(change: {value: any}) => Promise<boolean>} save 整条列表一起存，存成了交 `true`
 * @param {(dialog: any, item: any, value: any, save: (change: any) => any, saveSecret?: (text: string) => void) => HTMLElement} control
 */
export function records(dialog, item, value, save, control) {
  const ctx = dialog.ctx;
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  const fields = fieldsOf(item);
  if (!opened.has(item.key)) opened.set(item.key, new Set());
  const open = /** @type {Set<number>} */ (opened.get(item.key));
  let rows = Array.isArray(value) ? structuredClone(value) : [];
  let spots = problemSpots(item.key, item.problems ?? []);
  for (const i of spots.keys()) open.add(i);
  const box = h('div.set-records');

  /** 存整条：先照新的画（不等重画），拒了的把问题挂到卡片上、展开那几张 @param {any[]} next */
  const commit = async (next) => {
    rows = next;
    spots = new Map();
    draw();
    const ok = await save({ value: next });
    if (ok) return true;
    spots = problemSpots(item.key, dialog.lastProblems ?? []);
    for (const i of spots.keys()) open.add(i);
    draw();
    return false;
  };

  /** 一张卡片里的一格 @param {number} i @param {string} name @param {any} f */
  const fieldRow = (i, name, f) => {
    const record = rows[i] ?? {};
    const sub = { ...f, key: `${item.key}[${i}].${name}`, problems: [] };
    const saveField = (/** @type {{value?: any, input?: string, unset?: true}} */ change) => commit(withField(rows, i, name,
      change.unset ? { unset: true } : { value: 'input' in change ? fieldValue(f, change.input ?? '') : change.value }));
    // 密钥字段：粘贴的先存成一个新名字的密钥，这一格只记引用（同普通的密钥项）
    const saveSecret = async (/** @type {string} */ text) => {
      const secret = secretName(`${item.key}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), Date.now());
      try {
        await ctx.core.request('secret.set', { name: secret, value: text });
      } catch (err) {
        spots = new Map([[i, new Map([[name, [/** @type {any} */ (err)?.message ?? String(err)]]])]]);
        draw();
        return;
      }
      await commit(withField(rows, i, name, { value: { secret } }));
    };
    const errors = spots.get(i)?.get(name) ?? [];
    return h('div.set-record-field',
      h('div.set-record-name', h('span', f?.name ?? name), f?.description ? h('small', f.description) : null),
      h('div.set-record-control', control(dialog, sub, record[name] ?? null, saveField, saveSecret),
        errors.length ? h('p.set-record-error', errors.join('\n')) : null));
  };

  /** 一张卡片 @param {number} i */
  const card = (i) => {
    const title = titleOf(item, rows[i]) ?? t('record.nth', { n: i + 1 });
    const isOpen = open.has(i);
    const tool = (/** @type {string} */ name, /** @type {string} */ label, /** @type {boolean} */ off, /** @type {(e: MouseEvent) => void} */ run) =>
      h('button.set-record-tool', { type: 'button', title: label, 'aria-label': label, disabled: off ? true : null, onclick: run }, icon(name));
    const swap = (/** @type {number} */ d) => {
      // 展开着的跟着挪
      const a = open.has(i);
      const b = open.has(i + d);
      open.delete(i);
      open.delete(i + d);
      if (a) open.add(i + d);
      if (b) open.add(i);
      void commit(moved(rows, i, d));
    };
    const head = h('div.set-record-head',
      h('button.set-record-toggle', { type: 'button', 'aria-expanded': String(isOpen), onclick: () => { if (isOpen) open.delete(i); else open.add(i); draw(); } },
        icon(isOpen ? 'chevron-down' : 'chevron-right'), h('span.set-record-title', title)),
      tool('arrow-up', t('record.up'), i === 0, () => swap(-1)),
      tool('arrow-down', t('record.down'), i === rows.length - 1, () => swap(1)),
      tool('trash-2', t('record.remove'), false, async (e) => {
        if (!await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('record.remove_ask', { name: title }), yes: t('ask_yes'), no: t('ask_no') })) return;
        // 后面的展开着的往前挪一格
        const kept = [...open].filter((n) => n !== i).map((n) => (n > i ? n - 1 : n));
        open.clear();
        for (const n of kept) open.add(n);
        void commit(rows.filter((_, n) => n !== i));
      }));
    const whole = spots.get(i)?.get('') ?? [];
    return h(`div.set-record${isOpen ? '.is-open' : ''}${spots.has(i) ? '.has-error' : ''}`, head,
      whole.length ? h('p.set-record-error', whole.join('\n')) : null,
      isOpen ? h('div.set-record-body', fields.map(([name, f]) => fieldRow(i, name, f))) : null);
  };

  const draw = () => {
    const full = rows.length >= MOST;
    const add = h('button.set-records-add', { type: 'button', disabled: full ? true : null, title: full ? t('record.full', { n: MOST }) : null, onclick: () => {
      open.add(rows.length);
      void commit([...rows, blankRecord(fields)]);
    } }, icon('plus'), h('span', t('record.add')));
    replace(box, rows.map((_, i) => card(i)), add);
  };
  draw();
  return box;
}
