// @ts-check
//! 技能、脚本、MCP 三页的纯逻辑（蓝图 `web.md`「设置页」第 20 条；核心 X-26、X-27）：一项从哪来、来源写什么、搜索、筛选、
//! 开关和加载方式写什么、MCP 服务两处合成一份、添加服务那张表的读写。画法在 `tool-pages.js`。

/** 三页的编号（设置页的分页编号，也是 `kind`） @typedef {'skills'|'scripts'|'mcp'} ToolKind */

/**
 * 一页上的一项，三种合成一个样子。`own` 是自己放的（技能、脚本 `from` 是 `home`；MCP 是个人设置里写的），`package` 是随哪个包来的（出厂又没有编号的是 `null`）。
 * `on` 是全局开关（没有这一格的：`null`，不画开关）。`raw` 是核心给的那一项。
 * @typedef {{kind: ToolKind, id: string, name: string, title: string|null, desc: string|null, own: boolean, package: string|null,
 *   on: boolean|null, covered: boolean, raw: any}} ToolItem
 */

/** 功能编号的前缀（`feature.set` 的 `feature`、预设的 `features.<编号>`） */
const PREFIX = { skills: 'skill-', scripts: 'script-', mcp: 'mcp-' };

/** `skill.list` 的一项。 @param {any} s @returns {ToolItem} */
export function skillItem(s) {
  return {
    kind: 'skills', id: s.name, name: s.name, title: s.display_name ?? null, desc: s.summary ?? null,
    own: s.from === 'home', package: typeof s.package === 'string' ? s.package : null,
    on: typeof s.on === 'boolean' ? s.on : null, covered: false, raw: s,
  };
}

/**
 * 技能写得有小毛病的那几句（核心 PT-2上：`skill.list` 那一项的 `warnings: [{code, message}]`，`message` 已照连接的语言挑好）：交回要写的字，
 * 没有 `message` 的照 `code` 写；没有 `warnings` 的是空的。
 * @param {any} raw @returns {string[]}
 */
export function warningsOf(raw) {
  if (!Array.isArray(raw?.warnings)) return [];
  return raw.warnings.map((/** @type {any} */ w) => (typeof w?.message === 'string' && w.message.trim() ? w.message : typeof w?.code === 'string' ? w.code : null))
    .filter((/** @type {string|null} */ x) => x !== null);
}

/** `script.list` 的一项。 @param {any} s @returns {ToolItem} */
export function scriptItem(s) {
  return {
    kind: 'scripts', id: s.tool, name: s.tool, title: s.display_name ?? null, desc: s.description ?? null,
    own: s.from === 'home', package: typeof s.package === 'string' ? s.package : null,
    on: typeof s.on === 'boolean' ? s.on : null, covered: false, raw: s,
  };
}

/**
 * MCP 服务两处合成一份：个人设置里写的（`mcp.list`，自制）在前，照写的先后；再是包里带的（`package.list` 每个包的 `mcp`），照包、照包里的先后。
 * 包里带的服务没有 `on` 的（之前的核心）不画开关；被个人设置里同名的替代了的（`covered`）也不画。
 * @param {any[]|null|undefined} home `mcp.list` 的 `servers` @param {any[]|null|undefined} packages `package.list` 的 `packages`
 * @returns {ToolItem[]}
 */
export function mcpItems(home, packages) {
  /** @type {ToolItem[]} */
  const out = (home ?? []).map((s) => ({
    kind: 'mcp', id: `~home/${s.name}`, name: s.name, title: null, desc: null, own: true, package: null,
    on: typeof s.on === 'boolean' ? s.on : null, covered: false, raw: s,
  }));
  for (const p of packages ?? []) {
    if (!p?.status) continue;
    for (const s of Array.isArray(p.mcp) ? p.mcp : []) {
      const covered = !!s.covered;
      out.push({
        kind: 'mcp', id: `${p.package}/${s.name}`, name: s.name, title: null, desc: null, own: false, package: p.package,
        on: !covered && typeof s.on === 'boolean' ? s.on : null, covered, raw: { ...s, enabled: p.enabled !== false },
      });
    }
  }
  return out;
}

/** 全局开关写进 `feature.set` 的值：开的删掉那一项（`null`，没写的算开），关的写 `false`。 @param {boolean} on */
export const switchValue = (on) => (on ? null : false);

