// @ts-check
//! 回答里写的路径换成本机的绝对路径（蓝图 `web.md`「读本机文件」）：绝对路径、`~/` 开头、`file://` 开头的照写；别的相对路径照
//! 这个会话的工作目录找；网上的地址（有协议的）不是本机路径。纯函数，桥的 `/file` 照它取。

/**
 * @param {string} target 她写的地址
 * @param {{home: string|null, cwd: string|null}} where 家目录（握手回应的 `host.home`）、这个会话的工作目录（`session.created`）
 * @returns {string|null} 绝对路径；不是本机路径的是 `null`
 */
export function localPath(target, where) {
  const raw = (target ?? '').trim();
  if (!raw) return null;
  if (/^file:\/\//i.test(raw)) {
    try { return normalize(decodeURIComponent(raw.replace(/^file:\/\//i, ''))); } catch { return null; }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  if (raw.startsWith('~/')) return where.home ? normalize(`${where.home}/${raw.slice(2)}`) : null;
  if (raw.startsWith('/')) return normalize(raw);
  return where.cwd ? normalize(`${where.cwd}/${raw}`) : null;
}

/** 去掉 `.`、`..`、重复的 `/`；越过根的 `..` 停在根上。 */
function normalize(path) {
  const out = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
}

/**
 * 握手回应里的路径信息（`host`，核心施工 W-3）：新会话默认的工作目录是这个账号的工作区（设计 11 第四节，网页上开的会话默认在
 * 账号的工作区），家目录拿来把路径写成 `~/…`；核心在哪个系统上（`platform`：`linux`、`macos`、`windows`），Windows 上路径照 Windows 的写法
 * 给人看。没有的是 `null`。
 * @param {any} hello `hello` 的回应
 * @returns {{cwd: string|null, home: string|null, platform: string|null}}
 */
export function placeOf(hello) {
  const host = hello?.host;
  const platform = ['linux', 'macos', 'windows'].includes(host?.platform) ? host.platform : null;
  return { cwd: typeof host?.workspace === 'string' ? host.workspace : null, home: typeof host?.home === 'string' ? host.home : null, platform };
}

/**
 * 开会话时选的目录核心有没有换成别处（核心 WN-1：家目录、根目录这类太宽的，核心改用会话的默认工作区，回应的 `cwd` 写实际的、
 * 家目录下的写成 `~/…`）：换了的交实际的那个（照回应原样），没换、没选的交 `null`。两边都照家目录写成 `~` 再比，结尾的 `/` 不算。
 * @param {string|null|undefined} asked 选的目录 @param {string|null|undefined} used 回应的 `cwd` @param {string|null} home
 * @returns {string|null}
 */
export function movedFrom(asked, used, home) {
  if (!asked || !used) return null;
  const plain = (/** @type {string} */ p) => {
    const trimmed = p.length > 1 ? p.replace(/\/+$/, '') : p;
    if (home && (trimmed === home || trimmed.startsWith(`${home}/`))) return `~${trimmed.slice(home.length)}`;
    return trimmed;
  };
  return plain(asked) === plain(used) ? null : used;
}
