// @ts-check
//! 她的回答 → 一串块（蓝图 `web.md`「她的回答：Markdown」第 2 条，照旧版 `app.js:4736-5076`）。纯函数，不碰 DOM：
//! 块交给 `build.js` 造 DOM，这里测得了。
//!
//! 照这个先后认：空行；围起来的代码（```` ``` ```` 加语言，`~~~` 不算）；认领的一行（`options.line`，以后的音视频卡片）；
//! 独占几行的公式 `$$…$$`、`\[…\]`；表格；分隔线；标题（`#` 是 h2，往下顺延）；无序列表（`[ ]`、`[x]` 是任务）、
//! 有序列表（照缩进套，2026-10-23）；引用（去掉 `>` 以后照整条回答认块，2026-10-23）；段落（软换行照换行）。块里的字交给 `inline.js`。
//! 另外两种（2026-10-23）：独占一行的 `<details>`…`</details>` 折叠块，里面照整条回答认块；`[^名字]: 内容` 脚注的定义，
//! 从正文里拿走，照定义的先后收在最后一块 `footnotes` 里。

import { inline, FOOTNOTE_NAME, validLinkUrl, refKey, withRefs } from './inline.js';

/**
 * 一块。`code` 的 `closed` 是围栏收齐了没有：没收齐的代码到末尾为止（在收的时候，见 `stream.js`）；
 * `table` 的 `align` 一列一个（`left`、`center`、`right`，空的是没定）；列表的一项 `check` 是任务的勾（`null` 不是任务）；
 * `line` 是认领的一行，`value` 是认领时给的东西，原样放着。
 * @typedef {{type: 'para', kids: import('./inline.js').Inline[]}
 *   | {type: 'quote', blocks: Block[]}
 *   | {type: 'heading', level: number, kids: import('./inline.js').Inline[]}
 *   | {type: 'code', lang: string, text: string, closed: boolean}
 *   | {type: 'math', tex: string, raw: string}
 *   | {type: 'table', align: string[], head: import('./inline.js').Inline[][], rows: import('./inline.js').Inline[][][]}
 *   | {type: 'hr'}
 *   | {type: 'list', ordered: boolean, start?: number, task: boolean, items: Item[]}
 *   | {type: 'line', text: string, value: any}
 *   | {type: 'details', summary: import('./inline.js').Inline[]|null, blocks: Block[]}
 *   | {type: 'footnotes', items: {id: string, kids: import('./inline.js').Inline[]}[]}} Block
 * `details` 的 `summary` 是 `null` 的是没写 `<summary>`；`footnotes` 只在最后，一条回答最多一块。
 * @typedef {{check: boolean|null, kids: import('./inline.js').Inline[], blocks?: Block[]}} Item
 *   列表的一项：`kids` 是开头那一段的字（紧凑地画在记号后面），`blocks` 是下面别的块（子列表、第二段、代码块），没有的不写
 */

