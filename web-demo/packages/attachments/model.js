// @ts-check
//! 附件的纯逻辑（软件包 `attachments`，蓝图 `web.md`「附件」）：收哪些、框里那一排每一块在什么状态、发的时候交出什么、
//! 核心拒了放回来。不碰 DOM、不碰网络，画和传在 `tray.js`、`index.js`。


/**
 * @typedef {{name: string, size: number, type: string, file?: Blob, path?: string, modified?: number, stored?: {session: string, hash: string}}} FileLike
 *   宿主给的一个文件（`host/browser.js` 的 `FileRef`；测试里是假的）；输入历史翻出来的是核心存好的那一份（`stored`：发在哪个会话、编号）
 * @typedef {{blob: string, name: string, media_type: string, kind?: string, width?: number, height?: number}} Put `blob.put` 的回应
 * @typedef {{id: number, file: FileLike, name: string, size: number, state: 'uploading'|'ready', put: Put|null, path?: string, recalled?: boolean}} Item
 *   框里的一块；`path` 是它在核心那台电脑上原来的路径（`@` 选文件交过来的、网页软件找到的，第 2 条的子条目）；`recalled` 是跟着输入历史翻出来、
 *   还没留下的（换一条时换掉）
 * @typedef {{blob: string, name: string, media_type: string, size: number, path?: string}} Kept 记进输入历史的一块：核心存好的那一份
 * @typedef {{blob: string, name: string, media_type: string, path?: string}} Sent 交给核心的一个附件（`session.send` 的 `attachments` 的一项）
 * @typedef {{attachments: Sent[]}} Taken 发的时候交出去的，合进 `session.send` 的参数
 */

/** 媒体类型的写法（`kernel/ids.md` 第 5 条）：两截，只用小写字母、数字和 `!#$&^_.+-`，最长 127 个字符。 */
const MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const MEDIA_TYPE_MAX = 127;

/**
 * 浏览器给的媒体类型：合规矩的照写（换成小写），空的、不合的是 `null`，不写，交给核心照内容认（第 2 条）。
 * @param {string} type
 */
export function mediaType(type) {
  const t = (type ?? '').toLowerCase();
  return t.length <= MEDIA_TYPE_MAX && MEDIA_TYPE.test(t) ? t : null;
}

/** 原来的路径最长多少字节（核心 `protocol.md` 的 `session.send`：超过的 `bad_params`）。 */
const PATH_MAX_BYTES = 4096;

/**
 * 附件原来的路径写法对不对（核心只查写法，不对的整句拒 `bad_params`，所以这里先筛掉、不带）：绝对路径（`/`、`~/`、Windows 的盘符或
 * `\\` 开头）、没有控制字符、最多 4096 字节。对的照原样交回，不对的是 `null`。
 * @param {unknown} path @returns {string|null}
 */
export function sourcePath(path) {
  if (typeof path !== 'string' || path === '') return null;
  const absolute = path.startsWith('/') || path.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
  // eslint-disable-next-line no-control-regex
  if (!absolute || /[\u0000-\u001f\u007f-\u009f]/.test(path)) return null;
  return new TextEncoder().encode(path).length <= PATH_MAX_BYTES ? path : null;
}

/** 改了没多久的文件不找：刚粘贴的截图、太长的字转成的文字附件是此刻才有的，磁盘上没有它。 */
const FRESH_MS = 3000;

/**
 * 值不值得请网页软件找它原来在哪：浏览器给的、只有内容的文件（不是宿主已经给了路径的、不是输入历史翻出来的核心存好的那一份），
 * 带着改的时刻，而且不是刚刚才有的（`now` 是此刻，Unix 毫秒）。
 * @param {FileLike & {modified?: number}} file @param {number} now
 */
export function findable(file, now) {
  if (file.path || file.stored || !file.file) return false;
  return typeof file.modified === 'number' && file.modified > 0 && now - file.modified > FRESH_MS;
}

/**
 * 交给核心的一个附件长什么样（`session.send` 的 `attachments` 的一项）：`blob.put` 回应里的三格，知道原来路径的另带 `path`
 * （她看得到原文件在哪，能直接改它；模型看不了这个附件时核心的占位那一句也带上它）。
 * @param {Item} it @returns {Sent}
 */
