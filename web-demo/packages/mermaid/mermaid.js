// @ts-check
//! mermaid 图（软件包 `mermaid`，蓝图 `web.md`「mermaid 图」）：收齐了的 ```` ```mermaid ```` 由核心画成 SVG（`mermaid.render`，
//! `draw.js`），直接画在她的正文上，不加卡片的底。样子照旧版 `app.js:4580-4698`：上面一行暗的小字「图表」，右边切「源码」、
//! 复制；缩小了的写「· 点开看原图」，点图在灯箱里看。画不出来的这一块原地换成代码块。
//!
//! - SVG 里的字、线是页面的 CSS 变量（`draw.js` 换好的），换主题不重画；插进页面前先过一遍：去掉 `<script>`、`on…` 属性、
//!   `javascript:` 的链接（图里的字是她写的，渲染器转没转义不归我们管）；
//! - 灯箱里的那份是一张图片（`blob:` 地址），看不到页面的变量：先照现在的主题把颜色填成定值、铺上底色；
//! - 用到的都由入口交进来（`Deps`）：问核心画图、代码块、复制、灯箱、这个包的字；没有模块级的状态。

import { h, icon, scaleOf } from '../../src/lib/dom.js';

/**
 * @typedef {{draw: (source: string) => Promise<string|null>, codeBlock: (block: any, ctx: any) => HTMLElement,
 *   copy: (text: string, say?: (text: string, good?: boolean) => void) => void,
 *   open: (what: {url: string, name?: string, vector?: boolean}) => void, t: (path: string, fields?: any) => string}} Deps
 *   问核心画一张（问过的直接给）、Markdown 的代码块和复制、点开看大图（有灯箱在灯箱里，没有在新标签页）、这个包的字
 */

/**
 * 一张图：先写「正在画图…」，画好了换上；画不出来的这一块原地换成代码块。
 * @param {string} source mermaid 源码
 * @param {(text: string, good?: boolean) => void} say 提示（复制了几个字）
 * @param {Deps} deps
 */
export function mermaidBlock(source, say, deps) {
  const { draw, codeBlock, copy, open: lightbox, t } = deps;
  const label = h('span', t('label'));
  const figure = h('div.mermaid-figure', t('drawing'));
  const code = codeBlock({ lang: 'mermaid', text: source, closed: true }, { hooks: {}, say });
  code.hidden = true;
  const toggle = h('button.mermaid-source-toggle', { type: 'button', 'aria-expanded': 'false' }, t('source'));
  // 切过去、切回来这一块高度不变：源码照图的高度，长了在里面滚、短了下面空着（蓝图「mermaid 图」第 3 条）
  toggle.addEventListener('click', () => {
    const showing = code.hidden;
    if (showing) code.style.height = `${figure.offsetHeight}px`;
    code.hidden = !showing;
    figure.hidden = showing;
    toggle.textContent = t(showing ? 'diagram' : 'source');
    toggle.classList.toggle('is-active', showing);
    toggle.setAttribute('aria-expanded', String(showing));
  });
  const copyButton = h('button.code-copy-button', { type: 'button', title: t('copy'), 'aria-label': t('copy'), onclick: () => copy(source, say) }, icon('copy'));
  const block = h('div.mermaid-block', h('div.mermaid-toolbar', label, h('div.mermaid-actions', toggle, copyButton)), figure, code);
  draw(source).then((svg) => {
    const node = svg && clean(svg);
    if (!node) {
      // 原地换成代码块：回答重画时这一块会被挪过去重用（`rich.js` 的 `reuse`），把自己换出去的话重画又把「正在画图…」放回来
      code.hidden = false;
      block.classList.add('is-plain');
      block.replaceChildren(code);
      return;
    }
    figure.replaceChildren(node);
    figure.classList.add('is-zoomable');
    figure.setAttribute('role', 'button');
    figure.tabIndex = 0;
    const open = () => {
      const url = standalone(node);
      lightbox({ url, name: t('label'), vector: true });
    };
    figure.addEventListener('click', open);
    figure.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    // 画出来比原图小的，提示点开看原图
    requestAnimationFrame(() => {
      const natural = Number(node.getAttribute('height')) || 0;
      if (natural && node.getBoundingClientRect().height / scaleOf(figure) + 1 < natural) label.textContent = `${t('label')} · ${t('zoom')}`;
    });
  });
  return block;
}

/**
 * 留的元素（白名单，2026-11-02 第四轮审查 W4-1：原来是黑名单，`<style>` 留着、作用于整页）：渲染器用得到的 SVG 元素，别的连同里面的都去掉。
 * 小写比（XML 里是 `linearGradient` 这样的大小写）。
 */