/** 一项的功能编号（`feature.set` 的 `feature`）。 @param {ToolItem} item */
export const featureId = (item) => `${PREFIX[item.kind]}${item.name}`;

/** 筛选：全部、自制、随软件包来的 */
export const SOURCES = /** @type {const} */ (['all', 'own', 'package']);

/** 一项落不落在这个筛选里。 @param {ToolItem} item @param {string} filter */
export const inSource = (item, filter) => filter === 'all' || (filter === 'own' ? item.own : !item.own);

/**
 * 来源写什么：自己放的「自制」；随包来的写包名（`package.list` 里的名字，没装的照编号）；出厂又没有包编号的「出厂」。交回文字表的键或者名字。
 * @param {ToolItem} item @param {any[]|null|undefined} packages
 * @returns {{key: 'own'|'shipped'}|{name: string}}
 */
export function sourceOf(item, packages) {
  if (item.own) return { key: 'own' };
  if (!item.package) return { key: 'shipped' };
  const p = (packages ?? []).find((x) => x.package === item.package);
  return { name: p?.name ?? item.package };
}

/**
 * 搜索：显示名、名字、一句说明、来源的名字里有这几个字（不分大小写，前后空白不算；空的都算）。
 * @param {string} query @param {ToolItem} item @param {string} source 来源的名字（照界面语言）
 */
export function toolMatch(query, item, source) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.name, item.desc, source].some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
}

/**
 * 自己放技能、脚本的文件夹：核心给了 `dir` 的照它；没有的照 `from` 是 `home` 那几项的 `path` 倒推（技能 `<文件夹>/<名字>/SKILL.md`、
 * 脚本 `<文件夹>/<文件>`）；都没有的是 `null`（不出「打开目录」）。
 * @param {'skills'|'scripts'} kind @param {any} got `skill.list`、`script.list` 的回应
 */
export function homeDir(kind, got) {
  if (typeof got?.dir === 'string' && got.dir) return got.dir;
  const list = kind === 'skills' ? got?.skills : got?.scripts;
  const own = (Array.isArray(list) ? list : []).find((x) => x.from === 'home' && typeof x.path === 'string');
  if (!own) return null;
  const parts = own.path.split(/[\\/]/);
  const sep = own.path.includes('\\') && !own.path.includes('/') ? '\\' : '/';
  const up = kind === 'skills' ? 2 : 1;
  return parts.length > up ? parts.slice(0, -up).join(sep) : null;
}

/** MCP 的工具名去掉 `mcp__<服务名>__` 前缀。 @param {string} server @param {string} tool */
export const shortTool = (server, tool) => (tool.startsWith(`mcp__${server}__`) ? tool.slice(`mcp__${server}__`.length) : tool);

/** 服务名：小写字母开头，只有小写字母、数字、`-`，最多 32 个（核心 `mcp.set`） */
export const SERVER_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/** 时限不写是多少秒（核心：600000 毫秒） */
export const TIMEOUT_DEFAULT_S = 600;

/**
 * 一整条命令拆成 `[程序, …参数]`（2026-10-20 项目主人：命令、参数分两格不合理，一个框写整条）：照空白拆；`"…"`、`'…'` 里的空白不拆（单引号里原样，
 * 双引号里 `\"`、`\\` 转义）；引号外的 `\` 让下一个字照原样。引号没配对的交 `null`。
 * @param {string} text @returns {string[]|null}
 */
export function splitCommand(text) {
  const out = [];
  let word = '';
  let has = false;
  /** @type {string|null} */
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else word += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && (text[i + 1] === '"' || text[i + 1] === '\\')) word += text[++i];
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < text.length) {
      word += text[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has || word) out.push(word);
      word = '';
      has = false;
    } else {
      word += c;
      has = true;
    }
  }
  if (quote) return null;
  if (has || word) out.push(word);
  return out;
}

