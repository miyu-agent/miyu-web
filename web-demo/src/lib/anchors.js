// @ts-check
//! 吉祥物的落脚点（蓝图 `web.md`「吉祥物」第 11 条、「皮肤」第 4 条）：表 `resources/mascot-anchors.json` 认不认、主题包加的点和挪的点
//! 守不守规矩、照一块东西的位置量出台面、站点、扒边、互动点、够不够得着。吉祥物的包（`packages/mascot`）照它量，皮肤的包
//! （`packages/skin/model.js`）照它查主题包，所以放在 `src/lib`。不碰页面，位置都是屏幕像素（y 往下是正），测试直接调。

/** 四种落脚点各认哪几道边 */
export const EDGES = /** @type {const} */ ({ ground: ['top', 'bottom'], perch: ['top'], ledge: ['left', 'right'], hotspot: ['top', 'left', 'right'] });
/** 互动点的动作：戳、拍、凑过去看 */
export const ACTIONS = /** @type {const} */ (['poke', 'pat', 'look']);
/** 主题挪一个点最多挪多远（像素） */
export const MAX_OFFSET = 40;
/** 站点那一小段多宽的一半（落得上去、站得住，又不在上面走） */
export const PERCH_HALF = 6;

/**
 * @typedef {'ground'|'perch'|'ledge'|'hotspot'} Kind
 * @typedef {{id: string, kind: Kind, edge: string, part?: string, at?: () => any, zh?: string, actions?: string[], all?: boolean,
 *   within?: string, layer?: string, needs?: string, inset?: number, span?: number, dx?: number, dy?: number, carry?: boolean,
 *   solid?: boolean, stick?: boolean, home?: boolean, when?: 'appear', group?: string}} Anchor 一个落脚点（各格见蓝图）
 * @typedef {Record<string, {zh?: string, select: string[]}>} Parts 部件名表
 * @typedef {{left: number, top: number, right: number, bottom: number}} Rect
 * @typedef {{x1: number, x2: number, y: number, id: string, carry?: boolean, bottom?: number, stick?: boolean, perch?: boolean}} Platform
 * @typedef {{id: string, x: number, y1: number, y2: number, side: 'left'|'right'}} Ledge 一道竖的边：在哪、从多高到多高、往哪边探
 * @typedef {{id: string, x: number, y: number, rect: Rect, side: 'top'|'left'|'right', actions: string[], when?: 'appear'}} Hotspot
 *   一个互动点：站哪（`x`；`y` 是碰的那一点）、那一块在哪、从哪边碰、能做什么
 * @typedef {{dx?: number, dy?: number}} Offset
 */

const ID = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/;
const FLAGS = ['all', 'carry', 'solid', 'stick', 'home'];
const NUMBERS = ['inset', 'span', 'dx', 'dy'];
const KEYS = new Set(['id', 'kind', 'edge', 'part', 'at', 'zh', 'actions', 'within', 'layer', 'needs', 'when', 'group', ...FLAGS, ...NUMBERS]);

/**
 * 一个落脚点认不认：认的交 `null`，不认的交为什么。`free` 的（挂载位里别的包挂的）可以不写 `part`、写 `at()` 自己量，可以写 `group`。
 * @param {any} a @param {Parts} parts @param {{free?: boolean}} [opt]
 */
