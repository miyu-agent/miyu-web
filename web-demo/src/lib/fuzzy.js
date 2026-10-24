// @ts-check
//! 模糊搜索（蓝图 `web.md`「仪表盘」第 4 条展示文件的搜索，2026-10-24 项目主人）：不分大小写，要找的字在里面按先后都出现就算对得上；
//! 连着的、在开头的、紧跟着 `/` `.` `-` `_` 空格的（一段的开头）分高，排前面。纯函数，右侧边栏的卡片、放大看的那一页、预览工作区共用。

/**
 * 一段字对不对得上，多少分（越大越靠前）；对不上是 `null`；没写字的都对得上（0 分）。
 * @param {string} query @param {string} text
 * @returns {number|null}
 */
export function fuzzyScore(query, text) {
  const q = [...query.trim().toLowerCase()].filter((c) => c !== ' ');
  if (!q.length) return 0;
  const s = [...String(text ?? '').toLowerCase()];
  let score = 0;
  let at = 0;
  let last = -2;
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    let i = s.indexOf(c, at);
    if (i < 0) return null;
    // 后面有一段开头的同一个字，优先挑它（「miyu-web」里找 w 挑 web 的 w）；跳过去以后剩下的还得对得上
    for (let j = i; j < s.length; j++) {
      if (s[j] === c && (j === 0 || '/.-_ '.includes(s[j - 1])) && follows(q, k + 1, s, j + 1)) { i = j; break; }
    }
    score += 1;
    if (i === last + 1) score += 4;
    if (i === 0) score += 4;
    else if ('/.-_ '.includes(s[i - 1])) score += 2;
    last = i;
    at = i + 1;
  }
  return score - s.length / 1000;
}

/** `q` 从第 `k` 个字起在 `s` 的第 `at` 个字以后按先后都出现 @param {string[]} q @param {number} k @param {string[]} s @param {number} at */
function follows(q, k, s, at) {
  let i = at;
  for (let n = k; n < q.length; n++) {
    i = s.indexOf(q[n], i);
    if (i < 0) return false;
    i += 1;
  }
  return true;
}

/**
 * 照几段字（标题、文件名、路径）筛一串、照分排（一样的照原来的先后）；没写字的照原样。
 * @template T
 * @param {T[]} list @param {string} query @param {(item: T) => string[]} fields
 * @returns {T[]}
 */
export function fuzzyFilter(list, query, fields) {
  if (!query.trim()) return list;
  return list
    .map((item, i) => {
      const scores = fields(item).map((f) => fuzzyScore(query, f)).filter((x) => x != null);
      return { item, i, score: scores.length ? Math.max(.../** @type {number[]} */ (scores)) : null };
    })
    .filter((x) => x.score != null)
    .sort((a, b) => /** @type {number} */ (b.score) - /** @type {number} */ (a.score) || a.i - b.i)
    .map((x) => x.item);
}
