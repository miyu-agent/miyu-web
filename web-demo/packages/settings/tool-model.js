// @ts-check
//! 技能、脚本、MCP 三页的纯逻辑（蓝图 `web.md`「设置页」第 20 条；核心 X-26、X-27）：一项从哪来、来源写什么、搜索、筛选、
//! 开关和加载方式写什么、MCP 服务两处合成一份、添加服务那张表的读写。画法在 `tool-pages.js`。

/** 三页的编号（设置页的分页编号，也是 `kind`） @typedef {'skills'|'scripts'|'mcp'} ToolKind */

/**
 * 一页上的一项，三种合成一个样子。`own` 是自己放的（技能、脚本 `from` 是 `home`；MCP 是个人设置里写的），`package` 是随哪个包来的（出厂又没有编号的是 `null`）。
 * `load` 是加载方式（技能没有：`null`），`on` 是全局开关（没有这一格的：`null`，不画开关）。`raw` 是核心给的那一项。
 * @typedef {{kind: ToolKind, id: string, name: string, title: string|null, desc: string|null, own: boolean, package: string|null,
 *   load: {value: boolean, by: string}|null, on: boolean|null, covered: boolean, raw: any}} ToolItem
 */

/** 功能编号的前缀（`feature.set` 的 `feature`、预设的 `features.<编号>`） */
const PREFIX = { skills: 'skill-', scripts: 'script-', mcp: 'mcp-' };

/** `need_load` 那一格认得的样子：`{value: 布尔, by}` @param {any} x */
const loadOf = (x) => (x && typeof x.value === 'boolean' ? { value: x.value, by: typeof x.by === 'string' ? x.by : 'source' } : null);

/** `skill.list` 的一项。 @param {any} s @returns {ToolItem} */
export function skillItem(s) {
  return {
    kind: 'skills', id: s.name, name: s.name, title: s.display_name ?? null, desc: s.summary ?? null,
    own: s.from === 'home', package: typeof s.package === 'string' ? s.package : null,
    load: null, on: typeof s.on === 'boolean' ? s.on : null, covered: false, raw: s,
  };
}

/** `script.list` 的一项。 @param {any} s @returns {ToolItem} */
export function scriptItem(s) {
  return {
    kind: 'scripts', id: s.tool, name: s.tool, title: s.display_name ?? null, desc: s.description ?? null,
    own: s.from === 'home', package: typeof s.package === 'string' ? s.package : null,
    load: loadOf(s.need_load), on: typeof s.on === 'boolean' ? s.on : null, covered: false, raw: s,
  };
}

/**
 * MCP 服务两处合成一份：个人设置里写的（`mcp.list`，自制）在前，照写的先后；再是包里带的（`package.list` 每个包的 `mcp`），照包、照包里的先后。
 * 包里带的服务现在没有 `need_load`、`on` 的（2026-10-20 已请核心补）不画加载方式和开关；被个人设置里同名的替代了的（`covered`）也不画。
 * @param {any[]|null|undefined} home `mcp.list` 的 `servers` @param {any[]|null|undefined} packages `package.list` 的 `packages`
 * @returns {ToolItem[]}
 */
export function mcpItems(home, packages) {
  /** @type {ToolItem[]} */
  const out = (home ?? []).map((s) => ({
    kind: 'mcp', id: `~home/${s.name}`, name: s.name, title: null, desc: null, own: true, package: null,
    load: loadOf(s.need_load), on: typeof s.on === 'boolean' ? s.on : null, covered: false, raw: s,
  }));
  for (const p of packages ?? []) {
    if (!p?.status) continue;
    for (const s of Array.isArray(p.mcp) ? p.mcp : []) {
      const covered = !!s.covered;
      out.push({
        kind: 'mcp', id: `${p.package}/${s.name}`, name: s.name, title: null, desc: null, own: false, package: p.package,
        load: covered ? null : loadOf(s.need_load), on: !covered && typeof s.on === 'boolean' ? s.on : null, covered, raw: { ...s, enabled: p.enabled !== false },
      });
    }
  }
  return out;
}