export function anchorProblem(a, parts, opt = {}) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return '不是一个落脚点';
  if (typeof a.id !== 'string' || !ID.test(a.id)) return `编号不对：${a.id}`;
  const at = `落脚点 ${a.id}`;
  for (const k of Object.keys(a)) if (!KEYS.has(k)) return `${at}：不认 ${k}`;
  const edges = /** @type {Record<string, readonly string[]>} */ (EDGES)[a.kind];
  if (!edges) return `${at}：种类 ${a.kind} 不认（只有 ${Object.keys(EDGES).join('、')}）`;
  if (!edges.includes(a.edge)) return `${at}：${a.kind} 的边只有 ${edges.join('、')}，不是 ${a.edge}`;
  if (a.at != null) {
    if (!opt.free) return `${at}：表里的照部件名找，不写 at`;
    if (typeof a.at !== 'function') return `${at}：at 要是量位置的函数`;
  } else if (typeof a.part !== 'string' || !parts[a.part]) return `${at}：部件名表里没有 ${a.part}`;
  for (const k of ['within', 'layer']) if (a[k] != null && (typeof a[k] !== 'string' || !parts[a[k]])) return `${at}：${k} 的部件名表里没有 ${a[k]}`;
  if (a.group != null && (!opt.free || typeof a.group !== 'string' || !ID.test(a.group))) return `${at}：group 只有挂进来的能写，要是一个编号`;
  if (a.zh != null && typeof a.zh !== 'string') return `${at}：zh 要是一句话`;
  if (a.needs != null && typeof a.needs !== 'string') return `${at}：needs 要是另一个落脚点的编号`;
  for (const k of FLAGS) if (a[k] != null && typeof a[k] !== 'boolean') return `${at}：${k} 要是真假`;
  for (const k of NUMBERS) if (a[k] != null && (typeof a[k] !== 'number' || !Number.isFinite(a[k]) || Math.abs(a[k]) > 400)) return `${at}：${k} 要是 ±400 以内的数`;
  if (a.span != null && a.span <= 0) return `${at}：span 要大于 0`;
  if ((a.carry || a.solid || a.stick || a.home) && a.kind !== 'ground') return `${at}：carry、solid、stick、home 只有台面能写`;
  if (a.kind === 'hotspot') {
    if (!Array.isArray(a.actions) || !a.actions.length) return `${at}：互动点要写 actions`;
    for (const x of a.actions) if (!ACTIONS.includes(x)) return `${at}：动作 ${x} 不认（只有 ${ACTIONS.join('、')}）`;
  } else if (a.actions != null) return `${at}：只有互动点写 actions`;
  if (a.when != null && (a.kind !== 'hotspot' || a.when !== 'appear')) return `${at}：when 只有互动点写，只认 appear`;
  return null;
}

/**
 * 整张表有哪些不对：每一项照 `anchorProblem`，编号不重，`needs` 指的在表里，平常站的（`home`）只有一项。
 * @param {any} table `{anchors: [...]}` @param {Parts} parts
 * @returns {string[]}
 */
export function tableProblems(table, parts) {
  const list = table?.anchors;
  if (!Array.isArray(list)) return ['表里要有 anchors 一串'];
  /** @type {string[]} */
  const bad = [];
  const ids = new Set();
  for (const a of list) {
    const why = anchorProblem(a, parts);
    if (why) bad.push(why);
    else if (!a.zh) bad.push(`落脚点 ${a.id}：要写一句 zh`);
    if (ids.has(a?.id)) bad.push(`落脚点 ${a.id} 重了`);
    ids.add(a?.id);
  }
  for (const a of list) if (a?.needs && !ids.has(a.needs)) bad.push(`落脚点 ${a.id}：needs 的 ${a.needs} 不在表里`);
  if (list.filter((a) => a?.home).length !== 1) bad.push('平常站的（home）要有一项、只有一项');
  return bad;
}

/**
 * 主题包里落脚点的两格守不守规矩（「皮肤」第 4 条）：`anchors` 加的点编号以 `<它的编号>.` 开头、不和表里的重；`anchorOffsets` 的键是
 * 表里的、自己加的点的编号，或者一种落脚点，值 `{dx, dy}` 各在 ±40 以内。都没写的交 `null`。
 * @param {any} pack @param {Parts} parts @param {Set<string>} ids 表里的编号
 */
