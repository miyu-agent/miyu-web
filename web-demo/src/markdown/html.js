// @ts-check
//! 回答里放行的 HTML 标签和属性（蓝图 `web.md`「她的回答：Markdown」第 1 条）。纯函数：只认表里的名字，属性挑剩下安全的几样，
//! `build.js` 照它新造元素，原文的字不进标签。

/** 成对的行内标签：里面照行内的写法 */
export const INLINE_TAGS = ['kbd', 'sub', 'sup', 'mark', 'ins', 'u', 's', 'del', 'span', 'small', 'b', 'i', 'strong', 'em'];
/** 独占一行起头的块 */
export const BLOCK_TAGS = ['p', 'div', 'center'];

const ALIGN = /^(?:left|center|right|justify)$/;
const COLOR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?)\([\d.%\s,/]+\)|[a-z]{3,20})$/i;
/** `style` 里留下的几项和它们能写的值 */
const STYLE = /** @type {Record<string, RegExp>} */ ({
  color: COLOR,
  'background-color': COLOR,
  'font-weight': /^(?:normal|bold|bolder|lighter|[1-9]00)$/,
  'font-style': /^(?:normal|italic|oblique)$/,
  'text-decoration': /^(?:none|(?:underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*)$/,
  'text-align': ALIGN,
});

/**
 * 属性 → 留下的：`{style?, title?}`。`align` 并进 `style` 的 `text-align`；别的属性、`style` 里别的项、值不像的都丢掉。
 * 认不出写法的整串当没写（标签照样画）。
 * @param {string} raw 标签名后面那一截（`align="center" style="…"`）
 * @returns {{style?: string, title?: string}}
 */
export function safeAttrs(raw) {
  /** @type {{style?: string, title?: string}} */
  const out = {};
  /** @type {string[]} */
  const style = [];
  const re = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (let m; (m = re.exec(raw ?? ''));) {
    const name = m[1].toLowerCase();
    const value = (m[2] ?? m[3] ?? '').trim();
    if (name === 'title' && value) out.title = value;
    else if (name === 'align' && ALIGN.test(value.toLowerCase())) style.push(`text-align: ${value.toLowerCase()}`);
    else if (name === 'style') style.push(...safeStyle(value));
  }
  if (style.length) out.style = style.join('; ');
  return out;
}

/** `style` 里留下的几项（`名: 值` 一项一条） @param {string} css @returns {string[]} */
export function safeStyle(css) {
  /** @type {string[]} */
  const out = [];
  for (const part of String(css ?? '').split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const name = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).trim().replace(/\s*!important$/i, '');
    const ok = STYLE[name];
    if (ok && ok.test(value)) out.push(`${name}: ${value}`);
  }
  return out;
}
