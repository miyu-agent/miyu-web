// @ts-check
//! 斜杠命令怎么认、怎么筛（蓝图 `web.md`「斜杠命令」「命令列表」，规矩照 `tui.md`「斜杠命令列表」，做法照 TUI 演示的
//! `commands.rs`、`menu.rs`）。纯的；清单在 `resources/commands.json`，加命令只登记。
//!
//! - 像不像命令：`/` 开头，后面像个命令名（英文字母打头，只有英文字母、数字、`-`、`_`；刚打一个 `/` 也算）。
//!   `/你吃了吗`、路径 `/home/…` 不算，照普通的话发。
//! - 列表：没有空白时开；边打边筛，名字（或别名）开头的排前面、含着的排后面；`Esc` 关掉以后字变了才再开。
//! - 回车：`/名字` 是命令；带参数的命令名字后面空一格接着的字是参数；列表里没有的名字（带不带字）是 `unlisted`：开着的会话里
//!   交核心认（`command.catalog` 第 2 条：菜单里没有的头照样交 `command.run`，照拒绝的 `data.why` 说），核心不认的、带着字的
//!   照普通的话发；空会话里带字的是一句话，不带的弹「命令不存在」。

/**
 * @typedef {{name: string, aliases?: string[], summary: string, run: string, args?: boolean, argument?: string}} Spec
 *   一条命令：名字（不带 `/`）、别名、列表里的说明、做什么（`ui/commands.js` 照它找处理）、名字后面能不能接参数、参数的提示（核心的命令带）
 */

/**
 * 核心认的斜杠命令（`command.catalog`，核心 O-6 补）写成网页的命令：做法是交给核心（`command.run`），带参数的照它的提示。
 * @param {{name: string, aliases?: string[], summary?: string, argument?: string}[]} catalog @returns {Spec[]}
 */
export function coreSpecs(catalog) {
  return (catalog ?? []).map((c) => ({ name: c.name, aliases: c.aliases ?? [], summary: c.summary ?? '', run: 'core', args: !!c.argument, ...(c.argument ? { argument: c.argument } : {}) }));
}

/**
 * 网页自己的（出厂的、软件包登记的）在前，核心的接在后面；核心的名字、别名和网页的撞了的不要（网页的那条做得更多：空会话里怎么说、
 * 回执怎么画），核心新加的命令网页不用改就有。
 * @param {Spec[]} local @param {Spec[]} core @returns {Spec[]}
 */
export function mergeSpecs(local, core) {
  const taken = new Set(local.flatMap((s) => [s.name, ...(s.aliases ?? [])]));
  return [...local, ...core.filter((s) => ![s.name, ...(s.aliases ?? [])].some((n) => taken.has(n)))];
}
/**
 * @typedef {{kind: 'command', spec: Spec, words: string|null}|{kind: 'unlisted', name: string, words: string|null}|{kind: 'unknown'}|{kind: 'later'}|{kind: 'talk'}} Line
 *   回车时框里那一行是什么（`later`：空会话里打了核心的命令；`unlisted`：列表里没有的名字，`words` 是后面的字，没写的是 `null`）
 */

/** 框里的字像不像命令：像的交回命令名（刚打一个 `/` 的是空的），不像的是 `null`。名字要紧挨着 `/`。 */
export function typed(value) {
  if (!value.startsWith('/')) return null;
  const name = value.slice(1).split(/\s/u, 1)[0];
  return /^([A-Za-z][A-Za-z0-9_-]*)?$/.test(name) ? name : null;
}

/** 列表要不要开、照什么筛：像命令名，名字后面还没打空白（打了空白是在写参数，名字已经打全了）。 */
export function menuTyped(value) {
  const name = typed(value);
  if (name == null) return null;
  return value.length === 1 + name.length ? name : null;
}

/** 照打的字筛：名字或别名以它开头的排前面，含着它的排后面，各照清单的先后；不分大小写。 */
export function filter(list, name) {
  const want = name.toLowerCase();
  const starts = [];
  const contains = [];
  for (const spec of list) {
    const names = [spec.name, ...(spec.aliases ?? [])];
    if (names.some((n) => n.startsWith(want))) starts.push(spec);
    else if (names.some((n) => n.includes(want))) contains.push(spec);
  }
  return [...starts, ...contains];
}

/** 名字或别名正好是 `name` 的那一条；没有是 `null`。 */
export function find(list, name) {
  return list.find((s) => s.name === name || (s.aliases ?? []).includes(name)) ?? null;
}

/**
 * 回车时这一行是什么：`later` 是核心认、要造好的会话才能用的命令名和别名（小写；空会话里不列，打了也不当话发，提示开了会话才能用）；
 * 其中 `opens` 里的（`commands.json` 的 `opens_session`：`/goal`）后面带着字的交外面先开会话（`unlisted`）。
 * @param {Spec[]} list
 * @param {string} value 框里的字
 * @param {Set<string>} [later]
 * @param {Set<string>} [opens]
 * @returns {Line}
 */
