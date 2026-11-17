// @ts-check
//! 连核心那条 WebSocket 的地址（蓝图 `web.md`「连核心」第 1 条）：网页软件是 `/ws`，走桥的带口令 `/ws?k=…`；断线以后自己重连的再带
//! `again=1`，那一头照它不拉起人停的核心（核心 CS-5，W-1210）。纯的，`location` 从外面给。

/**
 * @param {{protocol: string, host: string}} at 页面的 `location`
 * @param {string|null} key 桥的口令；网页软件的是 `null`
 * @param {boolean} again 断线以后自己重连
 */
export function socketUrl(at, key, again) {
  const query = [key ? `k=${key}` : null, again ? 'again=1' : null].filter(Boolean).join('&');
  return `${at.protocol === 'https:' ? 'wss' : 'ws'}://${at.host}/ws${query ? `?${query}` : ''}`;
}
