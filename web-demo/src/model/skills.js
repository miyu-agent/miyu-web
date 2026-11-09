// @ts-check
//! `$` 点名技能（蓝图 `web.md`「`$` 点名技能」，发版前 check 26，W-1124）：技能不在斜杠命令列表里，在输入框里打 `$名字` 点名，一句话里
//! 能点好几个。光标前面的 `$` 词、照名字筛、从一句话里认出点了哪几个（交 `session.send` 的 `skills`）、气泡里哪几段要着色。纯函数；
//! 有哪些技能照核心 SK-1 `command.catalog` 顶层的 `skills`。

import { fuzzyFilter } from '../lib/fuzzy.js';

/** @typedef {{name: string, summary: string, argument?: string}} Skill `command.catalog` 的 `skills` 的一项 */

/** 名字后面紧跟着这些的，名字还没完（`$a` 不在 `$abc` 里认）；中文、标点、空白跟着的算完了（`$review帮我看`） */
const GOES_ON = /[A-Za-z0-9_]/;

/**
 * 光标前面的 `$` 词：`$` 在最前面或者前面是空白（`a$b`、`US$5` 不算），到光标为止都是名字里的字；交回从哪起（`$` 的位置）、到哪
 * （光标）、`$` 后面的字；不是的交 `null`。
 * @param {string} value @param {number} caret
 */
export function skillWordAt(value, caret) {
  const before = value.slice(0, caret);
  const m = /(?:^|\s)\$([\p{L}\p{N}_.:-]*)$/u.exec(before);
  if (!m) return null;
  return { start: before.length - m[1].length - 1, end: caret, word: m[1] };
}

/**
 * 读核心交回的 `skills`：名字是字符串的留下，说明没有的写空。不是数组的（旧核心没有这一格）交空的。
 * @param {any} list @returns {Skill[]}
 */
export function readSkills(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((s) => s && typeof s.name === 'string' && s.name)
    .map((s) => ({ name: s.name, summary: typeof s.summary === 'string' ? s.summary : '', ...(typeof s.argument === 'string' && s.argument ? { argument: s.argument } : {}) }));
}

/** 照打的字筛（只看名字，模糊）；没打字的照原样。 @param {Skill[]} skills @param {string} word */
export function filterSkills(skills, word) {
  return fuzzyFilter(skills, word, (s) => [s.name]);
}

/**
 * 一句话里的 `$名字` 一段一段切出来：`$` 前面是开头或空白，名字照 `names` 里有的、最长的一截认，后面紧跟英文字母、数字、`_` 的不算
 * （末尾的 `.` 这类标点、紧跟着的中文退掉：`$review.`、`$review帮我看`）。交回每段从哪起、多长、名字。
 * @param {string} text @param {Set<string>} names
 * @returns {{at: number, length: number, name: string}[]}
 */
function marks(text, names) {
  const out = [];
  for (const m of text.matchAll(/(^|\s)\$([\p{L}\p{N}_.:-]+)/gu)) {
    const word = m[2];
    let name = '';
    for (let k = word.length; k > 0; k--) {
      if (names.has(word.slice(0, k)) && !GOES_ON.test(word[k] ?? '')) {
        name = word.slice(0, k);
        break;
      }
    }
    if (!name) continue;
    const at = /** @type {number} */ (m.index) + m[1].length;
    out.push({ at, length: name.length + 1, name });
  }
  return out;
}

/**
 * 这一句点了哪几个技能（交 `session.send` 的 `skills`）：照先后，重复的只算一次。
 * @param {string} text @param {Iterable<string>} names
 */
export function skillsIn(text, names) {
  const set = new Set(names);
  return [...new Set(marks(text, set).map((m) => m.name))];
}

/**
 * 气泡里的字切成段：`$名字`（有这个技能的）的一段带 `skill`，别的照原样（蓝图「`$` 点名技能」第 4 条：照人打的字写，点名的着色）。
 * @param {string} text @param {Set<string>} names
 * @returns {{text: string, skill?: boolean}[]}
 */
export function skillPieces(text, names) {
  const out = [];
  let from = 0;
  for (const m of marks(text, names)) {
    if (m.at > from) out.push({ text: text.slice(from, m.at) });
    out.push({ text: text.slice(m.at, m.at + m.length), skill: true });
    from = m.at + m.length;
  }
  if (from < text.length) out.push({ text: text.slice(from) });
  return out;
}
