// @ts-check
//! 浏览器的两份宿主（走桥的 `browser.js`、直接连网页软件的 `served.js`，蓝图 `web/architecture.md`「宿主」）共用的：选文件、拖放、
//! 读附件的字节、这台设备上存东西的存法；框里的缩略图、读文字文件照宿主给的地址（两份宿主各自的 `urls`，异步给：直接连的要先换票据）。

/**
 * @typedef {{name: string, size: number, type: string, file?: Blob, path?: string, relative?: string, modified?: number, stored?: {session: string, hash: string}}} FileRef
 *   `stored`：核心存好的那一份（输入历史翻出来的附件），缩略图、内容照桥的 `/blob` 取
 *   一个要当附件的文件：浏览器给的只有内容（`file`）和改的时刻（`modified`，Unix 毫秒），桌面端给的有路径（`path`）；拖进来、选进来的文件夹里的带它在文件夹里的路径（`relative`，`笔记/日语/语法.md`）
 * @typedef {{readyState: number, send: (text: string) => void, onopen: any, onmessage: any, onclose: any, onerror: any}} Channel
 *   连核心的一条线，样子照 WebSocket：`readyState` 是 1 时通着，一帧一条 JSON-RPC 消息
 * @typedef {{getItem: (k: string) => string|null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void, keys?: () => string[]}} Store
 *   这台设备上存东西的存法
 */

/** 浏览器的文件换成附件用的样子。 */
export const refs = (/** @type {Iterable<File>} */ list) => [...list].map((file) => /** @type {FileRef} */ ({ name: file.name, size: file.size, type: file.type, file, modified: file.lastModified }));

/**
 * @typedef {{name: string, size?: number|null, modified?: number|null, near?: string[], wait?: number, exact?: boolean}} Wanted
 *   要在这台电脑上找的一个文件（网页软件的 `/locate`，2026-11-11 项目主人定：浏览器不给路径，照名字、大小、改的时刻找）：`near` 是先看的
 *   几处（会话的工作区），`wait` 最多找几毫秒（不写的照网页软件出厂的），`exact` 只认改的时刻也对得上的
 */

/**
 * `/locate` 的查询串：没有的、不是数的不写；`near` 一处写一次，空的不写。
 * @param {Wanted} wanted
 */
export function locateQuery(wanted) {
  const q = new URLSearchParams({ name: wanted.name });
  const whole = (/** @type {any} */ n) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : null);
  for (const [key, value] of [['size', whole(wanted.size)], ['modified', whole(wanted.modified)], ['wait', whole(wanted.wait)]]) {
    if (value != null) q.set(/** @type {string} */ (key), value);
  }
  for (const dir of wanted.near ?? []) if (typeof dir === 'string' && dir) q.append('near', dir);
  if (wanted.exact) q.set('exact', '1');
  return q;
}