export const KEEP = new Set(['svg', 'g', 'path', 'rect', 'line', 'circle', 'ellipse', 'polygon', 'polyline', 'text', 'tspan', 'title', 'desc', 'defs',
  'marker', 'symbol', 'lineargradient', 'radialgradient', 'stop', 'a', 'use']);

/** `style` 属性里留的几项：画图用得到的（填色、描边、透明度、字体、字的对齐和装饰、宽度上限、混合）；`position`、`z-index` 这些去掉 */
const STYLE_KEEP = new Set(['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-linecap', 'stroke-linejoin', 'opacity', 'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'alignment-baseline', 'text-decoration', 'letter-spacing', 'max-width', 'mix-blend-mode', 'visibility']);

/**
 * `style` 属性清洗成只留画图的那几项（[`STYLE_KEEP`]）；值里带 `url(`、反斜杠、`@`、尖括号、引号的整项去掉（引外面的东西、转义、跳出属性）。
 * 交回清洗后的字（一项都不剩的是空字）。纯的。
 * @param {string} text
 */
export function safeStyle(text) {
  return text.split(';').map((part) => {
    const at = part.indexOf(':');
    if (at < 0) return null;
    const name = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).trim();
    if (!STYLE_KEEP.has(name) || !value || /url\(|\\|@|[<>"'`]|expression/i.test(value)) return null;
    return `${name}: ${value}`;
  }).filter(Boolean).join('; ');
}

/**
 * 链接留不留（第二轮审查 W2-4：原来只挡 `javascript:`，`data:`、`blob:` 这些照样能点；`java\tscript:` 这种带空白的也过）：白名单，
 * 只留 `http:`、`https:` 和页面里的 `#锚点`（图里自己引用自己的）。先去掉空白、控制字符再认。
 * @param {string} value
 */
export function safeHref(value) {
  const plain = value.replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  return plain.startsWith('#') || /^https?:/i.test(plain);
}

/**
 * 核心给的 SVG 文字 → 一个能插进页面的 `<svg>`：只留白名单里的元素（[`KEEP`]），去掉 `on…` 属性，链接只留 http(s) 和锚点（[`safeHref`]；`use` 只能
 * 引图里自己的），`style` 照 [`safeStyle`] 清洗，最外层的 `style`、`class` 去掉（页面自己写宽高）；留下的外链一律新标签页开；读不懂的是 `null`。
 * @param {string} text
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

function clean(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName !== 'svg' || doc.querySelector('parsererror')) return null;
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    if (!el.isConnected && el !== svg) continue;
    const name = el.localName.toLowerCase();
    if (el.namespaceURI !== SVG_NS || !KEEP.has(name)) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      const key = attr.name.toLowerCase();
      const bad = key.startsWith('on') || (/href$/i.test(key) && (!safeHref(attr.value) || (name === 'use' && !attr.value.trim().startsWith('#'))));
      if (bad) el.removeAttribute(attr.name);
      else if (key === 'style') {
        const kept = el === svg ? '' : safeStyle(attr.value);
        if (kept) el.setAttribute('style', kept);
        else el.removeAttribute('style');
      }
    }
    if (el === svg) el.removeAttribute('class');
    if (el.nodeName.toLowerCase() === 'a' && [...el.attributes].some((attr) => /href$/i.test(attr.name) && !attr.value.trim().startsWith('#'))) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }
  svg.style.maxWidth = '100%';
  svg.style.height = 'auto';
  return /** @type {SVGSVGElement} */ (document.importNode(svg, true));
}

/** 灯箱里看的那份：CSS 变量照现在的主题换成定值，铺上正文的底色，做成一个 `blob:` 地址。 */
function standalone(svg) {
  const style = getComputedStyle(document.documentElement);
  const text = new XMLSerializer().serializeToString(svg).replace(/var\((--[\w-]+)\)/g, (all, name) => style.getPropertyValue(name).trim() || all);
  const copyNode = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  copyNode.setAttribute('style', `background: ${style.getPropertyValue('--surface').trim()}`);
  // 灯箱照宽高比放大：没写像素宽高的（百分比、没写）照 viewBox 补上，不然浏览器当它 300×150
  const box = (copyNode.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (box.length === 4 && box[2] > 0 && box[3] > 0) {
    for (const [name, size] of [['width', box[2]], ['height', box[3]]]) {
      if (!/^\d+(\.\d+)?(px)?$/.test(copyNode.getAttribute(name) ?? '')) copyNode.setAttribute(name, String(size));
    }
  }
  const blob = new Blob([new XMLSerializer().serializeToString(copyNode)], { type: 'image/svg+xml' });
  return URL.createObjectURL(blob);
}
