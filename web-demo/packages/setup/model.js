// @ts-check
//! 人格、预设、工作区（软件包 `setup`，蓝图 `web.md`「人格、预设、工作区」）：按钮上写什么、实际会用哪个、默认的能不能用、最近用过的目录。
//! 纯函数。

/** `persona.list` 的一项：写错的只有 `persona`、`problem`。 @typedef {{persona: string, name?: string|null, summary?: string|null, problem?: string}} Persona */
/** `preset.list` 的一项：写错的只有 `preset`、`problem`。 @typedef {{preset: string, name?: string|null, summary?: string|null, problem?: string}} Preset */

/** 人格写给人看的名字：没有显示名的写编号。 @param {Persona} p */
export const personaName = (p) => p.name || p.persona;

/** 预设写给人看的名字：没有显示名的写编号。 @param {Preset} p */
export const presetName = (p) => p.name || p.preset;

/**
 * `check` 的问题里属于这个人格、预设的（照文件在 `personas/<编号>/`、`presets/<编号>.toml` 下认，哪一层都算）。
 * `persona.list` 的 `problem` 是给日志的英文原话，人看的那一句（照连接的语言）在 `check` 里（项目主人 2026-10-08 定：写中文）。
 * @param {{kind: string, file?: string, line?: number, message: string}[]} problems @param {'persona'|'preset'} kind @param {string} id
 * 文件只留人格目录里的那一截（`persona.toml`、`prompts/examples.md`）、预设的文件名：在哪一层、数据根在哪是核心怎么存，不往界面上露
 * （项目主人 2026-10-08）；手改文件的人知道自己改的是哪个人格。
 * @returns {{line: number|null, message: string, file: string}[]}
 */
export function problemsOf(problems, kind, id) {
  const tail = kind === 'persona' ? `personas/${id}/` : `presets/${id}.toml`;
  return problems
    .filter((p) => p.kind === kind && typeof p.file === 'string')
    .map((p) => ({ p, f: /** @type {string} */ (p.file).replace(/\\/g, '/') }))
    .filter(({ f }) => f.startsWith(tail) || f.includes(`/${tail}`))
    .map(({ p, f }) => ({
      line: Number.isInteger(p.line) ? /** @type {number} */ (p.line) : null,
      message: p.message,
      file: kind === 'persona' ? f.slice(f.lastIndexOf(tail) + tail.length) : `${id}.toml`,
    }));
}

/**
 * 默认的能不能用（第 2 条：预设没了、文件写错的锁住输入框；人格只看写错的，没了的当没设）：指着的那一项在列表里、没写错。
 * @param {(Persona|Preset)[]} list @param {string|null} id @param {'persona'|'preset'} [key]
 */
export function defaultUsable(list, id, key = 'persona') {
  const hit = id ? list.find((p) => /** @type {any} */ (p)[key] === id) : null;
  return !!hit && !hit.problem;
}

/** 没选预设时用哪个：配置项 `preset.default`，没写的是出厂的 `full`（`protocol.md` 的 `session.create`）。 @param {string|null} chosen @param {string|null} fallback */
export const presetInUse = (chosen, fallback) => chosen ?? fallback ?? 'full';

/**
 * 实际用哪个人格：选了的；明着不用人格（`false`）的是没有；没选的照配置项 `persona.default`，指着没有的当没设（核心 2026-10-08）；
 * 都没有是没有人格（出厂不带人格）。预设不再带默认人格（2026-10-08 项目主人：人格、预设互不引用）。
 * @param {string|false|null} chosen @param {string|null} fallback @param {Persona[]} list
 * @returns {string|null}
 */
export function personaInUse(chosen, fallback, list) {
  if (chosen === false) return null;
  if (chosen) return chosen;
  return fallback && list.some((p) => p.persona === fallback) ? fallback : null;
}

/**
 * 新会话先选上上一次的（2026-10-09 项目主人：不然每次新会话都要选好麻烦）：会话表里最新的那个顶层会话的人格、预设。工作区不跟
 * （2026-10-22 项目主人：上一个会话换到 `~` 以后新建会话也跟着在 `~`，不对），新会话一律从默认工作区开始。
 * 那个会话没人格的选「无人格」（`false`）；人格、预设已经没了、写错了的不选（照默认的）；一个会话都没有的交 `null`。
 * @param {{session?: string, oneshot?: boolean, parent?: string|null, persona?: string, preset?: string|null, no_tools?: boolean, cwd?: string}[]} sessions 从新到旧
 * @param {Persona[]} personas @param {Preset[]} presets
 * @param {false|string|null} [noTools] 无工具的会话接着选什么（`Catalog.noToolsAs`）：旧核心 `false`，新核心（P-17）出厂的 `none`
 * @returns {{persona?: string|false, preset?: string|false}|null}
 */
