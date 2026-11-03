// @ts-check
//! 输入框空着时写的小提示（蓝图 `web.md`「输入框」写字的地方）：有哪几条、换一条挑哪条。不碰 DOM，随机数从外面给。
//! 每一条都是网页真有的本事；靠软件包的（附件）照它挂没挂上筛，没装的不提。

/** 一直有的几条（`text/*.json` 的 `tips.<名字>`） */
export const TIPS = ['slash', 'mention', 'newline', 'history', 'history_list', 'stash', 'level'];

/** 要按键的几条：主要指针是手指的（手机、平板）没有这些键，不出（2026-11-03 项目主人，W-1082） */
export const KEYS = ['newline', 'history', 'history_list', 'stash', 'level'];

/**
 * 现在有的几条：靠软件包的照它在不在；`touch` 的去掉要按键的。
 * @param {{attachments?: boolean, touch?: boolean}} has @returns {string[]}
 */
export function tipsFor(has) {
  const list = has.attachments ? [...TIPS, 'attach'] : [...TIPS];
  return has.touch ? list.filter((x) => !KEYS.includes(x)) : list;
}

/**
 * 换一条：照 `rand`（0 到 1）挑，不挑和上一条一样的（只剩一条的除外）；没有可挑的交回 `null`。
 * @param {string[]} list @param {string|null} last @param {number} rand @returns {string|null}
 */
export function pickTip(list, last, rand) {
  const pool = list.length > 1 ? list.filter((x) => x !== last) : list;
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand * pool.length))];
}
