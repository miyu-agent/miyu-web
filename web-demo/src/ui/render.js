// @ts-check
//! 换画法（蓝图 `web.md`「换画法」）：时间线的一段、一段 Markdown 照选中的提供者画（职能 `render.timeline`、`render.markdown`）；
//! 没有提供者的照兜底的画，提供者画的时候抛错的这一段退回兜底、上面写一行是谁出的错，别的照常。

import { h } from './dom.js';
import { t } from '../util/res.js';
import { row, peek, details, thinkingTail, commandLines } from '../model/words.js';
import { active } from '../model/timeline.js';

/**
 * 页面里的什么都从这里取提供者（`app` 包交进来：`ctx` 上带 `~` 的服务，总是现在选的那个；`seams` 查是哪个包登记的）。
 * @type {{ext: any}}
 */
const using = { ext: null };

/** @param {any} ext `app` 包的上下文 */
export function useRenderers(ext) {
  using.ext = ext;
}

/** @param {'render.timeline'|'render.markdown'} name */
function provider(name) {
  return using.ext?.[name] ?? null;
}

/** 出错的是哪个包（查不到的写提供者的编号）。 @param {string} name @param {any} p */
function ownerOf(name, p) {
  return using.ext?.seams?.providers?.(name)?.find((/** @type {any} */ r) => r.provider === p)?.owner ?? p?.id ?? '?';
}

/** 「这一块出错了（谁：原因）」 @param {string} name @param {any} p @param {unknown} err */
function failedNode(name, p, err) {
  console.error(`${name} 画的时候出错了`, err);
  return h('div.slot-failed', t('slot_failed', { owner: ownerOf(name, p), reason: err instanceof Error ? err.message : String(err) }));
}

/** 给时间线提供者的出厂写法（可用可不用，蓝图「换画法」第 2 条）。 */
const WORDS = Object.freeze({ row, peek, details, thinkingTail, commandLines, active });

/**
 * 画一段 Markdown：照选中的排版；没有的照原文写（留着换行），抛错的退回原文、上面写一行。`after` 都照样调。
 * @param {HTMLElement} container @param {string} source
 * @param {{streaming?: boolean, hooks?: import('../markdown/render.js').Hooks, say?: (text: string, good?: boolean) => void}} [options]
 */
export function drawMarkdown(container, source, options = {}) {
  const p = provider('render.markdown');
  if (p) {
    try {
      p.render(container, source, options);
      return;
    } catch (err) {
      container.replaceChildren(failedNode('render.markdown', p, err), plainText(source));
      options.hooks?.after?.(container);
      return;
    }
  }
  container.replaceChildren(plainText(source));
  options.hooks?.after?.(container);
}

/** @param {string} source */
function plainText(source) {
  return h('div.md-fallback', source);
}

/**
 * 时间线的一段：照选中的提供者交回 `{el, update}`；抛错（建的时候、更新的时候）的这一段换成兜底的，上面写一行。`el` 会变
 * （换成兜底的那一下），对话区每次 `update` 完照它放。
 * @param {{where: any, fresh: boolean, pin: (node: Element, ms?: number) => void}} base
 */
export function segmentView(base) {
  const env = Object.freeze({ ...base, words: WORDS, markdown: (/** @type {HTMLElement} */ el, /** @type {string} */ text) => drawMarkdown(el, text, { streaming: false }) });
  const p = provider('render.timeline');
  /** @type {{el: HTMLElement, update: (segment: any) => void}} */
  let view;
  let failed = /** @type {HTMLElement|null} */ (null);
  try {
    view = p ? p.segment(env) : new PlainSegment();
    if (!(view?.el instanceof HTMLElement) || typeof view.update !== 'function') throw new Error('segment() 要交回 {el, update}');
  } catch (err) {
    failed = failedNode('render.timeline', p, err);
    view = new PlainSegment(failed);
  }
  const out = {
    get el() { return view.el; },
    /** @param {any} segment */
    update(segment) {
      try {
        view.update(segment);
      } catch (err) {
        if (failed) throw err;
        failed = failedNode('render.timeline', p, err);
        const was = view.el;
        view = new PlainSegment(failed);
        view.update(segment);
        was.replaceWith(view.el);
      }
    },
  };
  return out;
}

/** 兜底的一段（蓝图「换画法」第 5 条）：只写收起那一行的字；在走的写最后一步那一行。 */
class PlainSegment {
  /** @param {HTMLElement|null} [failed] 上面那一行「出错了」 */
  constructor(failed = null) {
    this.line = h('div.tl-fallback-line');
    this.el = h('div.tl-fallback', failed, this.line);
  }

  /** @param {any} segment */
  update(segment) {
    if (segment.finished) {
      this.line.textContent = (segment.summary?.spans ?? []).map((/** @type {any} */ s) => s.text).join('');
      return;
    }
    const last = segment.steps.at(-1);
    if (!last) return void (this.line.textContent = '');
    const r = row(last);
    this.line.textContent = [r.name, r.subject].filter(Boolean).join(' ');
  }
}