/** 全局开关写进 `feature.set` 的值：开的删掉那一项（`null`，没写的算开），关的写 `false`。 @param {boolean} on */
export const switchValue = (on) => (on ? null : false);

/** 一项的功能编号（`feature.set` 的 `feature`）。 @param {ToolItem} item */
export const featureId = (item) => `${PREFIX[item.kind]}${item.name}`;

/** `tool.set_loading` 的参数：脚本照工具名，MCP 照服务名。 @param {ToolItem} item @param {boolean|null} needLoad */
export const loadingParams = (item, needLoad) => (item.kind === 'mcp' ? { server: item.name, need_load: needLoad } : { tool: item.name, need_load: needLoad });

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

/** 会话的种类（`venues`），先后照这里；不勾的照本机 */
export const VENUES = /** @type {const} */ (['local', 'private', 'group']);

/** 时限不写是多少秒（核心：600000 毫秒） */
export const TIMEOUT_DEFAULT_S = 600;

/**
 * 添加、编辑服务那张表交上来的字，换成 `mcp.set` 的参数；写错的交回第一处的问题（文字表 `tools.form.bad.*` 的键和要填的格子）。
 * 环境变量一行一个 `名字=值`；`keep` 里是原来就有、表里照原样画的值（引用、遮住的），名字对得上又没改的照原样交回。
 * @param {{name: string, command: string, args: string, env: string, venues: string[], timeout: string}} form
 * @param {{env?: Record<string, any>}} [before] 编辑时原来那一项
 * @returns {{params: any}|{problem: string, field: string, line?: number}}
 */
export function serverParams(form, before = {}) {
  const name = form.name.trim();
  if (!SERVER_NAME.test(name)) return { problem: 'name', field: 'name' };
  const command = form.command.trim();
  if (!command) return { problem: 'command', field: 'command' };
  /** @type {any} */
  const params = { name, command };
  const args = form.args.split('\n').map((l) => l.trim()).filter(Boolean);
  if (args.length) params.args = args;
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
  const venues = VENUES.filter((v) => form.venues.includes(v));
  // 只勾本机的和不勾一样，不写
  if (venues.length && !(venues.length === 1 && venues[0] === 'local')) params.venues = venues;
  const timeout = form.timeout.trim();
  if (timeout) {
    const s = Number(timeout);
    if (!Number.isFinite(s) || s < 1 || s > 3600) return { problem: 'timeout', field: 'timeout' };
    if (Math.round(s * 1000) !== TIMEOUT_DEFAULT_S * 1000) params.timeout_ms = Math.round(s * 1000);
  }
  // 加载方式不经这里（`tool.set_loading` 管；带了会把默认值写死进文件，核心 X-27 补）
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
 * 编辑时表里先填的字（核心 X-27 补：`mcp.list` 的 `command` 是 `[程序, …参数]`，写了的另带 `env`、不是默认的带 `timeout_ms`）。
 * @param {any} s `mcp.list` 的一项
 */
export function formOf(s) {
  const command = Array.isArray(s.command) ? s.command.map(String) : typeof s.command === 'string' ? [s.command] : [];
  return {
    name: s.name ?? '',
    command: command[0] ?? '',
    args: command.slice(1).join('\n'),
    env: Object.entries(s.env ?? {}).map(([k, v]) => `${k}=${envShown(v)}`).join('\n'),
    venues: Array.isArray(s.venues) && s.venues.length ? s.venues : ['local'],
    timeout: typeof s.timeout_ms === 'number' ? String(s.timeout_ms / 1000) : '',
  };
}

/**
 * 编辑得了的：核心照写的交了环境变量、时限（X-27 补；没写的没有那一格，认不出来），同一回补上的 `skill.list` 的 `dir` 有了就算。
 * 之前的核心整条换会冲掉环境变量、时限，不给编辑。
 * @param {any} skills `skill.list` 的回应
 */
export const editable = (skills) => typeof skills?.dir === 'string';

/** 命令那一格写成一行给人看：`[程序, …参数]` 用空格连（旧核心是一个字）。 @param {any} command */
export const commandLine = (command) => (Array.isArray(command) ? command.join(' ') : String(command ?? ''));
