// @ts-check
//! 语音的纯逻辑（软件包 `voice`，蓝图 `web.md`「语音」，核心设计 20 第七节）：总线上 `stt`、`tts` 能不能用，录下来的声音降到
//! 16 kHz、打成 16 位单声道 wav，静下来多久算说完，回答切成一句一句合成，出错码换成哪句话。不碰页面。

/** 识别要的采样率（`stt.transcribe` 一定收 16 kHz 单声道 16 位 PCM 的 wav，核心 `reference/bus.md`） */
export const RATE = 16000;

/**
 * 总线上这个名字能不能用（`bus.list` 的 `names`、`bus.changed` 推来的整份）：有人提供、`ready` 是真的。不认包名（设计 20 V13）。
 * @param {any} names @param {string} name
 */
export function ready(names, name) {
  return Array.isArray(names) && names.some((n) => n?.name === name && n?.kind === 'provides' && n?.ready === true);
}

/**
 * 降采样到 `to`：每个新样本照它对应的那一段取平均（降的倍数不是整数也行）；`from` 已经是 `to` 的原样交回。
 * @param {Float32Array} samples @param {number} from @param {number} [to]
 */
export function downsample(samples, from, to = RATE) {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let k = start; k < end; k++) sum += samples[k];
    out[i] = sum / (end - start);
  }
  return out;
}

/**
 * 打成 wav：16 位、单声道、`rate`。超出 [-1, 1] 的削掉。
 * @param {Float32Array} samples @param {number} [rate]
 * @returns {Uint8Array}
 */
