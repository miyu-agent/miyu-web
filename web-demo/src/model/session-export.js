// @ts-check
//! 导出会话（蓝图 `web.md`「导出会话」，核心 SE-1 中（f8f8a9bae）`session.export`，设计 58，W-1098）：导出框里的几样纯的——用途换成
//! 默认的范围、思考、工具（照核心参考 `sessions.md` 写的 `for` 的默认），拼 `session.export` 的参数，拒绝换成界面要说的，存下来叫什么，
//! 隐去的密钥排成一串。字由界面照 `key` 取（`export.*`）。

/** 四种用途：三种 Markdown（核心的 `for`）和原始包 */
export const PURPOSES = /** @type {const} */ (['read', 'agent', 'chat', 'bundle']);

/** 「最近几轮」默认几轮 */
export const DEFAULT_TURNS = 20;
/** 「最近几轮」最多写几轮（核心不限，框里的数字太大没意义） */
export const MOST_TURNS = 9999;

/**
 * @typedef {'read'|'agent'|'chat'|'bundle'} Purpose
 * @typedef {{range: 'all'|'context'|'turns', turns: number, thinking: boolean, tools: 'line'|'seen'|'full'}} Options
 */

/**
 * 一种用途的默认（核心参考：`range` 的 `read`、`chat` 是全部、`agent` 是现在的上下文；`thinking` 只有 `read` 带；`tools` 的 `chat` 是一行、
 * 别的是她看到的）。原始包没有这几样，照 `read` 给（框里不画）。换用途时整个换成新的这一份：人改过的只留到换用途为止。
 * @param {Purpose} purpose
 * @returns {Options}
 */
export function defaultsFor(purpose) {
  return {
    range: purpose === 'agent' ? 'context' : 'all',
    turns: DEFAULT_TURNS,
    thinking: purpose === 'read' || purpose === 'bundle',
    tools: purpose === 'chat' ? 'line' : 'seen',
  };
}

/**
 * 页面语言换成核心认的 `locale`：`zh`、`ja` 打头的照它，别的是英文（核心别的都当英文）。
 * @param {string|null|undefined} code
 */
export function localeOf(code) {
  const lower = String(code ?? '').toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ja')) return 'ja';
  return 'en';
}

/**
 * 「最近几轮」框里写的：1 到 [`MOST_TURNS`] 的整数照它，别的是 `null`（框里退回原来的）。
 * @param {string} text
 */
export function turnsOf(text) {
  const trimmed = String(text).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= MOST_TURNS ? n : null;
}

/**
 * Markdown 放进回应的 `session.export` 参数（三种 Markdown 用途；原始包走网页软件的 `/export`，不经这里）。
 * @param {string} session @param {Exclude<Purpose, 'bundle'>} purpose @param {Options} options @param {string} locale
 */
export function markdownParams(session, purpose, options, locale) {
  return {
    session,
    format: 'markdown',
    to: 'inline',
    for: purpose,
    range: options.range === 'turns' ? { turns: options.turns } : options.range,
    thinking: options.thinking,
    tools: options.tools,
    locale,
  };
}

/**
 * 导出没成怎么说：`export_too_big`（放进回应的超过 512 KiB）另写一句（`key` 是 `too_big`）；别的照核心给的原话（`key` 是 `failed`，
 * `reason` 是那一句，没有原话的写原因码）。
 * @param {any} err 核心的拒绝（`Refusal`）、网页软件 `/export` 回的，或别的错
 * @returns {{key: 'too_big'|'failed', reason?: string}}
 */
export function exportProblem(err) {
  if (err?.reason === 'export_too_big') return { key: 'too_big' };
  const message = typeof err?.message === 'string' && err.message ? err.message : (typeof err?.reason === 'string' && err.reason) || String(err);
  return { key: 'failed', reason: message };
}

/** 文件名里不能有的字（几个系统的并集）和控制字符 */
const BAD = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
/** 存下来的名字最多几个字（不算扩展名） */
const NAME_MAX = 80;

/**
 * 存下来叫什么（不带扩展名）：会话的标题，去掉文件名里不能有的字、前后的空白和点，最多 80 个字；没有标题、剩下空的照会话编号。
 * @param {string|null|undefined} title @param {string} session
 */
export function fileBase(title, session) {
  const cleaned = [...String(title ?? '').replace(BAD, ' ').replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX).join('').replace(/^[.\s]+|[.\s]+$/g, '');
  return cleaned || session;
}

/**
 * 隐去的密钥（回应的 `redacted`，`{名字: 几处}`）排成一串：多的在前，一样多的照名字；交回一共几处和每一项。
 * @param {any} redacted
 * @returns {{total: number, items: {name: string, count: number}[]}}
 */
export function redactedList(redacted) {
  const items = Object.entries(redacted && typeof redacted === 'object' ? redacted : {})
    .filter(([, count]) => typeof count === 'number' && count > 0)
    .map(([name, count]) => ({ name, count: /** @type {number} */ (count) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { total: items.reduce((sum, it) => sum + it.count, 0), items };
}
