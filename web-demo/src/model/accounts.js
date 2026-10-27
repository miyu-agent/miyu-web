// @ts-check
//! 这台浏览器记着的账号（蓝图 `web.md`「连核心」第 1 条「选择账号」；2026-10-27 项目主人定照 QQ 电脑版「选择账号登录」，im 设计 07 第 3.6 节）：
//! `localStorage` 的 `miyu.web.accounts` 是一张表 `{v: 1, current, accounts: [{account, token?, expires?, used}]}`，`token` 只有勾了「自动登录」的才有；
//! 没勾的令牌放这个标签页的存储里（`miyu.web.session`，`{account, token, expires}`）。旧的 `miyu.web.login`（一份 `{token, expires}`）
//! 迁成一项，账号名等握手回应填上。都是纯的：读进来的字、现在的时刻交进来，交回新的表。

/** 一项：`token` 是存着的登录令牌（勾了自动登录的），`used` 是上次用的时刻（ISO），照它排先后 @typedef {{account: string, token?: string, expires?: string|null, used: string}} Saved */
/** 整张表；`current` 是上次用的那个账号 @typedef {{v: 1, current: string|null, accounts: Saved[]}} List */
/** 这个标签页的那一份 @typedef {{account: string, token: string, expires?: string|null}} Session */

/** 账号名还不知道的那一项（旧的 `miyu.web.login` 迁过来的，握手回应的 `account` 填上） */
export const UNKNOWN = '';

/** 空表 @returns {List} */
export const emptyList = () => ({ v: 1, current: null, accounts: [] });

/** 令牌还能不能用：有令牌、没写过期的或者还没过期 @param {{token?: string, expires?: string|null}|null|undefined} x @param {number} now */
export const live = (x, now) => typeof x?.token === 'string' && !!x.token && !(x.expires && Date.parse(x.expires) <= now);

/**
 * 读表：`raw` 是 `miyu.web.accounts` 的字，`old` 是旧的 `miyu.web.login` 的字（迁成一项，当成勾了自动登录）。坏的、不认的当没有。
 * @param {string|null} raw @param {string|null} [old] @param {string} [at] 迁过来的那一项记的时刻
 * @returns {List}
 */
export function readList(raw, old = null, at = new Date(0).toISOString()) {
  /** @type {List} */
  let list = emptyList();
  try {
    const got = JSON.parse(raw ?? 'null');
    if (got && got.v === 1 && Array.isArray(got.accounts)) {
      const accounts = got.accounts.filter((/** @type {any} */ a) => typeof a?.account === 'string')
        .map((/** @type {any} */ a) => ({ account: a.account, ...(typeof a.token === 'string' && a.token ? { token: a.token, expires: typeof a.expires === 'string' ? a.expires : null } : {}), used: typeof a.used === 'string' ? a.used : at }));
      list = { v: 1, current: typeof got.current === 'string' && accounts.some((/** @type {Saved} */ a) => a.account === got.current) ? got.current : null, accounts };
    }
  } catch { /* 坏的当没有 */ }
  try {
    const was = JSON.parse(old ?? 'null');
    if (typeof was?.token === 'string' && was.token && !list.accounts.some((a) => a.token === was.token)) {
      list = { ...list, current: list.current ?? UNKNOWN, accounts: [...list.accounts.filter((a) => a.account !== UNKNOWN), { account: UNKNOWN, token: was.token, expires: typeof was.expires === 'string' ? was.expires : null, used: at }] };
    }
  } catch { /* 同上 */ }
  return list;
}

/** 读这个标签页的那一份；坏的、不全的是 `null` @param {string|null} raw @returns {Session|null} */
export function readSession(raw) {
  try {
    const got = JSON.parse(raw ?? 'null');
    return typeof got?.account === 'string' && typeof got?.token === 'string' && got.token ? { account: got.account, token: got.token, expires: typeof got.expires === 'string' ? got.expires : null } : null;
  } catch { return null; }
}

/**
 * 起页面时拿哪一份令牌握手：`want`（点了的头像、左下角换过去的、带票过来的 `as`）不然表上 `current` 那个账号；这个标签页的那份是它的先用，
 * 不然用表上存着的。没有能用的交 `null`（出「选择账号」或只要密码的登录）。
 * @param {List} list @param {Session|null} session @param {number} now @param {string|null} [want]
 * @returns {{account: string, token: string}|null}
 */
