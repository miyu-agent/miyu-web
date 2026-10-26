// @ts-check
//! 整理会话里的一批（蓝图 `web.md`「记忆页」第 13a 条第 3 条；核心 D-2 上、设计 41）：记忆模块交来的那一句、她回的那一段 JSON 换成画得出来的样子。
//! 不碰页面，测试直接调。
//!
//! 请求是记忆模块拼的一大段（英文的指令在前），后面几段一行一条记忆：`m38 user 2026-10-22: 喜欢猫`。段头是一行以 `:` 结尾的字，照里面的词认是
//! 哪一段：新记的（`since`）、相关的旧记忆（`related`）、轮到重看的（别的）。认不出来的只交编号到正文的对照，不数。
//! 回答是 `{"revised": [{id, text}], "retired": [{id, kind, by, why}], "summary": "..."}`（整理记忆那一次请求的约定：核心 Q-2 起它是旁路请求 `memory/organize`、照 `normal` 池走，配置项 `memory.organizer` 删了），外面可能包着代码块。

/** 一行记忆：编号、种类、日子、正文 */
const LINE = /^(m\d+)\s+\S+\s+\d{4}-\d{2}-\d{2}:\s?(.*)$/;
/** 段头：一行以冒号结尾、不是一行记忆的 */
const HEAD = /^[A-Za-z][^:]*:\s*$/;

/**
 * @typedef {{fresh: number, related: number, review: number}} Counts 这一批几条新记的、几条相关的旧记忆、几条重看
 * @typedef {{counts: Counts|null, texts: Map<string, string>}} Request
 */

/**
 * 读请求：几段各几条（一行记忆都没认出来的是 `null`），编号 → 正文。
 * @param {string} text
 * @returns {Request}
 */
export function requestOf(text) {
  /** @type {Map<string, string>} */
  const texts = new Map();
  const counts = { fresh: 0, related: 0, review: 0 };
  /** @type {keyof Counts|null} */
  let part = null;
  let any = false;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    const m = LINE.exec(line);
    if (m) {
      texts.set(m[1], m[2]);
      if (part) { counts[part] += 1; any = true; }
      continue;
    }
    if (HEAD.test(line)) part = /since/i.test(line) ? 'fresh' : /related/i.test(line) ? 'related' : 'review';
  }
  return { counts: any ? counts : null, texts };
}

/**
 * @typedef {{revised: {id: string, text: string}[], retired: {id: string, kind: string|null, by: string|null, why: string}[], summary: string|null}} Answer
 */

/**
 * 读回答：读不成的（还在写、写坏了）是 `null`。
 * @param {string} text
 * @returns {Answer|null}
 */
export function answerOf(text) {
  const body = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let got;
  try {
    got = JSON.parse(body);
  } catch {
    return null;
  }
  if (!got || typeof got !== 'object' || Array.isArray(got)) return null;
  const list = (/** @type {any} */ v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && typeof x.id === 'string') : []);
  return {
    revised: list(got.revised).map((x) => ({ id: x.id, text: String(x.text ?? '') })),
    retired: list(got.retired).map((x) => ({ id: x.id, kind: typeof x.kind === 'string' ? x.kind : null, by: typeof x.by === 'string' ? x.by : null, why: String(x.why ?? '') })),
    summary: typeof got.summary === 'string' && got.summary.trim() ? got.summary : null,
  };
}

/**
 * 一条条决定（同卡片里那几行的写法）：改写、删、摘要。原来的正文照请求里的对照，查不到写编号。
 * @param {Answer} answer @param {Map<string, string>} texts
 * @returns {({kind: 'revised', from: string, to: string} | {kind: 'retired', what: string, why: string, retire: string|null} | {kind: 'summary', text: string})[]}
 */
export function decisionsOf(answer, texts) {
  const name = (/** @type {string} */ id) => texts.get(id) ?? id;
  return [
    ...answer.revised.map((r) => ({ kind: /** @type {const} */ ('revised'), from: name(r.id), to: r.text })),
    ...answer.retired.map((r) => ({ kind: /** @type {const} */ ('retired'), what: name(r.id), why: r.why, retire: r.kind })),
    ...(answer.summary ? [{ kind: /** @type {const} */ ('summary'), text: answer.summary }] : []),
  ];
}