/** 围栏的开头：```` ``` ```` 加可有可无的语言，别的字不许有（`stream.js` 照同一个认）。 */
export const FENCE_OPEN = /^\s*```\s*([\w.+-]*)\s*$/;
/** 围栏的收尾：只有 ```` ``` ````。 */
export const FENCE_CLOSE = /^\s*```\s*$/;
/** 认的语言名（第 2 条）；不像的当没写。 */
const LANG = /^[\w.+-]{1,40}$/;
const HEADING = /^(#{1,6})\s+(.+)$/;
/** 列表的一项：缩进、记号（`-`、`*`、`+` 或者 `1.`、`1)`）、记号后面的空白、字 */
const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(\S.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const MATH_DELIMS = [['$$', '$$'], ['\\[', '\\]']];
/** 引用、折叠块、列表一共最多套几层（再深的整段照行内写） */
const MAX_DEPTH = 8;
/** 折叠块（第 2 条）：开头一行 `<details>`，后面可以紧跟 `<summary>…</summary>`；独占一行的标题、收尾。都不带属性。 */
const DETAILS_OPEN = /^\s*<details>\s*(?:<summary>(.*?)<\/summary>\s*)?$/i;
const SUMMARY = /^\s*<summary>(.*?)<\/summary>\s*$/i;
const DETAILS_CLOSE = /^\s*<\/details>\s*$/i;
/** 链接定义：`[名字]: 地址`，地址可以 `<>` 括起来，后面可以跟 `"标题"`、`'标题'`、`(标题)`（名字不是 `^` 开头的，那是脚注） */
const REF_DEF = /^ {0,3}\[([^\]^][^\]]{0,99})\]:[ \t]*<?([^\s<>]+)>?(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/;
/** 脚注的定义：`[^名字]: 内容`；下面缩进的几行接着算它的。 */
const FOOTNOTE_DEF = new RegExp(`^\\[\\^(${FOOTNOTE_NAME})\\]:\\s?(.*)$`);

/**
 * 解析一条回答。
 * @param {string} source
 * @param {{line?: (line: string) => any}} [options] `line` 认领独占一行的：给一个不是 `null` 的值，这一行就单独成
 *   一块（`{type: 'line', value}`），段落也在这里断开；每一行最多问一次
 * @returns {Block[]}
 */
export function parse(source, { line } = {}) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  /** @type {Map<string, import('./inline.js').Inline[]>} */
  const notes = new Map();
  // 链接定义先收齐（写在用到它的后面也认），解析时行内照它认引用式链接
  const blocks = withRefs(refDefs(lines), () => parseLines(lines, 0, lines.length, line, notes, 0));
  if (notes.size) blocks.push({ type: 'footnotes', items: [...notes].map(([id, kids]) => ({ id, kids })) });
  return blocks;
}

/**
 * `lines` 的 `[from, to)` 那几行认成块；脚注的定义收进 `notes`（同一个名字的留第一条）。`depth` 是套了几层（折叠块、引用、列表）。
 * @param {string[]} lines @param {number} from @param {number} to
 * @param {((line: string) => any)|undefined} line @param {Map<string, import('./inline.js').Inline[]>} notes @param {number} depth
 * @returns {Block[]}
 */
function parseLines(lines, from, to, line, notes, depth) {
  const asked = new Map();
  /** 这一行有没有被认领：问过的记着，段落里问过的，轮到它当块时不再问。 */
  const claim = (i) => {
    if (!line) return null;
    if (!asked.has(i)) asked.set(i, line(lines[i]) ?? null);
    return asked.get(i);
  };
  /** @type {Block[]} */
  const blocks = [];
  let i = from;
  while (i < to) {
    const text = lines[i];
    if (!text.trim()) {
      i += 1;
      continue;
    }
    const fence = FENCE_OPEN.exec(text);
    if (fence) {
      const body = [];
      const start = i;
      i += 1;
      while (i < to && !FENCE_CLOSE.test(lines[i])) body.push(lines[i++]);
      const closed = i < to;
      if (closed) i += 1;
      // 语言写 math 的围起来的一段是独占几行的公式（2026-10-19 项目主人让终端认，两个头一样）；还没收的照代码画，收了再排；`latex` 照源码画
      if (closed && fence[1].toLowerCase() === 'math') blocks.push({ type: 'math', tex: body.join('\n'), raw: lines.slice(start, i).join('\n') });
      else blocks.push({ type: 'code', lang: LANG.test(fence[1]) ? fence[1] : '', text: body.join('\n'), closed });
      continue;
    }
    const value = claim(i);
    if (value != null) {
      blocks.push({ type: 'line', text, value });
      i += 1;
      continue;
    }
    const opened = DETAILS_OPEN.exec(text);
    if (opened && depth < MAX_DEPTH) {
      const end = detailsEnd(lines, i + 1, to);
      let start = i + 1;
      let summary = opened[1] ?? null;
      if (summary == null) {
        // 标题可以在下一行，中间隔着空行也行
        let k = start;
        while (k < end && !lines[k].trim()) k += 1;
        const named = k < end ? SUMMARY.exec(lines[k]) : null;
        if (named) { summary = named[1]; start = k + 1; }
      }
      blocks.push({ type: 'details', summary: summary == null ? null : inline(summary), blocks: parseLines(lines, start, end, line, notes, depth + 1) });
      i = Math.min(to, end + 1);
      continue;
    }
    // 认得的链接定义从正文里拿走（定义早就收好了）
    if (isRefDef(text)) {
      i += 1;
      continue;
    }
    const note = FOOTNOTE_DEF.exec(text);
    if (note) {
      const body = [note[2]];
      i += 1;
      // 下面缩进的几行接着算它的；空行以后还缩进着的也算
      while (i < to && (/^(?: {2,}|\t)\S/.test(lines[i]) || (!lines[i].trim() && i + 1 < to && /^(?: {2,}|\t)\S/.test(lines[i + 1])))) body.push(lines[i++].trim());
      if (!notes.has(note[1])) notes.set(note[1], inline(body.join('\n').trim()));
      continue;
    }
    const math = /^\s*(\$\$|\\\[)/.test(text) ? mathBlock(lines, i, to) : null;
    if (math) {
      blocks.push({ type: 'math', tex: math.tex, raw: lines.slice(i, math.next).join('\n') });
      i = math.next;
      continue;
    }
    const tabled = isTableStart(lines, i, to) ? table(lines, i, to) : null;
    if (tabled) {
      blocks.push(tabled.block);
      i = tabled.next;
      continue;
    }
    if (isRule(text)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }
    const heading = HEADING.exec(text);
    if (heading) {
      blocks.push({ type: 'heading', level: Math.min(6, heading[1].length + 1), kids: inline(heading[2]) });
      i += 1;
      continue;
    }
    const listed = list(lines, i, to, line, notes, depth);
    if (listed) {
      blocks.push(listed.block);
      i = listed.next;
      continue;
    }
    if (/^\s*>/.test(text)) {
      const quoted = [];
      for (let m; i < to && (m = QUOTE.exec(lines[i])); i += 1) quoted.push(m[1]);
      // 去掉 `>` 以后照整条回答认块（引用里能套引用、列表、代码块）；套太深的整段照行内
      blocks.push({ type: 'quote', blocks: depth < MAX_DEPTH ? parseLines(quoted, 0, quoted.length, line, notes, depth + 1) : [{ type: 'para', kids: inline(quoted.join('\n')) }] });
      continue;
    }
    const para = [text];
    i += 1;
    while (i < to && lines[i].trim() && !startsBlock(lines, i, to, claim)) para.push(lines[i++]);
    blocks.push({ type: 'para', kids: inline(para.join('\n')) });
  }
  return blocks;
}

/** 这一行的链接定义：`{key, href, title}`，不是的、地址不认的是 `null`。 @param {string} text */
function refDef(text) {
  const m = REF_DEF.exec(text);
  const href = m ? validLinkUrl(m[2]) : null;
  return m && href ? { key: refKey(m[1]), href, title: m[3] ?? m[4] ?? m[5] ?? null } : null;
}

const isRefDef = (/** @type {string} */ text) => refDef(text) != null;

/**
 * 整条回答里的链接定义（围起来的代码里的不算）：名字 → `{href, title}`，同一个名字留第一条。
 * @param {string[]} lines
 */
function refDefs(lines) {
  /** @type {Map<string, {href: string, title: string|null}>} */
  const out = new Map();
  let fenced = false;
  for (const text of lines) {
    if (fenced ? FENCE_CLOSE.test(text) : FENCE_OPEN.test(text)) {
      fenced = !fenced;
      continue;
    }
    const def = fenced ? null : refDef(text);
    if (def && !out.has(def.key)) out.set(def.key, { href: def.href, title: def.title });
  }
  return out;
}

/** 从 `from` 起配对的 `</details>` 在第几行（照层数配对）；没有的是 `to`（在收的时候到末尾为止）。 */
function detailsEnd(lines, from, to) {
  let level = 1;
  for (let i = from; i < to; i += 1) {
    if (DETAILS_OPEN.test(lines[i])) level += 1;
    else if (DETAILS_CLOSE.test(lines[i]) && --level === 0) return i;
  }
  return to;
}

/** 这一行能不能开一块：段落碰到它就断开。 */
function startsBlock(lines, i, to, claim) {
  const text = lines[i];
  return DETAILS_OPEN.test(text) || DETAILS_CLOSE.test(text) || FOOTNOTE_DEF.test(text) || isRefDef(text) || /^\s*```/.test(text) || /^#{1,6}\s+/.test(text) || /^\s*[-*+]\s+/.test(text) || /^\s*\d+[.)]\s+/.test(text)
    || /^\s*>/.test(text) || isRule(text) || isTableStart(lines, i, to) || /^\s*\$\$/.test(text) || /^\s*\\\[\s*$/.test(text)
    || claim(i) != null;
}

