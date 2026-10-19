// @ts-check
//! 设置页的纯逻辑（蓝图 `web.md`「设置页」）：核心的配置清单（`config.schema`）和最终值（`config.get`）合成一页页、一组组的项；
//! 每一项来自哪一层、写在哪一层、`expect` 写什么、搜索对不对得上。不碰 DOM、不发请求。

/**
 * @typedef {{key: string, type: string, control: string, name: string, description: string, page: string, group: string,
 *   common?: boolean, layers: string[], applies: string, default?: any, options?: {value: any, name: string}[],
 *   min?: number, max?: number, max_chars?: number, element?: string, suggestions?: string[]}} SchemaItem 清单里的一项（`suggestions`：
 *   控件是 `combo` 的建议值，核心照连接的语言排好先后，核心 P-9 补）
 * @typedef {{origin: {layer: string, file?: string, line?: number, env?: string}, used: boolean, value: any}} LayerValue
 * @typedef {{value?: any, origin?: LayerValue['origin'], layers?: LayerValue[]}} Entry `config.get` 里一项的最终值和每一层
 * @typedef {{key?: string, level: string, message: string, file?: string, line?: number}} Problem
 * @typedef {SchemaItem & {entry: Entry|null, problems: Problem[], fact?: {value: any}}} Item 合好的一项（`fact`：配置里没写时模型目录给的值，
 *   模型那一页用）
 * @typedef {{id: string, name: string, items: Item[]}} Group
 * @typedef {{id: string, name: string, groups: Group[], problems: Problem[]}} Page
 */

/** 键里有人起的名字的项（`providers.<id>.base_url`）不照通用的行画：交给模型那一页的编辑器。 */
export const isTemplate = (key) => key.includes('<');

/**
 * 合成一页页：照 `pages`、`groups` 的先后，组里常用的排前面；带占位的项不列。项少的页并进别的页（`merge`：页 → 并进哪一页），
 * 个别组挪到别的页（`moveGroups`：组 → 哪一页）；并掉的页不再单列。别的头的项（键名以 `hide` 里的哪一个打头，`tui.`）不列（蓝图第 17 条）。
 * 对不上哪一项的问题挂在 `fallback` 那一页顶上。
 * @param {{pages: {id: string, name: string}[], groups: {id: string, name: string, page: string}[], items: SchemaItem[]}} schema
 * @param {{items: Record<string, Entry>, problems?: Problem[]}} got
 * @param {{fallback?: string, merge?: Record<string, string>, moveGroups?: Record<string, string>, hide?: string[]}} [opts]
 * @returns {Page[]}
 */
export function buildPages(schema, got, opts = {}) {
  const { fallback = 'advanced', merge = {}, moveGroups = {}, hide = [] } = opts;
  const foreign = (key) => hide.some((prefix) => key.startsWith(prefix));
  const known = new Set(schema.items.map((i) => i.key));
  const problems = got.problems ?? [];
  const pages = schema.pages.filter((p) => !merge[p.id]).map((p) => ({ id: p.id, name: p.name, groups: /** @type {Group[]} */ ([]), problems: /** @type {Problem[]} */ ([]) }));
  const byPage = new Map(pages.map((p) => [p.id, p]));
  for (const g of schema.groups) {
    const items = schema.items
      // 界面提示 `hidden` 的（核心 9-1 下：网页服务的空闲秒数这类）不画，照样能写、能查
      .filter((i) => i.group === g.id && !i.hidden && !isTemplate(i.key) && !foreign(i.key))
      .map((i) => ({ ...i, entry: got.items?.[i.key] ?? null, problems: problems.filter((x) => x.key === i.key) }))
      .sort((a, b) => Number(!!b.common) - Number(!!a.common));
    const home = moveGroups[g.id] ?? g.page;
    if (items.length) byPage.get(merge[home] ?? home)?.groups.push({ id: g.id, name: g.name, items });
  }
  // 对不上清单里哪一项的（整份写坏了、不认识的键、只属于带占位那几项的不算）：放那一页顶上。别的头的项连它的问题一起不列，
  // 不认识的键不管叫什么都要提示（改了名的旧键 `tui.startup` 留在文件里，人得看得到去删）
  const loose = problems.filter((x) => !x.key || (!known.has(x.key) && !templateOf(x.key, schema.items)));
  (byPage.get(fallback) ?? pages.at(-1))?.problems.push(...loose);
  return pages.filter((p) => p.groups.length || p.problems.length);
}

