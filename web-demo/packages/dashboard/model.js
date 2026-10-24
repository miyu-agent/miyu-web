// @ts-check
//! 仪表盘的纯逻辑（软件包 `dashboard`，蓝图 `web.md`「仪表盘」第 4、5 条）：后台任务的树怎么挂、怎么摊成一行行（收起、兄弟太多收成
//! 「(N)」、做完的顶层收成「✓ (N)」）、哪些在等人；编辑、写入按文件归在一起；待办露哪几项；差异的一行行带新旧行号。不碰 DOM。

import { tasksFromStatus } from '../../src/lib/jobs.js';

/**
 * 一个任务，连它下面挂着的。`owner` 是派它的会话（停它照它），`attention` 是它自己的会话在等人确认（`confirm`）、在问人（`ask`）。
 * @typedef {import('../../src/lib/jobs.js').Task & {key: string, owner: string, attention: 'confirm'|'ask'|null, kids: Node[]}} Node
 */

/** 在跑的（停在半路等人说话的也算） @param {Node} x */
export const live = (x) => x.state === 'running' || x.state === 'paused' || !!x.attention;

/** 一个会话的会话状态里在等人的：确认在前 @param {any} status @returns {'confirm'|'ask'|null} */
export function attentionOf(status) {
  const waiting = Array.isArray(status?.waiting) ? status.waiting : [];
  if (waiting.some((/** @type {any} */ w) => w?.what === 'approve')) return 'confirm';
  if (waiting.some((/** @type {any} */ w) => w?.what === 'ask')) return 'ask';
  return null;
}

/**
 * 一棵树：照会话状态的任务表（`tasksFromStatus`），子代理照它自己的会话状态往下挂（读进来了的，同一个不走两遍）。
 * @param {string} owner @param {any} status @param {(session: string) => any} statusOf @param {Set<string>} [seen]
 * @returns {Node[]}
 */
export function taskTree(owner, status, statusOf, seen = new Set([owner])) {
  return tasksFromStatus(status?.jobs).map((x) => {
    const own = x.what === 'agent' && x.session && !seen.has(x.session) ? statusOf(x.session) : null;
    const kids = own ? taskTree(/** @type {string} */ (x.session), own, statusOf, new Set([...seen, /** @type {string} */ (x.session)])) : [];
    return { ...x, key: `${owner}:${x.job}`, owner, attention: x.state === 'running' || x.state === 'paused' ? attentionOf(own) : null, kids };
  });
}

/** 整棵树摊平 @param {Node[]} tree @returns {Node[]} */
export const flat = (tree) => tree.flatMap((x) => [x, ...flat(x.kids)]);

/** 在跑的有几个、在等人的有几个（连子任务） @param {Node[]} tree */
export function counts(tree) {
  const all = flat(tree);
  return { running: all.filter((x) => x.state === 'running' || x.state === 'paused').length, waiting: all.filter((x) => x.attention).length };
}

/**
 * 右栏开关上的提醒点（第 3 条）：开着的不画；等人的橙色在先，来了新展示没看的 accent 圆点其次，有在跑的转圈最后。
 * @param {{running: number, waiting: number}} n @param {{open: boolean, fresh: boolean}} at
 * @returns {'waiting'|'new'|'running'|null}
 */
export function badgeOf(n, { open, fresh }) {
  if (open) return null;
  if (n.waiting > 0) return 'waiting';
  if (fresh) return 'new';
  return n.running > 0 ? 'running' : null;
}

/** 全部停止停哪几个：停一个子代理连它派的一起停，它下面的不再单停 @param {Node[]} tree @returns {Node[]} */
export const stoppable = (tree) => tree.flatMap((x) => (x.state === 'running' || x.state === 'paused' ? [x] : stoppable(x.kids)));

