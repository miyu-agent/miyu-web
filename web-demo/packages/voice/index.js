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
import { ready, sentences, errorKey, micErrorKey, interrupted, playSentence, stopRun, chimeOn } from './model.js';
import { chime } from './chime.js';
import { Recorder } from './recorder.js';

/** 按住超过这么久再松开的算按住说话，松开就停（毫秒）；短的是点一下，接着录 */
const HOLD_MS = 450;

/** @typedef {{key: string, audio: HTMLAudioElement|null, audios?: HTMLAudioElement[], stopped: boolean, cancel: (() => void)|null}} Run 正在念的一轮：哪一轮、放着的那一句、停了没有、停的时候叫醒等着的 */

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
  /** 这一次录音响不响提示音（开始时照设置读一次，停下时照它） */
  let chiming = false;
  /** 开始那一声在放、麦还没开 */
  let opening = false;
  // 「正在听」（2026-11-10 项目主人：原来换成方块、外面一圈淡淡的边，不好看；三种样子里选了竖条，W-1139）：录着的时候麦克风换成四根
  // 跟着录音音量跳的竖条（`--voice-level`，还没收到音量时样式里照一个中间值轻轻起伏）。
  const glyph = h('span.voice-glyph', icon('mic'));
  const bars = h('span.voice-bars', { 'aria-hidden': 'true' }, [0, 1, 2, 3].map((i) => h('span.voice-bar', { style: `--i: ${i}` })));
  const mic = h('button.icon-button.voice-mic', { type: 'button', title: t('mic'), 'aria-label': t('mic') }, glyph, bars);
  const paint = () => {
    mic.classList.toggle('is-recording', !!rec);
    mic.classList.toggle('is-busy', busy);
    if (!rec) mic.style.removeProperty('--voice-level');
    const label = busy ? t('mic_working') : rec ? t('mic_stop') : t('mic');
    mic.title = label;
    mic.setAttribute('aria-label', label);
    glyph.replaceChildren(icon(busy ? 'loader-circle' : 'mic'));
  };
  /** 录着的音量（0～1，均方根）画成竖条的高度：人说话一般在 0.02～0.2，开方以后拉开 @param {number} level */
  const meter = (level) => mic.style.setProperty('--voice-level', String(Math.min(1, Math.sqrt(Math.max(0, level) * 8))));
  const start = async () => {
    if (rec || busy) return;
    const r = new Recorder({
      threshold: ctx.config.threshold,
      quiet: ctx.config.silence_ms,
      maxMs: ctx.config.max_seconds * 1000,
      onEnd: (why) => finish(r, why),
      onLevel: meter,
    });
    rec = r;
    paint();
    // 开始录的提示音（todolist 第 62 条，设置 `voice-input.chime`）：放完再开麦，免得录进去；读不到设置的当开着
    opening = true;
    chiming = await request('config.get', { keys: ['voice-input.chime'] }).then(chimeOn, () => true);
    if (chiming && rec === r) await chime('start');
    // 响着的时候又点了一下：当没开始
    if (!opening || rec !== r) return;
    opening = false;
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
  const stop = () => {
    // 开始那一声还没放完、麦还没开：收回去，不传空录音
    if (opening) {
      opening = false;
      rec = null;
      paint();
      return;
    }
    rec?.end('stop');
  };
  /** 停了：传上去、认成字、放进框里。 @param {Recorder} r @param {string} _why */
  const finish = async (r, _why) => {
    if (rec !== r) return;
    rec = null;
    busy = true;
    paint();
    // 停下的提示音：不等它，接着传
    if (chiming) chime('stop');
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
    const on = autoOn();
    auto.classList.toggle('is-on', on);
    auto.setAttribute('aria-pressed', String(on));
    const label = on ? t('auto_on') : t('auto');
    auto.title = label;
    auto.setAttribute('aria-label', label);
  };
  /** 停下正在念的。 */
  const hush = () => {
    if (!playing) return;
    // 这一轮造过的都停（火狐上被打断的那个可能还在响，2026-11-13 主人 1113 初验第 5 条）
    stopRun(playing);
    playing = null;
    paintSpeak();
  };
  /** 合成一句，交回能放的地址。 @param {string} text @param {string|null} persona */
  const synth = async (text, persona) => {
    const got = await call('tts', 'synthesize', { text, ...(persona ? { persona } : {}) });
    const type = typeof got?.media_type === 'string' ? got.media_type : 'audio/mpeg';
    return { url: await ctx.host.blobUrl(got.audio, type), type };
  };
  /** 放一句，放完了（停了的、被打断的也算）交回（`model.js` 的 `playSentence`）。 @param {Run} run @param {string} url */
  const play = (run, url) => playSentence(run, () => new Audio(url), () => new Error(t('errors.play')));
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
    const run = { key, audio: null, audios: [], stopped: false, cancel: null };
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
      // 自己停的、被打断的（浏览器的 AbortError）不说；真的出错照旧说
      if (!run.stopped && !interrupted(err)) fail(err);
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
    toggle('mic', stt, () => ctx.slots.mount('composer.send_side', { id: 'voice-mic', order: 10, render: () => mic }) ?? (() => {}));
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
