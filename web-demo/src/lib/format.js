// @ts-check
//! 数的写法（`lib/`：纯的，谁都能用）：token 写短、命中率、百分比、读秒、用时、文件大小。照 TUI 演示的 `meter.rs`，两个头写出来一字不差
//! （`tui.md`「命中率的写法」「框下面那一行」）。

/** 去掉末尾的 `.0`：`1.0` 写 `1`。 */
const trim = (text) => (text.endsWith('.0') ? text.slice(0, -2) : text);

/** token 写短：`950`、`12.3k`、`1.4M`；一位小数，整的不写小数。 */
export function short(n) {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${trim((n / 1e3).toFixed(1))}k`;
  return `${trim((n / 1e6).toFixed(1))}M`;
}

/**
 * 命中率（命中 ÷ 输入，不算输出）：99 以下写整数；99 以上带一位小数，正好 99.0 的写 `99`；
 * 四舍五入到 100.0 的写 `100`。分母是 0 的是 `0`。
 */
export function hitRate(part, whole) {
  if (whole === 0) return '0';
  const exact = (part * 100) / whole;
  const tenths = Math.round(exact * 10) / 10;
  if (tenths < 99) return String(Math.round(exact));
  return trim(tenths.toFixed(1));
}

/** 上下文占窗口的百分比：一位小数，整的不写小数；窗口是 0 的是 `0`。 */
export function percentTenths(part, whole) {
  if (whole === 0) return '0';
  return trim(((part * 100) / whole).toFixed(1));
}

/** 读秒：`12s`、`1m 05s`、`1h 02m 05s`（运行状态行的用时、收起那一行末尾的用时）。 */
export function clock(secs) {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h === 0 && m === 0) return `${s % 60}s`;
  if (h === 0) return `${m}m ${pad(s % 60)}s`;
  return `${h}h ${pad(m)}m ${pad(s % 60)}s`;
}

/** 一轮、一步用了多久（毫秒）：一分钟以内带一位小数 `11.8s`，再长照读秒。 */
export function seconds(ms) {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${(ms / 1000).toFixed(1)}s`;
  return clock(secs);
}

/** 本地时间的 `HH:MM`（收尾那一行）。 */
export function hhmm(at) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 家目录里的路径写成 `~/…`（`tui.md` 侧边栏的「工作目录」）；家目录不知道、不在家目录里的照原样。 */
export function tilde(path, home) {
  if (!path || !home) return path;
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/**
 * 核心配置里写的路径照核心那台机器的写法给人看（蓝图 `web.md`「设置页」私密目录、受保护的路径）：Windows 上家目录写 `%USERPROFILE%`、
 * 分隔用 `\`（`~/AppData/Local` 写成 `%USERPROFILE%\AppData\Local`），别的系统同 [`tilde`]。
 * @param {string} path @param {string|null} home @param {string|null} platform 核心握手的 `host.platform`
 */
export function shownPath(path, home, platform) {
  if (platform !== 'windows') return home ? tilde(path, home) : path;
  const p = path.replace(/^~(?=\/|$)/, '%USERPROFILE%');
  return p.replace(/\//g, '\\');
}

/**
 * 悬停看的完整路径：Windows 上 `~` 换成真的家目录、分隔用 `\`；别的照原样。
 * @param {string} path @param {string|null} home @param {string|null} platform
 */
export function fullPath(path, home, platform) {
  if (platform !== 'windows') return path;
  const p = home ? path.replace(/^~(?=\/|$)/, home.replace(/[\\/]+$/, '')) : path;
  return p.replace(/\//g, '\\');
}

/**
 * 人照 Windows 的写法写的路径换回核心认的（核心只认 `~`、`~/…` 和绝对路径）：`%USERPROFILE%\…`、`~\…` 换成 `~/…`，相对路径的 `\` 换成 `/`；
 * 盘符开头、`\\` 开头的绝对路径照原样。别的系统照原样。
 * @param {string} text @param {string|null} platform
 */
export function corePath(text, platform) {
  if (platform !== 'windows') return text;
  const t = text.replace(/^%userprofile%(?=[\\/]|$)/i, '~');
  if (/^[a-z]:[\\/]/i.test(t) || t.startsWith('\\\\')) return t;
  return t.replace(/\\/g, '/');
}

/** 一次工具调用用了多久（照旧版 `app.js:8389`）：不到一秒 `23 ms`，十秒以内 `1.2 s`，再长 `12 s`。 */
export function toolDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1_000) return `${Math.max(1, Math.round(ms))} ms`;
  if (ms < 10_000) return `${(ms / 1_000).toFixed(1)} s`;
  return `${Math.round(ms / 1_000)} s`;
}

/** 在跑的读秒（照旧版 `app.js:10344`）：`12s`、`3m 05s`、`1h 02m`。 */
export function jobDuration(secs) {
  const v = Math.max(0, Math.floor(secs));
  if (v >= 3600) return `${Math.floor(v / 3600)}h ${String(Math.floor((v % 3600) / 60)).padStart(2, '0')}m`;
  if (v >= 60) return `${Math.floor(v / 60)}m ${String(v % 60).padStart(2, '0')}s`;
  return `${v}s`;
}

/** 文件大小的单位：1024 进一级。 */
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** 文件大小（附件的小卡）：`812 B`、`1.5 KB`、`3.3 MB`；一位小数，整的不写小数。 */
export function bytes(n) {
  let k = 0;
  while (n >= 1024 && k < UNITS.length - 1) {
    n /= 1024;
    k++;
  }
  return `${k === 0 ? n : trim(n.toFixed(1))} ${UNITS[k]}`;
}

/** 提示里不要句末的句号（2026-10-07 项目主人，终端同一条）：去掉一个「。」或「.」，省略号「…」「...」留着。 @param {string} text */
export function noStop(text) {
  return text.replace(/(?<!\.)[。.]$/u, '');
}

/** 上下文占窗口几成（全部会话的用量，2026-10-20 项目主人：「5% · 累计 3.9k」）：整数的百分比，用了一点又不到 1% 的写「<1%」。 @param {number} used @param {number} window */
export function contextPercent(used, window) {
  const pct = (used / window) * 100;
  return pct > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`;
}

const SIGNS = /** @type {Record<string, string>} */ ({ USD: '$', CNY: '¥', EUR: '€', GBP: '£' });

/** 一笔钱（用量页、框下面累计的浮窗）：一分钱以下的四位小数，别的两位；认得的币种写记号，别的写代码加空格。 @param {{currency: string, amount: number}} a */
export function amountText(a) {
  const n = a.amount > 0 && a.amount < 0.01 ? a.amount.toFixed(4) : a.amount.toFixed(2);
  const sign = SIGNS[a.currency];
  return sign ? `${sign}${n}` : `${a.currency} ${n}`;
}

/** 花费：照币种各写各的，用 ` + ` 接起来；一个都没有是空的。 @param {{currency: string, amount: number}[]} amounts */
export const money = (amounts) => (amounts ?? []).map(amountText).join(' + ');