/** 分隔线：三个以上的 `*`、`-`、`_`，中间可以有空白。 */
function isRule(text) {
  const t = text.trim();
  return /^(?:\*\s*){3,}$/.test(t) || /^(?:-\s*){3,}$/.test(t) || /^(?:_\s*){3,}$/.test(t);
}

/**
 * 独占几行的公式：`{tex, next}`（`next` 是公式后面那一行），没收齐的是 `null`（在收的时候照原文，收齐了下一次重画自己变公式）。
 * 开头那一行、收尾那一行可以带着公式的字；一行里开了又收的也算。
 */
function mathBlock(lines, index, to) {
  const first = lines[index].trim();
  for (const [open, close] of MATH_DELIMS) {
    if (!first.startsWith(open)) continue;
    const rest = first.slice(open.length);
    if (rest.length > close.length && rest.endsWith(close)) return { tex: rest.slice(0, -close.length), next: index + 1 };
    const body = rest && rest !== close ? [rest] : [];
    for (let i = index + 1; i < to; i += 1) {
      const candidate = lines[i].trim();
      if (candidate.endsWith(close)) {
        if (candidate !== close) body.push(candidate.slice(0, -close.length));
        return { tex: body.join('\n'), next: i + 1 };
      }
      body.push(lines[i]);
    }
    return null;
  }
  return null;
}