export function sentOf(it) {
  const put = /** @type {Put} */ (it.put);
  return { blob: put.blob, name: put.name, media_type: put.media_type, ...(it.path ? { path: it.path } : {}) };
}

/**
 * 这一回放进来的几个里收哪些：超过 `max_mib` 的不收；框里已经有 `count` 个，放满 `max_files` 个以后的不收（第 1、2 条）。
 * @template {FileLike} F
 * @param {number} count 框里已经有几个
 * @param {F[]} files
 * @param {{max_files: number, max_mib: number}} config
 */
export function admit(count, files, config) {
  const limit = config.max_mib * 1024 * 1024;
  const fits = files.filter((f) => f.size <= limit);
  const room = Math.max(0, config.max_files - count);
  return {
    accepted: fits.slice(0, room),
    tooBig: files.filter((f) => f.size > limit),
    tooMany: Math.max(0, fits.length - room),
  };
}

/**
 * 一个文件是哪一种：框里的样子、图标照它（第 3 条）。先看媒体类型，没有的看扩展名。
 * @param {{name: string, type: string}} file
 * @returns {'image'|'video'|'audio'|'pdf'|'text'|'file'}
 */
export function kindOf(file) {
  const type = (file.type ?? '').toLowerCase();
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('text/') || ['md', 'txt', 'json', 'csv', 'log'].includes(ext)) return 'text';
  return 'file';
}

/** `@` 选文件交过来的收不收（蓝图 `web.md`「`@` 选文件」第 5 条）：图片、PDF、音频、视频收成附件，别的照路径写进话里。 */
export function attachable(file) {
  return ['image', 'pdf', 'audio', 'video'].includes(kindOf(file));
}

/** 文字文件有几行：最后一行没有换行也算一行；空的是 0 行（卡片上那一行小字，蓝图「附件」第 3 条）。 */
export function lineCount(text) {
  if (!text) return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}

/** 卡左下角的标签：扩展名大写；没有扩展名的（`Makefile`、`.bashrc`）是空的（第 3 条）。 */
export function extOf(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
}

/** 框里那一排：照先后的几块，变了告诉看着的。 */
export class Tray {
  constructor() {
    /** @type {Item[]} */
    this.items = [];
    this.seq = 0;
    /** @type {Set<() => void>} */
    this.watchers = new Set();
    /** 交出去的几块，拒了照它放回来；不是这里交出去的不认 */
    /** @type {WeakMap<Taken, Item[]>} */
    this.given = new WeakMap();
    /** 切会话收起来的几排（W-1137）：传到一半的传完了照样记上 @type {Set<Item[]>} */
    this.stowed = new Set();
  }

  /** 这一块在哪一排（框里的，或者收起来的）。 @param {number} id */
  holder(id) {
    if (this.items.some((it) => it.id === id)) return this.items;
    for (const row of this.stowed) if (row.some((it) => it.id === id)) return row;
    return null;
  }

  /**
   * 切会话（W-1137）：框里这一排收起来交出去、框里清空；传到一半的接着传，传完了记在收起来的那一排上。一块都没有的交 `null`。
   * @returns {Item[]|null}
   */
  stow() {
    if (!this.items.length) return null;
    const row = this.items;
    this.stowed.add(row);
    this.items = [];
    this.changed();
    return row;
  }

  /** 切回来：收起来的那一排放回框里，排在现在框里的前面。 @param {Item[]} row */
  unstow(row) {
    if (!this.stowed.delete(row)) return;
    this.items = [...row, ...this.items];
    this.changed();
  }

  /** 看着变。交回怎么不看。 */
  watch(fn) {
    this.watchers.add(fn);
    return () => this.watchers.delete(fn);
  }

  changed() {
    for (const fn of this.watchers) fn();
  }

  /**
   * 放进来一个，先是在传。
   * @param {FileLike} file
   */
  add(file) {
    /** @type {Item} */
    const item = { id: ++this.seq, file, name: file.name, size: file.size, state: 'uploading', put: null };
    // 宿主给了路径的（`@` 选文件交过来的）：发的时候带上
    const path = sourcePath(file.path);
    if (path) item.path = path;
    this.items.push(item);
    this.changed();
    return item;
  }

