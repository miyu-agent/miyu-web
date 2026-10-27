// @ts-check
//! 浏览器的第二份宿主：页面由网页软件 `miyu-web` 给（`miyu web` 打开的；蓝图 `web/architecture.md`「浏览器的第二份宿主」、`web.md`「连核心」
//! 第 1 条下面几款、`web-module.md` 第一条）。和走桥的那一份只差连法：
//! - 线是 `/ws`，身份在握手里：地址带 `#setup=<一次性码>` 的读下来、从地址栏抹掉，握手带 `code`；没有的用这台浏览器记着的登录令牌
//!   （`login`）；都没有的交 `null`，内核出「选择账号」、登录框，握手带用户名、密码。记着几个账号（`model/accounts.js`，蓝图「连核心」第 1 条
//!   「选择账号」）：勾了「自动登录」的令牌存 `localStorage` 的表里（30 天），没勾的只放这个标签页（`sessionStorage`）；读写都兜着。
//! - 本机文件、blob 的地址带登录令牌 `POST /media` 换票据（`web-ui.md`「怎么走」第三条）；同一样东西换过的记着，不再换。软件后台页 `POST /page`。
//! - 选目录、桌面壁纸网页软件不给：交 `null`，用的地方照旧退回。

/**
 * @typedef {import('./files.js').FileRef} FileRef
 * @typedef {import('./files.js').Channel} Channel
 */

import { notify } from './notify.js';
import { fileTools, store, dropFromHash, hashRoute } from './files.js';
import { readList, readSession, readIntent, pickLogin, signedIn, usedLogin, dropToken, removeAccount, chooseAccount, shownAccounts, live, UNKNOWN } from '../model/accounts.js';

/** 这台浏览器记着的账号（`model/accounts.js` 的表）；原来那一份（`{token, expires}`）读到时迁进表、删掉 */
const ACCOUNTS = 'miyu.web.accounts';
const OLD_LOGIN = 'miyu.web.login';
/** 这个标签页的：没勾「自动登录」的那份令牌（`{account, token, expires}`）、重新载入以后要做什么（左下角菜单点的，读一次就拿掉） */
const SESSION = 'miyu.web.session';
const INTENT = 'miyu.web.intent';

/**
 * 读写都兜着：隐私窗口、清过数据、禁了存储的会抛，抛了的当没有、写不进的只管这一次。
 * @param {() => {getItem: (k: string) => string|null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void}} which
 */
const safe = (which) => ({
  get: (/** @type {string} */ k) => { try { return which().getItem(k); } catch { return null; } },
  set: (/** @type {string} */ k, /** @type {string} */ v) => { try { which().setItem(k, v); return true; } catch { return false; } },
  remove: (/** @type {string} */ k) => { try { which().removeItem(k); } catch { /* 同上 */ } },
});
const disk = safe(() => store);
const tab = safe(() => sessionStorage);

