// @ts-check
//! 造 DOM 的小工具（`lib/`：谁都能用，不依赖别的）：不用框架（设计 21 X2），一个 `h` 够用；图标照内核交进来的图标表画
//! （`resources/lucide.json`，内核起来时 `useIcons`）。

/** 图标表：名字 → 几段 SVG。内核起来时交进来。 */
let icons = /** @type {Record<string, Array<[string, Record<string, string>]>>} */ ({});

/** 内核起来时交进图标表。 */
export function useIcons(table) {
  icons = table;
}

/** 并进整套图标（`resources/lucide-all.json`，软件包、预设自己写的图标名要的）：原来那几个照旧。 */
export function addIcons(table) {
  icons = { ...table, ...icons };
}

/** 皮肤带的一套图标（蓝图 `web.md`「皮肤」第 4 条）：有的名字照它画，没有的照图标表；`null` 是没有。 */
let pack = /** @type {Record<string, Array<[string, Record<string, string>]>>|null} */ (null);

/**
 * 换上一套皮肤的图标（`null` 拿掉）：页面上已经画着的图标当场照新的重画（`icon` 画的都记着名字）。
 * @param {Record<string, Array<[string, Record<string, string>]>>|null} table
 */
export function useIconPack(table) {
  pack = table;
  for (const svg of document.querySelectorAll('svg.icon[data-icon]')) draw(/** @type {SVGElement} */ (svg), svg.getAttribute('data-icon') ?? '');
}

/** 图标表里所有的名字（选预设图标时搜）。 */
export const iconNames = () => Object.keys(icons);

/** 图标表里有没有这个名字（软件包、预设自己写的图标名，认不出的画通用的）。 @param {string} name */
export const hasIcon = (name) => Object.hasOwn(icons, name);

const SVG = 'http://www.w3.org/2000/svg';

/**
 * `h('div.a.b', {onclick, title}, 子节点…)`。属性里 `on*` 挂事件，`style` 是字符串或对象，`dataset` 照常；
 * 值是 `false`、`null` 的属性不写。子节点可以是字、节点、数组，`null` 跳过。
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  return append(el, kids);
}

/** 往节点里接子节点。 */
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

/** 换掉全部子节点。 */
/**
 * 写一个地址属性（`src`、`href`）：地址可能要等（直接连网页软件的先换票据，蓝图 `web/architecture.md`「浏览器的第二份宿主」）。是字符串的
 * 当场写上；是 `Promise` 的等到了再写，等到的是空的照取不到发一次 `error`。交回写上的那个地址（等的交 `Promise`）。
 * @param {Element} el @param {string} attr @param {string|Promise<string>} url @param {string} [suffix] 接在地址后面的（视频的 `#t=0.1`）
 * @returns {Promise<string>}
 */
export function setUrl(el, attr, url, suffix = '') {
  const done = Promise.resolve(url).then((u) => {
    if (u) el.setAttribute(attr, u + suffix);
    else el.dispatchEvent(new Event('error'));
    return u;
  });
  if (typeof url === 'string' && url) el.setAttribute(attr, url + suffix);
  return done;
}

export function replace(el, ...kids) {
  el.replaceChildren();
  return append(el, kids);
}

/**
 * 一个 Lucide 图标（`resources/lucide.json`）：24 的画布，线宽 1.8（照旧版 `.icon-slot svg`）。
 * 没登记的名字画一个空的框：看得出漏了，不崩。
 */
export function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('data-icon', name);
  draw(svg, name);
  return svg;
}

/** 照名字画进一个图标（皮肤的那一套有的先用它）。 @param {SVGElement} svg @param {string} name */
function draw(svg, name) {
  svg.replaceChildren();
  for (const [tag, attrs] of pack?.[name] ?? icons[name] ?? []) {
    const part = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) part.setAttribute(k, v);
    svg.append(part);
  }
}

/**
 * `node` 的顶边离 `box` 的顶边多远，照 `box` 自己的 CSS 像素（和 `scrollTop`、`clientHeight` 一个单位）。整页放大
 * （`--ui-scale`，1.1）以后 `getBoundingClientRect` 量的是屏幕上的像素，和滚动的像素差一成，得换回来（2026-09-30 查出：
 * 原来混着算，长回答停住、跳转条跳过去的位置越往后越偏）。
 * @param {Element} node
 * @param {HTMLElement} box
 */
export function offsetIn(node, box) {
  return (node.getBoundingClientRect().top - box.getBoundingClientRect().top) / scaleOf(box);
}

/** `box` 在屏幕上放大了几倍：屏幕上的像素 ÷ 它自己的 CSS 像素（整页放大 1.1 时是 1.1）。 */
export function scaleOf(box) {
  return box.offsetWidth ? box.getBoundingClientRect().width / box.offsetWidth : 1;
}
