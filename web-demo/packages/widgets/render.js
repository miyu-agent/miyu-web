// @ts-check
//! 画一块界面块（软件包 `widgets`，蓝图 `web.md`「界面块」第 2 到 4 条）：头一行认得出是谁放的（图标、软件名、标题、没在跑写「未运行」），
//! 下面六种内容一律当字画（`textContent`，不认 Markdown、HTML），超过行数上限的收起、底下「展开」。动作交给 `act`（调方法、开整页、复制）。

import { h, icon, hasIcon } from '../../src/lib/dom.js';
import { clip, rightParts, toneOf } from './model.js';

/** 一条的状态记号：进行中的转圈，别的写一个字 */
const MARKS = /** @type {Record<string, string>} */ ({ todo: '○', done: '✓', failed: '✕', off: '—' });

/**
 * @typedef {{rows: number, text: (path: string, fields?: any) => string, act: (action: any, block: import('./model.js').Block) => void,
 *   head?: boolean}} Opts `head` 为假的不画头一行（整页：顶栏已经写了是谁）
 */

/**
 * 一块：交回一个节点，内容变了照它再 `fill`（节点留着：展开了的还展开着）。
 * @param {import('./model.js').Block} block @param {Opts} opts
 */
export function drawBlock(block, opts) {
  const el = h('section.wg-block');
  fill(el, block, opts);
  return el;
}

/** 照这一块现在的样子重画节点里面。 @param {HTMLElement} el @param {import('./model.js').Block} block @param {Opts} opts */
export function fill(el, block, opts) {
  const t = opts.text;
  const open = el.dataset.open === '1';
  const content = Array.isArray(block.content) ? block.content : [];
  const { shown, hidden } = open ? { shown: content, hidden: 0 } : clip(content, opts.rows);
  const head = opts.head === false ? null : h('header.wg-head',
    h('span.wg-face', icon(block.icon && hasIcon(block.icon) ? block.icon : 'package')),
    h('span.wg-source', block.source),
    block.title ? h('span.wg-title', block.title) : null,
    block.running ? null : h('span.wg-off', t('not_running')));
  const body = content.length ? shown.map((seg) => segment(seg, block, opts)) : [h('p.wg-empty', t('empty'))];
  const more = hidden ? h('button.wg-more', { type: 'button', onclick: () => { el.dataset.open = '1'; fill(el, block, opts); } }, t('expand', { rows: hidden })) : null;
  el.replaceChildren(...[head, ...body, more].filter(Boolean));
}

/** 一段（整页里能改的那一页也照它画别的六种）。 @param {any} seg @param {import('./model.js').Block} block @param {Opts} opts */
export function segment(seg, block, opts) {
  switch (seg.type) {
    case 'heading': return h('div.wg-heading', String(seg.text ?? ''));
    case 'text': return h(`div.wg-text.wg-tone-${toneOf(seg.tone)}`, String(seg.text ?? ''));
    case 'pairs': return h('div.wg-pairs', (seg.items ?? []).map((/** @type {any} */ p) =>
      h('div.wg-pair', h('span.wg-label', String(p.label ?? '')), h(`span.wg-value.wg-tone-${toneOf(p.tone)}`, String(p.value ?? '')))));
    case 'progress': return progress(seg);
    case 'list': return h('div.wg-list', (seg.items ?? []).map((/** @type {any} */ it) => item(it, block, opts)));
    case 'buttons': return h('div.wg-buttons', (seg.items ?? []).map((/** @type {any} */ b) =>
      h('button.wg-button', { type: 'button', onclick: () => opts.act(b.action, block) }, String(b.label ?? ''))));
    default: return h('div.wg-text.wg-tone-dim', '');
  }
}

/** 进度条：4px 的条，`mark` 那一处竖一道，下面一句字。 @param {any} seg */
function progress(seg) {
  const pct = (/** @type {any} */ v) => `${Math.round(Math.min(1, Math.max(0, Number(v) || 0)) * 1000) / 10}%`;
  return h('div.wg-progress',
    h('div.wg-bar', h('i.wg-fill', { style: { width: pct(seg.value) } }), typeof seg.mark === 'number' ? h('b.wg-mark', { style: { left: pct(seg.mark) } }) : null),
    seg.text ? h('div.wg-progress-text', String(seg.text)) : null);
}

/** 一条：状态记号、标题、说明、右边几小段；能点的整行是按钮。 @param {any} it @param {import('./model.js').Block} block @param {Opts} opts */
function item(it, block, opts) {
  const state = typeof it.state === 'string' ? it.state : null;
  const mark = state === 'doing' ? h('span.wg-mark-doing', icon('loader-circle')) : state ? h(`span.wg-state.is-${state}`, MARKS[state] ?? '') : null;
  const parts = [
    mark,
    h('span.wg-item-text', h('span.wg-item-title', String(it.title ?? '')), it.detail ? h('span.wg-item-detail', String(it.detail)) : null),
    ...rightParts(it.right).map((p) => h(`span.wg-right.wg-tone-${toneOf(p.tone)}`, p.text)),
  ];
  return it.action ? h('button.wg-item.is-action', { type: 'button', onclick: () => opts.act(it.action, block) }, ...parts) : h('div.wg-item', ...parts);
}

/**
 * 底栏那一小段：照核心只有一段字，悬停写是哪个软件放的；没内容的不画。
 * @param {import('./model.js').Block} block
 */
export function drawStatus(block) {
  const seg = Array.isArray(block.content) ? block.content[0] : null;
  if (!seg) return null;
  return h(`span.wg-status.wg-tone-${toneOf(seg.tone)}`, { title: block.title ? `${block.source} · ${block.title}` : block.source }, String(seg.text ?? ''));
}
