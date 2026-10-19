// @ts-check
//! 软件页面（软件包 `backstage`，蓝图 `web.md`「软件的页面」；核心 `package-pages.md`「网页软件怎么给后台页」第 6 条，2026-10-15 项目主人定）：
//! 带页面的软件一个一整页，走网页自己的路由（`route.js`：`#package=<编号>`），能收藏、能在新标签页打开；网址变了（点了打开、浏览器后退）
//! 跟着开、关（地址经宿主的 `route` 读写）。提供服务 `backstage`：`open(编号)` 打开、`href(编号)` 给链接用的地址（设置的「软件后台」、信息页的「打开」照它）。
//! `miyu web --package <编号>` 打出的网址带着这一段，页面起来就开着它。停用了这个包：网址里写了也不开，设置里照旧列着（点了没反应）。

import { FullPage } from './page.js';
import { parseRoute, formatRoute } from './route.js';
import { sitePort, openSite } from './external.js';

/** @param {any} ctx */
export function apply(ctx) {
  /** 是这个页面里点开的：返回就后退一步，回到点开前那里；一进来就带着网址的没有「前面」，返回只把网址里这一段去掉 */
  let pushed = false;
  const nav = ctx.host.route;
  const page = new FullPage(ctx, () => back());
  const sync = () => {
    const route = parseRoute(nav.current());
    if (route) page.show(route);
    else {
      pushed = false;
      page.close();
    }
  };
  const back = () => {
    if (pushed) {
      pushed = false;
      nav.back();
      return;
    }
    nav.replace('');
    sync();
  };
  ctx.effect(() => nav.watch(sync));
  // 带着界面块整页的网址打开页面：软件包 `widgets` 可能比这里晚起来，起来了重开这一页
  ctx.on('service.set', (/** @type {string} */ name) => {
    if (name !== 'widgets' || !page.awaitWidgets) return;
    page.close();
    sync();
  });
  ctx.effect(() => () => page.close());
  ctx.provide('backstage', {
    /** 打开一个软件的页面（界面块的整页另带 `widget`）。 @param {string} id @param {string|null} [widget] */
    open: (id, widget = null) => {
      const next = formatRoute({ package: id, widget });
      if (nav.current() === next) return;
      pushed = true;
      nav.go(next);
    },
    /** 链接的地址（`<a href>`：按着 Ctrl、中键点开在新标签页）。 @param {string} id @param {string|null} [widget] */
    href: (id, widget = null) => formatRoute({ package: id, widget }),
    /** 软件自己的网页（`external.js`：接入通讯平台的页面服务）：听在哪个端口（没有的 `null`）、在新标签页打开（交回打不开的原因） */
    site: {
      /** @param {string} id */
      port: (id) => sitePort(ctx.core, id),
      /** @param {string} id */
      open: (id) => openSite(ctx, id),
    },
  });
  // `/im`：在新标签页打开接入通讯平台自己的网页（2026-10-19 项目主人）；打不开的在输入框上面说一句
  ctx.commands?.register({ name: 'im', summary: ctx.text('site.command') }, async () => {
    const why = await openSite(ctx, 'im');
    if (why) ctx.composer?.say(why);
  });
  sync();
}