/** 地址里的一次性码：读下来、从地址栏抹掉（刷新以后就没了：码只能用一次）；`#` 后面别的几项（软件页面的 `package=`）留着。 */
function setupCode() {
  const m = location.hash.match(/(?:^#|&)setup=([0-9a-f]+)/);
  if (!m) return null;
  dropFromHash(['setup']);
  return m[1];
}

/**
 * 地址里的交接票（`#ticket=<票>&as=<账号>`，im 设计 07 第 3.6 节、网页-乙：`miyu web`、im 网页的「打开主网页」开的）：读下来、从地址栏抹掉
 * 这两项（别的几项留着）；票不对的、没写账号的当没有。
 * @returns {{ticket: string, as: string}|null}
 */
function handoff() {
  const q = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (!q.has('ticket') && !q.has('as')) return null;
  dropFromHash(['ticket', 'as']);
  const ticket = q.get('ticket') ?? '';
  const as = q.get('as') ?? '';
  return /^[0-9a-f]{16,128}$/.test(ticket) && as ? { ticket, as } : null;
}

/** 地址里的邀请码（核心 Y-1 上，管理员给的注册链接 `#invite=<码>`）：读下来、从地址栏抹掉；握手带它、只能注册。 */
function inviteCode() {
  const m = location.hash.match(/(?:^#|&)invite=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  dropFromHash(['invite']);
  return m[1];
}

/** 起直接连网页软件的宿主（地址里没有桥的口令时用它）。 */
export function servedHost() {
  let code = setupCode();
  let invite = inviteCode();
  const stamp = () => new Date().toISOString();
  /** 读表（别的标签页可能改过，每次现读）；有旧的那一份的迁进来 */
  const load = () => readList(disk.get(ACCOUNTS), disk.get(OLD_LOGIN), stamp());
  /** 改表：现读、改、写回；写进去了才删旧的那一份 @param {(l: import('../model/accounts.js').List) => import('../model/accounts.js').List} change */
  const update = (change) => {
    if (disk.set(ACCOUNTS, JSON.stringify(change(load())))) disk.remove(OLD_LOGIN);
  };
  if (disk.get(OLD_LOGIN) != null) update((l) => l);
  const intent = readIntent(tab.get(INTENT));
  tab.remove(INTENT);
  let session = readSession(tab.get(SESSION));
  // 带票过来的：存着 `as` 那个账号的令牌先用它，`bad_login` 了再用票（`forget`）；没存的直接用票。换到的令牌：这个账号原来勾过
  // 「自动登录」（表里存过令牌）的照旧存进表，别的只放这个标签页
  const handed = code || invite ? null : handoff();
  /** 还没用的票 @type {string|null} */
  let ticket = handed?.ticket ?? null;
  const ticketKeep = !!handed && !!load().accounts.find((a) => a.account === handed.as)?.token;
  /** 这一次握手交的是票 */
  let usedTicket = false;
  // 「添加账号」「账号管理」过来的不拿记着的令牌（出登录框、账号管理）；左下角换过去的照那个账号
  const picked = handed ? pickLogin(load(), session, Date.now(), handed.as)
    : intent && !('pick' in intent) ? null : pickLogin(load(), session, Date.now(), intent && 'pick' in intent ? intent.pick : null);
  let token = picked?.token ?? null;
  /** 这份令牌是哪个账号的（`UNKNOWN` 是旧的那一份迁过来、还不知道名字） @type {string|null} */
  let who = picked?.account ?? null;
  /** 重新载入（换账号、添加、管理）：先记下要做什么 @param {import('../model/accounts.js').Intent} next */
  const reloadFor = (next) => {
    tab.set(INTENT, JSON.stringify(next));
    location.reload();
  };
  /** 扔掉现在这一份令牌（作废了、退出登录）：表上那个账号留着；交回是哪个账号的（不知道名字的交 `null`） */
  const dropCurrent = () => {
    const was = who;
    if (token) {
      const gone = token;
      update((l) => dropToken(l, was, gone));
      if (session?.token === gone) {
        session = null;
        tab.remove(SESSION);
      }
    }
    token = null;
    tickets.clear();
    return was === UNKNOWN ? null : was;
  };
  /** 换过的票据：同一样东西不再换 @type {Map<string, Promise<string>>} */
  const tickets = new Map();
  /** 带着登录令牌 `POST` 一下，交回回应里的 `url`；换不到的交空的。 @param {string} path @param {any} body */
  const post = async (path, body) => {
    if (!token) return '';
    try {
      const got = await fetch(path, { method: 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!got.ok) return '';
      const reply = await got.json();
      return typeof reply?.url === 'string' ? reply.url : '';
    } catch { return ''; }
  };
  /** 换一张 `/media` 的票据（换不到的不记，下次再换） @param {any} body */
  const media = (body) => {
    const sig = JSON.stringify(body);
    if (!tickets.has(sig)) {
      tickets.set(sig, post('/media', body).then((url) => {
        if (!url) tickets.delete(sig);
        return url;
      }));
    }
    return /** @type {Promise<string>} */ (tickets.get(sig));
  };
  /** @type {import('./files.js').Urls} */
  const urls = {
    file: (path, download = false) => media({ path, ...(download ? { download: true } : {}) }),
    blob: (hash, type, how = {}) => media({ blob: hash, type, ...(how.download ? { download: true } : {}), ...(how.download && how.name ? { name: how.name } : {}) }),
  };
  return {
    kind: 'served',
    /** 开一条到核心的线（网页软件照转）。 */
    channel: () => /** @type {Channel} */ (/** @type {unknown} */ (new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`))),
    urls,
    /**
     * 握手带的凭据：一次性码、邀请码（都只用一次）、记着的登录令牌、交接票（只用一次）；都没有的是 `null`（内核出登录框）。
     * @returns {{code: string}|{invite: string}|{login: string}|{ticket: string}|null}
     */
    credential: () => {
      if (code) {
        const c = code;
        code = null;
        return { code: c };
      }
      if (invite) {
        const i = invite;
        invite = null;
        return { invite: i };
      }
      usedTicket = false;
      if (token) return { login: token };
      // 交接票（只用一次）：存着的令牌没有、作废了才用它
      if (ticket) {
        const one = ticket;
        ticket = null;
        usedTicket = true;
        return { ticket: one };
      }
      return null;
    },
    /**
     * 握手、设密码、注册拿到的登录令牌（`{token, expires}`）：记下，以后握手、换票据都用它。这个账号进表、当成上次用的；`keep`（勾了「自动登录」）
     * 的令牌存进表，没勾的放这个标签页。
     * @param {{token: string, expires?: string|null}} login @param {string} account @param {boolean} keep
     */
    remember: (login, account, keep) => {
      // 拿票换到的：原来勾过「自动登录」的照旧存（上面 `ticketKeep`）
      if (usedTicket) keep = keep || ticketKeep;
      usedTicket = false;
      token = login.token;
      who = account;
      tickets.clear();
      update((l) => signedIn(l, account, login, keep, stamp()));
      session = keep ? null : { account, token: login.token, expires: login.expires ?? null };
      if (session) tab.set(SESSION, JSON.stringify(session));
      else tab.remove(SESSION);
    },
    /** 拿记着的令牌连上了：握手回应的账号名填上（旧的那一份迁过来的）、记一下这次用的 @param {string} account */
    signedIn: (account) => {
      if (!token || typeof account !== 'string' || !account) return;
      const used = token;
      who = account;
      update((l) => usedLogin(l, account, used, stamp()));
    },
    /** 登录令牌用不了了（`bad_login`）：扔掉这一份、账号留着；交回是哪个账号的（内核出只要密码的登录） */
    forget: () => dropCurrent(),
    /** 「选择账号」那一排（照上次用的先后，`saved` 是存着能用的令牌）、上次用的那个 */
    accounts: () => {
      const l = load();
      return { current: l.current, list: shownAccounts(l, Date.now()) };
    },
    /** 重新载入前点的（左下角菜单）：`add` 出登录框、`manage` 出账号管理、`pick` 换到的那个账号 */
    intent: () => intent,
    /** 点了一个头像：拿它存着的令牌（有的交 `true`，下一次 `credential` 就是它；没有的交 `false`，内核出只要密码的登录） @param {string} account */
    choose: (account) => {
      const got = pickLogin(load(), session, Date.now(), account);
      token = got?.token ?? null;
      who = got ? account : null;
      tickets.clear();
      return !!got;
    },
    /**
     * 从这台浏览器去掉一个账号（账号管理）：从表上、这个标签页拿掉，交回它存着的几份令牌的握手凭据（内核拿它们开线 `account.logout`，成不成都算去掉了）。
     * @param {string} account @returns {{login: string}[]}
     */
    dropAccount: (account) => {
      const now = Date.now();
      const l = load();
      const saved = l.accounts.find((a) => a.account === account);
      const tokens = new Set([saved && live(saved, now) ? saved.token : null, session?.account === account && live(session, now) ? session.token : null]);
      update((x) => removeAccount(x, account));
      if (session?.account === account) {
        session = null;
        tab.remove(SESSION);
      }
      if (who === account) {
        token = null;
        who = null;
        tickets.clear();
      }
      return [...tokens].filter((x) => typeof x === 'string').map((x) => ({ login: /** @type {string} */ (x) }));
    },
    /** 换到另一个账号（左下角的菜单）：当成上次用的，重新载入（存着令牌的直接进，没存的出只要密码的登录） @param {string} account */
    switchTo: (account) => {
      update((l) => chooseAccount(l, account));
      reloadFor({ pick: account });
    },
    /** 添加账号：重新载入直接出登录框（这一个标签页的令牌留着，回来还能点它） */
    addAccount: () => reloadFor({ add: true }),
    /** 账号管理：重新载入出账号管理 */
    manageAccounts: () => reloadFor({ manage: true }),
    /** 问口令还对不对：直接连的没有桥的口令，连不上就是网页软件没在跑 */
    check: async () => /** @type {'ok'|'bad'|'down'} */ ('down'),
    /** 能退出登录（拿登录令牌连的）：扔掉这个账号的令牌（账号留在表上），重新载入出「选择账号」 */
    signOut: () => {
      dropCurrent();
      location.reload();
    },
    /** 注册链接：这个网页的地址加 `#invite=<邀请码>`（账号页的「邀请」，核心 Y-1 上） @param {string} code */
    inviteLink: (code) => `${location.origin}/#invite=${encodeURIComponent(code)}`,
    files: {
      ...fileTools(urls),
      /** 选目录：网页软件不给，用的地方退回自己画的文件夹浏览器 */
      pickDir: async (/** @type {{title?: string, start?: string}} */ opts) => null,
    },
    /** 软件的页面：带着登录令牌换票据，交回框的地址；换不到的交 `null` */
    pages: { open: async (/** @type {string} */ id) => (await post('/page', { package: id })) || null },
    /** 网页自己的路由（`#` 后面那一段） */
    route: hashRoute(),
    /** 桌面壁纸：网页软件不给 */
    wallpaper: async (/** @type {boolean} */ dark) => null,
    wallpaperChanges: (/** @type {() => void} */ changed) => () => {},
    open: (/** @type {string} */ url) => {
      // 不写 noopener：写了的 window.open 一律回 null，看不出被浏览器拦了没有；开了马上断掉 opener，同 noopener
      const tab = window.open(url, '_blank');
      if (tab) tab.opener = null;
      return !!tab;
    },
    /** 重新载入页面 */
    restart: () => location.reload(),
    intercept: (/** @type {HTMLElement} */ root) => () => {},
    // 写字；写一张图（灯箱的「复制图片」，PNG：剪贴板普遍只收它）
    clipboard: { write: (/** @type {string} */ text) => navigator.clipboard.writeText(text), image: (/** @type {Blob} */ png) => navigator.clipboard.write([new ClipboardItem({ [png.type]: png })]) },
    // 系统通知（`notify.js`）
    notify,
    store,
  };
}
