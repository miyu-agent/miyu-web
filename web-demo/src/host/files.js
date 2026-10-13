// @ts-check
//! 浏览器的两份宿主（走桥的 `browser.js`、直接连网页软件的 `served.js`，蓝图 `web/architecture.md`「宿主」）共用的：选文件、拖放、
//! 读附件的字节、这台设备上存东西的存法；框里的缩略图、读文字文件照宿主给的地址（两份宿主各自的 `urls`，异步给：直接连的要先换票据）。

/**
 * @typedef {{name: string, size: number, type: string, file?: Blob, path?: string, stored?: {session: string, hash: string}}} FileRef
 *   `stored`：核心存好的那一份（输入历史翻出来的附件），缩略图、内容照桥的 `/blob` 取
 *   一个要当附件的文件：浏览器给的只有内容（`file`），桌面端给的有路径（`path`）
 * @typedef {{readyState: number, send: (text: string) => void, onopen: any, onmessage: any, onclose: any, onerror: any}} Channel
 *   连核心的一条线，样子照 WebSocket：`readyState` 是 1 时通着，一帧一条 JSON-RPC 消息
 * @typedef {{getItem: (k: string) => string|null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void}} Store
 *   这台设备上存东西的存法
 */

/** 浏览器的文件换成附件用的样子。 */
export const refs = (/** @type {Iterable<File>} */ list) => [...list].map((file) => /** @type {FileRef} */ ({ name: file.name, size: file.size, type: file.type, file }));

/** 选文件：系统的选文件窗口，能多选；取消的交回空的。 */
export function pick() {
  return new Promise((resolve) => {
    const input = /** @type {HTMLInputElement} */ (document.createElement('input'));
    input.type = 'file';
    input.multiple = true;
    input.addEventListener('change', () => resolve(refs(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

/**
 * 拖文件（蓝图 `web.md`「附件」第 1 条）：文件一拖进窗口 `enter`，到了 `target` 上面、离开它 `over(真假)`，拖出窗口、松开了
 * `leave`；只有在 `target` 上松开才 `drop`（交回文件；附件给的是整页，在哪松开都收）。在别处松开什么都不做，页面也不跳去打开那个文件。拖的不是文件的不管。
 * 交回怎么不看。桌面端照窗口的拖放事件和落点做同一件事。
 * @param {HTMLElement} target 收文件的那一块
 * @param {{enter: () => void, over: (inside: boolean) => void, leave: () => void, drop: (files: FileRef[]) => void}} on
 */
export function watchDrop(target, on) {
  let depth = 0;
  let inside = false;
  const isFiles = (/** @type {DragEvent} */ e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  const within = (/** @type {DragEvent} */ e) => e.target instanceof Node && target.contains(e.target);
  const hover = (/** @type {boolean} */ yes) => {
    if (yes === inside) return;
    inside = yes;
    on.over(yes);
  };
  const end = () => {
    depth = 0;
    hover(false);
    on.leave();
  };
  /** @type {[string, (e: DragEvent) => void][]} */
  const events = [
    ['dragenter', (e) => {
      if (!isFiles(e)) return;
      e.preventDefault();
      if (depth++ === 0) on.enter();
      hover(within(e));
    }],
    ['dragover', (e) => {
      if (!isFiles(e)) return;
      e.preventDefault();
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
      e.preventDefault();
      const yes = within(e);
      end();
      if (yes) on.drop(refs(e.dataTransfer?.files ?? []));
    }],
  ];
  for (const [name, fn] of events) document.addEventListener(name, /** @type {any} */ (fn));
  return () => { for (const [name, fn] of events) document.removeEventListener(name, /** @type {any} */ (fn)); };
}

/**
 * 本机文件、blob 的地址（宿主给的；异步：直接连网页软件的要先换票据）
 * @typedef {{file: (path: string, download?: boolean) => Promise<string>, blob: (hash: string, type: string, how?: {download?: boolean, name?: string|null}) => Promise<string>}} Urls
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
});

/** 页面和网页软件（桥）在同一台机器上（地址是本机）。 */
export const onThisMachine = () => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(location.hostname);

/**
 * 选文件、拖放、读附件，交给服务 `host` 的 `files`（选目录各自补）。
 * @param {Urls} urls
 */
export function fileTools(urls) {
  return {
    pick,
    watchDrop,
    preview: (/** @type {FileRef} */ ref) => preview(urls, ref),
    refs,
    text: (/** @type {FileRef} */ ref, /** @type {number} */ max) => text(urls, ref, max),
    read,
  };
}
