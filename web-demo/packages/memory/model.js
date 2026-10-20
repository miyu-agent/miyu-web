// @ts-check
//! 记忆页的纯逻辑（蓝图 `web.md`「记忆页」）：四个类别的先后、数没作废的、筛、存的时候只带改了的、数字数（照码点，同核心的
//! 120 字）。界面在 `page.js`。

/** 类别的先后（核心 `memory.md`「一条记忆」） */
export const CLASSES = /** @type {const} */ (['user', 'feedback', 'episode', 'reference']);

/** 作废了没有：核心作废时没写原因的给空字符串，不是 `null` 就算作废 @param {{retired?: string|null}} m */
export const isRetired = (m) => m.retired != null;

/** 一条最多几个字、关键词最多几个字（核心 R-15 上） */
export const TEXT_MAX = 120;
export const KEYWORDS_MAX = 200;

/**
 * @typedef {{id: string, class: string, text: string, by?: string, at?: string, used?: number, used_at?: string|null,
 *   sources?: {session: string, turn: number}[], retired?: string|null, venue?: string|null, keywords?: string|null}} Memory
 */

/** 字数照码点数（一个汉字、一个表情都算一个） @param {string} s */
export const chars = (s) => [...String(s ?? '')].length;

/** 没作废的一共几条、每一类几条 @param {Memory[]} list */
export function counts(list) {
  /** @type {Record<string, number>} */
  const out = { all: 0 };
  for (const c of CLASSES) out[c] = 0;
  for (const m of list) {
    if (isRetired(m)) continue;
    out.all += 1;
    if (m.class in out) out[m.class] += 1;
  }
  return out;
}

/**
 * 列哪几条：类别（`all` 是全部）、作废的看不看。
 * @param {Memory[]} list @param {{cls: string, retired: boolean}} f
 */
export function visible(list, f) {
  return list.filter((m) => (f.retired || !isRetired(m)) && (f.cls === 'all' || m.class === f.cls));
}

/** 核心给的记忆带不带关键词这一格（R-15 上以前的没有）：有一条带了就算有 @param {Memory[]} list */
export const hasKeywords = (list) => list.some((m) => Object.prototype.hasOwnProperty.call(m, 'keywords'));

/**
 * 存详情：只带改了的（`memory.update`）。内容去掉前后空白；关键词清空写空字符串（核心照它去掉关键词）。没改的交 `null`。
 * @param {Memory} m 原来的 @param {string} text 框里的内容 @param {string|null} keywords 框里的关键词（不认关键词的核心交 `null`）
 * @returns {{id: string, text?: string, keywords?: string}|null}
 */
export function updateOf(m, text, keywords) {
  /** @type {{id: string, text?: string, keywords?: string}} */
  const out = { id: m.id };
  const t = text.trim();
  if (t && t !== m.text) out.text = t;
  if (keywords != null) {
    const k = keywords.trim();
    if (k !== (m.keywords ?? '')) out.keywords = k;
  }
  return 'text' in out || 'keywords' in out ? out : null;
}

/**
 * 存不存得了：内容不空、不超长，关键词不超长，有改的。
 * @param {Memory} m @param {string} text @param {string|null} keywords
 */
export function canSave(m, text, keywords) {
  if (!text.trim() || chars(text.trim()) > TEXT_MAX) return false;
  if (keywords != null && chars(keywords.trim()) > KEYWORDS_MAX) return false;
  return updateOf(m, text, keywords) != null;
}

/** 底下那一行暗字说存了会怎样 @param {{text?: string, keywords?: string}|null} change */
export function saveNote(change) {
  if (!change) return null;
  return 'text' in change ? 'detail.note_new' : 'detail.note_same';
}

/**
 * 后台自己在整理的几批（蓝图「记忆页」第 12 条）：`ext.memory.merging` 不是人叫的（`manual` 假）记下 `upto`，同一个 `upto` 的
 * `merged`、`merge_failed` 划掉。交回新的一份（没变的交回原来那份）。
 * @param {Set<number|string>} open @param {any} event 记忆日志的一行（`memory.event` 的 `event`）
 */
export function tidying(open, event) {
  const kind = event?.kind;
  const upto = event?.body?.upto;
  if (upto == null) return open;
  if (kind === 'ext.memory.merging' && event.body.manual !== true) return new Set([...open, upto]);
  if ((kind === 'ext.memory.merged' || kind === 'ext.memory.merge_failed') && open.has(upto)) return new Set([...open].filter((u) => u !== upto));
  return open;
}

/** 出处那一行的短编号：会话编号最后 8 位 @param {string} session */
export const shortId = (session) => String(session).replace(/-/g, '').slice(-8);

/** 本地时间的那一天从几点开始（毫秒） @param {number} ms */
const dayStart = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * 多久以前（同全部会话那一页的写法）：一分钟内「刚才」、「N 分钟前」、今天的「N 小时前」、一周内「N 天前」、今年的「M 月 D 日」、别的年份带年。
 * @param {number} at @param {number} now @param {(key: string, fields?: any) => string} t 这个包的字（`ago.*`）
 */
export function agoText(at, now, t) {
  const secs = Math.max(0, (now - at) / 1000);
  if (secs < 60) return t('ago.now');
  if (secs < 3600) return t('ago.minutes', { n: Math.floor(secs / 60) });
  const days = Math.round((dayStart(now) - dayStart(at)) / 86400000);
  if (days === 0) return t('ago.hours', { n: Math.floor(secs / 3600) });
  if (days < 7) return t('ago.days', { n: days });
  const d = new Date(at);
  if (d.getFullYear() === new Date(now).getFullYear()) return t('ago.date', { m: d.getMonth() + 1, d: d.getDate() });
  return t('ago.full', { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
}

/**
 * 关键词拆成一个个（2026-10-20 项目主人：「逗号隔开」分不清中文、英文逗号）：中文、英文逗号、顿号、分号、换行都算隔开，去掉前后空白、空的、重的。
 * @param {string|null|undefined} text @returns {string[]}
 */
export function splitKeywords(text) {
  const out = [];
  for (const w of String(text ?? '').split(/[,，、;；\n]+/)) {
    const k = w.trim();
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/** 一个个关键词连回核心存的那一行（英文逗号加空格）。 @param {string[]} words */
export const joinKeywords = (words) => words.join(', ');
