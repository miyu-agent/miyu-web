// @ts-check
//! 语音（软件包 `voice`，蓝图 `web.md`「语音」，核心设计 20 第七节，W-1128）：总线（核心 BUS-2）上查到 `stt`、`tts` 能用才画入口，
//! 不认包名；订 `bus` 流跟着变（装卸了语音包、模型刚下好）。
//! - 麦克风（`stt`）：输入框下面一排一个麦克风，点一下开始、再点一下或静下来就停；按住说话、松开就停也行。浏览器用 AudioWorklet 录、
//!   打成 16 kHz 单声道 16 位 wav（`recorder.js`），分块传成 blob，调 `stt.transcribe`，认出的字插进输入框；设置里能改成说完直接发。
//!   没听清（`clear` 是假）的不往框里放空字，说一句。
//! - 朗读（`tts`）：她每一轮收尾那一行（复制、重做中间，挂载位 `turn.actions`）一个朗读按钮，一句一句 `tts.synthesize`、在浏览器里放，
//!   第一句好了就放，再点一下停；念过的照这一轮记着，再听不再合成。右上角（`stage.tools`）一个自动朗读开关，只在这个标签页里生效：
//!   开着时正在看的会话答完一轮就念。
//! 出错照 `data.code` 说一句人话（字表 `errors`），没有的照原话。

import { h, icon } from '../../src/lib/dom.js';
import { upload } from '../../src/lib/upload.js';
import { ready, sentences, errorKey, micErrorKey } from './model.js';
import { Recorder } from './recorder.js';

/** 按住超过这么久再松开的算按住说话，松开就停（毫秒）；短的是点一下，接着录 */
const HOLD_MS = 450;

/** @typedef {{key: string, audio: HTMLAudioElement|null, stopped: boolean, cancel: (() => void)|null}} Run 正在念的一轮：哪一轮、放着的那一句、停了没有、停的时候叫醒等着的 */

