// @ts-check
//! 系统通知写什么（软件包 `notify`，蓝图 `web.md`「系统通知」；2026-10-17 项目主人定，2026-11-10 项目主人改成照人格来，W-1143）：纯的。
//! 标题是这个会话人格的名字，无人格的写「Miyu」；图标是人格的头像，没有头像的、无人格的不带图标；正文是会话的标题（没有的照第一句）
//! 接为什么通知：「修登录页 · 回答完了」，没标题的只写为什么（「回答完了」「等你回答」「等你确认」），不带 AI 写的字、问题的原文。

/** 程序名：无人格的会话、账号级的提醒的标题 */
const MIYU = 'Miyu';

/**
 * 标题、图标照人格：有人格的写名字、有头像的带头像；无人格的（`look` 是 `null`、`undefined`，或者没名字）写程序名、不带图标。
 * @param {{name?: string|null, avatar?: string|null}|null|undefined} look
 * @returns {{title: string, icon?: string}}
 */
function whoOf(look) {
  const name = typeof look?.name === 'string' ? look.name.trim() : '';
  if (!name) return { title: MIYU };
  return look?.avatar ? { title: name, icon: look.avatar } : { title: name };
}

/** 正文：会话的标题接为什么，没标题的只写为什么。 @param {string} topic @param {string} why */
const bodyOf = (topic, why) => (topic ? `${topic} · ${why}` : why);

/**
 * 一条通知；不该弹的（子会话、一次性的会话）是 `null`。
 * @param {'done'|'ask'|'approve'} what
 * @param {any} entry 会话表里这一项（`title`、`preview`、`parent`、`oneshot`）
 * @param {{name?: string|null, avatar?: string|null}|null|undefined} look 这个会话的人格画成什么样（`chat.lookOf`：名字、头像）
 * @param {(path: string) => string} t 这个包的字
 * @returns {{title: string, body: string, icon?: string}|null}
 */
export function noteOf(what, entry, look, t) {
  if (entry?.parent || entry?.oneshot) return null;
  const topic = (entry?.title || entry?.preview || '').trim();
  return { ...whoOf(look), body: bodyOf(topic, t(what)) };
}

/**
 * 账号级的提醒（核心 J-3 中的 `notices` 流）写成什么：`schedule.ran` 是一条系统通知（标题、图标照那个会话的人格，同 [`noteOf`]；正文是会话的标题，
 * 会话表里还没有的照定时任务那句话 `prompt`，接「定时任务跑完了」；`tag` 同那个会话的「回答完了」，互相换掉）；`schedules.reset` 另有页面里的提示（`say`），
 * 系统通知标题「Miyu」、不带图标。认不得的是 `null`。纯的。
 * @param {any} notice `notice` 推来的那一条
 * @param {any} entry 会话表里那个会话（`schedule.ran` 的） @param {{name?: string|null, avatar?: string|null}|null|undefined} look @param {string|null} prompt 定时任务那句话
 * @param {(path: string) => string} t
 * @returns {{title: string, body: string, icon?: string, tag: string, session: string|null, say: string|null}|null}
 */
export function noticeNote(notice, entry, look, prompt, t) {
  if (notice?.kind === 'schedule.ran' && typeof notice.session === 'string') {
    const topic = (entry?.title || entry?.preview || prompt || '').trim();
    const body = bodyOf(topic, t(notice.ok === false ? 'schedule_failed' : 'schedule_ran'));
    return { ...whoOf(look), body, tag: `${notice.session}:done`, session: notice.session, say: null };
  }
  if (notice?.kind === 'schedules.reset') {
    return { title: MIYU, body: t('schedules_reset'), tag: 'schedules.reset', session: null, say: t('schedules_reset') };
  }
  return null;
}

/**
 * 弹不弹、出不出声（蓝图第 1 条，2026-11-02 项目主人定）：正在看的会话只在标签页不在前台时弹；别的会话前台也弹，不出声；别的会话
 * 有别的头开着的（会话表那一项 `viewed`，核心 HV-1）不弹，由开着它的那个头出。托盘认领了后台通知的（核心 TR-1 的 `claimed`，W-1088）：
 * 只为正在看的会话弹，别的会话都由托盘出。不弹的回 `null`。
 * @param {string|null} session 哪个会话的（没有会话的当成正在看的） @param {string|null} current 正在看的 @param {boolean} away 标签页不在前台
 * @param {boolean} [viewed] 会话表那一项写着有头开着它 @param {boolean} [claimed] 有托盘认领了后台通知
 * @returns {{silent: boolean}|null}
 */
export function popOf(session, current, away, viewed = false, claimed = false) {
  if (session && session !== current && (viewed || claimed)) return null;
  if (away) return { silent: false };
  return session && session !== current ? { silent: true } : null;
}
