// @ts-check
//! 「下载软件」页算的那几样（蓝图 `web.md`「设置页」第 12a 条）：筛选、个数、一张卡片的按钮是哪一种、带了什么写成一行。不碰页面，测试直接调。

/** 第一排筛选（照这个先后） */
export const STATUS_FILTERS = /** @type {const} */ (['all', 'installed', 'upgradable', 'official', 'community']);
/** 第二排：照它带了什么（`package.search` 每一项的 `provides`，核心 G-10），只露有的 */
export const KIND_FILTERS = /** @type {const} */ (['features', 'skills', 'scripts', 'mcp', 'personas', 'presets', 'command', 'slash', 'content']);
/** 卡片的图标：照它带的头一种 */
const FACES = { personas: 'user-round', presets: 'toggle-right', skills: 'sparkles', scripts: 'square-terminal', mcp: 'plug', command: 'square-terminal', slash: 'square-terminal', content: 'file-text', features: 'package' };

/** 它带了的几种（有名字的才算） @param {any} p */
export const kindsOf = (p) => KIND_FILTERS.filter((k) => {
  const v = p?.provides?.[k];
  return Array.isArray(v) ? v.length > 0 : !!v;
});

/** 卡片的图标 @param {any} p */
export const faceOf = (p) => FACES[kindsOf(p)[0] ?? 'features'];

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
  for (const f of [...STATUS_FILTERS, ...KIND_FILTERS]) counts[f] = hit.filter((p) => matches(p, f, upgradable)).length;
  const kinds = KIND_FILTERS.filter((k) => all.some((p) => kindsOf(p).includes(k)));
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
  return KIND_FILTERS.map((k) => {
    const v = provides?.[k];
    const items = Array.isArray(v) ? v : v ? [String(v)] : [];
    return items.length ? `${names[k] ?? k} ${items.join(sep)}` : null;
  }).filter(Boolean).join('；');
}

/** 下载进度：百分数（没有总数的是 `null`） @param {{done?: number, total?: number}|null} p */
export const percentOf = (p) => (p && typeof p.total === 'number' && p.total > 0 ? Math.min(100, Math.round(((p.done ?? 0) / p.total) * 100)) : null);