export function themeProblem(pack, parts, ids) {
  const own = new Set();
  if (pack.anchors != null) {
    if (!Array.isArray(pack.anchors)) return 'anchors 要是一串落脚点';
    for (const a of pack.anchors) {
      const why = anchorProblem(a, parts);
      if (why) return why;
      if (!a.id.startsWith(`${pack.id}.`)) return `落脚点 ${a.id}：编号要以 ${pack.id}. 开头`;
      if (ids.has(a.id) || own.has(a.id)) return `落脚点 ${a.id} 重了`;
      if (a.home) return `落脚点 ${a.id}：平常站哪由表定，主题不写 home`;
      own.add(a.id);
    }
  }
  const off = pack.anchorOffsets;
  if (off != null) {
    if (typeof off !== 'object' || Array.isArray(off)) return 'anchorOffsets 要是编号到 {dx, dy}';
    for (const [k, v] of Object.entries(off)) {
      if (!(k in EDGES) && !ids.has(k) && !own.has(k)) return `anchorOffsets：没有落脚点 ${k}`;
      if (!v || typeof v !== 'object' || Array.isArray(v)) return `anchorOffsets.${k} 要是 {dx, dy}`;
      for (const [n, x] of Object.entries(v)) {
        if (n !== 'dx' && n !== 'dy') return `anchorOffsets.${k}：只认 dx、dy`;
        if (typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > MAX_OFFSET) return `anchorOffsets.${k}.${n} 要是 ±${MAX_OFFSET} 以内的数`;
      }
    }
  }
  return null;
}

/**
 * 这一回算哪几个点：表里的、挂进来的、主题加的，照主题挪过（先照种类、再照编号，叠起来）。挂进来的和表里重了编号的不要。
 * @param {Anchor[]} table @param {Anchor[]} mounted @param {{anchors?: Anchor[], offsets?: Record<string, Offset>}|null} theme
 * @returns {Anchor[]}
 */
export function combine(table, mounted, theme) {
  const ids = new Set(table.map((a) => a.id));
  const all = [...table, ...mounted.filter((a) => !ids.has(a.id)), ...(theme?.anchors ?? [])];
  const off = theme?.offsets ?? {};
  return all.map((a) => {
    const k = off[a.kind] ?? {};
    const own = off[a.id] ?? {};
    const dx = (a.dx ?? 0) + (k.dx ?? 0) + (own.dx ?? 0);
    const dy = (a.dy ?? 0) + (k.dy ?? 0) + (own.dy ?? 0);
    return dx === (a.dx ?? 0) && dy === (a.dy ?? 0) ? a : { ...a, dx, dy };
  });
}

/**
 * 一块东西（`rect`）上量出这个点。台面交 `Platform`（`id` 照 `key`），站点交上边沿正中一小段（`perch`），扒边交 `Ledge`，
 * 互动点交 `Hotspot`（站哪照身子宽 `w` 算）。
 * @param {Anchor} a @param {Rect} r @param {{key: string, inset: number, w: number}} o
 * @returns {{platform?: Platform, ledge?: Ledge, hotspot?: Hotspot}}
 */
export function measure(a, r, o) {
  const dx = a.dx ?? 0;
  const dy = a.dy ?? 0;
  const id = o.key;
  if (a.kind === 'ground') {
    const inset = a.inset ?? o.inset;
    let x1 = r.left + inset + dx;
    let x2 = r.right - inset + dx;
    if (a.span != null) {
      const c = (r.left + r.right) / 2 + dx;
      [x1, x2] = [c - a.span / 2, c + a.span / 2];
    }
    /** @type {Platform} */
    const p = { id, x1, x2, y: (a.edge === 'bottom' ? r.bottom : r.top) + dy };
    if (a.carry) p.carry = true;
    if (a.solid) p.bottom = r.bottom + dy;
    if (a.stick) p.stick = true;
    return { platform: p };
  }
  if (a.kind === 'perch') {
    const c = (r.left + r.right) / 2 + dx;
    return { platform: { id, x1: c - PERCH_HALF, x2: c + PERCH_HALF, y: r.top + dy, perch: true } };
  }
  if (a.kind === 'ledge') {
    const side = a.edge === 'left' ? 'left' : 'right';
    return { ledge: { id, x: (side === 'left' ? r.left : r.right) + dx, y1: r.top + dy, y2: r.bottom + dy, side } };
  }
  const side = /** @type {'top'|'left'|'right'} */ (a.edge);
  const gap = o.w / 2 + 4;
  const x = (side === 'top' ? (r.left + r.right) / 2 : side === 'left' ? r.left - gap : r.right + gap) + dx;
  const y = (r.top + r.bottom) / 2 + dy;
  /** @type {Hotspot} */
  const h = { id, x, y, rect: r, side, actions: a.actions ?? [] };
  if (a.when) h.when = a.when;
  return { hotspot: h };
}