/**
 * 一行：一个任务（`depth` 第几层，`guides` 上面每一层还没完的要不要穿一道竖线，`last` 是不是这一层最后一个），收起来的兄弟（`more`），
 * 展开了的兄弟最后那一行「收起」（`less`），做完的顶层（`done`，开着的时候它后面接着那几个）。
 * @typedef {{type: 'task', node: Node, depth: number, guides: boolean[], last: boolean, hasKids: boolean, open: boolean}
 *   | {type: 'more', parent: string, depth: number, guides: boolean[], count: number, running: boolean}
 *   | {type: 'less', parent: string, depth: number, guides: boolean[]}
 *   | {type: 'done', count: number, open: boolean}} Row
 */

/** 同一层兄弟多于这么多才收；收的时候露前几个 */
export const SIBLINGS_MAX = 3;
export const SIBLINGS_SHOWN = 2;

/**
 * 摊成一行行（第 4 条）：在跑的顶层照先后，做完的顶层收在最后一行「✓ 已完成（N）」（`doneOpen` 的接着列出来）；子任务挂在下面，人收起了的
 * （`collapsed`）不露；同一层兄弟多于 3 个、没被展开（`expanded`）的只露前 2 个，剩下的收成一行；展开了的最后一行「收起」（2026-10-24 项目主人：
 * 展开了收不回）。
 * @param {Node[]} tree @param {{collapsed?: Set<string>, expanded?: Set<string>, doneOpen?: boolean}} [opts]
 * @returns {Row[]}
 */
export function rowsOf(tree, { collapsed = new Set(), expanded = new Set(), doneOpen = false } = {}) {
  /** @type {Row[]} */
  const out = [];
  /** @param {Node[]} list @param {number} depth @param {boolean[]} guides @param {string} parent */
  const walk = (list, depth, guides, parent) => {
    const many = depth > 0 && list.length > SIBLINGS_MAX;
    const fold = many && !expanded.has(parent);
    const shown = fold ? list.slice(0, SIBLINGS_SHOWN) : list;
    shown.forEach((node, i) => {
      // 后面还有收起来的那一行、「收起」那一行的，不是这一层最后一个
      const last = !many && i === shown.length - 1;
      const hasKids = node.kids.length > 0;
      const open = hasKids && !collapsed.has(node.key);
      out.push({ type: 'task', node, depth, guides, last, hasKids, open });
      if (open) walk(node.kids, depth + 1, [...guides, !last], node.key);
    });
    if (fold) {
      const rest = list.slice(SIBLINGS_SHOWN);
      out.push({ type: 'more', parent, depth, guides, count: rest.length, running: rest.some(live) });
    } else if (many) out.push({ type: 'less', parent, depth, guides });
  };
  const top = tree.filter(live);
  const done = tree.filter((x) => !live(x));
  walk(top, 0, [], '');
  if (done.length) {
    out.push({ type: 'done', count: done.length, open: doneOpen });
    if (doneOpen) walk(done, 0, [], '');
  }
  return out;
}

/**
 * 一个文件改了什么：路径、一共加减几行、照先后的几次调用（取差异用）、是不是新建的。
 * @typedef {{path: string, added: number, removed: number, calls: string[], created: boolean}} FileChange
 */

/**
 * 这个会话改过的文件（第 4 条「文件修改」）：视图条目里做成了的、带 `diff` 的工具那几步（编辑、写入），按路径归在一起，先改的在前。
 * 命令行改的没有这一格，不算。撤掉的那一轮（`hidden`）不算。
 * @param {any[]} entries @returns {FileChange[]}
 */
export function fileChanges(entries) {
  /** @type {Map<string, FileChange>} */
  const by = new Map();
  for (const e of entries ?? []) {
    if (e?.kind !== 'tool' || e.hidden || e.state !== 'ok' || !e.diff || typeof e.diff !== 'object') continue;
    const path = pathOf(e.args);
    if (!path) continue;
    const created = Array.isArray(e.files) && e.files.some((/** @type {any} */ f) => f?.action === 'created');
    const had = by.get(path);
    const x = had ?? { path, added: 0, removed: 0, calls: [], created };
    x.added += Number(e.diff.added) || 0;
    x.removed += Number(e.diff.removed) || 0;
    if (typeof e.call === 'string') x.calls.push(e.call);
    by.set(path, x);
  }
  return [...by.values()];
}

