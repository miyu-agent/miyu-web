// @ts-check
//! 时间线上的字（蓝图 `web.md`「时间线」，照旧版网页 `app.js:6962-7051`、`8334-8771`）：一步那一行、思考收着时的那一小段
//! 和在想时的窗口、命令写在下面的几行、点开的细节。纯函数，界面照它画。收起那一行核心算好了（9-8，条目 `group` 的 `summary`）。
//!
//! 一步那一行给人看的字（显示名、对象、结果那一句）是核心照连接的语言写好的标题那一句（9-8，条目 `tool` 的 `title`）；
//! 图标是 `resources/lucide.json` 里的名字，照 `timeline.json` 的 `icons`。

import { res, t } from '../util/res.js';
import { toolDuration } from './format.js';
import { fromArgs, compare } from './diff.js';

/** 留言发给父会话时 `to` 写的（`tools/send_message.md`） */
const PARENT = 'parent';
/** 留言的 `to` 是会话编号（整个或至少 8 位后缀，核心施工 C-5）：至少 8 个字符、只有十六进制和 `-`；`j10`、`parent` 不算 */
const SESSION_ID = /^[0-9a-f-]{8,}$/i;

/** @param {unknown} to 留言的 `to` */
export function isSessionId(to) {
  return typeof to === 'string' && SESSION_ID.test(to);
}

/** 会话的短编号：编号最后 `session_short` 位（照核心，`kernel/ids.md`「会话的短编号」）。 @param {string} id */
export function shortSession(id) {
  return id.slice(-res.timeline.session_short);
}

/**
 * 留言发给谁、写成给人看的：父会话写「父会话」，别的会话写「会话 短编号」，任务编号照写（有标题的接标题）。
 * @param {string} to
 * @param {string|null|undefined} [title] 派那个子代理的那一步的 `description`
 */
function recipient(to, title) {
  if (to === PARENT) return t('timeline.parent');
  if (isSessionId(to)) return t('timeline.message_session', { id: shortSession(to) });
  return title ? t('timeline.message_to', { job: to, title }) : to;
}

/** 留言送到了：那一句和对象重了，不写（核心送到了不给 `said`，9-8）；存下了、只订了「空了告诉我」、没送到的照写。 */
function delivered(step) {
  return step.status === 'ok' && !step.title?.said;
}

/** 一件工具算哪一类：`command`、`edit`、`agent`、`message`；没登记的是 `null`（`timeline.json` 的 `kinds`，收起那一行照它数）。 */
export const kindOf = (name) => res.timeline.kinds[name] ?? null;

/**
 * 出错了：图标换成 `circle-alert`、整行变红。`error` 和 `denied`（被拒：只读时的写入、要确认却没人能确认的）都算，被拒的写入不能
 * 看着像写成了（照 `tui.md`「时间线」第 12 条）；打断的不算。
 */
export const failed = (step) => step.kind === 'tool' && (step.status === 'error' || step.status === 'denied');

/**
 * @typedef {{since: number, format: 'secs'|'tenths'|'job'}} Timer 走表：从 `since` 起，`secs` 整秒 `12s`、`tenths`
 *   一位小数 `1.2 s`、`job` 读秒 `3m 05s`
 * @typedef {{icon: string, name: string, subject: string|null, mono: boolean, said: string|null, took: string|null,
 *   timer: Timer|null, failed: boolean, diff: {added: number, removed: number}|null}} Row `diff`：编辑、写入这一步加减的行数
 */

/**
 * 一步那一行：图标、名字、对象（别的工具的对象用等宽字，执行命令的是短标题）、结果那一句、用时。
 * @param {import('./timeline.js').Step} step
 * @returns {Row}
 */
