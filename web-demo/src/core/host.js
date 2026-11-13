// @ts-check
//! 旧代码（`src/ui/`、`src/markdown/`）经这里用宿主（蓝图 `web/architecture.md`「宿主」）：本机文件、blob、链接卡片配图的
//! 地址，外面的链接，剪贴板。内核起来时把选好的宿主交进来；软件包不经这里，经服务 `host`。拆完旧代码这个文件就没了。

/** @type {import('../host/browser.js').Host|null} */
let host = null;

/** 内核起来时交进来。 */
export function useHost(h) {
  host = h;
}

/**
 * 一个本机文件的地址。`download` 为真的叫浏览器存下来。宿主还没交进来时、换不到的是空的。能不能读照核心（`fs.read`），不分会话。
 * 异步：直接连网页软件的先换票据（蓝图 `web/architecture.md`「浏览器的第二份宿主」）；写进元素用 `setUrl`。
 * @param {string} path 绝对路径
 * @returns {Promise<string>}
 */
export function fileUrl(path, download = false) {
  return host ? host.urls.file(path, download) : Promise.resolve('');
}

/**
 * 一个 blob 的地址（你的话里的附件）。`download` 为真的叫浏览器存下来，存成 `name`。照这个账号的 blob（`blob.get`），不分会话。
 * @param {string} hash `sha256:…`
 * @param {string} type 媒体类型
 * @param {{download?: boolean, name?: string|null}} [how]
 * @returns {Promise<string>}
 */
export function blobUrl(hash, type, how = {}) {
  return host ? host.urls.blob(hash, type, how) : Promise.resolve('');
}


/**
 * 她展示过的一个文件的地址（核心 SW-1，W-1172：内容不在核心里，照路径或者「会话 + 调用编号」读）。`download` 为真的叫浏览器存下来，存成 `name`。
 * @param {string|null} session @param {import('../model/artifacts.js').Shown} s @param {string} type 媒体类型
 * @param {{download?: boolean}} [how]
 * @returns {Promise<string>}
 */
export function shownUrl(session, s, type, how = {}) {
  if (!host || !session || !s.call) return Promise.resolve('');
  return host.urls.shown({ session, call: s.call, path: s.path, type, name: s.name, download: !!how.download });
}

/** 外面的链接：浏览器是新标签页，桌面端是系统的浏览器；交回开了没有。 */
export function openExternal(url) {
  return !!host?.open(url);
}

/** 写进剪贴板。 */
export function writeClipboard(text) {
  if (!host) return Promise.reject(new Error('host'));
  return host.clipboard.write(text);
}
