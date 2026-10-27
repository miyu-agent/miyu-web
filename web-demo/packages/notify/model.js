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

/**
 * 账号级的提醒（核心 J-3 中的 `notices` 流）写成什么：`schedule.ran` 是一条系统通知（标题照会话的标题，会话表里还没有的照定时任务那句话 `prompt`，
 * 再没有「Miyu」；`tag` 同那个会话的「回答完了」，互相换掉）；`schedules.reset` 另有页面里的提示（`say`），系统通知标题「Miyu」。认不得的是 `null`。纯的。
 * @param {any} notice `notice` 推来的那一条
 * @param {any} entry 会话表里那个会话（`schedule.ran` 的） @param {{avatar?: string|null}|null|undefined} look @param {string|null} prompt 定时任务那句话
 * @param {string} miyu @param {(path: string) => string} t
 * @returns {{title: string, body: string, icon: string, tag: string, session: string|null, say: string|null}|null}
 */
export function noticeNote(notice, entry, look, prompt, miyu, t) {
  if (notice?.kind === 'schedule.ran' && typeof notice.session === 'string') {
    const title = (entry?.title || entry?.preview || prompt || '').trim() || 'Miyu';
    return { title, body: t(notice.ok === false ? 'schedule_failed' : 'schedule_ran'), icon: look?.avatar || miyu, tag: `${notice.session}:done`, session: notice.session, say: null };
  }
  if (notice?.kind === 'schedules.reset') {
    return { title: 'Miyu', body: t('schedules_reset'), icon: miyu, tag: 'schedules.reset', session: null, say: t('schedules_reset') };
  }
  return null;
}