/**
 * 表格的一行拆成格：`\|` 和代码里的 `|` 不分格；两头的 `|` 可有可无。
 * `separated` 是这一行里有没有分格的 `|`：没有的不算表格的一行。
 */
function row(line) {
  const text = String(line ?? '').trim();
  const cells = [];
  let cell = '';
  let fence = 0;
  let separated = false;
  let endsWithBar = false;
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\' && i + 1 < text.length) {
      cell += text.slice(i, i + 2);
      i += 2;
    } else if (text[i] === '`') {
      let end = i + 1;
      while (end < text.length && text[end] === '`') end += 1;
      // 一样长的一串反引号才收尾：`` `a|b` `` 里的 | 不分格
      if (!fence) fence = end - i;
      else if (fence === end - i) fence = 0;
      cell += text.slice(i, end);
      i = end;
    } else if (text[i] === '|' && !fence) {
      cells.push(cell.trim());
      cell = '';
      separated = true;
      endsWithBar = true;
      i += 1;
      continue;
    } else {
      cell += text[i];
      i += 1;
    }
    endsWithBar = false;
  }
  cells.push(cell.trim());
  if (text.startsWith('|')) cells.shift();
  if (endsWithBar) cells.pop();
  return { cells, separated };
}

/** 分隔行定的对齐，一列一个；不是分隔行的是 `null`。 */
function alignments(line) {
  const { cells, separated } = row(line);
  if (!separated || !cells.length) return null;
  const out = [];
  for (const cell of cells) {
    const marker = /^(:)?-{3,}(:)?$/.exec(cell);
    if (!marker) return null;
    out.push(marker[1] && marker[2] ? 'center' : marker[2] ? 'right' : marker[1] ? 'left' : '');
  }
  return out;
}

/** 这一行加下一行是不是表格的头：表头和分隔行的列数得一样。 */
function isTableStart(lines, i, to) {
  if (i + 1 >= to) return false;
  const head = row(lines[i]);
  const align = alignments(lines[i + 1]);
  return Boolean(align && head.separated && head.cells.length === align.length);
}

/**
 * 一张表：表头、分隔行，下面一行行到空行或者没有 `|` 的一行为止；格数照表头，少的补空，多的丢掉。
 * @returns {{block: Block, next: number}} `next` 是表格后面那一行
 */
function table(lines, start, to) {
  const head = row(lines[start]).cells;
  const align = /** @type {string[]} */ (alignments(lines[start + 1]));
  const rows = [];
  let i = start + 2;
  for (; i < to && lines[i].trim(); i += 1) {
    const r = row(lines[i]);
    if (!r.separated) break;
    rows.push(head.map((_, k) => inline(r.cells[k] ?? '')));
  }
  return { block: { type: 'table', align, head: head.map((c) => inline(c)), rows }, next: i };
}

/** 这几个空白占几列（Tab 算到下一个 4 的倍数） @param {string} ws */
function cols(ws) {
  let n = 0;
  for (const c of ws) n = c === '\t' ? n + 4 - (n % 4) : n + 1;
  return n;
}