/**
 * 名字下面那一行小字（蓝图第 7 条）：只写什么时候生效，当场生效的交 `null`（整行不出现）。值来自哪一层不写（2026-10-08 项目主人：
 * 「默认」「个人设置」这类来处是核心怎么存，用户用不上）。
 * @param {string} applies @returns {string|null}
 */
export const noteOf = (applies) => (applies === 'now' || applies === 'live' ? null : applies);

/** 一个真键对得上哪一项带占位的（`providers.dev.base_url` → `providers.<id>.base_url`）。 */
export function templateOf(key, items) {
  const parts = splitKey(key);
  return items.find((i) => {
    if (!isTemplate(i.key)) return false;
    const t = i.key.split('.');
    return t.length === parts.length && t.every((seg, n) => seg.startsWith('<') || seg === parts[n]);
  }) ?? null;
}

/** 照 TOML 点号连着的键拆开：带双引号的一段里的点不算（`providers.dev.models."a.b".window`）。 */
export function splitKey(key) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of key) {
    if (ch === '"') quoted = !quoted;
    else if (ch === '.' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * 写在哪一层：能写个人设置的写个人设置，只能写系统配置的写系统配置（M8 只有管理员一个人）。
 * @param {SchemaItem} item
 */
export const layerFor = (item) => (item.layers.includes('personal') ? 'personal' : 'system');

/**
 * `config.set` 的 `expect`：这一层里这一项现在写着什么，`{value}` 或者没写 `{}`（数照数值比：`1` 对得上文件里的 `1.0`，核心 8-3 再补）。
 * @param {Entry|null} entry
 * @param {string} layer
 */
export function expectFor(entry, layer) {
  const had = entry?.layers?.find((l) => l.origin.layer === layer);
  return had ? { value: had.value } : {};
}

/** 这一层写了这一项没有：写了的能「恢复默认」。 */
export const writtenIn = (entry, layer) => !!entry?.layers?.some((l) => l.origin.layer === layer);

/** 值是环境变量引用（`{env: X}`）：交回名字，不是的交 `null`。 */
export const envRef = (value) => (value && typeof value === 'object' && !Array.isArray(value) && typeof value.env === 'string' ? value.env : null);

/**
 * 列表加的一个元素（控件 `list`）：核心说元素是 `int`、`float` 的，照数交（接入QQ的群白名单是群号，交字会被核心拒，2026-10-17
 * O-41）；读不成数的、超出能准确表示的整数的照原样交，由核心说错在哪。别的照字。
 * @param {string|undefined} element @param {string} text
 */
export function listElement(element, text) {
  if (element === 'int' && /^[+-]?\d+$/.test(text) && Number.isSafeInteger(Number(text))) return Number(text);
  if (element === 'float' && text !== '' && Number.isFinite(Number(text))) return Number(text);
  return text;
}

/**
 * 控件里写的字：`text`、`number` 控件照它显示；人改了以后整串作为 `input` 交给核心，核心照这一项的类型读（时长写 `10m`）。
 * @param {any} value
 */
export function inputText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * 搜索：名字、键、说明里有这几个字（不分大小写）。交回对得上的项，带上在哪一页。
 * @param {Page[]} pages
 * @param {string} query
 * @returns {{page: Page, group: Group, item: Item}[]}
 */
export function search(pages, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const page of pages) {
    for (const group of page.groups) {
      for (const item of group.items) {
        const hay = `${item.name}\n${item.key}\n${item.description}`.toLowerCase();
        if (hay.includes(q)) out.push({ page, group, item });
      }
    }
  }
  return out;
}

/** 哪几页有错误（左栏名字后面一个红点）。 */
export function pagesWithErrors(pages) {
  const bad = (p) => p.problems.some((x) => x.level === 'error') || p.groups.some((g) => g.items.some((i) => i.problems.some((x) => x.level === 'error')));
  return new Set(pages.filter(bad).map((p) => p.id));
}

/** 照 TOML 点号连着的键写一段：只有字母、数字、`-`、`_` 的裸着写，别的带双引号（`"cline-pass/deepseek-v4.1-flash"`）。 */
export const keySegment = (name) => (/^[A-Za-z0-9_-]+$/.test(name) ? name : `"${name.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`);

/**
 * 带占位的键换成真键：`providers.<id>.models.<model>.window` + `{id: 'dev', model: 'a/b'}` → `providers.dev.models."a/b".window`。
 * @param {string} template @param {Record<string, string>} names
 */
export function realKey(template, names) {
  return template.split('.').map((seg) => (seg.startsWith('<') ? keySegment(names[seg.slice(1, -1)] ?? seg) : seg)).join('.');
}

/**
 * 模型那一页的一项：照清单里带占位的那一项，换成真键，配上最终值；配置里没写的带上目录给的值（`fact`）。清单里没有这一项的交 `null`。
 * @param {{items: SchemaItem[]}} schema @param {{items: Record<string, Entry>, problems?: Problem[]}} got
 * @param {string} template @param {Record<string, string>} names @param {{value: any}} [fact]
 * @returns {Item|null}
 */
export function itemFor(schema, got, template, names, fact) {
  const spec = schema.items.find((i) => i.key === template);
  if (!spec) return null;
  const key = realKey(template, names);
  return { ...spec, key, entry: got.items?.[key] ?? null, problems: (got.problems ?? []).filter((p) => p.key === key), ...(fact ? { fact } : {}) };
}

/**
 * 清单里一项不带占位的（`models.chat`）配上最终值。
 * @param {{items: SchemaItem[]}} schema @param {{items: Record<string, Entry>, problems?: Problem[]}} got @param {string} key
 * @returns {Item|null}
 */
export function plainItem(schema, got, key) {
  return itemFor(schema, got, key, {});
}

/** 窗口这类大数写短：`1000000` → `1M`，`128000` → `128k`。 */
export function shortCount(n) {
  if (typeof n !== 'number') return '';
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(n % 1e3 ? 1 : 0)}k`;
  return String(n);
}

/** 同一家里重了的显示名（同一个模型的几条线路）：这几个名字下面要写模型名分开它们。 @param {string[]} names */
export function duplicates(names) {
  const seen = new Set();
  const dup = new Set();
  for (const n of names) (seen.has(n) ? dup : seen).add(n);
  return dup;
}

/** 人起的编号（供应商、池）：小写字母开头，只有小写字母、数字、`-`、`_`，最长 32 个字符（`kernel/ids.md`「路径里的名字」）。 */
export const validId = (id) => /^[a-z][a-z0-9_-]{0,31}$/.test(id);

/** 粘贴的密钥存成的新名字：`<编号>-<时刻>`（不覆盖原来的，照终端第 7 条）；名字最长 64。 @param {string} id @param {number} now */
export const secretName = (id, now) => `${id}-${now.toString(36)}`.slice(0, 64);

/**
 * 存一家供应商的表要发的 `config.set` 的 `changes`（蓝图「设置页」第 14 条）：显示名、地址、接口、密钥，每项带这一层读到的
 * `expect`；空着的显示名、地址是删掉（新建的不写），地址是 `null` 的不改（原来是环境变量引用、框空着）；密钥 `keep` 是不改。
 * @param {string} id
 * @param {{name: string, base_url: string|null, driver: string, key: {kind: 'keep'|'secret'|'env', value: string}}} form
 * @param {{items: Record<string, Entry>}} got
 * @param {string} layer
 * @param {string|null} secret 粘贴的密钥存成的名字（`kind` 是 `secret` 时）
 */
export function providerChanges(id, form, got, layer, secret) {
  const key = (field) => `providers.${keySegment(id)}.${field}`;
  const changes = [];
  const put = (field, change) => {
    const entry = got.items?.[key(field)] ?? null;
    const had = writtenIn(entry, layer);
    if ('unset' in change && !had) return;
    changes.push({ key: key(field), ...change, expect: expectFor(entry, layer) });
  };
  put('name', form.name.trim() ? { value: form.name.trim() } : { unset: true });
  if (form.base_url !== null) put('base_url', form.base_url.trim() ? { input: form.base_url.trim() } : { unset: true });
  if (form.driver) put('driver', { value: form.driver });
  // 一家一个 key（核心 8-25）：`providers.<编号>.key` 是一个引用
  if (form.key.kind === 'secret' && secret) put('key', { value: { secret } });
  if (form.key.kind === 'env' && form.key.value.trim()) put('key', { value: { env: form.key.value.trim() } });
  return changes;
}

/**
 * 只换一家的密钥（供应商页头下面那一块，蓝图「设置页」第 14 条）：一条改动，写 `providers.<编号>.key` 的引用。
 * @param {string} id @param {{secret: string}|{env: string}} ref @param {{items?: Record<string, Entry>}} got @param {string} layer
 */
export function keyChange(id, ref, got, layer) {
  const key = `providers.${keySegment(id)}.key`;
  return [{ key, value: ref, expect: expectFor(got.items?.[key] ?? null, layer) }];
}

/**
 * 地址的主机名（供应商那一列第二行：同名的两家靠它分开）：写成环境变量的、写坏的是 `null`。
 * @param {any} url
 */
export function hostOf(url) {
  if (typeof url !== 'string') return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

/**
 * 地址从哪来，给人分开同名的两家用：主机名，写成环境变量的是 `$变量名`；都没有的 `null`。
 * @param {any} url
 */
export function whereOf(url) {
  return hostOf(url) ?? (url && typeof url === 'object' && typeof url.env === 'string' ? `$${url.env}` : null);
}

/**
 * 显示名重了的几家（2026-10-11 项目主人：两个 DeepSeek 分不出）：交回这些家的编号，画的地方在名字旁边多写地址从哪来（`whereOf`）。
 * @param {any[]} providers
 */
export function sameNamed(providers) {
  const names = duplicates(providers.map(providerName));
  return new Set(providers.filter((p) => names.has(providerName(p))).map((p) => p.id));
}

/**
 * 选默认模型的选择器按供应商分组（蓝图「设置页」第 14 条）：一家一组，组里是这一家的模型；`keep` 挑哪些列（看图的只列看得了图的），
 * 一个模型都不剩的家不列。同一家里名字重了的标出来（行下面写模型名）。
 * @template M
 * @param {{id: string, models?: M[]}[]} providers @param {(m: M) => boolean} keep @param {(m: M) => string} nameOf
 * @returns {{provider: any, models: {m: M, dup: boolean}[]}[]}
 */
export function pickGroups(providers, keep, nameOf) {
  return providers.map((provider) => {
    const models = (provider.models ?? []).filter(keep);
    const dup = duplicates(models.map(nameOf));
    return { provider, models: models.map((m) => ({ m, dup: dup.has(nameOf(m)) })) };
  }).filter((g) => g.models.length);
}

/** 池的成员往前（`-1`）、往后（`1`）挪一格；到头了不动。 @param {string[]} list @param {number} i @param {number} dir */
export function moveMember(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 删一家供应商：它在这一层写着的几项（`providers.<id>.*`）各一条 `unset`（2026-10-19 项目主人：设置页原来少了删除）。 @param {string} id @param {{items: Record<string, Entry>}} got @param {string} layer */
export function providerRemoval(id, got, layer) {
  const prefix = `providers.${keySegment(id)}.`;
  return Object.keys(got.items ?? {}).filter((k) => k.startsWith(prefix) && writtenIn(got.items[k], layer)).map((k) => ({ key: k, unset: true, expect: expectFor(got.items[k], layer) }));
}

/** 删一个池：它在这一层写着的几项（`pools.<id>.*`）各一条 `unset`。 @param {string} id @param {{items: Record<string, Entry>}} got @param {string} layer */
export function poolRemoval(id, got, layer) {
  const prefix = `pools.${keySegment(id)}.`;
  return Object.keys(got.items ?? {}).filter((k) => k.startsWith(prefix) && writtenIn(got.items[k], layer)).map((k) => ({ key: k, unset: true, expect: expectFor(got.items[k], layer) }));
}

/**
 * 找模型（蓝图「设置页」第 14 条的搜索框）：显示名、模型名、供应商名里有这几个字（不分大小写，空格分开的几段都要有）；空的全给。
 * @template {{name: string, model: string, provider?: string}} T
 * @param {T[]} rows @param {string} query
 * @returns {T[]}
 */
export function filterModels(rows, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const hay = `${r.name}\n${r.model}\n${r.provider ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** 供应商的显示名（核心 8-21：`name.value`，已经照配置、目录、编号退好；旧核心是字或没有）。 @param {{id: string, name?: any}} p */
/**
 * 选模型的项（`type: reference`，例如整理记忆的模型）下拉里列什么：模型（显示名，有好几家的后面暗字写哪一家）、能用的模型池（`@名字`）。
 * 能选的不做成手写（2026-10-09 项目主人：手写「供应商/模型」人不知道写什么）。
 * @param {any} list `model.list` 的回应（还没读到是 `null`）
 * @returns {{value: string, name: string, note?: string}[]}
 */
export function referenceOptions(list) {
  const providers = list?.providers ?? [];
  const many = providers.length > 1;
  const rows = providers.flatMap((p) => (p.models ?? []).filter((m) => m.ref).map((m) => ({ p, m, name: m.facts?.name?.value ?? m.model })));
  // 显示名重了的（同一个模型从好几条线路接进来）后面再写模型名，分得开
  const dup = duplicates(rows.map((r) => r.name));
  const models = rows.map(({ p, m, name }) => {
    const note = [many ? providerName(p) : null, dup.has(name) && m.model !== name ? m.model : null].filter(Boolean).join(' · ');
    return { value: m.ref, name, ...(note ? { note } : {}) };
  });
  const pools = (list?.pools ?? []).filter((x) => x.usable !== false).map((x) => ({ value: `@${x.name}`, name: `@${x.name}` }));
  return [...models, ...pools];
}

export const providerName = (p) => (typeof p.name === 'object' ? p.name?.value : p.name) || p.id;

/** 网页包的设置项里有控件能改的类型；结构复杂的（`json`、`map`、`list`）在设置页改不了，不列（蓝图「设置页」第 11 条）。 */
const EDITABLE = new Set(['boolean', 'choice', 'number', 'duration', 'color', 'text', 'key']);

/** 一个包能在设置页列出来的设置项（照清单的先后）。 @param {Record<string, {type: string}>} settings */
export const editableKeys = (settings) => Object.keys(settings ?? {}).filter((k) => EDITABLE.has(settings[k].type));

/**
 * 软件包列表收到一条 `package.changed`（订阅 `packages`，核心 F-8 三补）：整项换；`entry` 是空的从列表拿掉；没有的照编号排进去。
 * @param {any[]} list @param {string} id @param {any|null} entry
 */
export function applyPackageChange(list, id, entry) {
  const rest = list.filter((p) => p.package !== id);
  if (!entry) return rest;
  if (rest.length === list.length) return [...rest, entry].sort((a, b) => a.package.localeCompare(b.package));
  return list.map((p) => (p.package === id ? entry : p));
}

/** 包开着、它带的 MCP 服务有停下的（核心 X-4：`mcp` 每一格的 `state`；被个人设置里同名的替代了的不算，F-9 补的 `covered`）。 @param {any} p */
export const mcpStopped = (p) => p.enabled !== false && (p.mcp ?? []).some((s) => s.state === 'stopped' && !s.covered);

/**
 * 几个包的编号换成给人看的名字（核心 F-11：缺的依赖 `missing`、依赖它的 `by` 都是编号）：列表里有、有名字的照名字，没装的照编号；先后照原样。
 * @param {any[]|null|undefined} packages `package.list` 的 `packages` @param {string[]} ids
 */
export const packageNames = (packages, ids) => ids.map((id) => (packages ?? []).find((p) => p.package === id)?.name ?? id);

/**
 * 个人设置里的 MCP 服务推来一项（`mcp.changed {name, server}`，核心 F-9 补）：换掉同名的；新的接在后面（照个人设置里写的先后，新写的在最后）；
 * `server` 是 `null` 的拿掉。
 * @param {any[]} list @param {string} name @param {any|null} server
 */
export function applyServerChange(list, name, server) {
  if (!server) return list.filter((s) => s.name !== name);
  return list.some((s) => s.name === name) ? list.map((s) => (s.name === name ? server : s)) : [...list, server];
}

/**
 * 下拉加「其他」手写（`combo`，核心 P-9 补）现在停在哪：没设的是「不设」（`null`），在建议里的是那一项，别的是「其他」、那一行字里是它。
 * @param {string[]} suggestions @param {any} value 最终值
 * @returns {{choice: string|null|typeof COMBO_OTHER, custom: string}}
 */
export function comboState(suggestions, value) {
  if (typeof value !== 'string' || !value) return { choice: null, custom: '' };
  if (suggestions.includes(value)) return { choice: value, custom: '' };
  return { choice: COMBO_OTHER, custom: value };
}

/** 「其他」那一项的值：和哪个建议值都不会一样。 */
export const COMBO_OTHER = Object.freeze({ other: true });

/**
 * 左栏的分组（2026-10-20 项目主人分的四组）：`heads` 是每一组开头的那一页；一页在第几组照它在 `order` 里排在哪个开头后面（开头排在 `order` 里的位置）。
 * `order` 里没有的页（核心多出来的）排在「高级」前面，算最后一组。交回「页 → 第几组」。
 * @param {string[]} order @param {string[]} heads @returns {(id: string) => number}
 */
export function navGroups(order, heads) {
  const at = heads.map((id) => order.indexOf(id)).filter((i) => i >= 0).sort((a, b) => a - b);
  return (id) => {
    const i = order.indexOf(id);
    if (i < 0) return at.length;
    return at.filter((x) => x <= i).length;
  };
}

/** 软件包页的筛选（2026-10-20 项目主人：技能、脚本、MCP、网页、扩展混在一起，要能筛）：先后照这里；`web` 是网页自己的组件 */
export const PKG_FILTERS = /** @type {const} */ (['all', 'builtin', 'extension', 'connection', 'ui', 'mascot', 'mcp', 'web']);

/**
 * 一个核心的软件包落在哪几个筛选里（照包带了什么，一个包带好几样的几个里都有）：内置（`builtin`）、扩展（`process`、`worker`）、
 * 接入（带 `connection` 的）、界面（`ui`）、吉祥物（`mascot`，或者别的种类多带一张吉祥物）、MCP（`mcp` 里有服务的）。
 * @param {any} p `package.list` 的一项 @returns {string[]}
 */
export function pkgKinds(p) {
  const kinds = [];
  if (p.kind === 'builtin') kinds.push('builtin');
  if (p.kind === 'process' || p.kind === 'worker') kinds.push('extension');
  if (p.connection) kinds.push('connection');
  if (p.kind === 'ui') kinds.push('ui');
  if (p.kind === 'mascot' || p.mascot) kinds.push('mascot');
  if (Array.isArray(p.mcp) && p.mcp.length) kinds.push('mcp');
  return kinds;
}

/** 一行右边的小标签写它是哪一种（文字表 `pkg.kind.*` 的键）：接入的写接入；只带技能、脚本的 `bundle` 写技能包，带服务的写 MCP @param {any} p */
export function pkgTag(p) {
  if (p.connection) return 'connection';
  if (p.kind === 'process' || p.kind === 'worker') return 'extension';
  if (p.kind === 'bundle') return Array.isArray(p.mcp) && p.mcp.length ? 'mcp' : 'bundle';
  return ['builtin', 'ui', 'mascot'].includes(p.kind) ? p.kind : 'builtin';
}

/** 搜索：名字、一句说明、编号里有这几个字（不分大小写，前后空白不算；空的都算） @param {string} query @param {...(string|null|undefined)} fields */
export function pkgMatch(query, ...fields) {
  const q = String(query ?? '').trim().toLowerCase();
  return !q || fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
}

/**
 * 一项配置是哪个软件包的：`package` 是装着的包的照它；对不上的（核心 2026-10-20 以前把组当包编号填，联网搜索 `net` 的 key 和地址在组 `net_keys`）
 * 照键的头一段认（`net.search.exa.key` 归 `net`）；都对不上的是 `null`（核心自己的模块，照旧一组一组摊开）。
 * @param {{key: string, package?: string}} item @param {Set<string>} ids 装着的包
 */
export function ownerOf(item, ids) {
  if (typeof item.package === 'string' && ids.has(item.package)) return item.package;
  const head = String(item.key ?? '').split('.')[0];
  return ids.has(head) ? head : null;
}