/** 选文件夹：系统的选文件夹窗口，交回里面全部的文件（带 `relative`，连文件夹自己的名字）；取消的交回空的。 */
export function pickFolder() {
  return new Promise((resolve) => {
    const input = /** @type {HTMLInputElement} */ (document.createElement('input'));
    input.type = 'file';
    input.webkitdirectory = true;
    input.addEventListener('change', () => resolve([...(input.files ?? [])].map((file) => ({ ...refs([file])[0], relative: file.webkitRelativePath || file.name }))), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

/**
 * 拖进来的东西里的文件：文件夹一层层往下走，每个文件带它的相对路径（连拖进来的文件夹自己的名字）。`entries` 要在 `drop` 那一刻拿（事件过去就没了）。
 * @param {any[]} entries `DataTransferItem.webkitGetAsEntry()` 交回的 @returns {Promise<FileRef[]>}
 */
async function walk(entries) {
  /** @type {FileRef[]} */
  const out = [];
  const visit = async (/** @type {any} */ entry, /** @type {string} */ base) => {
    if (!entry) return;
    const here = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise((ok, bad) => entry.file(ok, bad)).catch(() => null);
      if (file) out.push({ ...refs([/** @type {File} */ (file)])[0], relative: here });
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    // 一次读不完：一直读到交回空的
    for (;;) {
      const batch = await new Promise((ok, bad) => reader.readEntries(ok, bad)).catch(() => []);
      if (!batch.length) break;
      for (const child of batch) await visit(child, here);
    }
  };
  for (const entry of entries) await visit(entry, '');
  return out;
}

/**
 * 选文件：系统的选文件窗口，默认能多选；取消的交回空的。`accept` 只列哪几种（导入会话只收 `.zip`，W-1094），`multiple: false` 只选一个。
 * @param {{accept?: string, multiple?: boolean}} [opts]
 * @returns {Promise<FileRef[]>}
 */
export function pick({ accept = '', multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = /** @type {HTMLInputElement} */ (document.createElement('input'));
    input.type = 'file';
    input.multiple = multiple;
    if (accept) input.accept = accept;
    input.addEventListener('change', () => resolve(refs(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

/**
 * 拖文件（蓝图 `web.md`「附件」第 1 条）：文件一拖进窗口 `enter`，到了 `target` 上面、离开它 `over(真假)`，拖出窗口、松开了
 * `leave`；只有在 `target` 上松开才 `drop`（交回文件；附件给的是整页，在哪松开都收）。在别处松开什么都不做，页面也不跳去打开那个文件。拖的不是文件的不管。
 * 交回怎么不看。桌面端照窗口的拖放事件和落点做同一件事。
 * `local` 的只听这一块自己（拖进、拖出它算 `enter`、`leave`；知识库页的「拖文件到这里」）：事件先到它，它收了的整页的那一份不再收；它标上
 * `data-drop-zone`，整页听的落在它上面（还有标了 `data-drop-shield` 的设置框上）的不弹、不收。`folders` 的拖进文件夹照文件夹里的全部文件交（带 `relative`）。
 * @param {HTMLElement} target 收文件的那一块
 * @param {{enter: () => void, over: (inside: boolean) => void, leave: () => void, drop: (files: FileRef[]) => void}} on
 * @param {{local?: boolean, folders?: boolean}} [opts]
 */
export function watchDrop(target, on, { local = false, folders = false } = {}) {
  let depth = 0;
  let inside = false;
  let entered = false;
  const isFiles = (/** @type {DragEvent} */ e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  const within = (/** @type {DragEvent} */ e) => e.target instanceof Node && target.contains(e.target);
  // 整页听的（输入框的附件）：落在自己收文件的那一块（`data-drop-zone`）、挡着的地方（`data-drop-shield`，设置框）上的不管——不弹整页的「拖到这里」、
  // 不收（2026-10-20 项目主人：往知识库拖文件先触发了输入框的拖文件）；浏览器默认的打开文件照样拦着
  const blocked = (/** @type {DragEvent} */ e) => !local && e.target instanceof Element && !!e.target.closest('[data-drop-zone], [data-drop-shield]');
  const hover = (/** @type {boolean} */ yes) => {
    if (yes === inside) return;
    inside = yes;
    on.over(yes);
  };
  const show = (/** @type {boolean} */ yes) => {
    if (yes && !entered) {
      entered = true;
      on.enter();
    } else if (!yes && entered) {
      entered = false;
      hover(false);
      on.leave();
    }
  };
  const end = () => {
    depth = 0;
    show(false);
  };
  if (local) target.dataset.dropZone = '';
  /** @type {[string, (e: DragEvent) => void][]} */
  const events = [
    ['dragenter', (e) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      depth++;
      const off = blocked(e);
      show(!off);
      if (!off) hover(within(e));
    }],
    ['dragover', (e) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      if (blocked(e)) {
        show(false);
        return;
      }
      show(true);
      const yes = within(e);
      if (e.dataTransfer) e.dataTransfer.dropEffect = yes ? 'copy' : 'none';
      hover(yes);
    }],
    ['dragleave', (e) => {
      if (!isFiles(e) || --depth > 0) return;
      end();
    }],
    ['drop', (e) => {
      if (!isFiles(e)) return;
      // 里面自己收文件的那一块（知识库页的「拖文件到这里」）先收了的（`preventDefault`）：这里只收尾，不再交一份
      const claimed = e.defaultPrevented;
      e.preventDefault();
      const yes = within(e) && !claimed && !blocked(e);
      // 收文件夹的（知识库）：这一刻拿到条目，再一层层往下走
      const entries = yes && folders ? [...(e.dataTransfer?.items ?? [])].map((item) => item.webkitGetAsEntry?.()).filter(Boolean) : null;
      const files = e.dataTransfer?.files ?? [];
      end();
      if (!yes) return;
      if (entries?.length) walk(entries).then((list) => on.drop(list));
      else on.drop(refs(files));
    }],
  ];
  const where = local ? target : document;
  for (const [name, fn] of events) where.addEventListener(name, /** @type {any} */ (fn));
  return () => { for (const [name, fn] of events) where.removeEventListener(name, /** @type {any} */ (fn)); };
}

/**
 * 本机文件、blob 的地址（宿主给的；异步：直接连网页软件的要先换票据）
 * @typedef {{file: (path: string, download?: boolean) => Promise<string>, blob: (hash: string, type: string, how?: {download?: boolean, name?: string|null}) => Promise<string>,
 *   shown: (s: {session: string, call: string, path: string, type: string, name?: string|null, download?: boolean}) => Promise<string>}} Urls
 *   `shown`：她展示过的一个文件（核心 SW-1，W-1172）：演示的桥照 `path` 读本机文件，网页软件照「会话 + 调用编号」经 `session.shown` 读
 */

/**
 * 框里的缩略图：图片、视频交回一个地址和怎么松开它；别的是 `null`。核心存好的那一份、本机的文件（`@` 选文件交过来的，只有路径）
 * 照宿主的地址取。
 * @param {Urls} urls @param {FileRef} ref
 * @returns {Promise<{url: string, release: () => void}|null>}
 */
export async function preview(urls, ref) {
  if (!/^(image|video)\//.test(ref.type)) return null;
  if (ref.stored) return { url: await urls.blob(ref.stored.hash, ref.type), release: () => {} };
  if (ref.path && !(ref.file instanceof Blob)) return { url: await urls.file(ref.path), release: () => {} };
  if (!(ref.file instanceof Blob)) return null;
  const url = URL.createObjectURL(ref.file);
  return { url, release: () => URL.revokeObjectURL(url) };
}

/**
 * 读文字文件的内容（框里的卡写有几行）：超过 `max` 字节的、读不了的交 `null`。
 * @param {Urls} urls @param {FileRef} ref @param {number} max
 */
export async function text(urls, ref, max) {
  if (ref.size > max) return null;
  try {
    if (ref.stored || (ref.path && !(ref.file instanceof Blob))) {
      const url = ref.stored ? await urls.blob(ref.stored.hash, 'text/plain') : await urls.file(/** @type {string} */ (ref.path));
      const got = await fetch(url);
      return got.ok ? await got.text() : null;
    }
    return ref.file instanceof Blob ? await ref.file.text() : null;
  } catch { return null; }
}

/**
 * 读附件的一段字节（分块传给核心，`blob.write`，核心施工 W-5）：浏览器的文件切一段读出来。
 * @param {FileRef} ref
 * @param {number} offset
 * @param {number} length
 * @returns {Promise<Uint8Array>}
 */
export async function read(ref, offset, length) {
  if (!(ref.file instanceof Blob)) throw new Error('没有内容');
  return new Uint8Array(await ref.file.slice(offset, offset + length).arrayBuffer());
}

/** 这台设备上存东西：`localStorage`（隐私窗口、清过数据时读写会抛，由内核的 `storage` 兜着）。 */
export const store = /** @type {Store} */ ({
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
  /** 全部的键（原来按账号分存的一次搬完，`kernel/storage.js`） */
  keys: () => Object.keys(localStorage),
});

/** 页面和网页软件（桥）在同一台机器上（地址是本机）。 */
export const onThisMachine = () => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(location.hostname);

/**
 * 从地址栏网址的 `#` 后面去掉这几项（桥的口令、一次性码：读完就抹，不留在历史、收藏里）；别的留着（软件页面的 `package=`、`widget=`，
 * 软件包 `backstage` 照它开页面，能收藏）。
 * @param {string[]} keys
 */
export function dropFromHash(keys) {
  const q = new URLSearchParams(location.hash.replace(/^#/, ''));
  for (const k of keys) q.delete(k);
  const rest = q.toString();
  history.replaceState(null, '', location.pathname + location.search + (rest ? `#${rest}` : ''));
}

/**
 * 网页自己的路由：网址 `#` 后面那一段（口令、一次性码读完已经抹掉），软件的独立整页照它开（软件包 `backstage`，`#package=<编号>`）。
 * 两个浏览器宿主共用；桌面端照它的样子另给。
 */
export function hashRoute() {
  return {
    /** 现在的那一段（带 `#`，没有的是空字） */
    current: () => location.hash,
    /** 去一个新地址：记进浏览器的历史，后退回得来 @param {string} hash */
    go: (hash) => { location.hash = hash; },
    /** 后退一步 */
    back: () => history.back(),
    /** 换成这个地址，不记进历史；空字去掉 `#` 后面整段 @param {string} hash */
    replace: (hash) => history.replaceState(null, '', location.pathname + location.search + hash),
    /** 地址变了叫 `changed`（点了链接、浏览器后退、`go`）；交回不再听的函数 @param {() => void} changed */
    watch: (changed) => {
      window.addEventListener('hashchange', changed);
      return () => window.removeEventListener('hashchange', changed);
    },
  };
}

/**
 * 叫浏览器下载一个地址（`a[download]`，导出会话，W-1098）：`name` 空着的照服务器给的名字（`Content-Disposition`）。
 * @param {string} url @param {string} [name]
 */
export function download(url, name = '') {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
}

/** Blob 地址放多久再松开：点了下载以后浏览器还要读它 */
const RELEASE_MS = 60_000;

/**
 * 把一段字存成文件（导出会话的 Markdown，W-1098）：浏览器的 Blob 加 `a[download]`，过一会儿松开。
 * @param {string} name @param {string} text @param {string} [type]
 */
export function saveText(name, text, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), RELEASE_MS);
}

/**
 * 选文件、拖放、读附件、把字存成文件，交给服务 `host` 的 `files`（选目录各自补）。
 * @param {Urls} urls
 */
export function fileTools(urls) {
  return {
    pick,
    pickFolder,
    watchDrop,
    preview: (/** @type {FileRef} */ ref) => preview(urls, ref),
    refs,
    text: (/** @type {FileRef} */ ref, /** @type {number} */ max) => text(urls, ref, max),
    read,
    save: saveText,
    /** 页面是不是开在别的设备上（文件在这台设备上，核心那台电脑读不到它） */
    elsewhere: () => !onThisComputer(),
    /** 这台电脑上能不能找文件在哪（页面和网页软件在同一台电脑上、网页软件有 `/locate`）：出厂不能，直接连网页软件的那一份自己补 */
    local: () => false,
    /** 找一个文件在这台电脑上的哪儿：交回路径，没找到、找不了的交 `null` @param {Wanted} _wanted @returns {Promise<string|null>} */
    locate: async (_wanted) => null,
  };
}

/** 地址里的主机名是不是本机（回环）：`127.*`、`localhost`、`[::1]` @param {string} host */
export const loopbackHost = (host) => {
  const v = host.toLowerCase();
  return v === 'localhost' || v === '[::1]' || v === '::1' || /^127\./.test(v);
};

/** 页面是不是开在本机地址上 */
export const onThisComputer = () => loopbackHost(globalThis.location?.hostname ?? '');

/** 这台浏览器记着的皮肤（登录那几屏、引导起来时皮肤包还没加载，页面一开始照它在根上写 `data-skin`；蓝图「第一次引导」第 2 条） */
const SKIN_MARK = 'miyu.web.skin';

/** 记着的皮肤：`get` 读（没有、读不了的是 `null`），`set` 记（`null` 是出厂，删掉）；存不了的不记。 */
export const skinMark = {
  get: () => {
    try {
      return globalThis.localStorage?.getItem(SKIN_MARK) ?? null;
    } catch {
      return null;
    }
  },
  /** @param {string|null} id */
  set: (id) => {
    try {
      if (id) globalThis.localStorage?.setItem(SKIN_MARK, id);
      else globalThis.localStorage?.removeItem(SKIN_MARK);
    } catch { /* 存不了的照出厂 */ }
  },
};
