// @ts-check
//! 导出会话的框（蓝图 `web.md`「导出会话」，核心 SE-1 中（f8f8a9bae）`session.export`，设计 58，W-1098）：左栏会话菜单的「导出…」打开。
//! 样子照「发送前问前缀」那一张（`prefix-ask.js`）：页面正中一张卡、后面淡遮罩，按钮同一套；`Esc`、点遮罩、「关闭」收起。
//!
//! - 上面四选一的用途：「自己看」「给别的 AI」「贴进网页 chat」三种是 Markdown（核心的 `for`），「原始包（能导回来）」是 ZIP。宿主导不了原始包的
//!   （走桥的演示）不列最后一种。每项下面一行说明。
//! - Markdown 的三种下面：范围（全部 / 现在的上下文 / 最近几轮，N 默认 20）、「带思考」、「工具」三档；默认照用途（`model/session-export.js`
//!   的 `defaultsFor`），换用途时整个换成新的默认，人改过的只留到换用途为止。原始包写一句包里有什么、自己留好。
//! - 按钮：Markdown 的「复制」「下载」，原始包的「下载」。导的时候按下的那一个转圈，几个都点不了。成了在框里写一句大小、token 估算、隐去了几处密钥；
//!   没成的照原因说（`export_too_big` 另写一句，别的照核心的原话）。

import { h, icon, replace } from './dom.js';
import { t } from '../util/res.js';
import { bytes, short } from '../lib/format.js';
import { writeClipboard } from '../core/host.js';
import { PURPOSES, defaultsFor, markdownParams, exportProblem, fileBase, redactedList, turnsOf } from '../model/session-export.js';

/**
 * @typedef {import('../model/session-export.js').Purpose} Purpose
 * @typedef {import('../model/session-export.js').Options} Options
 */

/** 开着的那一张：同时只开一张 @type {{close: () => void}|null} */
let opened = null;

/** 一排分段的按钮（同全部会话页「会话」「项目」那一排的样子）：交回那一排和换选中的函数。
 * @param {string} label @param {{value: string, name: string}[]} items @param {string} value @param {(v: string) => void} pick */
function segments(label, items, value, pick) {
  const buttons = items.map((it) => h('button.export-seg-item', {
    type: 'button', role: 'radio', 'aria-checked': String(it.value === value),
    onclick: () => { show(it.value); pick(it.value); },
  }, it.name));
  const show = (/** @type {string} */ v) => items.forEach((it, i) => buttons[i].setAttribute('aria-checked', String(it.value === v)));
  return { el: h('div.export-seg', { role: 'radiogroup', 'aria-label': label }, buttons), show };
}

