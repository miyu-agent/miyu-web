// @ts-check
//! 打开时去哪（`miyu web --session <编号>`、`--settings [<分页>]`，蓝图 `web-ui.md`「怎么走」第二条第 9 款，W-1085：托盘程序点通知回到那个会话、
//! 开设置、开设置里「访问」那一组）：网址 `#` 后面的 `session=<编号>`、`settings=<分页>`。这两项是一次性的去处，读的包（`app`、`settings`）读完
//! 照 `without` 从地址栏抹掉；`#` 后面别的几项（软件页面的 `package=`、`widget=`）留着。纯的。

/** 会话编号的写法（核心的 UUID，同 `miyu web --session`） */
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 分页的写法（同包编号、`miyu web --settings`）；空的是设置的首页 */
const PAGE = /^[A-Za-z0-9_.-]{0,64}$/;

/** 设置里「访问」那一组（「通用」页里的一组，不是一页） */
export const ACCESS = 'access';

/**
 * 网址的 `#` 后面点名了哪个会话；没有、写法不对的是 `null`。
 * @param {string} hash `location.hash`（带不带 `#` 都行）
 * @returns {string|null}
 */
export function sessionOf(hash) {
  const id = new URLSearchParams(hash.replace(/^#/, '')).get('session');
  return id && SESSION.test(id) ? id : null;
}

/**
 * 网址的 `#` 后面要开设置的哪一页：空字是首页，`access` 是「通用」里「访问」那一组；没写、写法不对的是 `null`。
 * @param {string} hash
 * @returns {string|null}
 */
export function settingsOf(hash) {
  const page = new URLSearchParams(hash.replace(/^#/, '')).get('settings');
  return page !== null && PAGE.test(page) ? page : null;
}

/**
 * 去掉这几项以后的 `#` 那一段（带 `#`）；什么都不剩的是空字（交给宿主的 `route.replace` 去掉整个 `#`）。
 * @param {string} hash @param {string[]} keys
 */
export function without(hash, keys) {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  for (const k of keys) q.delete(k);
  const rest = q.toString();
  return rest ? `#${rest}` : '';
}
