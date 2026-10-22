// @ts-check
//! 浏览器的第二份宿主：页面由网页软件 `miyu-web` 给（`miyu web` 打开的；蓝图 `web/architecture.md`「浏览器的第二份宿主」、`web.md`「连核心」
//! 第 1 条下面几款、`web-module.md` 第一条）。和走桥的那一份只差连法：
//! - 线是 `/ws`，身份在握手里：地址带 `#setup=<一次性码>` 的读下来、从地址栏抹掉，握手带 `code`；没有的用这台设备上记着的登录令牌
//!   （`login`，30 天）；都没有的交 `null`，内核出登录框，握手带用户名、密码。登录令牌不出这个文件（内核只拿到「记下」「忘掉」两个口子）。
//! - 本机文件、blob 的地址带登录令牌 `POST /media` 换票据（`web-ui.md`「怎么走」第三条）；同一样东西换过的记着，不再换。软件后台页 `POST /page`。
//! - 选目录、桌面壁纸网页软件不给：交 `null`，用的地方照旧退回。

/**
 * @typedef {import('./files.js').FileRef} FileRef
 * @typedef {import('./files.js').Channel} Channel
 */

import { notify } from './notify.js';
import { fileTools, store, dropFromHash, hashRoute } from './files.js';

/** 这台设备上记登录令牌的名字（`{token, expires}`） */
const LOGIN = 'miyu.web.login';

/** 地址里的一次性码：读下来、从地址栏抹掉（刷新以后就没了：码只能用一次）；`#` 后面别的几项（软件页面的 `package=`）留着。 */
function setupCode() {
  const m = location.hash.match(/(?:^#|&)setup=([0-9a-f]+)/);
  if (!m) return null;
  dropFromHash(['setup']);
  return m[1];
}

/** 地址里的邀请码（核心 Y-1 上，管理员给的注册链接 `#invite=<码>`）：读下来、从地址栏抹掉；握手带它、只能注册。 */
function inviteCode() {
  const m = location.hash.match(/(?:^#|&)invite=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  dropFromHash(['invite']);
  return m[1];
}

/** 记着的登录令牌：没有、过期了的是 `null`。 */
function savedLogin() {
  try {
    const got = JSON.parse(store.getItem(LOGIN) ?? 'null');
    if (typeof got?.token !== 'string') return null;
    if (got.expires && Date.parse(got.expires) <= Date.now()) return null;
    return got.token;
  } catch { return null; }
}

/** 起直接连网页软件的宿主（地址里没有桥的口令时用它）。 */
export function servedHost() {
  let code = setupCode();
  let invite = inviteCode();
  let token = savedLogin();
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
     * 握手带的凭据：一次性码、邀请码（都只用一次）、记着的登录令牌；都没有的是 `null`（内核出登录框）。
     * @returns {{code: string}|{invite: string}|{login: string}|null}
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
      return token ? { login: token } : null;
    },
    /** 握手、设密码拿到的登录令牌（`{token, expires}`）：记下，以后握手、换票据都用它。 @param {{token: string, expires?: string}} login */
    remember: (login) => {
      token = login.token;
      tickets.clear();
      try { store.setItem(LOGIN, JSON.stringify({ token: login.token, expires: login.expires ?? null })); } catch { /* 记不住就只管这一次 */ }
    },
    /** 登录令牌用不了了（`bad_login`）：忘掉，下次出登录框。 */
    forget: () => {
      token = null;
      tickets.clear();
      try { store.removeItem(LOGIN); } catch { /* 同上 */ }
    },
    /** 问口令还对不对：直接连的没有桥的口令，连不上就是网页软件没在跑 */
    check: async () => /** @type {'ok'|'bad'|'down'} */ ('down'),
    /** 能退出登录（拿登录令牌连的）：忘掉这台设备上的登录令牌，重新载入出登录框 */
    signOut: () => {
      token = null;
      try { store.removeItem(LOGIN); } catch { /* 记不住的本来就没记 */ }
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
