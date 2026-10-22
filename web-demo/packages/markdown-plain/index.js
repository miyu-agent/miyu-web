// @ts-check
//! 纯文字排版（软件包 `markdown-plain`，蓝图 `web.md`「换画法」第 7 条）：换画法的样板。只认段落、标题（加粗）、列表、围起来的代码、
//! 独占一行的媒体、图片、链接，别的照原文。四个接口照约定问（`code`、`line`、`image`、`after`），所以 mermaid 图、媒体卡片、链接卡片
//! 换了排版照样在。只经职能给的参数拿东西，不碰页面的旧代码。

import { h } from '../../src/lib/dom.js';

/** @param {any} ctx */
export function apply(ctx) {
  ctx.seams.provide('render.markdown', { id: 'plain', name: ctx.text('name'), render });
}

/**
 * @param {HTMLElement} container @param {string} source
 * @param {{streaming?: boolean, hooks?: any}} [options]
 */
function render(container, source, { streaming = false, hooks = {} } = {}) {
  const out = [];
  const lines = source.split('\n');
  /** @type {string[]} */
  let para = [];
  /** @type {{tag: 'ul'|'ol', items: string[]}|null} */
  let list = null;
  const flush = () => {
    if (para.length) out.push(h('p', inline(para.join(' '))));
    para = [];
    if (list) out.push(h(list.tag, list.items.map((t) => h('li', inline(t)))));
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(```+|~~~+)\s*([\w+-]*)/.exec(line);
    if (fence) {
      flush();
      const body = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        if (lines[i].trim().startsWith(fence[1])) { closed = true; break; }
        body.push(lines[i]);
      }
      const text = body.join('\n');
      // 在收的回答里最后那一块算没定（围栏收齐了也是），贵的活（画图）等定了再做
      const done = closed && !(streaming && i >= lines.length - 1);
      out.push(hooks.code?.(fence[2], text, done) ?? h('pre', h('code', text)));
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    // 独占一行的：先问别的包（音视频、图片卡片）
    const own = hooks.line?.(line);
    if (own) { flush(); out.push(own); continue; }
    const img = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (img) {
      flush();
      out.push(hooks.image?.(img[2], img[1]) ?? h('p', line));
      continue;
    }
    const head = /^(#{1,6})\s+(.*)$/.exec(line);
    if (head) { flush(); out.push(h(`h${Math.min(4, Math.max(2, head[1].length + 1))}`, inline(head[2]))); continue; }
    const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (item) {
      const tag = item[1] ? 'ul' : 'ol';
      if (para.length || (list && list.tag !== tag)) flush();
      list ??= { tag, items: [] };
      list.items.push(item[3]);
      continue;
    }
    if (list) flush();
    para.push(line.trim());
  }
  flush();
  container.replaceChildren(...out);
  hooks.after?.(container);
}

/** 行内：只认链接（`[字](地址)` 和裸的网址），只放 http(s)；别的写法照原文。 @param {string} text */
function inline(text) {
  const parts = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>()]+)/g;
  let at = 0;
  for (let m; (m = re.exec(text));) {
    if (m.index > at) parts.push(text.slice(at, m.index));
    const href = m[2] ?? m[3];
    parts.push(h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, m[1] ?? href));
    at = m.index + m[0].length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