export function row(step) {
  const base = { subject: null, mono: false, said: null, took: null, timer: null, failed: false, diff: null };
  if (step.kind === 'thought') {
    if (step.state === 'thinking') {
      return { ...base, icon: 'atom', name: t('timeline.thinking'), timer: step.start != null ? { since: step.start, format: 'secs' } : null };
    }
    // 读回来的历史不知道想了多久：不写用时（蓝图「时间线的数」第 4 条；旧版也不写）
    const took = step.start != null && step.end != null ? `${((step.end - step.start) / 1000).toFixed(1)}s` : null;
    return { ...base, icon: 'atom', name: t('timeline.thought'), took };
  }
  // 标题那一句核心给（9-8）；没给的（不该有）照显示名写
  return titled(step, kindOf(step.name), base);
}

/**
 * 软件包的工具：那个包清单里写的图标（2026-10-16 项目主人：表情包的工具要有自己的图标，不是扳手）。照 `human.get` 的 `packages` 认是哪个包，
 * 包没写图标、旧核心不给 `packages` 的是 `null`。
 * @param {string} name 工具名
 */
export function packageIcon(name) {
  const pkg = res.human?.packages?.[name];
  return (pkg && res.human?.icons?.[pkg]) || null;
}

/**
 * 照核心给的标题那一句（9-8，`view.md`「标题那一句」）：显示名、对象、结果那一句都是核心照连接的语言写好的；派子代理写「编号 · 描述」，
 * 留言的对象核心已经写成任务编号、「父会话」或「会话 短编号」；用时、走表、图标、出错照原来的规矩。
 * @param {any} step @param {string|null} kind @param {any} base
 */
function titled(step, kind, base) {
  const title = step.title ?? { name: res.human?.tools?.[step.name]?.name ?? step.name };
  if (step.state === 'preparing') return { ...base, icon: 'loader-circle', name: title.name ?? '', timer: step.start != null ? { since: step.start, format: 'tenths' } : null };
  const bad = failed(step);
  const icon = bad ? 'circle-alert' : res.timeline.icons[step.name] ?? packageIcon(step.name) ?? res.timeline.icon_default;
  const name = title.name ?? step.name;
  const object = title.object ?? null;
  const said = title.said ?? null;
  // 用了技能（读了它的 SKILL.md，2026-10-12 项目主人）：「使用技能 · 写技能」，技能的图标；出错的照读文件的样子
  if (step.skill && !bad) return { ...base, icon: res.timeline.icon_skill, name: t('timeline.skill'), subject: step.skill.title };
  if (kind === 'command') {
    const took = step.state === 'done' && step.duration != null ? toolDuration(step.duration) : null;
    const timer = step.state === 'running' && step.start != null ? { since: step.start, format: /** @type {const} */ ('job') } : null;
    return { ...base, icon, name, subject: object, took, timer, failed: bad };
  }
  if (kind === 'agent') {
    const subject = step.job ? t('timeline.agent_subject', { job: step.job, title: object ?? '' }) : t('timeline.agent_pending', { title: object ?? '' });
    return { ...base, icon, name, subject, failed: bad };
  }
  if (kind === 'message') return { ...base, icon, name, subject: object, said: delivered(step) ? null : said, failed: bad };
  return { ...base, icon, name, subject: object, mono: true, said, failed: bad, diff: counts(step) };
}

/**
 * 思考收着时接在那一行后面的一小段：最后 `peek_chars` 个字，空白压成一个空格（照旧版 `app.js:6563`）。截掉了前面的
 * 打头写 `…`；截在一个英文词中间的，那半个词不要，不然开头是 `hat to be` 这样的半截。
 */
export function peek(step) {
  // 只看末尾那一截（够写满还富余）：想得长的，不必每来一段字就把全文扫一遍（蓝图「性能」）
  const room0 = res.timeline.peek_chars;
  const raw = step.kind === 'thought' ? step.text : '';
  const text = (raw.length > room0 * 4 ? raw.slice(-room0 * 4) : raw).replace(/\s+/g, ' ').trim();
  const room = res.timeline.peek_chars;
  if (text.length <= room) return text;
  const from = text.length - room + 1;
  let tail = text.slice(from);
  if (/\w/.test(text[from - 1]) && /^\w/.test(tail)) tail = tail.replace(/^\w+\s*/, '');
  return `…${tail}`;
}

