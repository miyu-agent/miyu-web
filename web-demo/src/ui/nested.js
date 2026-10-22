// @ts-check
//! 脚本调用的工具那一段（蓝图 `web.md`「时间线」的「脚本里调的工具」第 2、3 条）：点开执行命令、后台命令的预览时接在后面，一个一行，
//! 点一行看参数、原因、结果。整份照 `view.detail` 要（`fetch`）；条目上那一格变了（`sync`）照 `nested_after` 接着要、拼上去。
//! 时间线（`steps.js`）和后台任务浮层（软件包 `jobs`）共用。

import { h, icon, replace } from './dom.js';
import { t } from '../util/res.js';
import { blobUrl } from '../core/host.js';
import { toolDuration } from '../lib/format.js';
import { nameOf, toneOf, mergeNested, afterOf, nestedSig, argLines } from '../lib/nested.js';

export class NestedList {
  /** @param {(after: number|null) => Promise<import('../lib/nested.js').Call[]|null>} fetch 要整份（`null`）或者某个序号以后的 */
  constructor(fetch) {
    this.fetch = fetch;
    /** @type {import('../lib/nested.js').Call[]} */
    this.items = [];
    this.count = 0;
    this.sig = '';
    /** 点开着的几个（序号） @type {Set<number>} */
    this.opened = new Set();
    /** 读回来的结果（照 blob） @type {Map<string, string>} */
    this.results = new Map();
    this.busy = false;
    this.again = false;
    this.label = h('div.tl-label');
    this.list = h('div.tl-nested-list');
    this.el = h('div.tl-detail.tl-nested', { hidden: true }, this.label, this.list);
  }

  /** 条目上那一格（`{count, last}`）：变了才再要。 @param {any} nested */
  sync(nested) {
    const sig = nestedSig(nested);
    if (!sig || sig === this.sig) return;
    this.sig = sig;
    this.count = nested.count ?? 0;
    this.more();
  }

  /** 接着要：一次只发一个，要着的时候又变了的，回来以后再要一次。 */
  async more() {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    const got = await this.fetch(afterOf(this.items)).catch(() => null);
    this.busy = false;
    if (got) {
      this.items = mergeNested(this.items, got);
      this.draw();
    }
    if (this.again) {
      this.again = false;
      this.more();
    }
  }

  draw() {
    this.el.hidden = !this.items.length;
    this.label.textContent = t('timeline.nested.section', { n: Math.max(this.count, this.items.length) });
    replace(this.list, this.items.map((c) => this.row(c)));
  }

  /** 一个一行：序号、显示名、对象、右边状态；点了在下面展开参数、原因、结果。 @param {import('../lib/nested.js').Call} c */
  row(c) {
    const s = stateOf(c);
    const open = this.opened.has(c.n);
    const head = h('button.tl-nested-row', {
      type: 'button', 'aria-expanded': String(open),
      onclick: (/** @type {Event} */ e) => {
        e.stopPropagation();
        if (this.opened.has(c.n)) this.opened.delete(c.n);
        else this.opened.add(c.n);
        this.draw();
      },
    },
    h('span.tl-nested-n', `#${c.n}`),
    h('span.tl-nested-name', nameOf(c)),
    c.title?.object ? h('span.tl-nested-object', c.title.object) : null,
    h(`span.tl-nested-state${s.tone ? `.is-${s.tone}` : ''}`, s.spin ? icon('loader-circle') : null, s.text));
    return h(`div.tl-nested-item${open ? '.is-open' : ''}`, head, open ? this.more_(c) : null);
  }

  /** 点开的一个：参数、出错被拒的原因、结果（照 blob 读回来，最多 4000 字）。 @param {import('../lib/nested.js').Call} c */
  more_(c) {
    const args = argLines(c.args);
    const result = c.result?.blob ? h('pre.tl-nested-result', this.results.get(c.result.blob) ?? t('timeline.nested.loading')) : null;
    if (c.result?.blob && !this.results.has(c.result.blob)) this.read(c.result.blob, c.result.bytes);
    return h('div.tl-nested-more',
      args ? [h('div.tl-label', t('timeline.args')), h('pre', args)] : null,
      c.reason ? [h('div.tl-label', t('timeline.nested.reason')), h('pre', c.reason)] : null,
      result ? [h('div.tl-label', t('timeline.result')), result] : null);
  }

  /** 读一个结果：读到了重画。 @param {string} blob @param {number|undefined} bytes */
  read(blob, bytes) {
    this.results.set(blob, t('timeline.nested.loading'));
    blobUrl(blob, 'text/plain')
      .then((url) => (url ? fetch(url).then((r) => (r.ok ? r.text() : '')) : ''))
      .then((text) => resultText(text, bytes), () => '')
      .then((text) => {
        this.results.set(blob, text);
        if (this.el.isConnected) this.draw();
      });
  }
}

/**
 * 一个右边的状态：成了的写用时，在跑的转圈，别的照字（`needs_approval`「需要确认，脚本里没问」：脚本里不问人、当场了结，和被拒分开）。
 * @param {Call} c
 * @returns {{text: string, tone: string|null, spin: boolean}}
 */
function stateOf(c) {
  if (c.state === 'running') return { text: t('timeline.nested.running'), tone: null, spin: true };
  if (c.state === 'ok') return { text: c.took_ms != null ? toolDuration(c.took_ms) : '', tone: null, spin: false };
  const known = ['error', 'denied', 'needs_approval', 'cancelled'];
  return { text: known.includes(c.state) ? t(`timeline.nested.${c.state}`) : c.state, tone: c.state === 'cancelled' ? 'faint' : toneOf(c.state), spin: false };
}

/** 结果最多先写几个字 */
const RESULT_CHARS = 4000;

/** 结果写多少：超了截掉，后面写一共多少字节。 @param {string} text @param {number|undefined} bytes */
function resultText(text, bytes) {
  if ([...text].length <= RESULT_CHARS) return text;
  return `${[...text].slice(0, RESULT_CHARS).join('')}\n${t('timeline.nested.cut', { bytes: bytes ?? new TextEncoder().encode(text).length })}`;
}
