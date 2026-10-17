// @ts-check
//! 浏览器这个宿主（蓝图 `web/architecture.md`「宿主」，照 Linux 的 `arch/`）：和平台有关的都在这一份里，页面、内核、软件包
//! 不直接碰（测试照源码查）。以后桌面端（Tauri）加一份 `tauri.js`，交出一样的东西，别处不动。
//!
//! 现在经桥（`web-demo/bridge/`）：
//! - 访问口令：桥起来时打出的网址带着 `#k=…`；拿到以后从地址栏抹掉，记在这个标签页的 sessionStorage 里，刷新还能连
//!   （设计 21 X6：放在 `#` 后面，不发给服务器、不进 Referer）。口令不出这个文件。
//! - 连核心的线是一条 WebSocket（`/ws`）；本机文件、blob（链接卡片的配图、图标也是 blob）的地址是桥的 `/file`、`/blob`；
//!   附件的字节从浏览器的文件里切一段读出来（`files.read`），页面分块传给核心（蓝图 `web.md`「附件」第 2 条，核心施工 W-5）。
//! - 链接照网页的写法（`target=_blank`、`download`），浏览器自己会办，`intercept` 什么都不做。
//! - 选目录：浏览器给不了本机路径，请桥开系统的选目录对话框（`/pick-dir`，桥的 `dialog.rs`）；页面开在别的机器上的（地址不是本机）
//!   不请，对话框会开在桥那台机器上、人看不到。
//! - 软件后台页：带着口令 `POST /page` 请桥造一张票据，交回框的地址（地址里只有票据，框里的页面读得到自己的地址，口令不能给它）。
//! - 桌面壁纸（主题「跟随壁纸」）：浏览器读不到桌面，请桥读（`/wallpaper`，crate `miyu-wallpaper`，matugen 生成的那份颜色优先）；
//!   换没换开一条 `/wallpaper/events`，桥盯着壁纸来处的文件、变了推一条（不轮询）。页面开在别的机器上的不请。
//! - 网址 `#` 后面的口令读完就抹掉，别的几项留着：`miyu web --package <编号>` 打出的 `package=<编号>` 由软件包 `backstage` 照它开软件的页面。

/**
 * @typedef {import('./files.js').FileRef} FileRef
 * @typedef {import('./files.js').Channel} Channel
 * @typedef {import('./files.js').Store} Store
 */

import { fileTools, store, onThisMachine, dropFromHash, hashRoute } from './files.js';

const KEY = 'miyu.web.bridge-key';

/** 这个标签页有没有桥的口令：地址里带着的先记下、从地址栏抹掉；没带的用记着的。都没有是 `null`。 */
function bridgeKey() {
  const m = location.hash.match(/k=([0-9a-f]+)/);
  if (m) {
    try { sessionStorage.setItem(KEY, m[1]); } catch { /* 记不住就只管这一次 */ }
    dropFromHash(['k']);
    return m[1];
  }
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

/**
 * 桥给的几种地址，都带口令（照两份宿主共用的样子异步交，桥的当场就有）。
 * @param {string} key 访问口令
 * @returns {import('./files.js').Urls}
 */
export function urls(key) {
  return {
    /** 一个本机文件：`download` 为真的叫浏览器存下来。 */
    file: async (path, download = false) => {
      const q = new URLSearchParams({ k: key, path });
      if (download) q.set('download', '1');
      return `/file?${q}`;
    },
    /** 一个 blob（你的话里的附件）：下载的存成 `name`。 */
    blob: async (hash, type, how = {}) => {
      const q = new URLSearchParams({ k: key, hash, type });
      if (how.download) q.set('download', '1');
      if (how.download && how.name) q.set('name', how.name);
      return `/blob?${q}`;
    },
  };
}

/**
 * 问桥口令还对不对：`/key?k=口令` 回 `204` 是对、`403` 是用不了了；问不到的是桥没在跑。
 * @param {string} key
 * @returns {Promise<'ok'|'bad'|'down'>}
 */
async function checkKey(key) {
  try {
    const got = await fetch(`/key?${new URLSearchParams({ k: key })}`, { cache: 'no-store' });
    return got.status === 204 ? 'ok' : got.status === 403 ? 'bad' : 'down';
  } catch {
    return 'down';
  }
}

/**
 * 选目录：请桥开系统的对话框（2026-10-08 项目主人：选择文件夹应该打开目录选择器）。交回选的绝对路径；点了取消的交 `false`；
 * 开不了的（页面开在别的机器上、桥那台机器上没有对话框程序、问不到桥）交 `null`，用的地方退回自己画的文件夹浏览器。
 * @param {string} key @param {{title?: string, start?: string}} [opts] `start` 从哪个目录开始
 * @returns {Promise<string|false|null>}
 */
async function pickDir(key, opts = {}) {
  if (!onThisMachine()) return null;
  try {
    const q = new URLSearchParams({ k: key, title: opts.title ?? '', start: opts.start ?? '' });
    const got = await (await fetch(`/pick-dir?${q}`, { cache: 'no-store' })).json();
    if (typeof got?.path === 'string') return got.path;
    return got?.cancelled ? false : null;
  } catch {
    return null;
  }
}

/**
 * 桌面壁纸（主题「跟随壁纸」，蓝图 `web.md`「跟着人格的外观」第 5 条）：问桥（`/wallpaper`）现在的那一份。matugen 生成的颜色优先：
 * 交 `{sig, kind: 'matugen', colors}`（`colors` 是那份 JSON，页面自己认）；没有的交 `{sig, kind: 'image', seeds}`（桥照图算好的候选色，
 * 最多四个 `#rrggbb`，打分高的在前）。`sig` 是换没换的记号。页面开在别的机器上的（那是桥那台机器的壁纸）、两样都读不到的（404）交 `null`；
 * 一时问不到的（连接断了、桥出了别的错）抛错，页面留着原来那一套。
 * @param {string} key @param {boolean} dark 页面这时是不是深色（深浅可以各设一张）
 * @returns {Promise<{sig: string, kind: 'matugen', colors: any}|{sig: string, kind: 'image', seeds: string[]}|null>}
 */
async function wallpaper(key, dark) {
  if (!onThisMachine()) return null;
  const q = new URLSearchParams({ k: key, dark: dark ? '1' : '0' });
  const got = await fetch(`/wallpaper?${q}`, { cache: 'no-store' });
  if (got.status === 404) return null;
  if (!got.ok) throw new Error(`/wallpaper ${got.status}`);
  const { sig, kind, seeds } = await got.json() ?? {};
  if (typeof sig !== 'string') return null;
  if (kind !== 'matugen') return { sig, kind: 'image', seeds: Array.isArray(seeds) ? seeds.filter((c) => typeof c === 'string') : [] };
  q.set('data', '1');
  q.set('sig', sig);
  const colors = await fetch(`/wallpaper?${q}`, { cache: 'no-store' });
  if (colors.status === 404) return null;
  if (!colors.ok) throw new Error(`/wallpaper ${colors.status}`);
  return { sig, kind: 'matugen', colors: await colors.json() };
}

/**
 * 盯着桌面壁纸换没换（蓝图 `web.md`「跟着人格的外观」第 5 条，2026-10-14 项目主人：不轮询）：开一条 `/wallpaper/events`，桥那边壁纸来处的
 * 文件变了叫 `changed`。断了的浏览器自己会重连。页面开在别的机器上的不开。交回关掉的函数。
 * @param {string} key @param {() => void} changed
 * @returns {() => void}
 */
function wallpaperChanges(key, changed) {
  if (!onThisMachine() || typeof EventSource !== 'function') return () => {};
  const source = new EventSource(`/wallpaper/events?${new URLSearchParams({ k: key })}`);
  source.onmessage = () => changed();
  return () => source.close();
}

/**
 * 软件后台页（核心 F-6 中，`package-pages.md`）：带着口令请桥造一张票据，交回框的地址；没有后台页、问不到桥的交 `null`。
 * @param {string} key @param {string} id 软件包的编号
 * @returns {Promise<string|null>}
 */
async function packagePage(key, id) {
  try {
    const got = await fetch('/page', { method: 'POST', cache: 'no-store', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ package: id }) });
    if (!got.ok) return null;
    const body = await got.json();
    return typeof body?.url === 'string' ? body.url : null;
  } catch {
    return null;
  }
}

