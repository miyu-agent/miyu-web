// @ts-check
//! 块和行内节点 → DOM（蓝图 `web.md`「她的回答：Markdown」第 1、4、5 条，照旧版 `app.js:4271-4390`、`4700-4839`、
//! `4949-5076` 造的样子）。只用 `h()`（`createElement`、字节点），不走 `innerHTML`：她写的字没有机会变成标签。
//! 类名照旧版，`styles/markdown.css` 照它画。

import { h, icon } from '../ui/dom.js';
import { t } from '../util/res.js';
import { filePath, TAGS } from './inline.js';
import { math } from './math.js';
import { paint } from './highlight.js';
import { writeClipboard } from '../core/host.js';

/**
 * 造 DOM 时带着的：扩展点（`render.js` 的 `Hooks`）和提示（复制成了没有）。
 * `notes` 是这条回答的脚注，名字 → 号、那一条、正文里引用它的上标（`build` 先造好，引用、「↩」照它滚）。
 * @typedef {{hooks: import('./render.js').Hooks, say?: (text: string, good?: boolean) => void, notes?: Map<string, Note>}} Context
 * @typedef {{n: number, item: HTMLElement, refs: HTMLElement[]}} Note
 */

/**
 * 一串块 → 一个片段。
 * @param {import('./parse.js').Block[]} blocks
 * @param {Context} ctx
 * @returns {DocumentFragment}
 */
export function build(blocks, ctx) {
  const frag = document.createDocumentFragment();
  const foot = blocks.find((b) => b.type === 'footnotes');
  /** @type {Map<string, Note>} */
  const notes = new Map();
  if (foot?.type === 'footnotes') foot.items.forEach((it, k) => notes.set(it.id, { n: k + 1, item: h('li'), refs: [] }));
  const inner = { ...ctx, notes };
  for (const b of blocks) frag.append(block(b, inner));
  return frag;
}

