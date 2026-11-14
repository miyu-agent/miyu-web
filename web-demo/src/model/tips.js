// @ts-check
//! 输入框空着时写的小提示（蓝图 `web.md`「输入框」写字的地方）：有哪几条、换一条挑哪条。不碰 DOM，随机数从外面给。
//! 每一条都是网页真有的本事；靠软件包的（附件）照它挂没挂上筛，没装的不提。

/** 一直有的几条（`text/*.json` 的 `tips.<名字>`） */
export const TIPS = ['slash', 'mention', 'newline', 'history', 'history_list', 'stash', 'level'];

/** 要按键的几条：主要指针是手指的（手机、平板）没有这些键，不出（2026-11-03 项目主人，W-1082） */
export const KEYS = ['newline', 'history', 'history_list', 'stash', 'level'];

/**
 * 手机上的说法（2026-11-14 主人：「手机版的 webui 的 tips 要和桌面端做区分」，W-1190）：桌面那条在手机上做不到、或者做法不一样的，
 * 换成手机上真有的那一种——附件没法拖，点框里的回形针选；权限级别没有 Tab，点框下面那一格换；模型点框下面的模型名换。
 * 桌面上的模型名也点得开，桌面那套只提按键、不提它，照旧。
 */
export const TOUCH = { attach: 'attach_touch', level: 'level_touch' };

/**
 * 现在有的几条：靠软件包的照它在不在；`skills` 是这个会话有能点名的技能（核心 SN-1 起才有，W-1126），有才提 `$`；
 * `touch` 的去掉要按键的、换成手机的说法（`TOUCH`），框下面露着模型名的（`model`）多一条点它换模型。
 * @param {{attachments?: boolean, skills?: boolean, touch?: boolean, model?: boolean}} has @returns {string[]}
 */
export function tipsFor(has) {
  const list = [...TIPS, ...(has.skills ? ['skill'] : []), ...(has.attachments ? ['attach'] : [])];
  if (!has.touch) return list;
  const mine = list.flatMap((x) => (x in TOUCH ? [TOUCH[/** @type {keyof typeof TOUCH} */ (x)]] : KEYS.includes(x) ? [] : [x]));
  return has.model ? [...mine, 'model_touch'] : mine;
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