export function wav(samples, rate = RATE) {
  const data = samples.length * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const text = (/** @type {number} */ at, /** @type {string} */ s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** 一块声音有多响（均方根）。 @param {Float32Array} samples */
export function loudness(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/**
 * 说完没有：说过话（响过 `threshold`）以后，连着 `quiet` 毫秒都没响过的算说完（同 `stt.record` 的 `silence_ms`，默认 1200）。
 * 一块一块喂（`feed`，那一块的响度和时长），说完了交回 `true`。还没开口的不算说完。
 */
export class Silence {
  /** @param {{threshold: number, quiet: number}} opts */
  constructor({ threshold, quiet }) {
    this.threshold = threshold;
    this.quiet = quiet;
    this.spoke = false;
    this.still = 0;
  }

  /** @param {number} level @param {number} ms */
  feed(level, ms) {
    if (level >= this.threshold) {
      this.spoke = true;
      this.still = 0;
      return false;
    }
    if (!this.spoke) return false;
    this.still += ms;
    return this.still >= this.quiet;
  }
}

/** 一句话到这些字为止（中英文的句号、问号、感叹号、分号，换行） */
const END = /([。！？!?；;]+["'」』）)]*|\.(?=\s)|\n+)/;

/** 围起来的代码块（三个以上的反引号、波浪线，到同样的收尾或者结尾） */
const FENCE = /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(\n\2[^\S\n]*(?=\n|$)|$)/g;

/**
 * 回答切成一句一句交给 `tts.synthesize`（设计 20 第七节：一句一句合成，第一句好了就放）：照句末的标点、换行切，太短的并进下一句，
 * 一句最长 `max` 个字（超出的照逗号、空格再切，再不行硬切）。围起来的代码块整块是一段、不切开（念不念由合成的一方定，`say`
 * 把 Markdown 转成念得出来的话），不和前后的并。空白的不要。
 * @param {string} text @param {{min?: number, max?: number}} [opts]
 * @returns {string[]}
 */
export function sentences(text, opts = {}) {
  const all = String(text ?? '');
  /** @type {string[]} */
  const out = [];
  let at = 0;
  for (const m of all.matchAll(FENCE)) {
    out.push(...prose(all.slice(at, m.index), opts));
    if (m[0].trim()) out.push(m[0].trim());
    at = (m.index ?? 0) + m[0].length;
  }
  out.push(...prose(all.slice(at), opts));
  return out;
}

/** 没有代码块的一段照句切。 @param {string} text @param {{min?: number, max?: number}} opts */
function prose(text, { min = 12, max = 300 }) {
  const parts = text.split(END);
  /** @type {string[]} */
  const pieces = [];
  for (let i = 0; i < parts.length; i += 2) pieces.push((parts[i] ?? '') + (parts[i + 1] ?? ''));
  /** @type {string[]} */
  const out = [];
  let held = '';
  for (const piece of pieces) {
    held += piece;
    if (held.trim().length >= min) {
      out.push(...cut(held.trim(), max));
      held = '';
    }
  }
  if (held.trim()) out.push(...cut(held.trim(), max));
  return out.filter((s) => s.trim());
}

/** 一句太长：照逗号、空格切到 `max` 以内，切不开的硬切。 @param {string} s @param {number} max */
function cut(s, max) {
  /** @type {string[]} */
  const out = [];
  let rest = s;
  while (rest.length > max) {
    const head = rest.slice(0, max);
    const at = Math.max(head.lastIndexOf('，'), head.lastIndexOf(','), head.lastIndexOf('、'), head.lastIndexOf(' '));
    const end = at > max / 3 ? at + 1 : max;
    out.push(rest.slice(0, end).trim());
    rest = rest.slice(end);
  }
  if (rest.trim()) out.push(rest.trim());
  return out;
}

/**
 * 放的时候抛的是不是「被打断」（浏览器的 `AbortError`）：`play()` 还没放起来就被 `pause()`、换了音源、被浏览器收走都抛它，
 * 火狐的原话是「The fetching process for the media resource was aborted by the user agent at the user's request」。
 * 这不是合成、音频坏了，不该当出错说给人（发版前 check 29，2026-11-11 项目主人）。
 * @param {any} err
 */
export function interrupted(err) {
  return err?.name === 'AbortError';
}

/**
 * 放一句，放完了交回；人停了的（`run.stopped`，`run.cancel` 叫醒）也算放完。被打断的（[`interrupted`]）不算出错：没停的再放一次
 * （`tries` 一共放几次），还被打断就跳过这一句；音频坏了、放不出来的（`onerror`、别的错）照旧抛出去。
 * @param {{audio: any, stopped: boolean, cancel: (() => void)|null}} run 正在念的一轮
 * @param {() => {play: () => Promise<void>, onended: any, onerror: any}} make 造这一句的播放器
 * @param {() => Error} broken 音频坏了时抛什么
 * @param {number} [tries]
 * @returns {Promise<void>}
 */
export function playSentence(run, make, broken, tries = 2) {
  return new Promise((resolve, reject) => {
    const audio = make();
    run.audio = audio;
    run.cancel = () => resolve();
    audio.onended = () => resolve();
    audio.onerror = () => reject(broken());
    audio.play().catch((/** @type {any} */ err) => {
      if (!interrupted(err)) return reject(err);
      if (run.stopped || tries <= 1) return resolve();
      playSentence(run, make, broken, tries - 1).then(resolve, reject);
    });
  });
}

/** 字表里有一句话的出错码（核心 `reference/bus.md`：总线的、`stt`、`tts` 的） */
export const CODES = ['bad_audio', 'too_long', 'engine_failed', 'mic_busy', 'no_microphone', 'empty_text', 'not_configured', 'no_speaker', 'no_provider', 'not_exported'];

/**
 * 出错了照哪一句说：提供方的出错码在 `data.code`（核心转成 `method_failed`），总线自己的在 `reason`；字表里有的交它的键，
 * 没有的交 `null`（照原话说）。
 * @param {any} err
 * @returns {string|null}
 */
export function errorKey(err) {
  const code = err?.data?.code ?? err?.reason;
  return typeof code === 'string' && CODES.includes(code) ? code : null;
}

/**
 * 浏览器拿麦克风时抛的（`getUserMedia`）换成哪一句：没给权限、没有麦克风、被别的程序占着；别的交 `null`。
 * @param {any} err
 * @returns {'mic_denied'|'no_microphone'|'mic_busy'|null}
 */
export function micErrorKey(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'mic_denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no_microphone';
    case 'NotReadableError':
    case 'AbortError':
      return 'mic_busy';
    default:
      return null;
  }
}

/**
 * 认出来的字放进输入框的哪：光标那里插进去，前后缺空格的不补（中文不要空格），交回新的字和光标。
 * @param {string} value @param {number} start @param {number} end @param {string} text
 */
export function insertAt(value, start, end, text) {
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}
