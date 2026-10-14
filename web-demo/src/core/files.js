// @ts-check
//! `@` 选文件问核心（蓝图 `web.md`「`@` 选文件」第 2 条，核心施工 W-2；原来由桥的 `web.files` 列、找）：按目录找经 `fs.list`，
//! 模糊找经 `fs.find`，都带这个会话的工作目录。清单没建完（`building`）的先交已经建好的，再问一次带 `wait` 的（核心 V-6 上：建完
//! 再答），不隔一会儿再问。
//! 核心的列表里不带媒体类型：照扩展名补上（`resources/media.json` 的 `types`），附件包照它认收不收。

import { res } from '../util/res.js';

/**
 * @typedef {{path: string, full: string, dir: boolean, marks: number[], size?: number, type: string}} Entry
 * @typedef {{items: Entry[], partial: boolean, layer: boolean}} Found `layer` 是按目录找的（只读这一层）
 */

/** 照扩展名认媒体类型；目录、认不得的是空的。 @param {{path: string, dir: boolean}} x */
function typeOf(x) {
  if (x.dir) return '';
  const dot = x.path.lastIndexOf('.');
  return dot < 0 ? '' : res.media?.types?.[x.path.slice(dot + 1).toLowerCase()] ?? '';
}

/** @param {any} got @param {boolean} layer @returns {Found} */
function shape(got, layer) {
  return { items: (got?.items ?? []).map((x) => ({ ...x, type: typeOf(x) })), partial: !!got?.partial, layer };
}

/**
 * 列、找一次。模糊找的清单没建完：先把已经建好的交给 `onUpdate`，再问一次带 `wait` 的（核心建完再答，不再带 `fresh`），`stale()`
 * 说不要了就不问。比 V-6 上旧的核心不认 `wait`、当场答，还没建完的就照它交，不接着问。
 * 问不到的照原样报出去（`model/mention.js` 的 `failure` 写成人话）。
 * @param {import('./connection.js').Connection} conn
 * @param {string|null} cwd 这个会话的工作目录
 * @param {{mode: 'dir', dir: string, prefix: string}|{mode: 'find', query: string}} plan `model/mention.js` 的 `plan`
 * @param {boolean} fresh 开列表时：清单旧了重建
 * @param {(found: Found) => void} [onUpdate]
 * @param {() => boolean} [stale]
 * @returns {Promise<Found>}
 */
export async function listFiles(conn, cwd, plan, fresh, onUpdate = () => {}, stale = () => false) {
  if (plan.mode === 'dir') return shape(await conn.request('fs.list', { cwd, dir: plan.dir, prefix: plan.prefix }), true);
  const got = await conn.request('fs.find', { cwd, query: plan.query, fresh });
  const found = shape(got, false);
  if (!got?.building || stale()) return found;
  onUpdate(found);
  return shape(await conn.request('fs.find', { cwd, query: plan.query, fresh: false, wait: true }), false);
}