/** 头顶放得下（离窗口上沿至少一个身子高 `h`）：顶上是墙，站上去头会出窗口的不算 @param {{y: number}} p @param {number} h */
export const roomy = (p, h) => p.y >= h;

/**
 * 互动点站哪：那一点下面（或者上面不远，`reach`）最近的台面上，`x` 在它里面。没有的交 `null`。
 * @param {Hotspot} spot @param {Platform[]} platforms @param {number} [reach]
 * @returns {Platform|null}
 */
export function standFor(spot, platforms, reach = 60) {
  const under = platforms.filter((p) => !p.perch && spot.x >= p.x1 && spot.x <= p.x2 && p.y >= spot.rect.top - reach && p.y <= spot.rect.bottom + 12);
  return under.reduce((best, p) => (!best || Math.abs(p.y - spot.rect.bottom) < Math.abs(best.y - spot.rect.bottom) ? p : best), /** @type {Platform|null} */ (null));
}

/**
 * 从脚下这一段台子（`from`，站在 `x`）够不够得着 `to` 那一点：走到这一段上离它最近的地方（两头各让 `edge`），横着不超过 `reach_x`、
 * 往上不超过 `reach_up`。够得着的交在哪起跳，不然交 `null`。
 * @param {{x: number, ground: Platform}} me @param {{x: number, y: number}} to @param {{reach_x: number, reach_up: number}} reach
 * @param {number} edge
 */
export function launchFrom(me, to, reach, edge) {
  const g = me.ground;
  const lo = Math.min(g.x1 + edge, (g.x1 + g.x2) / 2);
  const hi = Math.max(g.x2 - edge, (g.x1 + g.x2) / 2);
  const x = Math.max(lo, Math.min(hi, to.x));
  if (Math.abs(to.x - x) > reach.reach_x || g.y - to.y > reach.reach_up) return null;
  return x;
}

/**
 * 从 `(x, y)` 跳到 `(tx, ty)`：跳得比两头高的那一头再高 `extra`，交回起跳的速度（往上是负的）和多久落到 `ty`（下落着经过它）。
 * @param {number} x @param {number} y @param {number} tx @param {number} ty @param {number} g 重力 @param {number} extra
 */
export function leap(x, y, tx, ty, g, extra) {
  const top = Math.min(y, ty) - extra;
  const up = Math.sqrt(2 * g * (y - top));
  const t = up / g + Math.sqrt((2 * (ty - top)) / g);
  return { vx: (tx - x) / t, vy: -up, t };
}

/**
 * 扒着一道边时身子放哪、裁掉多少：身子的中线在边外面 `peek - 0.5` 个身宽的地方，边里面那一截裁掉（露出 `peek` 那么多）。
 * 交回脚底中点的 x 和从身子左边（`left`）、右边（`right`）各裁掉多少像素。
 * @param {Ledge} l @param {number} w 身子多宽 @param {number} peek 露出几成
 */
export function hangAt(l, w, peek) {
  const out = l.side === 'right' ? 1 : -1;
  const x = l.x + out * (peek - 0.5) * w;
  const hidden = Math.max(0, Math.min(w, (1 - peek) * w));
  return { x, left: out > 0 ? hidden : 0, right: out < 0 ? hidden : 0 };
}
