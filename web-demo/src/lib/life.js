// @ts-check
//! 推演人生（核心设计 70，LF-1 到 LF-9；蓝图 `web.md`「推演人生」）：会话表里认人生会话、结束了没有，`/life` 哪几种要先问，
//! `life.status` 写成一行字。纯函数。
//!
//! 人生会话不进左栏和全部会话（2026-11-14 项目主人：「和别的会话混在一起的话，万一误删了不是很尴尬？」「还记得那个 webui 左侧边栏那个
//! 更多吗？可以放那里」）：从左栏「更多」的「推演人生」打开（软件包 `life`）。

/** 会话表那一项是不是人生会话（`session.list` 的 `life: true`）。 @param {{life?: boolean}|null|undefined} entry */
export const isLife = (entry) => entry?.life === true;

/** 结束了的人生会话（`life_ended: true`）：封存了，只读。 @param {{life?: boolean, life_ended?: boolean}|null|undefined} entry */
export const lifeEnded = (entry) => isLife(entry) && entry?.life_ended === true;

/**
 * `/life` 的哪几种发之前先问（2026-11-14 项目主人：网页确认，终端不确认）：`kill` 结束这段人生、`new` 先结束再开，都会清掉这段人生的记忆、
 * 恢复不了；`/life`、`pause`、`resume` 不问。交回问的是哪一种，不用问的是 `null`。
 * @param {string} name 命令名（不带 `/`） @param {string|null} words 后面的字
 * @returns {'kill'|'new'|null}
 */
export function lifeAsk(name, words) {
  if (name.toLowerCase() !== 'life') return null;
  const first = (words ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return first === 'kill' || first === 'new' ? first : null;
}

/**
 * `life.status` 的回应写成状态那一行的几样（人格设置、「推演人生」的列表）：`state` 照原样，`next` 是下次醒的时刻（只有在跑的有），
 * `doing` 是她最近写的「现在在干嘛」那一句（没有的 `null`）。认不得的当 `none`。
 * @param {any} got
 * @returns {{state: 'none'|'running'|'paused'|'ended', session: string|null, next: Date|null, doing: string|null}}
 */
export function lifeState(got) {
  const state = ['running', 'paused', 'ended'].includes(got?.state) ? got.state : 'none';
  const next = state === 'running' && typeof got?.next === 'string' ? new Date(got.next) : null;
  return {
    state,
    session: typeof got?.session === 'string' ? got.session : null,
    next: next && !Number.isNaN(next.getTime()) ? next : null,
    doing: typeof got?.doing?.text === 'string' && got.doing.text.trim() ? got.doing.text.trim() : null,
  };
}

/**
 * 开关该是开着还是关着（人格设置）：在跑的开着；暂停、结束、没有的关着。拨开时做哪一样：没有的、结束了的 `start`（开一条新的，先问一句），
 * 暂停着的 `resume`；拨关时在跑的 `pause`（关掉算暂停，不是结束，设计 70 第二节第 10 条）。
 * @param {'none'|'running'|'paused'|'ended'} state @param {boolean} on 拨成开还是关
 * @returns {'start'|'resume'|'pause'|null} 什么都不用做的是 `null`
 */
export function lifeToggle(state, on) {
  if (on) return state === 'running' ? null : state === 'paused' ? 'resume' : 'start';
  return state === 'running' ? 'pause' : null;
}