/** 一行开头的空白占几列 @param {string} text */
const indentOf = (text) => cols(/^[ \t]*/.exec(text)?.[0] ?? '');

/** 去掉一行开头 `n` 列的空白（不够的去掉全部；Tab 拆开的剩下的照空格补上） @param {string} text @param {number} n */
function dedent(text, n) {
  let col = 0;
  let k = 0;
  while (k < text.length && col < n && (text[k] === ' ' || text[k] === '\t')) {
    col = text[k] === '\t' ? col + 4 - (col % 4) : col + 1;
    k += 1;
  }
  return ' '.repeat(Math.max(0, col - n)) + text.slice(k);
}

/**
 * 这一行是不是列表的一项：`{indent, ordered, start, content, text}`，`content` 是这一项的内容从第几列起（记号后面的字那一列；
 * 记号后面空了 5 列以上的照 1 列算，CommonMark 的规矩），不是的是 `null`。
 * @param {string} text
 */
function itemAt(text) {
  const m = ITEM.exec(text);
  if (!m) return null;
  const indent = cols(m[1]);
  const gap = cols(m[3]);
  return { indent, ordered: /\d/.test(m[2]), start: Number.parseInt(m[2], 10), content: indent + m[2].length + (gap > 4 ? 1 : gap), text: m[4] };
}

/**
 * 从这一行起的列表（2026-10-23 起能套）：一项的内容从记号后面的字那一列起，下面缩进到这一列的行都归它（空行以后还缩进着的也算），
 * 去掉这么多缩进以后照整条回答认块；缩进不到这一列、但比记号深的一行接在字后面；没缩进又不是项的一行、换了有序无序，列表结束。
 * 开头是 `[ ]`、`[x]` 的项是任务，有一项是任务整张就是任务列表；有序的记第一项的号（`start`）。不是列表的是 `null`。
 * @param {string[]} lines @param {number} start @param {number} to
 * @param {((line: string) => any)|undefined} line @param {Map<string, import('./inline.js').Inline[]>} notes @param {number} depth
 * @returns {{block: Block, next: number}|null}
 */
function list(lines, start, to, line, notes, depth) {
  const first = itemAt(lines[start]);
  if (!first) return null;
  /** @type {Item[]} */
  const items = [];
  let i = start;
  let top = first;
  for (let m = first; m && m.ordered === first.ordered && m.indent < top.content; m = i < to ? itemAt(lines[i]) : null) {
    top = m;
    const task = first.ordered ? null : TASK.exec(m.text);
    const body = [task ? task[2] : m.text];
    i += 1;
    while (i < to) {
      const text = lines[i];
      if (!text.trim()) {
        // 空行：后面还缩进到这一项的内容那一列的才接着算这一项
        let k = i;
        while (k < to && !lines[k].trim()) k += 1;
        if (k >= to || indentOf(lines[k]) < m.content) break;
        while (i < k) { body.push(''); i += 1; }
        continue;
      }
      const ind = indentOf(text);
      if (ind >= m.content) body.push(dedent(text, m.content));
      // 缩进不到内容那一列、但比记号深的（不是别的项）：接在字后面
      else if (ind > m.indent && !itemAt(text) && body.at(-1)?.trim()) body.push(text.trim());
      else break;
      i += 1;
    }
    const blocks = depth < MAX_DEPTH ? parseLines(body, 0, body.length, line, notes, depth + 1) : [{ type: 'para', kids: inline(body.join('\n')) }];
    const head = blocks[0]?.type === 'para' ? blocks.shift() : null;
    items.push({ check: task ? task[1] !== ' ' : null, kids: head?.type === 'para' ? head.kids : [], ...(blocks.length ? { blocks } : {}) });
    // 项和项之间的空行跳过（下一行是同一张表的项才接着）
    let k = i;
    while (k < to && !lines[k].trim()) k += 1;
    const next = k < to ? itemAt(lines[k]) : null;
    if (k > i && !(next && next.ordered === first.ordered && next.indent < m.content)) break;
    i = k;
  }
  return { block: { type: 'list', ordered: first.ordered, ...(first.ordered && first.start !== 1 ? { start: first.start } : {}), task: items.some((it) => it.check != null), items }, next: i };
}