export function lastChoice(sessions, personas, presets, noTools = false) {
  const last = sessions.find((e) => !e.oneshot && !e.parent);
  if (!last) return null;
  /** @type {{persona?: string|false, preset?: string|false}} */
  const out = {};
  if (!last.persona) out.persona = false;
  else if (defaultUsable(personas, last.persona)) out.persona = last.persona;
  // 上一个是「无工具」的（核心 P-16 下：`preset` 是 `null` 又带 `no_tools`；中途换了的，会话表当场跟着换）接着选它；
  // 新核心（P-17）没有单拿的无工具了，选出厂的「无功能」
  if (last.preset) {
    if (defaultUsable(presets, last.preset, 'preset')) out.preset = last.preset;
  } else if (last.no_tools) {
    if (noTools === false) out.preset = false;
    else if (noTools && defaultUsable(presets, noTools, 'preset')) out.preset = noTools;
  }
  return out;
}

/** 目录名（按钮上写的）：路径最后一段，`~` 照写。 @param {string} path */
export function dirName(path) {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts.at(-1) || path;
}

/**
 * 输入框里写的路径：只认绝对的（`/…`；Windows 的 `C:\…`、`C:/…`、`\\服务器\…`）和 `~`、`~/…`（相对的不知道照谁接），核心在哪个系统上
 * 都能用；去掉前后空白和末尾的分隔符（根目录本身留着）。不认的是 `null`。
 * @param {string} text
 */
export function readPath(text) {
  const t = text.trim();
  const ok = t === '~' || t.startsWith('~/') || t.startsWith('~\\') || t.startsWith('/') || /^[A-Za-z]:[\\/]/.test(t) || t.startsWith('\\\\');
  if (!ok) return null;
  const cut = t.replace(/[\\/]+$/, '');
  return cut === '' || /^[A-Za-z]:$/.test(cut) ? t.slice(0, cut.length + 1) : cut;
}

/** 记一个最近用过的目录：排到最前，重复的去掉，最多 `max` 个；默认工作区不记。 @param {string[]} list @param {string} path @param {string} fallback @param {number} max */
export function remember(list, path, fallback, max) {
  if (path === fallback) return list;
  return [path, ...list.filter((x) => x !== path)].slice(0, max);
}

/** 家目录下的写成 `~/…`（显示用）。 @param {string} path @param {string|null} home */
export function tilde(path, home) {
  if (!home) return path;
  if (path === home) return '~';
  return path.startsWith(`${home}/`) || path.startsWith(`${home}\\`) ? `~${path.slice(home.length)}` : path;
}

/** 示范对话的一对：你说的、人格回的。 @typedef {{user: string, assistant: string}} Pair */
/** `persona.set`、`preset.set` 的一项改动。 @typedef {{key: string, value?: string, unset?: true}} Change */

/**
 * 说明改了发什么：写了的发字，清空了发空字（就是没有说明，盖住出厂的那句；核心 P-3 再补）；没变的什么都不发。
 * 2026-10-08 项目主人：说明要能清空（原来发 `unset`，出厂的回到出厂那句，看着清不掉）。
 * @param {'persona'|'preset'} kind @param {string} before @param {string} after @returns {Change[]}
 */
export function summaryChange(kind, before, after) {
  const text = after.trim();
  if (text === before.trim()) return [];
  return [{ key: `${kind}.summary`, value: text }];
}

/**
 * 编辑器里的人格（详情的四样、「子代理可选」）和读进来时提示词的版本（存的时候当 `expect` 带回去，防覆盖别处的改动）。
 * @typedef {{name: string, summary: string, persona: string, reminders: string, pairs: Pair[], subagent?: boolean, versions: {persona: string|null, reminders: string|null, examples: string|null}}} PersonaDraft
 */

/** 示范对话要存的那几对：字前后的空白去掉，两头都空的不要。 @param {Pair[]} pairs @returns {Pair[]} */
export function cleanPairs(pairs) {
  return pairs.map((p) => ({ user: p.user.trim(), assistant: p.assistant.trim() })).filter((p) => p.user || p.assistant);
}

