// @ts-check
//! 软件包自带的图标（核心 F-18 上；蓝图 `web.md`「设置页」第 13 条）：`package.list` 的一项带 `logo`（版本）的画包里那张图，取一次（`package.logo`）
//! 照版本记在这个页面里，版本变了才重取；没取到以前、取不到的画清单的 `icon`（Lucide），都没有的画默认的。取到了把页面上这个包的图标都换成图。

import { h, icon, hasIcon } from '../../src/lib/dom.js';

/** 取到了的：包编号 → `{v, src}`（`src` 是 data URL） @type {Map<string, {v: string, src: string}>} */
const cache = new Map();
/** 在取的：`<编号>@<版本>` @type {Set<string>} */
const pending = new Set();

/**
 * 一个软件包的图标（`span.set-pkg-face`）。
 * @param {any} core 连核心的 @param {any} p `package.list` 的一项 @param {string} [fallback] 都没有时画的 Lucide 图标 @param {string} [cls] 多加的类
 */
export function pkgFace(core, p, fallback = 'package', cls = '') {
  const el = h(`span.set-pkg-face${cls}`, { 'data-pkg-logo': String(p?.package ?? '') }, icon(p?.icon && hasIcon(p.icon) ? p.icon : fallback));
  const v = typeof p?.logo === 'string' && p.logo ? p.logo : null;
  if (!v || typeof p.package !== 'string') return el;
  const got = cache.get(p.package);
  if (got?.v === v) show(el, got.src);
  else fetchLogo(core, p.package, v);
  return el;
}

/** 换成图 @param {Element} el @param {string} src */
function show(el, src) {
  el.classList.add('is-logo');
  el.replaceChildren(h('img', { src, alt: '' }));
}

/** 取一次，取到了换掉页面上这个包的图标 @param {any} core @param {string} id @param {string} v */
async function fetchLogo(core, id, v) {
  const key = `${id}@${v}`;
  if (pending.has(key)) return;
  pending.add(key);
  try {
    const got = await core.request('package.logo', { package: id });
    if (typeof got?.data !== 'string' || typeof got?.media_type !== 'string') return;
    const src = `data:${got.media_type};base64,${got.data}`;
    cache.set(id, { v: typeof got.logo === 'string' ? got.logo : v, src });
    for (const el of document.querySelectorAll(`[data-pkg-logo="${CSS.escape(id)}"]`)) show(el, src);
  } catch {
    // 旧核心没有这个方法、取不到：照旧画 Lucide 图标
  } finally {
    pending.delete(key);
  }
}
