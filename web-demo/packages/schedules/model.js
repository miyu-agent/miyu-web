// @ts-check
//! 定时任务写成什么、新建的那张表交给核心什么（软件包 `schedules`，蓝图 `web.md`「定时任务」；协议照核心 J-1 下 `schedules.md`）。纯的。

/**
 * 核心的一项（`schedule.list` 的）：有的才写。
 * @typedef {{id: string, when: {cron?: string, recurring?: boolean, at?: string, every?: number}, prompt: string,
 *   target?: {session?: string, new?: {persona?: string|null, preset?: string, cwd?: string}}, by?: {kind: string, session?: string},
 *   recurring?: boolean, paused?: boolean, loop?: 'fixed'|'dynamic', next?: string, last?: {at: string, result: string, session?: string}, created?: string}} Schedule
 */

/** @typedef {(path: string, fields?: Record<string, any>) => string} Text */

/** 照核心的先后排：有下一次的照时刻在前，停着的、没定下一次的在后；同一档照编号（`t2` 在 `t10` 前面）。 @param {Schedule[]} list */
export function sorted(list) {
  const num = (/** @type {Schedule} */ s) => Number(String(s.id).replace(/^\D+/, '')) || 0;
  const at = (/** @type {Schedule} */ s) => (!s.paused && s.next ? Date.parse(s.next) : NaN);
  return [...list].sort((a, b) => {
    const x = at(a);
    const y = at(b);
    if (Number.isFinite(x) !== Number.isFinite(y)) return Number.isFinite(x) ? -1 : 1;
    if (Number.isFinite(x) && x !== y) return x - y;
    return num(a) - num(b);
  });
}

/** 两位数 @param {number} n */
const two = (n) => String(n).padStart(2, '0');
/** `08:00` @param {Date} d */
const clock = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;

/** cron 一段是不是一个整数（`0`–`max`） @param {string} s @param {number} max */
const int = (s, max) => (/^\d{1,2}$/.test(s) && Number(s) <= max ? Number(s) : null);

/**
 * cron 写成人话：认得的几种——每天、工作日、每周几、每月几日（分、时都是一个数）；认不得的交回 `null`（照原样写）。
 * @param {string} cron @param {Text} t
 */
export function cronText(cron, t) {
  const f = String(cron).trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [mi, hr, dom, mon, dow] = f;
  const m = int(mi, 59);
  const hh = int(hr, 23);
  if (m === null || hh === null || mon !== '*') return null;
  const time = `${two(hh)}:${two(m)}`;
  if (dom === '*' && dow === '*') return t('when.daily', { time });
  if (dom === '*' && dow === '1-5') return t('when.weekdays', { time });
  const day = int(dow, 7);
  if (dom === '*' && day !== null) return t('when.weekly', { day: t(`weekday.${day % 7}`), time });
  const date = int(dom, 31);
  if (date !== null && date >= 1 && dow === '*') return t('when.monthly', { date, time });
  return null;
}

/** 隔多久：整天、整小时、整分钟，不然秒 @param {number} secs @param {Text} t */
export function everyText(secs, t) {
  const n = Math.max(0, Math.round(secs));
  if (n && n % 86400 === 0) return t('every.days', { n: n / 86400 });
  if (n && n % 3600 === 0) return t('every.hours', { n: n / 3600 });
  if (n && n % 60 === 0) return t('every.minutes', { n: n / 60 });
  return t('every.seconds', { n });
}

/**
 * 某个时刻照「今天 08:00」「明天 08:00」「10月30日 08:00」写（浏览器本地时区；`now` 是这一刻）。
 * @param {string} iso @param {Date} now @param {Text} t
 */
export function dayText(iso, now, t) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const start = (/** @type {Date} */ x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(d) - start(now)) / 86400000);
  const time = clock(d);
  if (days === 0) return t('day.today', { time });
  if (days === 1) return t('day.tomorrow', { time });
  const year = d.getFullYear() !== now.getFullYear() ? d.getFullYear() : null;
  return t(year ? 'day.dated_year' : 'day.dated', { y: year, d: d.getDate(), mon: t(`month.${d.getMonth() + 1}`), time });
}

/**
 * 什么时候：循环的「循环 · 每 10 分钟」「循环 · 由 AI 定」，cron 认得的写人话、认不得的「cron <原样>」，`every`、`at` 照写。
 * cron 记下的时区（`when.zone`，核心 J-3 上）和这里（`here`，浏览器的）不一样的后面接「（Asia/Tokyo）」。
 * @param {Schedule} s @param {Date} now @param {Text} t @param {string|null} [here]
 */