/** 一个开关（同设置页的开关）。 @param {string} label @param {boolean} on @param {(on: boolean) => void} change */
function toggle(label, on, change) {
  const el = h('button.export-switch', { type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': label, onclick: () => { const next = el.getAttribute('aria-checked') !== 'true'; show(next); change(next); } }, h('i'));
  const show = (/** @type {boolean} */ v) => el.setAttribute('aria-checked', String(v));
  return { el, show };
}

/**
 * 打开导出框。
 * @param {{session: string, title: string|null, locale: string, request: (method: string, params: any) => Promise<any>,
 *   save: ((name: string, text: string) => void)|null, bundle: ((session: string, name: string) => Promise<{bytes: number}>)|null}} o
 *   `save` 叫浏览器存一段字（宿主的 `files.save`），`bundle` 导原始包（宿主的 `files.bundle`，网页软件的 `/export`；没有的不列原始包）
 */
export function openExport(o) {
  opened?.close();
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const purposes = PURPOSES.filter((p) => p !== 'bundle' || o.bundle);
  /** @type {Purpose} */
  let purpose = 'read';
  /** @type {Options} */
  let options = defaultsFor(purpose);
  let busy = false;
  let alive = true;
  const base = fileBase(o.title, o.session);

  const close = () => {
    if (!alive) return;
    alive = false;
    opened = null;
    document.removeEventListener('keydown', onKey, true);
    layer.remove();
    if (back?.isConnected) back.focus({ preventScroll: true });
  };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };

  // 用途：四选一，一项一行说明
  const rows = purposes.map((p) => h('button.export-purpose', { type: 'button', role: 'radio', 'aria-checked': String(p === purpose), onclick: () => choose(p) },
    h('span.export-purpose-name', t(`export.${p}`)),
    h('span.export-purpose-desc', t(`export.${p}_desc`))));

  // Markdown 的选项：范围（最近几轮多一个数字框）、带思考、工具
  const turns = /** @type {HTMLInputElement} */ (h('input.export-turns', { type: 'text', inputmode: 'numeric', value: String(options.turns), 'aria-label': t('export.range_turns') }));
  turns.addEventListener('change', () => {
    const n = turnsOf(turns.value);
    if (n == null) turns.value = String(options.turns);
    else options.turns = n;
  });
  const turnsBox = h('span.export-turns-box', turns, h('span', t('export.turns_unit')));
  const range = segments(t('export.range'), [
    { value: 'all', name: t('export.range_all') },
    { value: 'context', name: t('export.range_context') },
    { value: 'turns', name: t('export.range_turns') },
  ], options.range, (v) => { options.range = /** @type {Options['range']} */ (v); turnsBox.hidden = v !== 'turns'; });
  turnsBox.hidden = options.range !== 'turns';
  const thinking = toggle(t('export.thinking'), options.thinking, (on) => { options.thinking = on; });
  const tools = segments(t('export.tools'), [
    { value: 'line', name: t('export.tools_line') },
    { value: 'seen', name: t('export.tools_seen') },
    { value: 'full', name: t('export.tools_full') },
  ], options.tools, (v) => { options.tools = /** @type {Options['tools']} */ (v); });
  // 子代理（核心 SE-1 中下下，W-1098 补）：只写交代、回报，或者整份附在后面
  const children = segments(t('export.children'), [
    { value: 'reports', name: t('export.children_reports') },
    { value: 'append', name: t('export.children_append') },
  ], options.children, (v) => { options.children = /** @type {Options['children']} */ (v); });
  const line = (/** @type {string} */ label, /** @type {Node[]} */ ...control) => h('div.export-row', h('span.export-label', label), h('div.export-control', control));
  const markdownBox = h('div.export-options',
    line(t('export.range'), range.el, turnsBox),
    line(t('export.thinking'), thinking.el),
    line(t('export.tools'), tools.el),
    line(t('export.children'), children.el));
  const bundleNote = h('p.export-note', t('export.bundle_note'));

  // 结果、出错的那一句；底下的按钮
  const result = h('p.export-result', { role: 'status', hidden: true });
  const say = (/** @type {string} */ text, /** @type {boolean} */ bad = false) => {
    result.hidden = !text;
    result.textContent = text;
    result.classList.toggle('is-bad', bad);
  };
  const button = (/** @type {string} */ key, /** @type {string} */ name, /** @type {boolean} */ primary, /** @type {() => Promise<void>} */ run) => {
    const el = /** @type {HTMLButtonElement} */ (h(`button.export-btn${primary ? '.is-primary' : ''}`, { type: 'button', dataset: { key } }));
    const idle = () => replace(el, icon(name), h('span', t(`export.${key}`)));
    idle();
    el.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      sync();
      el.classList.add('is-busy');
      replace(el, icon('loader-circle'), h('span', t('export.working')));
      say('');
      try {
        await run();
      } catch (err) {
        if (alive) {
          const why = exportProblem(err);
          say(why.key === 'too_big' ? t('export.too_big') : t('export.failed', { reason: why.reason ?? '' }), true);
        }
      } finally {
        busy = false;
        el.classList.remove('is-busy');
        idle();
        sync();
      }
    });
    return el;
  };
  /** Markdown 放进回应（`to: "inline"`），交回回应 */
  const markdown = async () => {
    const got = await o.request('session.export', markdownParams(o.session, /** @type {any} */ (purpose), options, o.locale));
    if (typeof got?.text !== 'string') throw new Error('no text');
    return got;
  };
  /** 成了以后那一句：大小、token 估算、隐去了几处密钥 @param {string} key @param {any} got */
  const done = (key, got) => {
    const hidden = redactedList(got.redacted);
    const list = hidden.items.map((it) => t('export.redacted_item', { name: it.name, count: it.count })).join(t('export.list_sep'));
    const size = bytes(typeof got.bytes === 'number' ? got.bytes : new TextEncoder().encode(got.text).length);
    const said = t(`export.${key}`, { size, tokens: short(typeof got.tokens === 'number' ? got.tokens : 0) });
    say(hidden.total ? `${said}${t('export.sentence_sep')}${t('export.redacted', { count: hidden.total, list })}` : said);
  };
  const copy = button('copy', 'copy', false, async () => {
    const got = await markdown();
    await writeClipboard(got.text);
    if (alive) done('copied', got);
  });
  const download = button('download', 'download', true, async () => {
    if (purpose === 'bundle') {
      const got = await /** @type {NonNullable<typeof o.bundle>} */ (o.bundle)(o.session, base);
      if (alive) say(t('export.bundle_done', { size: bytes(got.bytes) }));
      return;
    }
    const got = await markdown();
    o.save?.(`${base}.md`, got.text);
    if (alive) done('saved', got);
  });
  const closeBtn = h('button.export-btn', { type: 'button', onclick: () => close() }, t('export.close'));
  const sync = () => {
    copy.disabled = busy;
    download.disabled = busy || (purpose !== 'bundle' && !o.save);
    for (const r of rows) /** @type {HTMLButtonElement} */ (r).disabled = busy;
  };

  /** 换用途：选项整个换成这一种的默认（人改过的只留到这里） @param {Purpose} p */
  const choose = (p) => {
    if (busy || p === purpose) return;
    purpose = p;
    options = defaultsFor(p);
    purposes.forEach((one, i) => rows[i].setAttribute('aria-checked', String(one === p)));
    range.show(options.range);
    tools.show(options.tools);
    children.show(options.children);
    thinking.show(options.thinking);
    turns.value = String(options.turns);
    turnsBox.hidden = options.range !== 'turns';
    const isBundle = p === 'bundle';
    markdownBox.hidden = isBundle;
    bundleNote.hidden = !isBundle;
    copy.hidden = isBundle;
    say('');
    sync();
  };

  const title = h('h3.export-title', { id: 'export-title' }, t('export.title'));
  const card = h('div.export-card', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'export-title' },
    title,
    h('p.export-sub', o.title || t('sidebar.untitled')),
    h('div.export-purposes', { role: 'radiogroup', 'aria-label': t('export.purpose') }, rows),
    markdownBox,
    bundleNote,
    result,
    h('div.export-foot', closeBtn, h('span.export-grow'), copy, download));
  bundleNote.hidden = true;
  const layer = h('div.export-ask', { onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, card);
  document.addEventListener('keydown', onKey, true);
  document.body.append(layer);
  opened = { close };
  sync();
  /** @type {HTMLElement} */ (rows[0]).focus({ preventScroll: true });
}