/** 只写了一头的那一对是第几对（从 0 起，照编辑器里的先后）；都齐的是 -1。 @param {Pair[]} pairs */
export function halfPair(pairs) {
  return pairs.findIndex((p) => !p.user.trim() !== !p.assistant.trim());
}

/**
 * 点「保存」发什么（`persona.set` 的 `changes`、`prompts`）：和读进来的比，变了的才发；提示词带读进来时的版本。
 * 人设、角色扮演提示清空了发空字（人要的是「不要这一段」，`unset` 在出厂人格上会回到出厂的字）；示范对话没有了发空的一对对。
 * 说明清空了发空字（没有说明）。
 * @param {PersonaDraft} before @param {PersonaDraft} after
 * @returns {{changes?: Change[], prompts?: Record<string, any>}|null} 什么都没变是 `null`
 */
export function personaSave(before, after) {
  /** @type {{changes?: Change[], prompts?: Record<string, any>}} */
  const out = {};
  /** @type {Change[]} */
  const changes = [];
  const name = after.name.trim();
  if (name && name !== before.name) changes.push({ key: 'persona.name', value: name });
  changes.push(...summaryChange('persona', before.summary, after.summary));
  // 子代理可选（核心 P-10 补）：拨了才发；没读到这一格的（引导里新建的）当关着
  if (!!after.subagent !== !!before.subagent) changes.push({ key: 'persona.subagent', value: !!after.subagent });
  if (changes.length) out.changes = changes;
  const prompts = {};
  for (const key of /** @type {const} */ (['persona', 'reminders'])) {
    if (after[key].trim() !== before[key].trim()) prompts[key] = { text: after[key].trim(), expect: before.versions[key] };
  }
  const pairs = cleanPairs(after.pairs);
  if (JSON.stringify(pairs) !== JSON.stringify(cleanPairs(before.pairs))) prompts.examples = { pairs, expect: before.versions.examples };
  if (Object.keys(prompts).length) out.prompts = prompts;
  return out.changes || out.prompts ? out : null;
}

/** 预设功能分段的先后和认法：编号前缀（核心 X-2 的 `mcp-<服务名>`、X-12 的 `script-<工具名>`、X-11 的 `skill-<名字>`、X-14 的
 * `command-<名字>`），别的是包的功能。 */
const FEATURE_GROUPS = /** @type {const} */ ([['mcp', 'mcp-'], ['script', 'script-'], ['skill', 'skill-'], ['command', 'command-']]);

/** 机主私人的脚本、MCP 服务、模板命令归的「包」（核心 ENV-1） */
export const HOME_PACKAGE = '~home';

/**
 * 预设的功能怎么分组。核心 ENV-1 起功能带 `package`：照包分组（项目主人：开关挂在包名下面），包照第一次出现的先后，`~home` 一组
 * （`home`）排在包后面，一个功能的包也是一组；没有 `package` 的（不归包的技能、没装的）接在最后照五段分，这时「功能」那一段叫 `other`。
 * 旧核心一个都没带 `package` 的分成五段：功能、MCP 服务、脚本、技能（2026-10-12 项目主人定），斜杠命令（2026-10-15 项目主人定）。
 * 组里照核心的先后，空的不要。
 * @template {{id: string, package?: string}} F
 * @param {F[]} list `preset.get` 的 `features`
 * @returns {{group: 'package'|'home'|'feature'|'other'|'mcp'|'script'|'skill'|'command', package?: string, items: F[]}[]}
 */
export function featureGroups(list) {
  const owned = (/** @type {F} */ f) => typeof f.package === 'string' && f.package !== '';
  const of = (/** @type {F} */ f) => FEATURE_GROUPS.find(([, prefix]) => String(f.id).startsWith(prefix))?.[0] ?? 'feature';
  const packaged = list.some(owned);
  const kinds = /** @type {const} */ (['feature', 'mcp', 'script', 'skill', 'command'])
    .map((kind) => ({ group: packaged && kind === 'feature' ? /** @type {const} */ ('other') : kind, items: list.filter((f) => !owned(f) && of(f) === kind) }))
    .filter((g) => g.items.length);
  if (!packaged) return kinds;
  /** @type {Map<string, F[]>} */
  const byPackage = new Map();
  for (const f of list) {
    if (!owned(f) || f.package === HOME_PACKAGE) continue;
    const id = /** @type {string} */ (f.package);
    byPackage.set(id, [...(byPackage.get(id) ?? []), f]);
  }
  const home = list.filter((f) => f.package === HOME_PACKAGE);
  return [
    ...[...byPackage].map(([id, items]) => ({ group: /** @type {const} */ ('package'), package: id, items })),
    ...(home.length ? [{ group: /** @type {const} */ ('home'), items: home }] : []),
    ...kinds,
  ];
}