/**
 * 没改成的编辑（有了结果、不是成了：出错、被拒、打断）：不算 edit、不算加减的行数，算成用过一件工具（照 `tui.md`「时间线」第 17 条）。
 * 还在跑的照参数算。
 */
function unchanged(step) {
  return step.kind === 'tool' && kindOf(step.name) === 'edit' && step.status != null && step.status !== 'ok';
}

/**
 * 编辑、写入这一步加减的行数（照 `tui.md`「差异」第 5 条，和收起那一行同一份，照参数算）：加减都是 0 的、没改成的（出错、被拒、
 * 打断）是 `null`，免得看着像改了；在跑的照参数写。
 */
function counts(step) {
  if (kindOf(step.name) !== 'edit' || unchanged(step)) return null;
  // 核心给的（9-8）：有了结果是真数，之前照参数估
  if (step.lines) return step.lines.added + step.lines.removed > 0 ? { added: step.lines.added, removed: step.lines.removed } : null;
  const d = fromArgs(step.parsed);
  return d && d.added + d.removed > 0 ? { added: d.added, removed: d.removed } : null;
}

/**
 * 留言收着时接在那一行后面的预览：留言开头 `peek_chars` 个字，空白压成一个空格，截了的末尾写 `…`（思考露尾巴，留言露开头）。
 * 不是留言的是空的。
 */
export function messagePeek(step) {
  if (step.kind !== 'tool' || kindOf(step.name) !== 'message') return '';
  const text = (arg(step, 'message') ?? '').replace(/\s+/g, ' ').trim();
  const room = res.timeline.peek_chars;
  return text.length <= room ? text : `${text.slice(0, room - 1)}…`;
}

/**
 * 在想、收着的时候那一行下面滚着显示的：最后 `rows` 行（默认 `thinking_rows`），首尾的空行不算。
 * @param {string} text 思考的字
 * @param {number} [rows]
 */
export function thinkingTail(text, rows = res.timeline.thinking_rows) {
  const body = text.trim();
  // 从末尾往回数几个换行：不把全文切开（想得长的，每来一段字都切一遍很费）
  let at = body.length;
  for (let n = 0; n < rows && at > 0; n++) at = body.lastIndexOf('\n', at - 1);
  return at > 0 ? body.slice(at + 1) : body;
}

/**
 * 执行命令写在那一行下面的命令本身：最多 `command_rows` 行；放不下时让出最后一行写 `⋮`（照旧版 `app.js:8408-8525`）。
 * 不是命令、命令还没有字的是 `null`。
 * @returns {{lines: string[], more: boolean}|null}
 */
export function commandLines(step) {
  if (step.kind !== 'tool' || kindOf(step.name) !== 'command') return null;
  const command = arg(step, 'command') ?? '';
  if (!command) return null;
  const lines = command.split('\n');
  const rows = res.timeline.command_rows;
  return lines.length > rows ? { lines: lines.slice(0, rows - 1), more: true } : { lines, more: false };
}

/** 点不开的一步（忘掉、删知识库文档：标题那一句就够，2026-10-17 项目主人在终端定的；什么都没找到的翻记忆、查知识库也是）。 */
export const quiet = (step) => step.kind === 'tool' && (kindOf(step.name) === 'quiet' || emptyFound(step));

/** 翻记忆、查知识库、读文档什么都没找到（核心给的 `detail` 是空的）：标题那一句写了「没找到」，点开只是一块空的，点不开（照终端 0d3e045）。 */
function emptyFound(step) {
  const kind = kindOf(step.name);
  return !!step.detail && step.status === 'ok' && (kind === 'memory_search' || kind === 'kb_search' || kind === 'kb_read') && !found(kind, step.detail).length;
}

