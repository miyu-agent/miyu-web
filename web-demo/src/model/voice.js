// @ts-check
//! 她说出来的一段语音（核心 SD-1，视图条目 `voice`：`{blob, media_type, name?, duration_ms?, by?, cause?}`；蓝图 `web.md`「语音条」，W-1212）：
//! 正文里画一个播放条（`ui/voice.js`），放不放照这一轮是谁开的。纯函数。

/**
 * 条目 → 正文的一条：没有 `blob` 的不画。
 * @param {any} e
 */
export function voiceItem(e) {
  if (typeof e.blob !== 'string' || !e.blob) return null;
  return {
    type: 'voice',
    key: e.id,
    turn: e.turn ?? null,
    voice: {
      blob: e.blob,
      media_type: typeof e.media_type === 'string' && e.media_type ? e.media_type : 'audio/wav',
      name: typeof e.name === 'string' && e.name ? e.name : null,
      duration_ms: Number.isFinite(e.duration_ms) && e.duration_ms > 0 ? e.duration_ms : null,
    },
  };
}

/**
 * 刚推来的一段语音要不要当场放（核心 `view.md`「条目」`voice`）：开这一轮的请求（`cause`）是这个页面发的，是在这里说的话，当场放；
 * `by` 是到点叫醒的（`schedule`）、没有 `by` 的，是没人开口的一轮，开着这个会话的头都放；别的头上说的只画播放条。
 * 读进来、重新订阅换上的老条目不走这里（`core/store.js` 只问推送里新来的）。
 * @param {any} entry @param {{mine: (id: string) => boolean, viewing: boolean}} here
 */
export function autoplays(entry, here) {
  if (typeof entry?.cause === 'string' && entry.cause && here.mine(entry.cause)) return true;
  const by = entry?.by;
  if (by == null || by.kind === 'schedule') return here.viewing;
  return false;
}