  /**
   * 传完了。已经拿掉的交回 `false`（不收）。
   * @param {number} id
   * @param {Put} put
   */
  ready(id, put) {
    const item = this.holder(id)?.find((it) => it.id === id);
    if (!item) return false;
    item.state = 'ready';
    item.put = put;
    this.changed();
    return true;
  }

  /**
   * 找到它原来在哪了（网页软件照名字、大小、改的时刻找的，第 2 条的子条目）：记在这一块上，发的时候带上。写法核心不收的不记；已经拿掉、
   * 发出去了的不管。记上了交回 `true`。
   * @param {number} id @param {string|null} path
   */
  located(id, path) {
    const item = this.holder(id)?.find((it) => it.id === id);
    const ok = sourcePath(path);
    if (!item || !ok) return false;
    item.path = ok;
    this.changed();
    return true;
  }

  /** 拿掉一块（传到一半的也能拿；切会话收起来的那几排里的也认，传坏了照样拿掉）；交回拿掉的那块。 */
  remove(id) {
    const row = this.holder(id);
    const at = row ? row.findIndex((it) => it.id === id) : -1;
    if (!row || at < 0) return null;
    const [item] = row.splice(at, 1);
    this.changed();
    return item;
  }

  /** 键盘拿掉最后一块（光标在最前面按退格，蓝图「附件」第 3 条）：拿掉了交回 `true`，一块都没有的 `false`。 */
  dropLast() {
    const last = this.items.at(-1);
    return last ? !!this.remove(last.id) : false;
  }

  has() {
    return this.items.length > 0;
  }

  /** 还有在传的：这时不能发。 */
  busy() {
    return this.items.some((it) => it.state === 'uploading');
  }

  /**
   * 发：交出全部（blob、名字、媒体类型，知道原来路径的带 `path`）、框里清空。没有的、还在传的交 `null`。
   * @returns {Taken|null}
   */
  take() {
    if (!this.has() || this.busy()) return null;
    const items = this.items;
    const taken = { attachments: items.map(sentOf) };
    this.given.set(taken, items);
    this.items = [];
    this.changed();
    return taken;
  }

  /**
   * 交出去的记进输入历史的样子（蓝图 `web.md`「输入历史」第 1 条）：只留核心存好的那一份、名字、媒体类型、大小（知道原来路径的
   * 带 `path`），浏览器里的文件存不下。不是这里交出去的交 `null`。
   * @param {Taken} taken
   * @returns {Kept[]|null}
   */
  keep(taken) {
    const items = this.given.get(taken);
    if (!items) return null;
    return items.map((it) => {
      const put = /** @type {Put} */ (it.put);
      return { blob: put.blob, name: put.name, media_type: put.media_type, size: it.size, ...(it.path ? { path: it.path } : {}) };
    });
  }

  /**
   * 输入历史翻出来的（第 2 条）：换掉上一次跟着翻出来、还没留下的几块，自己放进来的不动；`null` 是只拿掉。翻出来的是传好了的
   * （核心存好的那一份，再发不用重新传），文件带着它（缩略图照它取）。
   * @param {Kept[]|null} kept
   * @param {string|null} session 发在哪个会话（取那一份照它）
   */
  recall(kept, session) {
    this.items = this.items.filter((it) => !it.recalled);
    for (const k of kept ?? []) {
      const file = { name: k.name, size: k.size, type: k.media_type, stored: { session: /** @type {string} */ (session), hash: k.blob } };
      const path = sourcePath(k.path);
      this.items.push({ id: ++this.seq, file, name: k.name, size: k.size, state: 'ready', put: { blob: k.blob, name: k.name, media_type: k.media_type }, ...(path ? { path } : {}), recalled: true });
    }
    this.changed();
  }

  /** 翻出来的字改了、从列表里选定了：跟着回来的几块留下，当成自己放的。 */
  settle() {
    for (const it of this.items) delete it.recalled;
  }

  /**
   * 核心拒了：交出去的放回来，排在现在框里的前面（原来就在前面）。
   * @param {Taken} taken
   */
  putBack(taken) {
    const items = this.given.get(taken);
    if (!items) return;
    this.given.delete(taken);
    this.items = [...items, ...this.items];
    this.changed();
  }
}
