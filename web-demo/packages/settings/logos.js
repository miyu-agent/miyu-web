// @ts-check
//! 软件包自带的图标（核心 F-18 上；蓝图 `web.md`「设置页」第 13 条）：`package.list` 的一项带 `logo`（版本）的画包里那张图，取一次（`package.logo`）
//! 照版本记在这个页面里，版本变了才重取；没取到以前、取不到的画清单的 `icon`（Lucide），都没有的画默认的。取到了把页面上这个包的图标都换成图。

import { h, icon, hasIcon } from '../../src/lib/dom.js';

/** 取到了的：`<源>:<包编号>`（装着的那一份源写 `@`）→ `{v, src}`（`src` 是 data URL） @type {Map<string, {v: string, src: string}>} */
const cache = new Map();
/** 在取的：`<编号>@<版本>` @type {Set<string>} */
const pending = new Set();

/**
 * 一个软件包的图标（`span.set-pkg-face`）。`from` 是软件源的名字（「下载软件」里没装的那一份，核心 F-18 下：`package.logo` 带 `from`）；装着的不写。
 * @param {any} core 连核心的 @param {any} p `package.list`、`package.search` 的一项 @param {string} [fallback] 都没有时画的 Lucide 图标
 * @param {string} [cls] 多加的类 @param {string|null} [from]
 */
export function pkgFace(core, p, fallback = 'package', cls = '', from = null) {
  const key = `${from ?? '@'}:${String(p?.package ?? '')}`;
  const el = h(`span.set-pkg-face${cls}`, { 'data-pkg-logo': key }, icon(p?.icon && hasIcon(p.icon) ? p.icon : fallback));
  const v = typeof p?.logo === 'string' && p.logo ? p.logo : null;
  if (!v || typeof p.package !== 'string') return el;
  const got = cache.get(key);
  if (got?.v === v) show(el, got.src);
  else fetchLogo(core, key, p.package, v, from);
  return el;
}

/** 换成图 @param {Element} el @param {string} src */
function show(el, src) {
  el.classList.add('is-logo');
  el.replaceChildren(h('img', { src, alt: '' }));
}

/**
 * 取一次，取到了换掉页面上这个包的图标。
 * @param {any} core @param {string} key 缓存的键 @param {string} id 包编号 @param {string} v 版本 @param {string|null} from 软件源
 */
async function fetchLogo(core, key, id, v, from) {
  const asking = `${key}@${v}`;
  if (pending.has(asking)) return;
  pending.add(asking);
  try {
    const got = await core.request('package.logo', from ? { package: id, from } : { package: id });
    if (typeof got?.data !== 'string' || typeof got?.media_type !== 'string') return;
    const src = `data:${got.media_type};base64,${got.data}`;
    cache.set(key, { v: typeof got.logo === 'string' ? got.logo : v, src });
    for (const el of document.querySelectorAll(`[data-pkg-logo="${CSS.escape(key)}"]`)) show(el, src);
  } catch {
    // 旧核心没有这个方法、源里没有、下不成：照旧画 Lucide 图标
  } finally {
    pending.delete(asking);
  }
}
