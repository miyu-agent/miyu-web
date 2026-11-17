// @ts-check
//! 她说出来的一段语音（核心 SD-1，蓝图 `web.md`「语音条」，W-1212）：正文里一个播放条——播放、暂停，进度，时长，有名字的写名字。
//!
//! 一段语音一个播放器（照「会话/条目编号」记着，不放进页面）：播放条重画（对话区换掉节点）不打断在放的，推送来了要当场放的
//! （`playVoice`，会话仓库照 `model/voice.js` 的 `autoplays` 挑出来的）即使这个会话没画在屏幕上也放得出来。浏览器拦了自动播放的
//! （`play()` 被拒）只记一句，播放条照常在，人点一下就放。

import { h, icon, replace } from './dom.js';
import { t } from '../util/res.js';
import { blobUrl } from '../core/host.js';
import { voiceItem } from '../model/voice.js';

/** @typedef {{blob: string, media_type: string, name: string|null, duration_ms: number|null}} Voice */

/** 「会话/条目编号」→ 播放器、地址写好了没有 @type {Map<string, {audio: HTMLAudioElement, ready: Promise<void>}>} */
const players = new Map();

/** @param {string} key @param {Voice} voice */
function playerOf(key, voice) {
  let p = players.get(key);
  if (!p) {
    const audio = new Audio();
    audio.preload = 'metadata';
    const ready = Promise.resolve(blobUrl(voice.blob, voice.media_type)).then((url) => {
      if (url) audio.src = url;
    });
    p = { audio, ready };
    players.set(key, p);
  }
  return p;
}

/** 放一段：地址好了再放；浏览器拦了（没点过页面的自动播放）、放不了的只记一句，不往外抛。 @param {{audio: HTMLAudioElement, ready: Promise<void>}} p @param {string} what */
function start(p, what) {
  p.ready.then(() => p.audio.play()).catch((err) => console.warn(`语音没有放出来（${what}）：${err?.message ?? err}`));
}

/**
 * 推送里新来的一段语音、该在这个页面上当场放的（`core/store.js` 的 `voiced`）：同一段的播放条画出来时接着这个播放器。
 * @param {string} session @param {any} entry 视图条目 `voice`
 */
export function playVoice(session, entry) {
  const item = voiceItem(entry);
  if (!item) return;
  start(playerOf(`${session}/${item.key}`, item.voice), item.voice.name ?? item.key);
}

/**
 * 正文里的播放条。
 * @param {{key: string, voice: Voice}} it @param {string|null} session
 */
export function voiceBar(it, session) {
  const p = playerOf(`${session ?? ''}/${it.key}`, it.voice);
  const { audio } = p;
  const play = h('button.voice-clip-play', { type: 'button' });
  const fill = h('div.voice-clip-track-fill');
  const track = h('div.voice-clip-track', { role: 'slider', tabindex: '-1', 'aria-label': t('media.progress'), 'aria-valuemin': '0', 'aria-valuenow': '0' }, fill);
  const time = h('span.voice-clip-time', it.voice.duration_ms ? clock(it.voice.duration_ms / 1000) : '--:--');
  const name = it.voice.name ? h('span.voice-clip-name', { title: it.voice.name }, it.voice.name) : null;
  const bar = h('div.voice-clip', play, track, time, name);

  const total = () => (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (it.voice.duration_ms ?? 0) / 1000);
  /** 按钮现在画的是不是「暂停」（变了才换图标） @type {boolean|null} */
  let drawn = null;
  const sync = () => {
    const playing = !audio.paused && !audio.ended;
    if (playing !== drawn) {
      drawn = playing;
      replace(play, icon(playing ? 'pause' : 'play'));
      const label = t(playing ? 'media.pause' : 'media.play');
      play.title = label;
      play.setAttribute('aria-label', label);
      bar.classList.toggle('is-playing', playing);
    }
    const d = total();
    const ratio = d > 0 ? Math.min(Math.max(audio.currentTime / d, 0), 1) : 0;
    fill.style.width = `${(ratio * 100).toFixed(2)}%`;
    if (d > 0) time.textContent = clock(d);
    track.setAttribute('aria-valuenow', String(Math.floor(audio.currentTime || 0)));
  };
  play.addEventListener('click', () => {
    if (audio.paused || audio.ended) start(p, it.voice.name ?? it.key);
    else audio.pause();
  });
  // 点进度条跳到那里
  track.addEventListener('click', (e) => {
    const d = total();
    const box = track.getBoundingClientRect();
    if (d <= 0 || box.width <= 0) return;
    audio.currentTime = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1) * d;
  });
  const events = ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange', 'error'];
  // 节点被对话区换掉、拿掉以后（上过页面、现在不在了）不再跟着这个播放器：播放器还在，重画的那一条接上
  let shown = false;
  const follow = (/** @type {Event} */ e) => {
    shown ||= bar.isConnected;
    if (shown && !bar.isConnected) {
      for (const ev of events) audio.removeEventListener(ev, follow);
      return;
    }
    if (e.type === 'error') failed();
    else sync();
  };
  // 放不了的（blob 没了、格式不认）：时长那一格写「无法播放」
  const failed = () => {
    bar.classList.add('is-error');
    time.textContent = t('media.audio_failed');
  };
  for (const ev of events) audio.addEventListener(ev, follow);
  sync();
  if (audio.error) failed();
  return bar;
}

/** 播放条上的时长：`m:ss`。 @param {number} secs */
function clock(secs) {
  const s = Math.max(0, Math.round(secs || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