/** @param {any} ctx */
export function apply(ctx) {
  const t = (/** @type {string} */ path, /** @type {any} */ fields) => ctx.text(path, fields);
  const core = ctx.core;
  if (!core) return;
  const request = (/** @type {string} */ method, /** @type {any} */ params) => core.request(method, params);
  const call = (/** @type {string} */ name, /** @type {string} */ method, /** @type {any} */ params) => request('bus.call', { name, method, params });
  /** 出错说一句：认得的出错码照字表，不认得的照原话。 @param {any} err */
  const fail = (err) => {
    const key = errorKey(err);
    ctx.composer.say(key ? t(`errors.${key}`) : t('errors.other', { reason: err?.message ?? String(err) }));
  };

  // ---- 总线上有什么 ----
  let names = /** @type {any[]} */ ([]);
  const subscribe = async () => {
    try {
      const got = await request('subscribe', { stream: 'bus' });
      names = Array.isArray(got?.names) ? got.names : [];
    } catch (err) {
      // 旧核心没有总线：当没有语音
      console.error(`订阅不了总线，当没有语音：${/** @type {any} */ (err)?.message}`);
      names = [];
    }
    sync();
  };
  const onPush = (/** @type {string} */ method, /** @type {any} */ p) => {
    if (method === 'resync' && p?.stream === 'bus') subscribe();
    else if (method === 'bus.changed') {
      names = Array.isArray(p?.names) ? p.names : [];
      sync();
    }
  };

  // ---- 麦克风 ----
  /** @type {Recorder|null} */
  let rec = null;
  let busy = false;
  let pressedAt = 0;
  const mic = h('button.icon-button.voice-mic', { type: 'button', title: t('mic'), 'aria-label': t('mic') }, icon('mic'));
  const paint = () => {
    mic.classList.toggle('is-recording', !!rec);
    mic.classList.toggle('is-busy', busy);
    const label = busy ? t('mic_working') : rec ? t('mic_stop') : t('mic');
    mic.title = label;
    mic.setAttribute('aria-label', label);
    mic.replaceChildren(icon(busy ? 'loader-circle' : rec ? 'square' : 'mic'));
  };
  const start = async () => {
    if (rec || busy) return;
    const r = new Recorder({
      threshold: ctx.config.threshold,
      quiet: ctx.config.silence_ms,
      maxMs: ctx.config.max_seconds * 1000,
      onEnd: (why) => finish(r, why),
    });
    rec = r;
    paint();
    try {
      await r.start();
    } catch (err) {
      r.release();
      if (rec === r) rec = null;
      paint();
      const key = micErrorKey(err);
      ctx.composer.say(key ? t(`errors.${key}`) : t('errors.other', { reason: /** @type {any} */ (err)?.message ?? String(err) }));
    }
  };
  const stop = () => rec?.end('stop');
  /** 停了：传上去、认成字、放进框里。 @param {Recorder} r @param {string} _why */
  const finish = async (r, _why) => {
    if (rec !== r) return;
    rec = null;
    busy = true;
    paint();
    try {
      const bytes = r.wav();
      const put = await upload(request, { name: 'voice.wav', size: bytes.length }, 'audio/wav',
        async (offset, length) => bytes.subarray(offset, offset + length), { chunk: ctx.config.chunk_bytes, tries: 3 });
      const got = await call('stt', 'transcribe', { audio: put.blob });
      const text = typeof got?.text === 'string' ? got.text.trim() : '';
      if (got?.clear === false || !text) ctx.composer.say(t('unclear'));
      else {
        ctx.composer.insert(text);
        if (ctx.config.after === 'send') ctx.composer.send();
      }
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
      paint();
    }
  };
  // 点一下开始、再点停；按住超过一会儿再松开的算按住说话，松开就停
  mic.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (rec) {
      pressedAt = 0;
      stop();
    } else {
      pressedAt = performance.now();
      start();
    }
  });
  const release = () => {
    if (pressedAt && rec && performance.now() - pressedAt > HOLD_MS) stop();
    pressedAt = 0;
  };
  mic.addEventListener('pointerup', release);
  mic.addEventListener('pointerleave', release);
  // 键盘：空格、回车照点一下
  mic.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (rec) stop();
    else start();
  });

  // ---- 朗读 ----
  /** 念过的照这一轮记着：`会话:轮` → 一句一句的音频（地址、媒体类型）；再听不再合成 */
  const cache = new Map();
  /** 正在念的：哪一轮、放着的那个 audio、停了没有 */
  let playing = /** @type {Run|null} */ (null);
  /** 收尾那一行的朗读按钮：照这一轮在不在念换图标 @type {Map<string, HTMLButtonElement>} */
  const buttons = new Map();
  const paintSpeak = () => {
    for (const [key, b] of buttons) {
      if (!b.isConnected) { buttons.delete(key); continue; }
      const on = playing?.key === key;
      b.classList.toggle('is-playing', on);
      const label = on ? t('speak_stop') : t('speak');
      b.title = label;
      b.setAttribute('aria-label', label);
      b.replaceChildren(icon(on ? 'square' : 'volume-2'));
    }
    auto.classList.toggle('is-on', autoOn());
  };
  /** 停下正在念的。 */
  const hush = () => {
    if (!playing) return;
    playing.stopped = true;
    playing.audio?.pause();
    playing.cancel?.();
    playing = null;
    paintSpeak();
  };
  /** 合成一句，交回能放的地址。 @param {string} text @param {string|null} persona */
  const synth = async (text, persona) => {
    const got = await call('tts', 'synthesize', { text, ...(persona ? { persona } : {}) });
    const type = typeof got?.media_type === 'string' ? got.media_type : 'audio/mpeg';
    return { url: await ctx.host.blobUrl(got.audio, type), type };
  };
  /** 放一句，放完了（停了的也算）交回。 @param {Run} run @param {string} url */
  const play = (run, url) => new Promise((resolve, reject) => {
    const audio = new Audio(url);
    run.audio = audio;
    run.cancel = () => resolve(undefined);
    audio.onended = () => resolve(undefined);
    audio.onerror = () => reject(new Error(t('errors.play')));
    audio.play().catch(reject);
  });
  /**
   * 念一轮：一句一句合成，第一句好了就放，后面的边放边合成下一句（同一时间只多合成一句）。
   * @param {string} session @param {number|undefined} turn @param {string} text
   */
  const speak = async (session, turn, text) => {
    const key = `${session}:${turn ?? 'last'}`;
    if (playing?.key === key) return hush();
    hush();
    const parts = sentences(text);
    if (!parts.length) return;
    /** @type {Run} */
    const run = { key, audio: null, stopped: false, cancel: null };
    playing = run;
    paintSpeak();
    const persona = ctx.chat.persona?.(session) ?? null;
    /** @type {Promise<{url: string, type: string}>[]} */
    const got = cache.get(key) ?? [];
    cache.set(key, got);
    const at = (/** @type {number} */ i) => (got[i] ??= synth(parts[i], persona).catch((err) => { delete got[i]; throw err; }));
    try {
      for (let i = 0; i < parts.length && !run.stopped; i++) {
        const now = at(i);
        if (i + 1 < parts.length) at(i + 1).catch(() => {});
        let url;
        try {
          ({ url } = await now);
        } catch (err) {
          // 这一段没有能念的（代码块、只有符号）：跳过，接着念下一句
          if (errorKey(err) === 'empty_text') continue;
          throw err;
        }
        if (run.stopped) break;
        await play(run, url);
      }
    } catch (err) {
      if (!run.stopped) fail(err);
    } finally {
      if (playing === run) {
        playing = null;
        paintSpeak();
      }
    }
  };
  const turnButton = (/** @type {{turn: number, session: string|null}} */ { turn, session }) => {
    if (!session) return null;
    const key = `${session}:${turn}`;
    const b = /** @type {HTMLButtonElement} */ (h('button.msg-action.voice-speak', { type: 'button',
      onclick: () => speak(session, turn, ctx.chat.turnText(turn)) }, icon('volume-2')));
    buttons.set(key, b);
    queueMicrotask(paintSpeak);
    return b;
  };

  // ---- 自动朗读：只在这个标签页 ----
  // 记在这一页里：只在这个标签页生效，刷新、换个标签页都是关的
  let autoread = false;
  const autoOn = () => autoread;
  const auto = h('button.icon-button.voice-auto', { type: 'button', title: t('auto'), 'aria-label': t('auto'), onclick: () => {
    autoread = !autoread;
    if (!autoread) hush();
    paintSpeak();
  } }, icon('audio-lines'));
  ctx.effect(() => ctx.sessions.onAttention((/** @type {string} */ id, /** @type {string} */ what) => {
    if (what !== 'done' || !autoOn() || id !== ctx.chat.current?.()) return;
    const text = ctx.chat.turnText();
    if (text) speak(id, undefined, text);
  }));

  // ---- 照总线画入口：有了挂上，没了拿掉 ----
  /** @type {Record<string, (() => void)|null>} */
  const mounted = { mic: null, speak: null, auto: null };
  const toggle = (/** @type {string} */ which, /** @type {boolean} */ on, /** @type {() => () => void} */ mount) => {
    if (on && !mounted[which]) mounted[which] = mount();
    else if (!on && mounted[which]) {
      mounted[which]?.();
      mounted[which] = null;
    }
  };
  function sync() {
    const stt = ready(names, 'stt');
    const tts = ready(names, 'tts');
    if (!stt && rec) rec.end('stop');
    if (!tts) hush();
    toggle('mic', stt, () => ctx.slots.mount('composer.bar', { id: 'voice-mic', order: 20, render: () => mic }) ?? (() => {}));
    toggle('speak', tts, () => ctx.slots.mount('turn.actions', { id: 'voice-speak', order: 10, render: turnButton }) ?? (() => {}));
    toggle('auto', tts, () => ctx.slots.mount('stage.tools', { id: 'voice-auto', order: 5, render: () => auto }) ?? (() => {}));
    paint();
    paintSpeak();
  }

  core.onPush(onPush);
  ctx.effect(() => () => {
    core.pushes?.delete(onPush);
    rec?.end('stop');
    hush();
    request('unsubscribe', { stream: 'bus' }).catch(() => {});
  });
  ctx.effect(() => core.onRejoin?.(subscribe) ?? (() => {}));
  subscribe();
}
