// @ts-check
//! 「下载软件」页算的那几样（蓝图 `web.md`「设置页」第 12a 条）：筛选、个数、一张卡片的按钮是哪一种、带了什么写成一行。不碰页面，测试直接调。

/** 第一排筛选（照这个先后） */
export const STATUS_FILTERS = /** @type {const} */ (['all', 'installed', 'upgradable', 'official', 'community']);
/**
 * 按种类筛（2026-10-21 项目主人：筛选图标，照包的种类筛；以后加了种类不用改网页）：一个包的种类是它清单里的种类（`kind`，核心 G-11：
 * 主题、通讯平台、语言、插件……）加上它带了的几样（`provides` 里有名字的那几格，核心 G-10：技能、脚本、MCP……）。都照核心给的编号，
 * 这里只定先后：认得的照这张表排在前面，别的照编号排在后面。
 */
export const KIND_FILTERS = /** @type {const} */ (['theme', 'connection', 'language', 'extension', 'ui', 'mascot', 'builtin',
  'skills', 'scripts', 'mcp', 'command', 'slash', 'personas', 'presets', 'features', 'content']);
/** 卡片的图标：照它带的头一种 */
const FACES = { theme: 'palette', connection: 'plug', language: 'languages', extension: 'package', mascot: 'smile', personas: 'user-round', presets: 'toggle-right', skills: 'sparkles', scripts: 'square-terminal', mcp: 'plug', command: 'square-terminal', slash: 'square-terminal', content: 'file-text', features: 'package' };

/** 清单的种类换成筛选的那一种：核心的 `process`、`worker` 对人都是插件（核心 G-11 给的是清单 `kind` 的原样） */
const KIND_ALIAS = /** @type {Record<string, string>} */ ({ process: 'extension', worker: 'extension' });
/** 不单列的种类：`bundle` 只是装技能、脚本、MCP 的壳，照它带的那几样筛 */
const KIND_HIDDEN = new Set(['bundle']);

/** 它是哪几种：清单的种类，加上带了的几样（有名字的才算） @param {any} p @returns {string[]} */
export const kindsOf = (p) => {
  const raw = typeof p?.kind === 'string' && p.kind ? KIND_ALIAS[p.kind] ?? p.kind : null;
  const own = raw && !KIND_HIDDEN.has(raw) ? [raw] : [];
  const carried = Object.entries(p?.provides ?? {}).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v)).map(([k]) => k);
  return [...new Set([...own, ...carried])];
};

/** 种类的先后：认得的照表，别的照编号排在后面 @param {string} a @param {string} b */
const byKind = (a, b) => {
  const i = KIND_FILTERS.indexOf(/** @type {any} */ (a));
  const j = KIND_FILTERS.indexOf(/** @type {any} */ (b));
  return (i < 0 ? 999 : i) - (j < 0 ? 999 : j) || a.localeCompare(b);
};

/** 卡片的图标 @param {any} p */
export const faceOf = (p) => FACES[/** @type {keyof typeof FACES} */ (kindsOf(p).sort(byKind).find((k) => k in FACES) ?? 'features')];

/** 装着的版本和软件源的不一样（照 `package.upgrades` 的 `upgrades`） @param {any} p @param {Set<string>} upgradable */
const canUpgrade = (p, upgradable) => upgradable.has(p.package);

/**
 * 一种筛选对不对得上这一项。
 * @param {any} p @param {string} f @param {Set<string>} upgradable
 */
export function matches(p, f, upgradable) {
  switch (f) {
    case 'all': return true;
    case 'installed': return p.installed != null;
    case 'upgradable': return canUpgrade(p, upgradable);
    case 'official': return !!p.official;
    case 'community': return !p.official;
    default: return kindsOf(p).includes(/** @type {any} */ (f));
  }
}

/**
 * 搜：照名字、说明、编号，几个词都得出现，不分大小写（同核心的 `package.search`，这里在拿到的那一份里边打边筛）。
 * @param {any} p @param {string} query
 */
export function found(p, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = [p.package, p.name, p.summary].filter((x) => typeof x === 'string').join('\n').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * 筛出来的那几项和每一种筛选的个数（第二排只交有的）。
 * @param {any[]} all @param {{query: string, filter: string, kind: string|null}} view @param {Set<string>} upgradable
 */
export function shownOf(all, view, upgradable) {
  const hit = all.filter((p) => found(p, view.query));
  const list = hit.filter((p) => matches(p, view.filter, upgradable) && (!view.kind || matches(p, view.kind, upgradable)));
  /** @type {Record<string, number>} */
  const counts = {};
  const kinds = [...new Set(all.flatMap(kindsOf))].sort(byKind);
  for (const f of [...STATUS_FILTERS, ...kinds]) counts[f] = hit.filter((p) => matches(p, f, upgradable)).length;
  return { list, counts, kinds };
}

/**
 * 卡片右下角那个按钮是哪一种：被拉黑的不画（`blocked`）、在装的（`busy`）、能升级的、装着的、没装的。
 * @param {any} p @param {Set<string>} upgradable @param {string|null} busy 在装、在升的那一个
 * @returns {'blocked'|'busy'|'upgrade'|'installed'|'install'}
 */
export function actionOf(p, upgradable, busy) {
  if (p.blocked) return 'blocked';
  if (busy === p.package) return 'busy';
  if (canUpgrade(p, upgradable)) return 'upgrade';
  if (p.installed != null) return 'installed';
  return 'install';
}

/** 带程序的种类（核心 U23下上：自己那一层只收不带程序的包） */
const PROGRAM_KINDS = new Set(['process', 'worker', 'ui', 'builtin']);

/**
 * 带不带程序（蓝图第 12a 条第 8 款）：种类是插件、界面、内置，或者带了子命令、MCP 服务的；平时只装得进自己那一层的人装不了它。
 * @param {any} p `package.search` 的一项
 */
export function hasProgram(p) {
  const has = (/** @type {string} */ k) => { const v = p?.provides?.[k]; return Array.isArray(v) ? v.length > 0 : !!v; };
  return PROGRAM_KINDS.has(p?.kind) || has('command') || has('mcp');
}

/**
 * 卡片上点「安装」要不要先开详情给人看：要权限的、要一起装依赖的先看（`package.install {source, preview: true}` 的回应）。
 * @param {any} preview
 */
export const needsLook = (preview) => (Array.isArray(preview?.capabilities) && preview.capabilities.length > 0) || (Array.isArray(preview?.with) && preview.with.length > 0);

/**
 * 「包含」一行：一种一段，「技能 weather、forecast」，段之间用 `；`（种类的名字照 `names`）。
 * @param {any} provides @param {Record<string, string>} names @param {string} sep
 */
export function providesLine(provides, names, sep = '、') {
  return Object.keys(provides ?? {}).sort(byKind).map((k) => {
    const v = provides?.[k];
    const items = Array.isArray(v) ? v : v ? [String(v)] : [];
    return items.length ? `${names[k] ?? k} ${items.join(sep)}` : null;
  }).filter(Boolean).join('；');
}

/** 下载进度：百分数（没有总数的是 `null`） @param {{done?: number, total?: number}|null} p */
export const percentOf = (p) => (p && typeof p.total === 'number' && p.total > 0 ? Math.min(100, Math.round(((p.done ?? 0) / p.total) * 100)) : null);
