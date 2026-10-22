// @ts-check
//! 纯文字时间线（软件包 `timeline-plain`，蓝图 `web.md`「换画法」第 7 条）：换画法的样板。一步一行等宽字（`✓` 做完、`✗` 失败、
//! `·` 在走），后面写标题和用时；点一行展开它的细节（照 `env.words.details` 写成纯文字）。只经 `env` 拿东西，不碰页面的旧代码。

import { h } from '../../src/lib/dom.js';

/** @param {any} ctx */
export function apply(ctx) {
  ctx.seams.provide('render.timeline', {
    id: 'plain',
    name: ctx.text('name'),
    segment: (/** @type {any} */ env) => new PlainSegment(env, (/** @type {string} */ path, /** @type {any} */ vars) => ctx.text(path, vars)),
  });
}

class PlainSegment {
  /** @param {any} env @param {(path: string, vars?: any) => string} text */
  constructor(env, text) {
    this.env = env;
    this.text = text;
    /** 人点开的步（编号）；整段收着没有 */
    this.opened = new Set();
    /** 人点过整段：开还是关；没点过的照「在走的展开、做完收起」 */
    this.open = /** @type {boolean|null} */ (null);
    /** 问到的结果原文：调用编号 → 字（`null` 是在问） */
    this.outputs = new Map();
    this.el = h('div.tlp');
    this.segment = /** @type {any} */ (null);
  }

  /** @param {any} segment */
  update(segment) {
    this.segment = segment;
    const expanded = this.open ?? !segment.finished;
    const lines = [];
    if (segment.finished) {
      const words = (segment.summary?.spans ?? []).map((/** @type {any} */ s) => s.text).join('') || this.text('steps', { n: segment.steps.length });
      lines.push(h(`button.tlp-line.tlp-head${segment.summary?.failed ? '.is-failed' : ''}`, { type: 'button', onclick: (/** @type {Event} */ e) => this.toggleAll(/** @type {Element} */ (e.currentTarget)) },
        `${expanded ? '▾' : '▸'} ${words}`));
    }
    if (expanded) for (const step of segment.steps) lines.push(...this.stepLines(step));
    this.el.replaceChildren(...lines);
  }

  /** @param {Element} line */
  toggleAll(line) {
    this.env.pin(line, 60);
    this.open = !(this.open ?? !this.segment.finished);
    this.update(this.segment);
  }

  /** 一步：一行，点开的接上细节。 @param {any} step */
  stepLines(step) {
    const r = this.env.words.row(step);
    const done = step.state === 'done';
    const mark = !done ? '·' : r.failed ? '✗' : '✓';
    // 在走的用时：带 `tl-timer` 的由对话区走表（蓝图「换画法」第 2 条）
    const time = r.timer ? h('span.tl-timer.tlp-time', { dataset: { since: String(r.timer.since), format: r.timer.format, lead: ' ' } })
      : r.took ? h('span.tlp-time', ` ${r.took}`) : null;
    const canOpen = step.kind === 'tool' && done;
    const line = h(`${canOpen ? 'button' : 'div'}.tlp-line${r.failed ? '.is-failed' : ''}`, canOpen ? { type: 'button', onclick: () => this.toggleStep(line, step) } : null,
      `${mark} ${r.name}`, r.subject ? ` ${r.subject}` : null, time);
    if (!this.opened.has(step.key)) return [line];
    return [line, this.detail(step)];
  }

  /** @param {Element} line @param {any} step */
  toggleStep(line, step) {
    this.env.pin(line, 60);
    if (this.opened.has(step.key)) this.opened.delete(step.key);
    else {
      this.opened.add(step.key);
      this.fetch(step);
    }
    this.update(this.segment);
  }

  /** 结果原文要问核心（同一次调用只问一次）。 @param {any} step */
  fetch(step) {
    if (!step.callId || this.outputs.has(step.callId) || !this.env.where?.detail) return;
    this.outputs.set(step.callId, null);
    this.env.where.detail(step.callId).then((/** @type {any} */ got) => {
      this.outputs.set(step.callId, typeof got?.output === 'string' ? got.output : '');
      if (this.el.isConnected) this.update(this.segment);
    });
  }

  /** 细节：照出厂的分段，一段一个标签加原文。 @param {any} step */
  detail(step) {
    const output = step.callId ? this.outputs.get(step.callId) : '';
    const parts = this.env.words.details({ ...step, output: output ?? '' });
    const body = parts.map((/** @type {any} */ p) => {
      if (p.kind === 'text') return h('div.tlp-part', p.label ? h('div.tlp-label', p.label) : null, h('pre.tlp-text', p.text));
      if (p.kind === 'diff') return h('div.tlp-part', h('div.tlp-label', p.path), h('pre.tlp-text', diffText(p.diff)));
      if (p.kind === 'images') return h('div.tlp-part', h('div.tlp-label', this.text('images', { n: p.images.length })));
      // 翻记忆、查知识库的结果：一条一段，头上那一行加原文
      if (p.kind === 'blocks' || p.kind === 'rows') {
        const items = p.kind === 'blocks' ? p.blocks : p.rows;
        return h('div.tlp-part', h('div.tlp-label', p.label), h('pre.tlp-text', items.map((/** @type {any} */ x) => [x.head, x.text].filter(Boolean).join('\n')).join('\n\n')));
      }
      if (p.kind === 'markdown') {
        const md = h('div.markdown-body');
        this.env.markdown(md, p.text);
        return h('div.tlp-part', p.label ? h('div.tlp-label', p.label) : null, md);
      }
      return null;
    });
    if (output === null) body.push(h('div.tlp-label', this.text('loading')));
    return h('div.tlp-detail', body);
  }
}

/** 差异写成 `+`、`-`、空格开头的几行。 @param {any} diff */
function diffText(diff) {
  const mark = { added: '+', removed: '-', gap: '…', keep: ' ' };
  return (diff?.lines ?? []).map((/** @type {any} */ l) => (l.mark === 'gap' ? '…' : `${mark[/** @type {'added'} */ (l.mark)] ?? ' '} ${l.text ?? ''}`)).join('\n');
}