export function pickLogin(list, session, now, want = null) {
  const who = want ?? list.current;
  if (who == null) return null;
  if (session && session.account === who && live(session, now)) return { account: session.account, token: session.token };
  const a = list.accounts.find((x) => x.account === who);
  return a?.token && live(a, now) ? { account: a.account, token: a.token } : null;
}

/**
 * 登录成了（握手、设密码、注册拿到登录令牌）：这个账号进表、当成 `current`；`keep`（勾了自动登录）存令牌，没勾的表上只记名字（令牌另放这个标签页）。
 * 迁过来、还不知道名字的那一项（令牌相同或者 `UNKNOWN`）换成这个名字。
 * @param {List} list @param {string} account @param {{token: string, expires?: string|null}} login @param {boolean} keep @param {string} at
 * @returns {List}
 */
export function signedIn(list, account, login, keep, at) {
  const rest = list.accounts.filter((a) => a.account !== account && a.account !== UNKNOWN && a.token !== login.token);
  /** @type {Saved} */
  const one = keep ? { account, token: login.token, expires: login.expires ?? null, used: at } : { account, used: at };
  return { v: 1, current: account, accounts: [one, ...rest] };
}

/** 握手照记着的令牌连上了（账号名照回应填上、`current` 换成它、记一下这次用的时刻；令牌不动） @param {List} list @param {string} account @param {string} token @param {string} at @returns {List} */
export function usedLogin(list, account, token, at) {
  const mine = list.accounts.find((a) => a.token === token) ?? list.accounts.find((a) => a.account === account);
  const rest = list.accounts.filter((a) => a !== mine && a.account !== account);
  /** @type {Saved} */
  const one = { account, ...(mine?.token ? { token: mine.token, expires: mine.expires ?? null } : {}), used: at };
  return { v: 1, current: account, accounts: [one, ...rest] };
}

/** 令牌用不了了（`bad_login`）：扔掉那份令牌、账号留着 @param {List} list @param {string|null} account @param {string} token @returns {List} */
export function dropToken(list, account, token) {
  return { ...list, accounts: list.accounts.filter((a) => a.account !== UNKNOWN || a.token !== token)
    .map((a) => (a.token === token || a.account === account ? { account: a.account, used: a.used } : a)) };
}

/** 从这台浏览器去掉一个账号（账号管理） @param {List} list @param {string} account @returns {List} */
export function removeAccount(list, account) {
  return { v: 1, current: list.current === account ? null : list.current, accounts: list.accounts.filter((a) => a.account !== account) };
}

/** 换到一个账号（左下角的菜单、点头像）：`current` 换成它 @param {List} list @param {string|null} account @returns {List} */
export function chooseAccount(list, account) {
  return { ...list, current: account };
}

/** 「选择账号」那一排：照上次用的先后，名字还不知道的不列；`saved` 是存着能用的令牌（点了直接进） @param {List} list @param {number} now */
export function shownAccounts(list, now) {
  return [...list.accounts].filter((a) => a.account !== UNKNOWN).sort((a, b) => b.used.localeCompare(a.used))
    .map((a) => ({ account: a.account, saved: live(a, now) }));
}

/** 头像上画的字：账号名的首字（大写），空的画「?」（账号有头像以后换，im 设计 07 第 4.6 节第 8 样） @param {string} account */
export const initialOf = (account) => ([...account.trim()][0] ?? '?').toUpperCase();

/** 重新载入以后要做什么（左下角菜单点的，放这个标签页的 `miyu.web.intent`，读一次就拿掉）：`add` 直接出登录框、`manage` 出账号管理、`pick` 是换到的账号 @typedef {{add: true}|{manage: true}|{pick: string}} Intent */

/** 读那份打算；坏的、不认的是 `null` @param {string|null} raw @returns {Intent|null} */
export function readIntent(raw) {
  try {
    const got = JSON.parse(raw ?? 'null');
    if (got?.add === true) return { add: true };
    if (got?.manage === true) return { manage: true };
    return typeof got?.pick === 'string' ? { pick: got.pick } : null;
  } catch { return null; }
}
