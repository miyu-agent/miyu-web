// @ts-check
//! 浏览器的第二份宿主：页面由网页软件 `miyu-web` 给（`miyu web` 打开的；蓝图 `web/architecture.md`「浏览器的第二份宿主」、`web.md`「连核心」
//! 第 1 条下面几款、`web-module.md` 第一条）。和走桥的那一份只差连法：
//! - 线是 `/ws`，身份在握手里（核心 SU-1：只有主人一个人，2026-10-28 项目主人定）：地址带 `#setup=<一次性码>` 的读下来、从地址栏抹掉，握手带
//!   `code`；带 `#ticket=<票>` 的（`miyu web`、im 网页的「打开主网页」开的）先用记着的设备令牌、作废了再用票；都没有的用这台浏览器记着的设备令牌
//!   （`login`）；再没有的交 `null`，内核出「输入访问密码」，握手带 `password`。勾了「自动登录」的令牌存 `localStorage` 的 `miyu.web.login`（30 天），
//!   没勾的只放这个标签页（`sessionStorage` 的 `miyu.web.session`）；读写都兜着。原来多账号时的 `miyu.web.accounts` 读到时照上次用的那个账号的令牌迁成一份。
//! - 本机文件、blob 的地址带设备令牌 `POST /media` 换票据（`web-ui.md`「怎么走」第三条）；同一样东西换过的记着，不再换。软件后台页 `POST /page`。
//! - 选目录、桌面壁纸网页软件不给：交 `null`，用的地方照旧退回。

/**
 * @typedef {import('./files.js').FileRef} FileRef
 * @typedef {import('./files.js').Channel} Channel
 */

import { notify } from './notify.js';
import { fileTools, store, dropFromHash, hashRoute } from './files.js';

/** 这台浏览器记着的设备令牌（勾了「自动登录」的）：`{token, expires}` */
const LOGIN = 'miyu.web.login';
/** 这个标签页的那一份（没勾的）：`{token, expires}` */
const SESSION = 'miyu.web.session';
/** 原来多账号时的表（迁一次就删） */
const OLD_ACCOUNTS = 'miyu.web.accounts';
/** 记着的头像（核心 AV-1，只有主人那一张）：`{v, img}`，`v` 是核心给的版本，`img` 是缩成 96 像素见方的 data URL */
const AVATAR = 'miyu.web.avatar';
/** 原来多账号时上次用的那个账号（本地存储照它搬完才删，`kernel/storage.js`；页面起到一半出错的下次照样搬） */
const FORMER = 'miyu.web.former';
/** 原来按账号记的头像（迁一次就删） */
const OLD_AVATARS = 'miyu.web.avatars';
/** 小图的边长 */
const THUMB = 96;

/** 把一张图缩成头像小图（居中裁成正方形，WebP，存不了的浏览器给 PNG） @param {Blob} blob @returns {Promise<string>} */
async function thumbnail(blob) {
  const bitmap = await createImageBitmap(blob);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = THUMB;
  canvas.height = THUMB;
  canvas.getContext('2d')?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, THUMB, THUMB);
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.85);
}

/** base64 换回 Blob @param {string} data @param {string} type */
const fromBase64 = (data, type) => new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type });

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

/** 读一份 `{token, expires}`；坏的、不全的、过期了的是 `null` @param {string|null} raw @param {number} now */
export function readLogin(raw, now) {
  try {
    const got = JSON.parse(raw ?? 'null');
    if (typeof got?.token !== 'string' || !got.token) return null;
    const expires = typeof got.expires === 'string' ? got.expires : null;
    return expires && Date.parse(expires) <= now ? null : { token: got.token, expires };
  } catch { return null; }
}

/**
 * 原来多账号时的表（`{v: 1, current, accounts: [{account, token?, expires?, used}]}`）迁成一份：上次用的那个账号（`current`）存着的令牌，
 * 没有的照最近用过、存着令牌的那一个；都没有的是 `null`。纯的。
 * @param {string|null} raw @param {number} now
 * @returns {{token: string, expires: string|null, account: string|null}|null}
 */
