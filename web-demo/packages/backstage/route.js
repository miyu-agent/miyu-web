// @ts-check
//! 软件页面的网址（软件包 `backstage`，蓝图 `web.md`「软件的页面」第 1 条）：`#package=<编号>`，界面块的整页另带 `&widget=<编号>`（核心
//! `widgets.md`）。编号只认字母、数字、`-`、`_`、`.`，1 到 64 个（同 `miyu web --package`）。`#` 后面别的几项（桥的口令、一次性码）不归这里，
//! 宿主读完就抹掉。纯的。

const ID = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * 网址的 `#` 后面点名了哪个软件的页面；没有、写法不对的是 `null`。
 * @param {string} hash `location.hash`（带不带 `#` 都行）
 * @returns {{package: string, widget: string|null}|null}
 */
export function parseRoute(hash) {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const id = q.get('package');
  if (!id || !ID.test(id)) return null;
  const widget = q.get('widget');
  return { package: id, widget: widget && ID.test(widget) ? widget : null };
}

/**
 * 写成 `#` 后面那一段。
 * @param {{package: string, widget?: string|null}} route
 */
export function formatRoute(route) {
  return `#package=${route.package}${route.widget ? `&widget=${route.widget}` : ''}`;
}

/**
 * 点名的这个包的后台页是不是由它自己的服务提供（发版前 check 14，W-1120）：`package.list` 带 `page_server` 的是（核心 BP-1）；旧核心上
 * 没有后台页、`status` 问得到端口的也算（接入通讯平台以前就是这样）；有后台页、没写 `page_server` 的不是，不问端口。
 * @param {any} p `package.list` 里的这一项（没列着的是 `undefined`） @param {() => Promise<number|null>} probe 问它的端口
 * @returns {Promise<boolean>}
 */
export async function servesItself(p, probe) {
  if (p?.page_server) return true;
  if (p?.page) return false;
  return (await probe()) != null;
}