/**
 * 预设的功能排成几段、一段几块（蓝图「设置页」预设详情第 8 条；2026-10-27 项目主人：包一个总开关、功能是暗字子项，内置的在前、别的按安装先后）：
 * 在组里的包（`package.list` 的 `groups`）一组一段、段名是组名，组里照组内先后（核心 PG-1 的 `groups[].packages`，没给的照原来的先后）；
 * 再是别的出厂包（`layer: shipped`）一段，照原来的先后；再是装的包，照安装先后（`installed_at`，早的在前，没给的接在后面照名字）；
 * 再「我的」（`~home`）；没有 `package` 的几段（`other`、MCP 服务……）接在最后。一块是一个包：`single` 的只有一个功能、名字和包名一样，只画一行。纯的。
 * @template {{id: string, name?: string, package?: string}} F
 * @param {ReturnType<typeof featureGroups<F>>} groups `featureGroups` 分好的
 * @param {{packages?: any[], groups?: {id: string, name?: string, packages?: string[]}[]}} info `package.list` 的回应
 * @returns {{title: string|null, kind: 'group'|'package'|'home'|string, blocks: {package: string|null, name: string|null, items: F[], single: boolean}[]}[]}
 */
export function presetSections(groups, info) {
  const pkgs = new Map((info.packages ?? []).filter((p) => p?.package).map((p) => [p.package, p]));
  const nameOf = (/** @type {string} */ id) => pkgs.get(id)?.name ?? id;
  const blockOf = (/** @type {{package?: string, items: F[]}} */ g) => {
    const id = g.package ?? null;
    const name = id ? nameOf(id) : null;
    const only = g.items.length === 1 ? g.items[0] : null;
    return { package: id, name, items: g.items, single: !!only && !!id && (only.name ?? only.id) === name };
  };
  const pkgGroups = groups.filter((g) => g.group === 'package');
  const used = new Set();
  /** @type {ReturnType<typeof presetSections<F>>} */
  const out = [];
  for (const group of info.groups ?? []) {
    const members = pkgGroups.filter((g) => !used.has(g) && Array.isArray(pkgs.get(/** @type {string} */ (g.package))?.groups) && pkgs.get(/** @type {string} */ (g.package)).groups.includes(group.id));
    if (!members.length) continue;
    const order = Array.isArray(group.packages) ? group.packages : [];
    const rank = (/** @type {any} */ g) => { const i = order.indexOf(g.package); return i < 0 ? order.length : i; };
    const sorted = members.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g) - rank(b.g) || a.i - b.i).map((x) => x.g);
    for (const g of sorted) used.add(g);
    out.push({ title: group.name ?? group.id, kind: 'group', blocks: sorted.map(blockOf) });
  }
  const rest = pkgGroups.filter((g) => !used.has(g));
  const shipped = rest.filter((g) => pkgs.get(/** @type {string} */ (g.package))?.layer !== 'home');
  const installed = rest.filter((g) => pkgs.get(/** @type {string} */ (g.package))?.layer === 'home')
    .map((g) => ({ g, at: Date.parse(pkgs.get(/** @type {string} */ (g.package))?.installed_at ?? '') }))
    .sort((a, b) => (Number.isNaN(a.at) ? 1 : 0) - (Number.isNaN(b.at) ? 1 : 0) || (a.at - b.at) || nameOf(/** @type {string} */ (a.g.package)).localeCompare(nameOf(/** @type {string} */ (b.g.package))))
    .map((x) => x.g);
  if (shipped.length || installed.length) out.push({ title: null, kind: 'package', blocks: [...shipped, ...installed].map(blockOf) });
  for (const g of groups) {
    if (g.group === 'package') continue;
    out.push({ title: g.group, kind: g.group, blocks: [{ package: g.group === 'home' ? HOME_PACKAGE : null, name: null, items: g.items, single: false }] });
  }
  return out;
}