export function migrateAccounts(raw, now) {
  try {
    const got = JSON.parse(raw ?? 'null');
    if (!got || !Array.isArray(got.accounts)) return null;
    const saved = got.accounts.filter((/** @type {any} */ a) => readLogin(JSON.stringify(a), now));
    const pick = saved.find((/** @type {any} */ a) => a.account === got.current)
      ?? [...saved].sort((/** @type {any} */ a, /** @type {any} */ b) => String(b.used ?? '').localeCompare(String(a.used ?? '')))[0];
    return pick ? { token: pick.token, expires: typeof pick.expires === 'string' ? pick.expires : null, account: typeof pick.account === 'string' ? pick.account : null } : null;
  } catch { return null; }
}

/** 地址里的一次性码：读下来、从地址栏抹掉（刷新以后就没了：码只能用一次）；`#` 后面别的几项（软件页面的 `package=`）留着。 */
function setupCode() {
  const m = location.hash.match(/(?:^#|&)setup=([0-9a-f]+)/);
  if (!m) return null;
  dropFromHash(['setup']);
  return m[1];
}

/**
 * 地址里的交接票（`#ticket=<票>`，`miyu web`、im 网页的「打开主网页」开的；原来多账号时还带 `as=<账号>`，一起抹掉不用）：读下来、从地址栏
 * 抹掉这两项（别的几项留着）；票不对的当没有。
 * @returns {string|null}
 */
function handoff() {
  const q = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (!q.has('ticket') && !q.has('as')) return null;
  dropFromHash(['ticket', 'as']);
  const ticket = q.get('ticket') ?? '';
  return /^[0-9a-f]{16,128}$/.test(ticket) ? ticket : null;
}

/** 起直接连网页软件的宿主（地址里没有桥的口令时用它）。 */
export function servedHost() {
  let code = setupCode();
  const now = () => Date.now();
  // 原来多账号的那张表：上次用的那个账号的令牌迁成一份，表删掉（核心 SU-1）
  const old = disk.get(OLD_ACCOUNTS);
  /** 原来上次用的那个账号（这台设备上按账号分存的东西照它搬，`kernel/storage.js`） @type {string|null} */
  let former = disk.get(FORMER);
  if (old != null) {
    const moved = migrateAccounts(old, now());
    former = moved?.account ?? (() => { try { return JSON.parse(old)?.current ?? null; } catch { return null; } })();
    if (former) disk.set(FORMER, former);
    if (moved && !readLogin(disk.get(LOGIN), now())) disk.set(LOGIN, JSON.stringify({ token: moved.token, expires: moved.expires }));
    try {
      const pics = JSON.parse(disk.get(OLD_AVATARS) ?? 'null');
      const pic = moved?.account ? pics?.[moved.account] : null;
      if (pic?.v && pic?.img && disk.get(AVATAR) == null) disk.set(AVATAR, JSON.stringify(pic));
    } catch { /* 坏的不迁 */ }
    disk.remove(OLD_ACCOUNTS);
    disk.remove(OLD_AVATARS);
  }
  /** 带票过来的：记着的令牌先用、作废了再用票 */
  let ticket = code ? null : handoff();
  /** 这一次握手交的是票 */
  let usedTicket = false;
  /** 这个标签页的那份先用，再用存着的 */
  let token = readLogin(tab.get(SESSION), now())?.token ?? readLogin(disk.get(LOGIN), now())?.token ?? null;
  /** 记着的令牌原来是存在这台浏览器里的（勾过「自动登录」）：拿票换到的照旧存 */
  const wasKept = readLogin(disk.get(LOGIN), now()) != null;
  /** 扔掉现在这一份令牌（作废了、退出登录） */
  const dropCurrent = () => {
    if (token) {
      const gone = token;
      if (readLogin(disk.get(LOGIN), now())?.token === gone) disk.remove(LOGIN);
      if (readLogin(tab.get(SESSION), now())?.token === gone) tab.remove(SESSION);
    }
    token = null;
    tickets.clear();
  };
  /** 记着的头像（坏的当没有） @returns {{v: string, img: string}|null} */
  const readAvatar = () => {
    try {
      const got = JSON.parse(disk.get(AVATAR) ?? 'null');
      return typeof got?.v === 'string' && typeof got?.img === 'string' ? got : null;
    } catch { return null; }
  };
  /** @type {Set<() => void>} */
  const avatarWatchers = new Set();
  /** 记下、扔掉头像，叫一声 @param {{v: string, img: string}|null} one */
  const putAvatar = (one) => {
    if (one) disk.set(AVATAR, JSON.stringify(one));
    else disk.remove(AVATAR);
    for (const fn of avatarWatchers) fn();
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
    /** 原来多账号时上次用的那个账号：这台设备上按账号分存的东西照它搬一次 */
    formerAccount: former,
    /** 本地存储搬完了：不再记那个账号 */
    formerMoved: () => disk.remove(FORMER),
    /** 开一条到核心的线（网页软件照转）。 */
    channel: () => /** @type {Channel} */ (/** @type {unknown} */ (new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`))),
    urls,
    /**
     * 握手带的凭据：一次性码（只用一次）、记着的设备令牌、交接票（只用一次，记着的令牌没有、作废了才用）；都没有的是 `null`（内核出「输入访问密码」）。
     * @returns {{code: string}|{login: string}|{ticket: string}|null}
     */
    credential: () => {
      if (code) {
        const c = code;
        code = null;
        return { code: c };
      }
      usedTicket = false;
      if (token) return { login: token };
      if (ticket) {
        const one = ticket;
        ticket = null;
        usedTicket = true;
        return { ticket: one };
      }
      return null;
    },
    /**
     * 握手、设密码拿到的设备令牌（`{token, expires}`）：记下，以后握手、换票据都用它。`keep`（勾了「自动登录」）的存进这台浏览器，没勾的放这个标签页；
     * 拿票换到的：原来存在浏览器里的照旧存。
     * @param {{token: string, expires?: string|null}} login @param {boolean} keep
     */
    remember: (login, keep) => {
      if (usedTicket) keep = keep || wasKept;
      usedTicket = false;
      token = login.token;
      tickets.clear();
      const one = JSON.stringify({ token: login.token, expires: login.expires ?? null });
      if (keep) {
        disk.set(LOGIN, one);
        tab.remove(SESSION);
      } else {
        tab.set(SESSION, one);
        disk.remove(LOGIN);
      }
    },
    /** 设备令牌用不了了（`bad_login`）：扔掉这一份 */
    forget: () => dropCurrent(),
    /**
     * 头像（核心 AV-1，只有主人那一张）：`sync` 握手以后对一下版本（不一样的照 `fetch` 取一次、缩成小图记下，握手没带的扔掉）；`put` 自己改了以后记下
     * （`null` 是移除）；`get` 读记着的小图；`version` 记着的版本；`watch` 换了叫一声（「访问」页照它重画）。
     */
    avatar: {
      get: () => readAvatar()?.img ?? null,
      version: () => readAvatar()?.v ?? null,
      /** @param {string|null} version @param {() => Promise<any>} fetch */
      sync: async (version, fetch) => {
        const had = readAvatar();
        if (!version) {
          if (had) putAvatar(null);
          return;
        }
        if (had?.v === version) return;
        const got = await fetch().catch(() => null);
        if (typeof got?.data !== 'string' || typeof got?.avatar !== 'string') return;
        const img = await thumbnail(fromBase64(got.data, got.media_type ?? 'image/png')).catch(() => null);
        if (img) putAvatar({ v: got.avatar, img });
      },
      /** @param {string|null} version @param {Blob|null} image */
      put: async (version, image) => {
        if (!version || !image) return putAvatar(null);
        const img = await thumbnail(image).catch(() => null);
        if (img) putAvatar({ v: version, img });
      },
      /** @param {() => void} fn */
      watch: (fn) => { avatarWatchers.add(fn); return () => avatarWatchers.delete(fn); },
    },
    /** 问口令还对不对：直接连的没有桥的口令，连不上就是网页软件没在跑 */
    check: async () => /** @type {'ok'|'bad'|'down'} */ ('down'),
    /** 能退出登录（拿设备令牌连的）：扔掉这一份令牌，重新载入出「输入访问密码」 */
    signOut: () => {
      dropCurrent();
      location.reload();
    },
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
