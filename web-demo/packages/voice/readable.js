// @ts-check
//! 朗读前先把回答整理成念得出来的原文（软件包 `voice`，蓝图 `web.md`「语音」第 3 条，todolist 第 14 条，W-1205）。纯的。
//! - 末尾的参考链接那一段不念：从末尾往上只有链接的几行（列表、裸网址、`[1]: 网址` 这种），连同它上面那一行「参考链接」「来源」
//!   「Sources」这类小标题；有小标题的，带说明的链接行也一起不念。整段回答都是链接的照念（问的就是链接）。
//! - 网址不念原文：`[字](网址)` 留字，字就是网址、空的念域名，只有编号的（`[1](网址)` 这种引用角标）不念；裸网址、`<网址>` 念域名；
//!   `[1]: 网址` 这种定义行、`[^1]` 脚注角标不念。切句（`model.js` 的 `sentences`）照 `?`、`;`、`!` 切，网址不先换掉会被切成两半，
//!   `say` 拿到半截的链接只好照原文念网址。
//! 围起来的代码块原样不动（念不念由 `say` 定）。

/** `[字](网址)`、`![替代文字](网址)`，网址后面可以带标题 */
const LINK = /(!?)\[([^\]\n]*)\]\(\s*<?([^)\s>]*)>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;
/** `<网址>` */
const AUTOLINK = /<(https?:\/\/[^>\s]+)>/g;
/** 裸网址：到空白、尖括号、中文字为止 */
const BARE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'*+,;=%]+/g;
/** `[1]: 网址` 这种链接定义（整行） */
const DEFINITION = /^\s{0,3}\[[^\]\n]+\]:\s*\S+.*$/;
/** 脚注角标 `[^1]` */
const FOOTNOTE = /\[\^[^\]\n]*\]/g;
/** 分隔线 */
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
/** 围起来的代码块的开头、收尾 */
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** 引用角标的字：只有编号、方括号（`1`、`[1]`、`¹`） */
const CITATION = /^[\s[\]\d¹²³⁴⁵⁶⁷⁸⁹⁰,，、-]*$/;

/** 小标题的字（去掉标点、符号、空白、小写以后整个就是它）：中文 */
const LABEL_ZH = /^(?:以下是?|附|附上|主要|相关|更多|延伸|扩展|信息|资料|数据|搜索|搜索结果|网页|原文|参考)?(?:参考|链接|资料|来源|出处|文献|阅读|网址|引用|原文)(?:来源|链接|资料|文献|列表|如下)?$/;
/** 小标题的字：英文、日文 */
const LABEL_OTHER = /^(?:sources?|references?|links?|citations?|furtherreading|readmore|relatedlinks?|usefullinks?|learnmore|seealso|bibliography|参考文献|出典|参考リンク|リンク|情報源|ソース)$/;

/**
 * 朗读前整理回答：末尾的参考链接那一段去掉，网址换成念得出来的字。
 * @param {string} text
 * @returns {string}
 */
export function readable(text) {
  const all = String(text ?? '');
  const kept = withoutSources(all);
  return links(kept.trim() ? kept : all);
}

/** 去掉末尾的参考链接那一段（见文件头）。 @param {string} text */
export function withoutSources(text) {
  const lines = text.split('\n');
  let end = lines.length;
  /** 从末尾往上、只有链接的那几行从哪一行起（`end` 是还没有） */
  let pure = end;
  let allPure = true;
  let cut = -1;
  let j = lines.length - 1;
  for (; j >= 0; j--) {
    const line = lines[j];
    if (!line.trim() || RULE.test(line)) continue;
    if (FENCE.test(line) || !hasLink(line)) break;
    // 一行既是小标题又带链接（「来源：[甲](…)、[乙](…)」）：这一段从这里起
    if (isLabel(line)) { cut = j; break; }
    if (allPure && isPure(line)) pure = j;
    else allPure = false;
  }
  if (cut < 0 && j >= 0 && isLabel(lines[j]) && hasLink(lines.slice(j + 1).join('\n'))) cut = j;
  if (cut < 0) cut = pure < end ? pure : -1;
  if (cut < 0) return text;
  // 这一段上面紧挨着的空行、分隔线一起去掉
  end = cut;
  while (end > 0 && (!lines[end - 1].trim() || RULE.test(lines[end - 1]))) end--;
  return lines.slice(0, end).join('\n');
}

/** 这一行带不带链接、网址。 @param {string} line */
function hasLink(line) {
  return DEFINITION.test(line) || new RegExp(LINK.source).test(line) || new RegExp(AUTOLINK.source).test(line) || new RegExp(BARE.source).test(line);
}

/** 拿掉链接、网址、角标以后剩下的字（只留字母、数字，小写）。 @param {string} line */
function residual(line) {
  if (DEFINITION.test(line)) return '';
  const rest = line.replace(LINK, ' ').replace(AUTOLINK, ' ').replace(BARE, ' ').replace(FOOTNOTE, ' ')
    .replace(/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+/, ' ');
  return (rest.match(/[\p{L}\p{N}]+/gu) ?? []).join('').toLowerCase();
}

/** 只有链接的一行（列表的一项、一个裸网址、一行几个链接）：拿掉链接以后不剩字，编号不算。 @param {string} line */
function isPure(line) {
  return !residual(line).replace(/\d+/g, '');
}

/** 「参考链接」「来源：」「## Sources」这种小标题（不带链接的那几个字整个就是它）。 @param {string} line */
function isLabel(line) {
  const words = residual(line).replace(/\d+/g, '');
  return !!words && words.length <= 20 && (LABEL_ZH.test(words) || LABEL_OTHER.test(words));
}

/** 网址换成念得出来的字（见文件头）；围起来的代码块里的不动。 @param {string} text */
function links(text) {
  /** 在哪种围栏里（开头那几个字的第一个，`` ` `` 或 `~`）；不在是空的 */
  let inFence = '';
  /** @type {string[]} */
  const out = [];
  for (const line of text.split('\n')) {
    const fence = line.match(FENCE)?.[1];
    if (fence && (!inFence || fence[0] === inFence)) {
      inFence = inFence ? '' : fence[0];
      out.push(line);
    } else if (inFence) out.push(line);
    else if (!DEFINITION.test(line)) out.push(spokenLinks(line));
  }
  return out.join('\n');
}

/** 一行里的链接、网址换成念得出来的字。 @param {string} line */
function spokenLinks(line) {
  return line
    .replace(LINK, (_m, image, words, url) => {
      const w = String(words).trim();
      if (image) return w;
      if (!w || w === url) return domain(url);
      return CITATION.test(w) ? '' : w;
    })
    .replace(AUTOLINK, (_m, url) => domain(url))
    .replace(BARE, (url) => domain(url))
    .replace(FOOTNOTE, '');
}

/** 网址的域名，去掉 `www.`（同 `say`）。 @param {string} url */
function domain(url) {
  const rest = url.includes('://') ? url.slice(url.indexOf('://') + 3) : url;
  const host = rest.split(/[/?#]/)[0];
  return host.slice(host.lastIndexOf('@') + 1).replace(/^www\./, '').replace(/[.,;:!?]+$/, '');
}