export function read(list, value, later = new Set(), opens = new Set()) {
  const name = typed(value);
  if (name == null) return { kind: 'talk' };
  const words = value.slice(1 + name.length).trim();
  const spec = find(list, name);
  if (spec && !words) return { kind: 'command', spec, words: null };
  if (spec?.args) return { kind: 'command', spec, words };
  // 核心认、要造好的会话才能用的（空会话里不列）：不当话发出去（2026-10-10：空会话里打 `/remember 内容` 被当成一句话发给了她）
  if (!spec && name && later.has(name.toLowerCase())) return words && opens.has(name.toLowerCase()) ? { kind: 'unlisted', name, words } : { kind: 'later' };
  // 列表里没有的名字：交给外面（开着的会话里问核心，2026-10-12：没开记忆的会话里打 `/remember 内容` 被当成一句话发给了她）
  if (!spec && name) return { kind: 'unlisted', name, words: words || null };
  if (!spec && !words) return { kind: 'unknown' };
  return { kind: 'talk' };
}

/**
 * 核心拒绝的写核心给的那一句（2026-10-10 起网页不再照原因码另写一份）：带了 `data.why` 的（`/goal`、`/remember` 这类用不了的，核心
 * 照连接的语言说为什么，`command.catalog` 第 2 条）写它，不然写拒绝本身的话；别的错写它自己的话。扩展的命令答了错的（`command_failed`，
 * 核心 X-14 下）`why` 是扩展的原话，两行：拒绝的话、原话。
 */
export function refusalText(err) {
  const why = typeof err?.data?.why === 'string' && err.data.why ? err.data.why : null;
  if (why && err?.reason === 'command_failed') return `${err.message}\n${why}`;
  return why ?? err.message;
}

/**
 * 列表里没有的命令交核心被拒了以后，要不要照普通的话发：只有核心认不出（原因码 `unknown_command`）、后面带着字的（`/etc 目录是干什么的`）。
 * 只认原因码：数字码 -32010 别的拒绝也用（`memory_unavailable`），照它判会把无人格会话里的 `/remember 内容` 发给她。
 * @param {string|null|undefined} reason @param {string|null} words
 */
export function talkAfterRefusal(reason, words) {
  return !!words && reason === 'unknown_command';
}

/**
 * 回执不写进提示的：设长期目标（`/goal <目标>`，右上方那一截出来了就是回执，2026-10-12 项目主人）。照核心的认法（`command.run`
 * 第 10 条）：后面没别的字的 `pause`、`resume`、`clear` 和 `edit …` 是子命令，别的带字的整句是设目标。看、改、停、清的照旧写。
 * @param {string} name 正名 @param {string|null} words
 */
export function quietReceipt(name, words) {
  const w = (words ?? '').trim();
  if (name !== 'goal' || !w) return false;
  return !['pause', 'resume', 'clear', 'edit'].includes(w) && !/^edit\s/.test(w);
}

/** 命令列表的状态：开没开、选中哪一条（照 TUI 演示的 `menu.rs`）。 */
export class Menu {
  constructor() {
    /** 选中的是筛出来的第几条。 */
    this.selected = 0;
    /** 上一次照什么名字筛的：变了，选中回到第一条。 */
    this.typed = /** @type {string|null} */ (null);
    /** 按 `Esc` 时框里的字；字没变就一直关着。 */
    this.dismissed = /** @type {string|null} */ (null);
  }

  /**
   * 照框里的字定开不开：开着的交回筛出来的几条，关着的（不像命令、`Esc` 关了、一条都没有）交回空的。
   * @param {string} value
   * @param {Spec[]} list
   */
  sync(value, list) {
    const name = menuTyped(value);
    if (name == null) {
      // 不是命令了（`/` 删掉了、打了空白）：Esc 关掉的那一次也算过去了
      this.typed = null;
      this.dismissed = null;
      return [];
    }
    if (this.typed !== name) {
      this.typed = name;
      this.selected = 0;
    }
    if (this.dismissed !== value) this.dismissed = null;
    const matches = filter(list, name);
    this.selected = Math.min(this.selected, Math.max(0, matches.length - 1));
    return this.dismissed == null ? matches : [];
  }

  /** 往下、往上挪一条，到头就停。 */
  step(down, count) {
    this.selected = down ? Math.min(this.selected + 1, Math.max(0, count - 1)) : Math.max(0, this.selected - 1);
  }

  /** 关掉，直到框里的字变了。 */
  dismiss(value) { this.dismissed = value; }
}

/**
 * 你的一句话（条目 `user`）带的附件，换成附件包放回框里的样子（`{blob, name, media_type, size}`，核心存好的那一份）：大小照这台设备的
 * 输入历史（发的时候记下的），查不到的是 `null`；没名字的照种类和媒体类型起一个（`image.png`）。
 * @param {{attachments?: {kind: string, blob: string, media_type: string, name?: string|null}[]}} said
 * @param {{parts?: Record<string, any>}[]} history 输入历史的条目
 */
export function keptAttachments(said, history) {
  const sizes = new Map();
  for (const item of history ?? []) for (const k of item.parts?.attachments ?? []) if (k?.blob) sizes.set(k.blob, k.size);
  return (said.attachments ?? []).map((a) => ({
    blob: a.blob,
    name: a.name ?? `${a.kind}.${(a.media_type.split('/')[1] ?? 'bin').split('+')[0]}`,
    media_type: a.media_type,
    size: sizes.get(a.blob) ?? null,
  }));
}