export function whenText(s, now, t, here = localZone()) {
  const w = s.when ?? {};
  let text;
  if (s.loop === 'dynamic') text = t('when.dynamic');
  else if (typeof w.cron === 'string') {
    text = cronText(w.cron, t) ?? t('when.cron', { cron: w.cron.trim() });
    if (typeof w.zone === 'string' && w.zone && w.zone !== here) text += t('when.zone', { zone: w.zone });
  }
  else if (typeof w.every === 'number') text = everyText(w.every, t);
  else if (typeof w.at === 'string') text = t('when.once', { at: dayText(w.at, now, t) });
  else text = '';
  return s.loop ? t('when.loop', { when: text }) : text;
}

/**
 * 在哪跑：每次新开会话；跑在会话上的照标题写（会话表里没有的写编号）。
 * @param {Schedule} s @param {(id: string) => string|null} title @param {Text} t
 */
export function whereText(s, title, t) {
  const id = s.target?.session;
  if (typeof id === 'string') return t('where.session', { title: title(id) ?? id });
  return t('where.new');
}

/** 下次：停着的「已暂停」，没定下一次的空着 @param {Schedule} s @param {Date} now @param {Text} t */
export function nextText(s, now, t) {
  if (s.paused) return t('paused');
  return s.next ? t('next', { at: dayText(s.next, now, t) }) : '';
}

/** 底下那一行暗字：什么时候 · 在哪 · 下次（空的不写） @param {Schedule} s @param {Date} now @param {(id: string) => string|null} title @param {Text} t */
export function metaText(s, now, title, t) {
  return [whenText(s, now, t), whereText(s, title, t), nextText(s, now, t)].filter(Boolean).join(' · ');
}

/** 上一次跳过了的原因（不是跳过的是 `null`）：认得的写人话，认不得的照原样 @param {Schedule} s @param {Text} t */
export function skipText(s, t) {
  const r = s.last?.result;
  if (typeof r !== 'string' || !r.startsWith('skipped:')) return null;
  const why = r.slice('skipped:'.length);
  const key = `skipped.${why}`;
  const said = t(key);
  return said === key ? t('skipped.other', { why }) : said;
}

/** 卡片里那一行：什么时候 · 下次 @param {Schedule} s @param {Date} now @param {Text} t */
export function cardText(s, now, t) {
  return [whenText(s, now, t), nextText(s, now, t)].filter(Boolean).join(' · ');
}

/**
 * 右侧栏卡片一行右边的下次（2026-10-27 项目主人选「话在左、下次时刻靠右」）：今天的只写时刻「10:31」，明天的「明天」，再往后「10/30」；
 * 停着的「已暂停」，没定下一次的空。纯的。
 * @param {Schedule} s @param {Date} now @param {Text} t
 */
export function nextShort(s, now, t) {
  if (s.paused) return t('paused');
  if (!s.next) return '';
  const d = new Date(s.next);
  if (Number.isNaN(d.getTime())) return '';
  const day = ymd(d);
  if (day === ymd(now)) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (day === ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))) return t('pick.tomorrow');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 新建那张表：「什么时候」的四种。
 * @typedef {{kind: 'daily', time: string} | {kind: 'every', n: string, unit: 'minutes'|'hours'|'days'} | {kind: 'once', at: string} | {kind: 'cron', cron: string}} WhenForm
 */

const UNIT = { minutes: 60, hours: 3600, days: 86400 };

/**
 * 表上的「什么时候」交给核心什么：每天 → cron「分 时 * * *」；每隔 → 秒（少于 60 秒不收）；一次 → 本地的日期时刻换成 ISO（已经过了的不收）；
 * 自定义 → cron 原样（五段）。写得不对的交回 `{problem}`（同核心 `bad_params` 的 `data.problem`：`when`、`cron`、`short`、`past`）。
 * cron 的（每天、自定义）带上 `zone`（浏览器的时区，核心 J-3 上：照建时记下的时区走；不传的记核心那台机器的）。
 * @param {WhenForm} f @param {Date} now @param {string|null} [zone]
 * @returns {{when: any}|{problem: string}}
 */