/** 参数里改的是哪个文件 @param {any} args @returns {string|null} */
function pathOf(args) {
  let parsed = args;
  if (typeof args === 'string') {
    try {
      parsed = JSON.parse(args);
    } catch (err) {
      return null;
    }
  }
  const path = parsed?.file_path ?? parsed?.path;
  return typeof path === 'string' && path ? path : null;
}

/**
 * 文件名和暗字的目录：工作区里的写相对目录，家目录写 `~`。
 * @param {string} path @param {{workdir?: string|null, home?: string|null}} [where]
 */
export function splitPath(path, { workdir = null, home = null } = {}) {
  const at = path.lastIndexOf('/');
  const name = at < 0 ? path : path.slice(at + 1);
  let dir = at < 0 ? '' : path.slice(0, at);
  if (workdir && (dir === workdir || dir.startsWith(`${workdir}/`))) dir = dir.slice(workdir.length + 1);
  else if (home && (dir === home || dir.startsWith(`${home}/`))) dir = `~${dir.slice(home.length)}`;
  return { name, dir };
}

/**
 * 待办露哪几项（第 4 条）：没做完的照先后最多露 `max` 项（在做的、没做的），剩下的数（`more`，收成「还有 N 项」）；人展开了（`open`）的
 * 全露，`fold` 说要不要「收起」那一行；做完的数，人展开了（`doneOpen`）的列在 `finished`。
 * @param {{content: string, status: string}[]} todos @param {number} max @param {{open?: boolean, doneOpen?: boolean}} [opts]
 */
export function todoView(todos, max, { open = false, doneOpen = false } = {}) {
  const list = Array.isArray(todos) ? todos : [];
  const left = list.filter((x) => x?.status !== 'completed');
  const finished = list.filter((x) => x?.status === 'completed');
  const many = left.length > max;
  return {
    total: list.length, done: finished.length, shown: many && !open ? left.slice(0, max) : left, more: many && !open ? left.length - max : 0,
    fold: many && open, finished: doneOpen ? finished : [],
  };
}

/**
 * 统一格式的差异（核心 `view.detail` 的 `files[].diff`）摊成一行行：段头（`@@ -1,3 +1,4 @@ …`）、加、删、没动的，带新旧行号。
 * @param {string[]} lines
 * @returns {Array<{kind: 'hunk', text: string} | {kind: 'add'|'del'|'same', old: number|null, now: number|null, text: string}>}
 */
export function diffRows(lines) {
  /** @type {any[]} */
  const out = [];
  let old = 0;
  let now = 0;
  for (const line of lines ?? []) {
    const head = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (head) {
      old = Number(head[1]);
      now = Number(head[2]);
      out.push({ kind: 'hunk', text: line });
      continue;
    }
    const mark = line[0];
    const text = line.slice(1);
    if (mark === '+') out.push({ kind: 'add', old: null, now: now++, text });
    else if (mark === '-') out.push({ kind: 'del', old: old++, now: null, text });
    else if (mark === '\\') continue;
    else out.push({ kind: 'same', old: old++, now: now++, text });
  }
  return out;
}

/**
 * 右栏的卡片照什么先后排（蓝图「仪表盘」第 4 条）：设置 `cards` 里写了的照它的先后在前，没写的照各自的 `order`（一样的照 `id`）接在后面；
 * `cards_off` 里的不出。同一个 `id` 挂了几次的，挂载位已经只留后来的那一个。
 * @template {{id: string, order?: number}} T
 * @param {T[]} entries @param {{order?: string[], off?: string[]}} [opts]
 * @returns {T[]}
 */
export function arrange(entries, { order = [], off = [] } = {}) {
  const at = new Map(order.map((id, i) => [id, i]));
  const hidden = new Set(off);
  return entries
    .filter((e) => !hidden.has(e.id))
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const x = at.get(a.e.id);
      const y = at.get(b.e.id);
      if (x != null && y != null) return x - y;
      if (x != null) return -1;
      if (y != null) return 1;
      return (a.e.order ?? 0) - (b.e.order ?? 0) || String(a.e.id).localeCompare(String(b.e.id)) || a.i - b.i;
    })
    .map(({ e }) => e);
}
