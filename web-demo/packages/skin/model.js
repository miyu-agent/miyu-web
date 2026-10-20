// @ts-check
//! 皮肤包认不认、写哪些变量、它的 CSS 怎么接进页面（软件包 `skin`，蓝图 `web.md`「皮肤」第 2–4 条）。不碰页面，测试直接调。
//!
//! 变量表是 `styles/tokens.css`：`:root` 里定义的（形状的总开关）加注释里 `@token` 列的（材质，出厂不定义）。部件名是
//! `resources/parts.json`：名字 → 页面里的选择器；皮肤的 CSS 写 `[data-part="composer"]`，接进页面时换成 `:is(.composer)`。

/** @typedef {{id: string, name?: string, order?: number, tokens?: Record<string, string|{light: string, dark: string}>, css?: string}} Pack */
/** @typedef {Record<string, {zh?: string, select: string[]}>} Parts */

const ID = /^[a-z][a-z0-9-]*$/;
const NAME = /^--[a-z][a-z0-9-]*$/;

/** 变量表里有哪些名字（`@token --r-数` 是一类的说明，不算名字，真的 `--r-8` 照 `:root` 里的定义） @param {string} css */
export function vocabulary(css) {
  const names = new Set();
  for (const m of css.matchAll(/@token\s+(--[a-z][a-z0-9-]*)(?=\s)/g)) names.add(m[1]);
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of plain.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)) names.add(m[1]);
  return names;
}

/**
 * 一格皮肤认不认：认的交 `null`，不认的交为什么（写进控制台，设置页不列它）。
 * @param {any} pack @param {Set<string>} known
 */
export function packProblem(pack, known) {
  if (!pack || typeof pack !== 'object') return '不是一格皮肤';
  if (typeof pack.id !== 'string' || !ID.test(pack.id)) return `编号不对：${pack.id}`;
  const tokens = pack.tokens ?? {};
  if (typeof tokens !== 'object' || Array.isArray(tokens)) return 'tokens 要是变量名到值';
  for (const [name, value] of Object.entries(tokens)) {
    // `--skin-` 打头的是这一格自己的辅助变量（几个掺出来的颜色、一道影），别处不认
    if (!NAME.test(name) || !(known.has(name) || name.startsWith('--skin-'))) return `变量表里没有 ${name}`;
    if (typeof value === 'string') continue;
    if (!value || typeof value !== 'object' || typeof value.light !== 'string' || typeof value.dark !== 'string') {
      return `${name} 要是一段字，或浅色、深色两份都有的 {light, dark}`;
    }
  }
  if (pack.css != null && typeof pack.css !== 'string') return 'css 要是样式文件的地址';
  return null;
}

/** 照明暗取这一格的变量：`[[名字, 值], …]` @param {Pack} pack @param {boolean} dark */
export function valuesOf(pack, dark) {
  return Object.entries(pack.tokens ?? {}).map(([name, v]) => [name, typeof v === 'string' ? v : dark ? v.dark : v.light]);
}

/** 去掉注释，一条条规则：`{at, selector, body}`（`@media`、`@supports` 里的照样拆出来，`at` 是外面那一层） @param {string} css */
export function rulesOf(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /** @type {Array<{at: string, selector: string, body: string}>} */
  const out = [];
  const walk = (/** @type {string} */ s, /** @type {string} */ at) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      for (; j < s.length && depth; j++) depth += s[j] === '{' ? 1 : s[j] === '}' ? -1 : 0;
      const body = s.slice(open + 1, j - 1);
      if (/^@(media|supports|container|layer)\b/.test(head)) walk(body, head);
      else out.push({ at, selector: head, body });
      i = j;
    }
  };
  walk(text, '');
  return out;
}

/**
 * 皮肤的 CSS 有哪几条不守规矩（第 4 条）：每条规则都以 `:root[data-skin="<编号>"]` 开头、只写部件名和状态，不写类名、编号；
 * `@font-face` 可以带。交回不守规矩的那几条的选择器和为什么。
 * @param {string} css @param {string} id
 */
export function scopeProblems(css, id) {
  const lead = `:root[data-skin="${id}"]`;
  /** @type {string[]} */
  const bad = [];
  for (const r of rulesOf(css)) {
    if (r.selector === '@font-face') continue;
    if (r.selector.startsWith('@')) { bad.push(`${r.selector}：只认 @font-face、@media、@supports`); continue; }
    for (const one of splitList(r.selector)) {
      if (!one.startsWith(lead)) bad.push(`${one}：不在 ${lead} 下面`);
      else if (/[.#][a-zA-Z_-]/.test(one.slice(lead.length).replace(/\[[^\]]*\]/g, ''))) bad.push(`${one}：只写部件名，不写类名、编号`);
    }
  }
  return bad;
}

/** 选择器列表按顶层的逗号拆开 @param {string} sel */
function splitList(sel) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && !depth) { parts.push(sel.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(sel.slice(start).trim());
  return parts.filter(Boolean);
}

/**
 * 接进页面：部件名换成页面里的选择器，相对的 `url()`（字体）照样式文件的地址换成绝对的。交回换好的 CSS 和不认得的部件名。
 * @param {string} css @param {Parts} parts @param {string} base 样式文件的地址
 */
export function translate(css, parts, base) {
  /** @type {string[]} */
  const unknown = [];
  const out = css
    .replace(/\[data-part=(["'])([^"']+)\1\]/g, (_, _q, name) => {
      const p = parts[name];
      if (!p) { unknown.push(name); return ':is(.skin-unknown-part)'; }
      return `:is(${p.select.join(', ')})`;
    })
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (whole, q, ref) => {
      if (/^(data:|[a-z]+:\/\/|\/)/i.test(ref)) return whole;
      return `url(${q}${new URL(ref, base).href}${q})`;
    });
  return { css: out, unknown: [...new Set(unknown)] };
}