/**
 * 点开的内容不说是哪一步、结果是什么的（记住、记进知识库只有写进去的字，翻记忆、查知识库、读文档只有找到的、读到的）：只有它一步的一段点开时照常画那一步的标题行，
 * 下面接着内容（2026-10-17 项目主人：原来省掉标题行，看不出是「记住」、也看不到「记成 m9」）。
 */
export const keepsHead = (step) => step.kind === 'tool' && ['remember', 'kb_save', 'memory_search', 'kb_search', 'kb_read'].includes(kindOf(step.name) ?? '');

/**
 * 点开一步看到的细节，一段一段（照旧版 `app.js:8673-8696`）：「参数」一行一个 `键: 值`，再是「结果」；编辑、写入是
 * 差异卡片，做成了不写结果。没有的段不写。执行命令点开时命令那几行留着（`tui.md`「时间线」第 14 条：命令、空行、
 * 输出），参数里不再写 `command`（那几行写着）、`description`（标题上写着），命令被截了的才把全文写进参数。
 * @returns {({kind: 'text', label: string, text: string}|{kind: 'diff', op: string, created: boolean, path: string, diff: import('./diff.js').Diff})[]}
 */
export function details(step) {
  if (step.kind !== 'tool') return [];
  const output = step.output.trimEnd();
  const result = [
    ...(output ? [{ kind: /** @type {const} */ ('text'), label: t('timeline.result'), text: output }] : []),
    // 结果里的图：接在「结果」下面；没有字的只有图，也写「结果」（蓝图「图片」第 2 条）
    ...(step.images?.length ? [{ kind: /** @type {const} */ ('images'), label: output ? '' : t('timeline.result'), images: step.images }] : []),
  ];
  // 记忆、知识库（2026-10-17 项目主人在终端定的）：画给人看的，不画给模型的原文；忘掉、删文档点不开（`quiet`）
  const kind = kindOf(step.name);
  if (kind === 'quiet') return [];
  // 翻记忆、查知识库、读文档：照核心给人看的结构化结果（`detail`，10-17）；老日志、出错的没有，照下面一般的画
  if (step.detail && step.status === 'ok' && (kind === 'memory_search' || kind === 'kb_search' || kind === 'kb_read')) return found(kind, step.detail);
  if (kind === 'remember' || kind === 'kb_save') {
    const text = arg(step, 'text');
    const label = kind === 'remember' ? 'timeline.remembered' : step.parsed?.append === true ? 'timeline.appended' : 'timeline.saved';
    const card = text ? [{ kind: /** @type {const} */ ('text'), label: t(label), text }] : [];
    return step.status === 'ok' ? card : [...card, ...result];
  }
  if (kind === 'kb_edit') {
    const old = arg(step, 'old');
    const now = arg(step, 'new');
    if (old != null && now != null) {
      const one = compare(old, now);
      const card = { kind: /** @type {const} */ ('diff'), op: t('timeline.changed'), created: false, path: arg(step, 'path') ?? '', diff: { ...one, lines: one.lines.map((l) => ({ ...l, number: null })) } };
      return step.status === 'ok' ? [card] : [card, ...result];
    }
  }
  const diff = kind === 'edit' ? fromArgs(step.parsed) : null;
  if (diff) {
    // 新建的照核心给的改了哪些文件（9-8 三补的 `created`）
    const created = (step.files ?? []).some((f) => f.action === 'created');
    const card = { kind: /** @type {const} */ ('diff'), op: t(created ? 'timeline.created' : 'timeline.changed'), created, path: arg(step, 'file_path') ?? '', diff };
    return step.status === 'ok' ? [card] : [card, ...result];
  }
  // 派子代理：完整的提示词；出错了的接着结果
  if (kindOf(step.name) === 'agent') {
    const prompt = arg(step, 'prompt');
    return [...(prompt ? [{ kind: /** @type {const} */ ('text'), label: t('timeline.prompt'), text: prompt }] : []), ...(step.status === 'ok' ? [] : result)];
  }
  // 留言：发给谁（编号加子代理的标题，父会话写「父会话」，别的会话写「会话 短编号」）、完整的消息；存下了、没送到的接着结果
  if (kindOf(step.name) === 'message') {
    const to = arg(step, 'to');
    const who = to ? recipient(to, step.toTitle) : null;
    const message = arg(step, 'message');
    return [
      ...(who ? [{ kind: /** @type {const} */ ('text'), label: t('timeline.to'), text: who }] : []),
      ...(message ? [{ kind: /** @type {const} */ ('text'), label: t('timeline.message'), text: message }] : []),
      ...(delivered(step) ? [] : result),
    ];
  }
  const lines = commandLines(step);
  const shown = lines && !lines.more ? ['command', 'description'] : lines ? ['description'] : [];
  const args = pretty(step, shown);
  return [...(args ? [{ kind: /** @type {const} */ ('text'), label: t('timeline.args'), text: args }] : []), ...result];
}

