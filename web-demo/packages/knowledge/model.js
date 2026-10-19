// @ts-check
//! 知识库页的纯逻辑（蓝图 `web.md`「知识库页」）：库从哪来、能不能改、编号怎么定、一篇读不了的原因、大小怎么写、搜到的那一段头上写什么。
//! 界面在 `page.js`。

/**
 * @typedef {{id: string, name?: string, description?: string, documents?: number, chunks?: number, auto?: boolean,
 *   error?: string, package?: string, mount?: string}} Base
 * @typedef {{path: string, name?: string, kind?: string, size?: number, at?: string, chunks?: number, reason?: string, why?: string}} Doc
 * @typedef {{kb: string, path: string, chunk?: number, heading?: string, text?: string, at?: string, page?: number}} Hit
 */

/** 核心给的读不了的原因（`kb.documents`）；别的照「读不了」写 */
export const REASONS = /** @type {const} */ (['too_large', 'not_utf8', 'no_text', 'no_extractor', 'extract_failed', 'unreadable']);

/** 库从哪来：随软件包的、挂的文件夹、自己建的 @param {Base} b @returns {'package'|'mount'|'own'} */
export const sourceOf = (b) => (b.package ? 'package' : b.mount ? 'mount' : 'own');

/** 能不能加、删文档（挂的、随包的只读，2026-10-19 项目主人） @param {Base} b */
export const writable = (b) => sourceOf(b) === 'own';

/** 能不能删掉这个库（随包的不能） @param {Base} b */
export const deletable = (b) => sourceOf(b) !== 'package';

/** 一篇读不了的原因的字的编号（`reasons.*`）；没有原因的是 `null` @param {{reason?: string}} d */
export const reasonKey = (d) => (d.reason ? `reasons.${REASONS.includes(/** @type {any} */ (d.reason)) ? d.reason : 'unreadable'}` : null);

/** 核心对编号的要求（小写字母开头，只有小写字母、数字、`-`、`_`，最多 32 个字） @param {string} id */
export const validId = (id) => /^[a-z][a-z0-9_-]{0,31}$/.test(id);

/**
 * 新建的编号：名字只有英文字母、数字、空格、`-`、`_` 的照名字（转小写、空格换成 `-`），不然 `kb-` 加一段时间编号；
 * 已经有的后面加 `-2`、`-3`……
 * @param {string} name @param {Set<string>} taken @param {number} now
 */
export function idFor(name, taken, now) {
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
  let base = /^[a-z][a-z0-9_-]*$/.test(slug) ? slug.slice(0, 32).replace(/[-_]+$/, '') : '';
  if (!validId(base)) base = `kb-${now.toString(36)}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const tail = `-${n}`;
    const id = base.slice(0, 32 - tail.length) + tail;
    if (!taken.has(id)) return id;
  }
}

/** 撞了编号再试的下一个（`kb_exists`）：把这一个也算进已经有的 @param {string} name @param {Set<string>} taken @param {string} tried @param {number} now */
export const nextId = (name, taken, tried, now) => idFor(name, new Set([...taken, tried]), now);

/** 文件大小：字节、KB、MB（一位小数，整数的不写小数） @param {number|undefined} n */
export function sizeText(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const s = v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '');
  return `${s} ${units[i]}`;
}

/** 文档的图标（Lucide）：PDF `file`，网页 `file-code`，别的 `file-text` @param {string|undefined} kind */
export const docIcon = (kind) => (kind === 'pdf' ? 'file' : kind === 'html' ? 'file-code' : 'file-text');

/**
 * 搜到的那一段头上写什么：「库名 / 路径 · 标题」，没有标题的 PDF 写「第 N 页」。
 * @param {Hit} hit @param {(id: string) => string} nameOf 库编号 → 名字 @param {(page: number) => string} pageText
 */
export function hitHead(hit, nameOf, pageText) {
  const at = hit.heading || (Number.isInteger(hit.page) ? pageText(/** @type {number} */ (hit.page)) : '');
  return [`${nameOf(hit.kb)} / ${hit.path}`, at].filter(Boolean).join(' · ');
}

/**
 * 看原文时滚到哪：拿片段里头一行像样的字（去掉 Markdown 的记号，取前 16 个字）去画好的原文里找。没有能找的交 `null`。
 * @param {string|undefined} snippet
 */
export function probeOf(snippet) {
  for (const line of String(snippet ?? '').split('\n')) {
    const plain = line.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)+/, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .trim();
    if ([...plain].length >= 4) return [...plain].slice(0, 16).join('');
  }
  return null;
}

/**
 * 文档清单排成文件树（2026-10-20 项目主人：要能以文件树的形式展示，可展开收起）：照路径的 `/` 一层一层分；一层里文件夹在前、文件在后，各照名字排。
 * 读不了的子目录（`kb.documents` 的 `folders`）带 `dir`，照文件放在它那一层（画成文件夹、写原因、点不开）。
 * @typedef {{name: string, path: string, folders: TreeNode[], docs: (Doc & {dir?: boolean})[]}} TreeNode
 * @param {(Doc & {dir?: boolean})[]} docs @returns {TreeNode}
 */
export function treeOf(docs) {
  /** @type {TreeNode & {map?: Map<string, any>}} */
  const root = { name: '', path: '', folders: [], docs: [] };
  /** @type {Map<string, TreeNode>} */
  const byPath = new Map([['', root]]);
  const folderAt = (/** @type {string[]} */ parts) => {
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join('/');
      let next = byPath.get(path);
      if (!next) {
        next = { name: parts[i], path, folders: [], docs: [] };
        byPath.set(path, next);
        node.folders.push(next);
      }
      node = next;
    }
    return node;
  };
  for (const d of docs) {
    const parts = String(d.path).split('/').filter(Boolean);
    folderAt(parts.slice(0, -1)).docs.push({ ...d, name: parts.at(-1) ?? d.path });
  }
  const order = (/** @type {TreeNode} */ node) => {
    node.folders.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    node.docs.sort((a, b) => Number(!!a.dir) - Number(!!b.dir) || String(a.name).localeCompare(String(b.name), 'zh'));
    node.folders.forEach(order);
  };
  order(root);
  return root;
}

/** 一个文件夹里（连子文件夹）有几篇（读不了的子目录不算） @param {TreeNode} node @returns {number} */
export function countOf(node) {
  return node.docs.filter((d) => !d.dir).length + node.folders.reduce((n, f) => n + countOf(f), 0);
}
