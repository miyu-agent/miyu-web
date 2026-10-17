// @ts-check
//! 系统通知写什么（软件包 `notify`，蓝图 `web.md`「系统通知」；2026-10-17 项目主人定）：纯的。标题是会话的标题（没有的照第一句，
//! 再没有写「Miyu」）；正文只写为什么通知：「回答完了」「等你回答」「等你确认」，不带 AI 写的字、问题的原文；图标是这个会话人格的
//! 头像，没有的用 Miyu 的图标。

/**
 * 一条通知；不该弹的（子会话、一次性的会话）是 `null`。
 * @param {'done'|'ask'|'approve'} what
 * @param {any} entry 会话表里这一项（`title`、`preview`、`parent`、`oneshot`）
 * @param {{avatar?: string|null}|null|undefined} look 这个会话的人格画成什么样（`chat.lookOf`）
 * @param {string} miyu Miyu 的图标的地址
 * @param {(path: string) => string} t 这个包的字
 * @returns {{title: string, body: string, icon: string}|null}
 */
export function noteOf(what, entry, look, miyu, t) {
  if (entry?.parent || entry?.oneshot) return null;
  const title = (entry?.title || entry?.preview || '').trim() || 'Miyu';
  return { title, body: t(what), icon: look?.avatar || miyu };
}
