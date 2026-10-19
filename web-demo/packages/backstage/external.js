// @ts-check
//! 软件自己的网页（不在框里的那种，现在是接入通讯平台 `im` 的页面服务；im 的 I-5，2026-10-19）：在新标签页打开，人不用再登录一次。照 10-19 和 im
//! 定的写法：先问它的 `status`（`package.call`）回应里的 `web`（页面服务实际听的端口，没听上的不带），再在这条连接上要一张交接票 `login.ticket`
//! （60 秒、一次性，核心 1b45d31c），连同现在的深浅、主题颜色、界面语言写进网址的片段：
//! `http://127.0.0.1:<端口>/#miyu=<base64url(JSON {v: 1, scheme, colors, ticket, lang})>`；那边读完用 `history.replaceState` 去掉片段。
//! 颜色照它认的那几个名字（design.js page 那一组），网页的样式变量算成实际的值交过去（变量套变量的那边认不得），值里有 `;`、`{`、`}` 的不交。

/** 交过去的颜色：im 认的名字（网页的样式变量是把 `_` 换成 `-`）；`_shadow` 结尾的是阴影，照 `box-shadow` 算 */
export const COLOR_NAMES = /** @type {const} */ (['surface', 'sidebar_bg', 'surface_1', 'surface_2', 'surface_3', 'text', 'text_soft', 'line', 'line_strong',
  'accent', 'accent_soft', 'on_primary', 'on_primary_container', 'gold', 'ribbon', 'online', 'danger', 'bubble_shadow', 'card_shadow', 'float_shadow',
  'peek_shadow', 'sidebar_active', 'sidebar_active_shadow', 'scrim']);

/**
 * 一段字照 UTF-8 编成 base64url（不带 `=`）。
 * @param {string} text
 */
export function base64url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 跳过去的网址。
 * @param {number} port @param {{scheme: 'light'|'dark', colors: Record<string, string>, ticket: string, lang: string}} what
 */
export function siteUrl(port, what) {
  const colors = Object.fromEntries(Object.entries(what.colors).filter(([, v]) => v && !/[;{}]/.test(v)));
  return `http://127.0.0.1:${port}/#miyu=${base64url(JSON.stringify({ v: 1, scheme: what.scheme, colors, ticket: what.ticket, lang: what.lang }))}`;
}

/** 现在的主题颜色：每个变量放在一个看不见的小块上算出实际的值（`rgb(…)`、阴影照 `box-shadow`）。 */
export function currentColors() {
  const probe = document.createElement('i');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;visibility:hidden';
  document.body.append(probe);
  /** @type {Record<string, string>} */
  const out = {};
  try {
    for (const name of COLOR_NAMES) {
      const v = `var(--${name.replace(/_/g, '-')})`;
      const shadow = name.endsWith('_shadow');
      probe.style.color = '';
      probe.style.boxShadow = '';
      if (shadow) probe.style.boxShadow = v;
      else probe.style.color = v;
      const style = getComputedStyle(probe);
      const got = shadow ? style.boxShadow : style.color;
      if (got && got !== 'none' && !(shadow && got === '')) out[name] = got;
    }
  } finally {
    probe.remove();
  }
  return out;
}

/**
 * 这个软件有没有自己的网页、听在哪个端口（问它的 `status`；没有这个方法、没开、没听上的交 `null`）。
 * @param {any} core @param {string} id
 * @returns {Promise<number|null>}
 */
export async function sitePort(core, id) {
  try {
    const got = await core.request('package.call', { package: id, method: 'status' });
    const port = got?.web;
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
  } catch {
    return null;
  }
}

/**
 * 在新标签页打开：问到端口、要到票再开（都在本机，很快，还在点的那一下浏览器放行的时间里；打不开的不白开一个空标签页），交回一句为什么打不开。
 * @param {any} ctx 这个包的上下文 @param {string} id
 * @returns {Promise<string|null>} 打不开的原因；开了是 `null`
 */
export async function openSite(ctx, id) {
  try {
    const port = await sitePort(ctx.core, id);
    if (!port) return ctx.text('site.no_web');
    const { ticket } = await ctx.core.request('login.ticket', {});
    if (typeof ticket !== 'string' || !ticket) return ctx.text('site.no_ticket');
    const dark = ctx.theme?.dark?.() ?? matchMedia('(prefers-color-scheme: dark)').matches;
    const lang = (document.documentElement.lang || 'zh').split('-')[0];
    const url = siteUrl(port, { scheme: dark ? 'dark' : 'light', colors: currentColors(), ticket, lang });
    // 开外面的链接照宿主的（浏览器开新标签页，桌面端照它自己的）
    ctx.host.open(url);
    return null;
  } catch (err) {
    return /** @type {any} */ (err)?.message ?? String(err);
  }
}