/** 平滑滚到一处，停在视野正中（脚注的号、「↩」） @param {Element|undefined} el */
function jump(el) {
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** @param {import('./parse.js').Block} b @param {Context} ctx @returns {Node|string} */
function block(b, ctx) {
  switch (b.type) {
    case 'code':
      return ctx.hooks.code?.(b.lang, b.text, b.closed) ?? codeBlock(b, ctx);
    case 'line':
      return b.value;
    case 'math':
      return h('div.math-block', math(b.tex, true, b.raw));
    case 'table':
      return table(b, ctx);
    case 'hr':
      return h('hr');
    case 'heading':
      return h(`h${b.level}`, kids(b.kids, ctx));
    case 'list':
      // 一项：开头那一段紧凑地写在记号后面，下面的块（子列表、第二段、代码块）接着画
      return h(b.ordered ? 'ol' : `ul${b.task ? '.task-list' : ''}`, b.start != null ? { start: b.start } : null, b.items.map((it) => {
        const more = (it.blocks ?? []).map((x) => block(x, ctx));
        return it.check == null
          ? h('li', kids(it.kids, ctx), more)
          : h('li.task-list-item', h('input', { type: 'checkbox', checked: it.check, disabled: true }), h('span', kids(it.kids, ctx), more));
      }));
    case 'quote':
      return h('blockquote', b.blocks.map((x) => block(x, ctx)));
    case 'details':
      // 折叠块（第 2 条）：标题一行能点，里面照整条回答造
      return h('details.md-details', h('summary', b.summary ? kids(b.summary, ctx) : t('markdown.details')),
        h('div.md-details-body', b.blocks.map((x) => block(x, ctx))));
    case 'footnotes':
      return h('section.footnotes', { 'aria-label': t('markdown.footnotes') }, h('ol', b.items.map((it) => {
        const note = /** @type {Note} */ (ctx.notes?.get(it.id));
        const back = t('markdown.footnote_back');
        note.item.append(...[kids(it.kids, ctx)].flat(Infinity).filter((x) => x != null), ' ',
          h('button.footnote-back', { type: 'button', title: back, 'aria-label': back, onclick: () => jump(note.refs[0]) }, '↩'));
        return note.item;
      })));
    default:
      return h('p', kids(b.kids, ctx));
  }
}

/**
 * 代码块：头一行语言（没写的写「代码」）和复制按钮，下面是代码；上色见 `highlight.js`。
 * @param {{lang: string, text: string, closed: boolean}} b
 * @param {Context} ctx
 */
export function codeBlock(b, ctx) {
  const code = h('code', b.lang ? { class: `language-${b.lang}` } : null, b.text);
  paint(code, b.lang, b.text, b.closed);
  const label = t('markdown.copy_code');
  return h('div.code-block',
    h('div.code-toolbar',
      // 语言名照原样小写（蓝图第 5 条）
      h('span', b.lang ? b.lang.toLowerCase() : t('markdown.code')),
      h('button.code-copy-button', { type: 'button', title: label, 'aria-label': label, onclick: () => copy(b.text, ctx.say) }, icon('copy'))),
    h('pre', code));
}

/** 表格：外面一层自己横着滚；对齐照分隔行。 */
function table(b, ctx) {
  const cell = (tag, content, k) => h(`${tag}${b.align[k] ? `.align-${b.align[k]}` : ''}`, tag === 'th' ? { scope: 'col' } : null, kids(content, ctx));
  return h('div.markdown-table-scroll', h('table',
    h('thead', h('tr', b.head.map((c, k) => cell('th', c, k)))),
    b.rows.length ? h('tbody', b.rows.map((r) => h('tr', r.map((c, k) => cell('td', c, k))))) : null));
}

/** @param {import('./inline.js').Inline[]} nodes @param {Context} ctx @returns {any[]} 节点、字，`h()` 摊平 */
function kids(nodes, ctx) {
  return nodes.map((n) => inlineNode(n, ctx));
}

/** @param {import('./inline.js').Inline} n @param {Context} ctx @returns {any} 一个节点、字，或者几个（`h()` 摊平） */
function inlineNode(n, ctx) {
  if (typeof n === 'string') return n;
  switch (n.type) {
    case 'br':
      return h('br');
    case 'code':
      return h('code', n.text);
    case 'math':
      return math(n.tex, false, n.raw);
    case 'link': {
      const a = link(n.href, '', kids(n.kids, ctx), ctx);
      // 写了标题的悬停看标题（本机路径的悬停照旧看全路径）
      if (n.title && a instanceof HTMLElement && !a.title) a.title = n.title;
      return a;
    }
    case 'autolink':
      return link(n.href, '.auto-link', [n.text], ctx);
    case 'image':
      // 没接扩展点、扩展点不认的（比如地址是个 mailto:）照原文写
      return ctx.hooks.image?.(n.src, n.alt, n.title ?? null) ?? `![${n.alt}](${n.src})`;
    case 'tag':
      // 放行的标签照名字新造（第 1 条），名字不在表里的照字
      return TAGS.includes(n.tag) ? h(n.tag, kids(n.kids, ctx)) : kids(n.kids, ctx);
    case 'fnref': {
      // 脚注的引用：有定义的画成上标的号，点了滚到那一条；没定义的照原文
      const note = ctx.notes?.get(n.id);
      if (!note) return n.raw;
      const ref = h('sup.footnote-ref', h('button', { type: 'button', title: t('markdown.footnote_jump', { n: note.n }), onclick: () => jump(note.item) }, String(note.n)));
      note.refs.push(ref);
      return ref;
    }
    case 'titled':
      // 标题和地址在同一个链接里，点哪儿都能走；地址那半截退半档（旧版 `.link-url`）
      return [n.indent || null, link(n.href, '.auto-link.title-link', [
        h('span.link-title', kids(n.title, ctx)), `${n.gap}${n.open}`, h('span.link-url', n.url), n.close,
      ], ctx)];
    default:
      return h(n.type, kids(n.kids, ctx));
  }
}

/**
 * 一个链接：新标签页打开。`file://` 的点一下复制路径、悬停看全路径（第 4 条）：浏览器不让从网页跳到本机文件，
 * 做成真链接点了什么都不会发生，比不成链更让人糊涂（旧版 `app.js:4271-4290`）。
 */
function link(href, classes, content, ctx) {
  if (!/^file:/i.test(href)) return h(`a${classes}`, { href, rel: 'noopener noreferrer', target: '_blank' }, content);
  return pathLink(filePath(href), classes, content, ctx.say);
}

/**
 * 本机路径的链接：点一下复制路径、悬停看全路径（第 4 条）。不当图的 `![说明](地址)` 也用它（`ui/rich.js`）。
 * @param {string} path 绝对路径
 * @param {string} classes
 * @param {any} content
 * @param {((text: string, good?: boolean) => void)|undefined} say
 */
export function pathLink(path, classes, content, say) {
  return h(`a${classes}.path-link`, {
    href: `file://${encodeURI(path)}`, rel: 'noopener noreferrer', title: path,
    onclick: (/** @type {Event} */ e) => { e.preventDefault(); copy(path, say); },
  }, content);
}

/**
 * 复制，提示复制了几个字（照会话编号的复制，`ui/panel.js`）；复制不了的提示原因。
 * @param {string} text
 * @param {((text: string, good?: boolean) => void)|undefined} say
 */
export async function copy(text, say) {
  try {
    await writeClipboard(text);
    say?.(t('copied', { count: [...text].length }), true);
  } catch (err) {
    if (say) say(t('copy_failed', { reason: err.message }));
    else console.error(err);
  }
}