export function whenOf(f, now, zone = null) {
  const tz = zone ? { zone } : {};
  if (f.kind === 'daily') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(f.time).trim());
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { problem: 'when' };
    return { when: { cron: `${Number(m[2])} ${Number(m[1])} * * *`, recurring: true, ...tz } };
  }
  if (f.kind === 'every') {
    const n = Number(String(f.n).trim());
    if (!Number.isFinite(n) || n <= 0 || !(f.unit in UNIT)) return { problem: 'when' };
    const secs = Math.round(n * UNIT[f.unit]);
    if (secs < 60) return { problem: 'short' };
    return { when: { every: secs } };
  }
  if (f.kind === 'once') {
    const d = new Date(String(f.at));
    if (!f.at || Number.isNaN(d.getTime())) return { problem: 'when' };
    if (d.getTime() <= now.getTime()) return { problem: 'past' };
    return { when: { at: d.toISOString() } };
  }
  const cron = String(f.cron ?? '').trim().split(/\s+/).join(' ');
  if (cron.split(' ').length !== 5) return { problem: 'cron' };
  return { when: { cron, recurring: true, ...tz } };
}

/**
 * 核心拒了写在哪一格下面：`data.problem`、拒绝码照表上的格认；认不得的写在底下（`null`）。
 * @param {any} err
 * @returns {{field: 'prompt'|'when'|'target'|'persona'|'preset'|null, key: string|null}}
 */
export function fieldOf(err) {
  const reason = err?.reason;
  if (reason === 'unknown_persona') return { field: 'persona', key: 'bad.unknown_persona' };
  if (reason === 'unknown_preset') return { field: 'preset', key: 'bad.unknown_preset' };
  const p = err?.data?.problem;
  if (reason !== 'bad_params' || typeof p !== 'string') return { field: null, key: null };
  if (p === 'prompt') return { field: 'prompt', key: 'bad.prompt' };
  if (['when', 'cron', 'past', 'short'].includes(p)) return { field: 'when', key: `bad.${p}` };
  if (p === 'session' || p === 'target' || p === 'cwd') return { field: 'target', key: `bad.${p}` };
  return { field: null, key: null };
}

/** 一项换进列表（`schedules.changed`）：删了的、一次的跑完了的拿掉，别的整项换；照核心的先后重排 @param {Schedule[]} list @param {any} p */
export function applyChange(list, p) {
  if (!p || typeof p.id !== 'string') return list;
  const rest = list.filter((s) => s.id !== p.id);
  if (p.removed || !p.entry) return rest;
  return sorted([...rest, p.entry]);
}

/** 跑在某个会话上的（右侧栏卡片列的） @param {Schedule[]} list @param {string|null} session */
export function onSession(list, session) {
  return session ? list.filter((s) => s.target?.session === session) : [];
}

/** 浏览器的时区（IANA 名）；拿不到的是 `null`。 */
export function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * 时刻那一格打的字认成 `HH:MM`：`8`、`08`、`8:5`、`8:05`、`0805`、`805`、全角冒号都认；认不得的、越界的交 `null`。纯的。
 * @param {string} text @returns {string|null}
 */
export function parseClock(text) {
  const s = String(text ?? '').trim().replace(/[：.]/g, ':');
  let m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (!m) {
    const d = /^(\d{3,4})$/.exec(s);
    if (!d) return null;
    m = /** @type {any} */ ([s, d[1].slice(0, -2), d[1].slice(-2)]);
  }
  const hh = Number(m[1]);
  const mm = m[2] === undefined ? 0 : Number(m[2]);
  if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 本地日期写成 `YYYY-MM-DD` @param {Date} d */
export function ymd(d) {
  const two = (/** @type {number} */ x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/**
 * 月历的格子：`year` 年 `month` 月（0 起）那一页，周一开头、整周排满（前后补别的月的日子），一格 `{date, day, inMonth, past, today}`。纯的。
 * @param {number} year @param {number} month @param {Date} now
 */
export function monthCells(year, month, now) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const today = ymd(now);
  const last = new Date(year, month + 1, 0).getDate();
  const count = Math.ceil((lead + last) / 7) * 7;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(year, month, 1 - lead + i);
    const date = ymd(d);
    return { date, day: d.getDate(), inMonth: d.getMonth() === month, past: date < today, today: date === today };
  });
}

/**
 * 日期按钮上的字：今天、明天写「今天」「明天」，别的「10月28日 周二」。纯的。
 * @param {string} date `YYYY-MM-DD` @param {Date} now @param {Text} t
 */
export function dateLabel(date, now, t) {
  const today = ymd(now);
  const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (date === today) return t('pick.today');
  if (date === tomorrow) return t('pick.tomorrow');
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return t('pick.date', { month: m, day: d, weekday: t(`pick.weekdays.${day}`) });
}