/**
 * 翻记忆、查知识库、读文档点开画什么（和终端一样，2026-10-17）：记忆一条一行「日期 · 内容」（作废的划线）；对话片段、知识库的命中一段一块，
 * 头一行是哪来的，下面接原文；读到的那一页照 Markdown。
 * @param {string} kind @param {any} d
 */
function found(kind, d) {
  const str = (/** @type {any} */ v) => (typeof v === 'string' ? v : '');
  if (kind === 'kb_read') return str(d.text) ? [{ kind: /** @type {const} */ ('markdown'), label: t('timeline.content'), text: str(d.text) }] : [];
  if (kind === 'kb_search') {
    const hits = Array.isArray(d.hits) ? d.hits : [];
    const where = (/** @type {any} */ x) => {
      const at = str(x.heading) || (Number.isInteger(x.page) ? t('timeline.page', { page: x.page }) : '');
      return [`${str(x.kb)} / ${str(x.path)}`, at].filter(Boolean).join(' · ');
    };
    return hits.length ? [{ kind: /** @type {const} */ ('blocks'), label: t('timeline.hits'), blocks: hits.map((x) => ({ head: where(x), text: str(x.snippet) })) }] : [];
  }
  const memories = Array.isArray(d.memories) ? d.memories : [];
  const turns = Array.isArray(d.turns) ? d.turns : [];
  return [
    ...(memories.length ? [{ kind: /** @type {const} */ ('rows'), label: t('timeline.memories'), rows: memories.map((m) => ({ head: str(m.date), text: str(m.text), struck: m.forgotten === true })) }] : []),
    ...(turns.length ? [{ kind: /** @type {const} */ ('blocks'), label: t('timeline.turns'),
      blocks: turns.map((x) => ({ head: [str(x.date), str(x.session) ? t('timeline.message_session', { id: shortSession(str(x.session)) }) : ''].filter(Boolean).join(' · '), text: str(x.text) })) }] : []),
  ];
}

/** 参数里的一个字符串，没有的是 `null`。 */
function arg(step, key) {
  const v = step.kind === 'tool' ? step.parsed?.[key] : null;
  return typeof v === 'string' ? v : null;
}

/** 参数写成一行一个 `键: 值`，嵌套的压成一行 JSON（照旧版 `app.js:8263-8294`）；`skip` 里的键不写；读不懂的照原文。 */
function pretty(step, skip = []) {
  const v = step.parsed;
  if (v == null) return step.args.trim();
  if (typeof v !== 'object' || Array.isArray(v)) return JSON.stringify(v, null, 2);
  return Object.entries(v).filter(([k]) => !skip.includes(k)).map(([k, raw]) => `${k}: ${raw == null ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)}`).join('\n');
}