/** `[程序, …参数]` 写回一行：有空白、引号、`\` 的、空的用单引号括（里面的单引号写成 `'\''`）。 @param {string[]} parts */
export function joinCommand(parts) {
  return parts.map((p) => (p === '' || /[\s'"\\]/.test(p) ? `'${p.replace(/'/g, "'\\''")}'` : p)).join(' ');
}

/**
 * 添加、编辑服务那张表交上来的字，换成 `mcp.set` 的参数；写错的交回第一处的问题（文字表 `tools.form.bad.*` 的键和要填的格子）。
 * 命令一个框写整条（`splitCommand`）；环境变量一行一个 `名字=值`，`keep` 里是原来就有、表里照原样画的值（引用、遮住的），名字对得上又没改的照原样交回。
 * 会话的种类（`venues`）网页不画（2026-10-20 项目主人：本机、私聊、群聊是通讯平台的事），编辑时照原来的带回。
 * @param {{kind?: 'command'|'url', name: string, command: string, env: string, url?: string, bearer?: string, headers?: string, timeout: string}} form
 * @param {{env?: Record<string, any>, venues?: string[]}} [before] 编辑时原来那一项
 * @returns {{params: any}|{problem: string, field: string, line?: number}}
 */
export function serverParams(form, before = {}) {
  const name = form.name.trim();
  if (!SERVER_NAME.test(name)) return { problem: 'name', field: 'name' };
  if (form.kind === 'url') return urlParams(name, form, before);
  const parts = splitCommand(form.command);
  if (!parts) return { problem: 'quote', field: 'command' };
  if (!parts.length || !parts[0]) return { problem: 'command', field: 'command' };
  /** @type {any} */
  const params = { name, command: parts[0] };
  if (parts.length > 1) params.args = parts.slice(1);
  /** @type {Record<string, any>} */
  const env = {};
  const lines = form.env.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    const key = eq > 0 ? line.slice(0, eq).trim() : '';
    if (!key || /\s/.test(key)) return { problem: 'env', field: 'env', line: i + 1 };
    const text = line.slice(eq + 1);
    const old = before.env?.[key];
    env[key] = old !== undefined && typeof old !== 'string' && text === envShown(old) ? old : text;
  }
  if (Object.keys(env).length) params.env = env;
  if (Array.isArray(before.venues) && before.venues.length) params.venues = before.venues;
  const timeout = form.timeout.trim();
  if (timeout) {
    const sec = Number(timeout);
    if (!Number.isFinite(sec) || sec < 1 || sec > 3600) return { problem: 'timeout', field: 'timeout' };
    if (Math.round(sec * 1000) !== TIMEOUT_DEFAULT_S * 1000) params.timeout_ms = Math.round(sec * 1000);
  }
  return { params };
}

/**
 * 网址的服务（核心 X-32 下）：交 `url`、`bearer`、`headers`，不交 `command`、`args`、`env`。令牌一行；请求头一行一个 `名字: 值`；
 * 值是引用的（`{secret:X}`、`{env:X}`）照表里画的样子没改，原样交回原来那一格。
 * @param {string} name @param {{url?: string, bearer?: string, headers?: string, timeout: string}} form @param {any} before
 * @returns {{params: any}|{problem: string, field: string, line?: number}}
 */
function urlParams(name, form, before) {
  const url = (form.url ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return { problem: 'url', field: 'url' };
  /** @type {any} */
  const params = { name, url };
  const bearer = (form.bearer ?? '').trim();
  if (bearer) params.bearer = before.bearer !== undefined && typeof before.bearer !== 'string' && bearer === envShown(before.bearer) ? before.bearer : bearer;
  /** @type {Record<string, any>} */
  const headers = {};
  const lines = (form.headers ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const at = line.indexOf(':');
    const key = at > 0 ? line.slice(0, at).trim() : '';
    if (!key || /\s/.test(key)) return { problem: 'header', field: 'headers', line: i + 1 };
    const text = line.slice(at + 1).trim();
    const old = before.headers?.[key];
    headers[key] = old !== undefined && typeof old !== 'string' && text === envShown(old) ? old : text;
  }
  if (Object.keys(headers).length) params.headers = headers;
  if (Array.isArray(before.venues) && before.venues.length) params.venues = before.venues;
  const timeout = form.timeout.trim();
  if (timeout) {
    const sec = Number(timeout);
    if (!Number.isFinite(sec) || sec < 1 || sec > 3600) return { problem: 'timeout', field: 'timeout' };
    if (Math.round(sec * 1000) !== TIMEOUT_DEFAULT_S * 1000) params.timeout_ms = Math.round(sec * 1000);
  }
  return { params };
}

/** 环境变量的值在表里怎么写：字照原样；引用写成 `{env:X}`、`{secret:X}`；别的样子照 JSON。 @param {any} v */
export function envShown(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v.env === 'string') return `{env:${v.env}}`;
  if (v && typeof v.secret === 'string') return `{secret:${v.secret}}`;
  return JSON.stringify(v);
}

/**
 * 编辑时表里先填的字（核心 X-27 补：`mcp.list` 的 `command` 是 `[程序, …参数]`，写回一行；写了的另带 `env`、不是默认的带 `timeout_ms`）。
 * @param {any} s `mcp.list` 的一项
 */
export function formOf(s) {
  const command = Array.isArray(s.command) ? s.command.map(String) : typeof s.command === 'string' ? [s.command] : [];
  return {
    // 网址的服务（`mcp.list` 里带 `url`、没有 `command`）
    kind: typeof s.url === 'string' ? 'url' : 'command',
    url: typeof s.url === 'string' ? s.url : '',
    bearer: s.bearer != null ? envShown(s.bearer) : '',
    headers: Object.entries(s.headers ?? {}).map(([k, v]) => `${k}: ${envShown(v)}`).join('\n'),
    name: s.name ?? '',
    command: joinCommand(command),
    env: Object.entries(s.env ?? {}).map(([k, v]) => `${k}=${envShown(v)}`).join('\n'),
    timeout: typeof s.timeout_ms === 'number' ? String(s.timeout_ms / 1000) : '',
  };
}

/**
 * 编辑得了的：核心照写的交了环境变量、时限（X-27 补；没写的没有那一格，认不出来），同一回补上的 `skill.list` 的 `dir` 有了就算。
 * 之前的核心整条换会冲掉环境变量、时限，不给编辑。
 * @param {any} skills `skill.list` 的回应
 */
export const editable = (skills) => typeof skills?.dir === 'string';

/** 命令那一格写成一行给人看：`[程序, …参数]` 照 `joinCommand` 连（旧核心是一个字）。 @param {any} command */
export const commandLine = (command) => (Array.isArray(command) ? joinCommand(command.map(String)) : String(command ?? ''));

/** 多选：点一项，没勾的勾上、勾了的去掉（交回新的一份；同全部会话的多选）。 @param {Set<string>} selected @param {string} id */
export function flip(selected, id) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * 多选：`Shift` 点，上一次点的和这一次之间（含两头，照列表的先后）都勾上；上一次点的不在列表里的只勾这一项。
 * @param {Set<string>} selected @param {string[]} order @param {string|null} from @param {string} to
 */
export function range(selected, order, from, to) {
  const next = new Set(selected);
  const a = from == null ? -1 : order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return next.add(to);
  for (const id of order.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(id);
  return next;
}

/**
 * 环境变量、令牌、请求头在详情里怎么显示（扩展线 X-32 下的约定：`mcp.list` 照原样交回这几格，显示时遮住，只在编辑框里给全）：
 * 写成引用的（`{env:X}`、`{secret:X}`）只是名字，照常写；字一律写成一串圆点。
 * @param {any} v
 */
export function maskedValue(v) {
  if (v && typeof v === 'object' && (typeof v.env === 'string' || typeof v.secret === 'string')) return envShown(v);
  return '••••••';
}

/** 一组键值（环境变量、请求头）在详情里写成一行：`KEY=••••••  KEY2={env:X}` @param {Record<string, any>|undefined} map */
export const maskedPairs = (map) => Object.entries(map ?? {}).map(([k, v]) => `${k}=${maskedValue(v)}`).join('  ');

/**
 * 服务列出来了、核心没登记的（`mcp.list` 的 `skipped`）：工具是 `{tool, why}`（核心 X-37），提示词是 `{prompt, why}`（核心 X-39）。
 * 交回几行（`name` 是服务那边的原名，没写名字的是空的）和有哪几种（`tools`、`prompts`、`both`；没有的交 `null`）。
 * @param {any} skipped
 * @returns {{kinds: 'tools'|'prompts'|'both'|null, rows: {name: string, prompt: boolean, why: string}[]}}
 */
export function skippedOf(skipped) {
  const rows = (Array.isArray(skipped) ? skipped : []).filter((x) => x && typeof x === 'object')
    .map((x) => ({ name: String(x.prompt ?? x.tool ?? ''), prompt: x.prompt != null && x.tool == null, why: String(x.why ?? '') }));
  const prompts = rows.some((r) => r.prompt);
  const tools = rows.some((r) => !r.prompt);
  return { kinds: prompts && tools ? 'both' : prompts ? 'prompts' : tools ? 'tools' : null, rows };
}