/** 起浏览器这个宿主；链接里、这个标签页里都没有桥的口令的交 `null`（页面说连不上桥）。 */
export function browserHost() {
  const key = bridgeKey();
  if (!key) return null;
  return {
    kind: 'browser',
    /** 开一条到核心的线（经桥）。 */
    channel: () => /** @type {Channel} */ (/** @type {unknown} */ (new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?k=${key}`))),
    urls: urls(key),
    /** 握手带的凭据：走桥的不带（桥出示本机令牌） */
    credential: () => null,
    /** 记下登录令牌：走桥的用不着 */
    remember: (/** @type {any} */ login) => {},
    forget: () => {},
    /** 问桥口令还对不对（蓝图 `web.md`「连核心」第 9 条）：`ok`、`bad`（用不了了，桥重启过）、`down`（问不到，桥没在跑） */
    check: () => checkKey(key),
    files: {
      ...fileTools(urls(key)),
      /** 选目录：请桥开系统的对话框（见上面的 `pickDir`） */
      pickDir: (/** @type {{title?: string, start?: string}} */ opts) => pickDir(key, opts),
    },
    /** 软件的页面：框的地址（见上面的 `packagePage`） */
    pages: { open: (/** @type {string} */ id) => packagePage(key, id) },
    /** 网页自己的路由（`#` 后面那一段） */
    route: hashRoute(),
    /** 桌面壁纸：问桥（见上面的 `wallpaper`） */
    wallpaper: (/** @type {boolean} */ dark) => wallpaper(key, dark),
    /** 桌面壁纸换了：桥推过来（见上面的 `wallpaperChanges`） */
    wallpaperChanges: (/** @type {() => void} */ changed) => wallpaperChanges(key, changed),
    /** 外面的链接：新标签页。 */
    open: (/** @type {string} */ url) => { window.open(url, '_blank', 'noopener'); },
    /** 重新载入页面 */
    restart: () => location.reload(),
    /** 接住页面里的链接：浏览器自己会办，什么都不做；交回怎么不接。 */
    intercept: (/** @type {HTMLElement} */ root) => () => {},
    // 写字；写一张图（灯箱的「复制图片」，PNG：剪贴板普遍只收它）
    clipboard: { write: (/** @type {string} */ text) => navigator.clipboard.writeText(text), image: (/** @type {Blob} */ png) => navigator.clipboard.write([new ClipboardItem({ [png.type]: png })]) },
    store,
  };
}

/** @typedef {NonNullable<ReturnType<typeof browserHost>>} Host 一个宿主交出的（桌面端那一份照这个样子） */
