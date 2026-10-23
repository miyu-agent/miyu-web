// @ts-check
//! 预览工作区里放什么（蓝图 `web.md`「预览工作区」第 1 条；核心 D-5，设计 35「展示」）：这个会话里她 `show` 过的东西。照视图里工具条目的
//! `shown` 那一格认（`{path, blob, name, media_type, size, title?, language?, width?, height?}`），不监视文件：内容是展示那一刻存下的
//! blob，她以后改了、删了那个文件，展示过的那一份不变。
//!
//! - 同一个 `path`（核心换成真实位置的绝对路径）再展示一次，换掉那一张，排到最前；
//! - 撤掉的那一轮的条目核心藏起来（`hidden`），跟着就没了；
//! - 最后展示的在前。
//!
//! 原来演示用的「她用 `write` 写进工作目录下 `artifacts/` 的文件」那一套去掉了（2026-10-17 项目主人定：有了 `show`，右栏只放展示过的）。


import { res } from '../util/res.js';
/**
 * @typedef {{path: string, blob: string, name: string, title: string|null, kind: string, type: string, size: number|null,
 *   language: string|null, width: number|null, height: number|null, id: string, seq: number, turn: number|null}} Shown
 *   `kind` 是 `image`、`pdf`、`html`、`markdown`、`code`、`text`、`video`、`audio`（在正文里播，不进右栏）、`file`（别的文件：只能下载，
 *   不进右栏）；`type` 是核心认的媒体类型（核心认成别的文件、后缀是音视频的，照后缀换成的）
 */

/** 条目编号里的序号（`e12` → 12）。 @param {string} id */
const seqOf = (id) => Number.parseInt(String(id).replace(/^[a-z]+/, ''), 10) || 0;

/**
 * 一条工具条目带的展示；不是展示、没展示成（没有 `shown`、没有 `blob`）的是 `null`。
 * @param {any} e 视图里的条目
 * @returns {Shown|null}
 */
export function shownOf(e) {
  const s = e?.kind === 'tool' ? e.shown : null;
  if (!s || typeof s.blob !== 'string' || !s.blob || typeof s.path !== 'string') return null;
  const name = typeof s.name === 'string' && s.name ? s.name : s.path.split('/').pop() ?? s.path;
  const type = mediaGuess(typeof s.media_type === 'string' ? s.media_type : 'application/octet-stream', name);
  const language = typeof s.language === 'string' && s.language ? s.language : null;
  return {
    path: s.path,
    blob: s.blob,
    name,
    title: typeof s.title === 'string' && s.title ? s.title : null,
    kind: shownKind(type, language),
    type,
    size: Number.isFinite(s.size) ? s.size : null,
    language,
    width: Number.isFinite(s.width) ? s.width : null,
    height: Number.isFinite(s.height) ? s.height : null,
    id: e.id,
    seq: seqOf(e.id),
    turn: e.turn ?? null,
  };
}

/**
 * 这个会话展示过的：一个路径一项（最后那一次），最后展示的在前。藏起来的（撤掉的那一轮）不算。
 * @param {any[]} entries 视图里的条目，照显示的先后
 * @returns {Shown[]}
 */
export function shownList(entries) {
  /** @type {Map<string, Shown>} */
  const last = new Map();
  for (const e of entries) {
    if (e.hidden) continue;
    const s = shownOf(e);
    if (!s) continue;
    last.delete(s.path);
    last.set(s.path, s);
  }
  return [...last.values()].sort((a, b) => b.seq - a.seq);
}

/** 右栏里看得了的（别的文件只在对话里一张卡片，能下载）。 @param {Shown[]} list */
export const panelList = (list) => list.filter((s) => !INLINE_ONLY.includes(s.kind));

/** 只在正文里的（右栏不放）：别的文件只能下载，音视频在正文里播 */
const INLINE_ONLY = ['file', 'video', 'audio'];

/**
 * 核心认成别的文件的，后缀是视频、音频的照后缀换成媒体类型（核心的 `show` 还不认音视频，2026-10-23）；换成的得在桥的 `blob_types` 里，
 * 不然照原样。别的照核心给的。
 * @param {string} type @param {string} name
 */
export function mediaGuess(type, name) {
  if (type !== 'application/octet-stream') return type;
  const dot = name.lastIndexOf('.');
  const ext = dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
  if (!ext || !(res.cards?.video?.includes(ext) || res.cards?.audio?.includes(ext))) return type;
  const guess = res.media?.types?.[ext];
  return guess && res.media?.blob_types?.includes(guess) ? guess : type;
}

/**
 * 下拉里删掉的不列（2026-10-17 项目主人定）：记着删的时候那一次展示的序号，同一个路径后来又展示了（序号更新）的照旧列。
 * @param {Shown[]} list @param {Record<string, number>|undefined} dismissed 路径 → 删的时候的序号
 */
export const undismissed = (list, dismissed) => (dismissed ? list.filter((s) => !(Number(dismissed[s.path]) >= s.seq)) : list);

/**
 * 照核心认的媒体类型分种类（设计 35 第二节第 3 条）：图片、PDF、HTML、Markdown；`text/plain` 认得出语言的是代码，别的是文字；
 * 别的都是文件。
 * @param {string} type @param {string|null} [language]
 */
export function shownKind(type, language = null) {
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'pdf';
  if (type === 'text/html') return 'html';
  if (type === 'text/markdown') return 'markdown';
  if (type === 'text/plain') return language ? 'code' : 'text';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

/** 代码按哪种语言上色：核心给的语言名是 Markdown 代码块的写法，和回答里的代码块同一套（`markdown/highlight.js` 认）。 @param {string|null} language */
export const codeLanguage = (language) => (language ? language.toLowerCase() : null);
