// @ts-check
//! 只能看的会话（W-1168，im 第 59 条，2026-11-12 项目主人当面定：im 网页会话设置卡片里的「查看会话」跳到网页软件看这个群、私聊的
//! AI 会话，只看不发）：网址 `#session=<编号>` 点名的场所会话（通讯平台上的群、私聊）不在会话表里（核心 `session.list`、`sessions` 流只列
//! 本机的会话），订阅照常成。认法：会话表已经读到了、表里没有、不是整理记忆的会话、不是样张、订阅成了（没坏、这一刻读得了）。纯的。

/**
 * @param {{id: string|null, loaded: boolean, listed: boolean, dream: boolean, gallery: boolean, subscribed: boolean}} s
 *   `loaded` 会话表读到了没有（没读到以前什么都不算只读，免得托盘点通知打开的本机会话先锁一下）；`listed` 表里有没有；
 *   `subscribed` 订阅成了、没坏、读得了
 */
export function watchOnly(s) {
  return !!s.id && s.loaded && !s.listed && !s.dream && !s.gallery && s.subscribed;
}
