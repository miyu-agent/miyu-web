// @ts-check
//! 浏览器录音（软件包 `voice`，核心设计 20 第七节）：`getUserMedia` 拿麦克风，AudioWorklet（`capture.worklet.js`）收一块块原始的
//! PCM，停的时候降到 16 kHz、打成 16 位单声道 wav（`model.js`）。不用 `MediaRecorder`：各家浏览器录出来是 webm、mp4，识别那一头就得
//! 多带解码。静下来（`Silence`）、录满了自己停，`onEnd` 交回为什么停。

import { RATE, Silence, downsample, loudness, wav } from './model.js';

/** @typedef {'silence'|'stop'|'max'} Ended */

export class Recorder {
  /**
   * @param {{threshold: number, quiet: number, maxMs: number, onEnd: (why: Ended) => void, onLevel?: (level: number) => void}} opts
   */
  constructor(opts) {
    this.opts = opts;
    /** @type {Float32Array[]} */
    this.chunks = [];
    this.length = 0;
    this.rate = RATE;
    this.ms = 0;
    this.silence = new Silence({ threshold: opts.threshold, quiet: opts.quiet });
    /** @type {MediaStream|null} */
    this.stream = null;
    /** @type {AudioContext|null} */
    this.audio = null;
    /** @type {AudioWorkletNode|null} */
    this.node = null;
    this.done = false;
  }

  /** 开麦：拿不到麦克风的照浏览器的错抛（`micErrorKey` 认）。 */
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    // 先要 16 kHz 的：要得到的省掉降采样；有的浏览器（Firefox 接麦克风时）不认，照它自己的采样率录、停的时候降
    try {
      this.audio = new AudioContext({ sampleRate: RATE });
      await this.connect();
    } catch {
      await this.audio?.close().catch(() => {});
      this.audio = new AudioContext();
      await this.connect();
    }
    this.rate = this.audio.sampleRate;
  }

  async connect() {
    const audio = /** @type {AudioContext} */ (this.audio);
    await audio.audioWorklet.addModule(new URL('./capture.worklet.js', import.meta.url));
    const source = audio.createMediaStreamSource(/** @type {MediaStream} */ (this.stream));
    const node = new AudioWorkletNode(audio, 'miyu-voice-capture');
    node.port.onmessage = (e) => this.take(/** @type {Float32Array} */ (e.data));
    source.connect(node);
    this.node = node;
  }

  /** 收一块：记下、看响度，静下来了、录满了停。 @param {Float32Array} block */
  take(block) {
    if (this.done) return;
    this.chunks.push(block);
    this.length += block.length;
    const ms = (block.length / (this.audio?.sampleRate ?? RATE)) * 1000;
    this.ms += ms;
    const level = loudness(block);
    this.opts.onLevel?.(level);
    if (this.silence.feed(level, ms)) this.end('silence');
    else if (this.ms >= this.opts.maxMs) this.end('max');
  }

  /** 停：人点的（`stop`）、静下来了、录满了。 @param {Ended} why */
  end(why) {
    if (this.done) return;
    this.done = true;
    this.release();
    this.opts.onEnd(why);
  }

  /** 关麦、关掉音频（再点不会接着录）。 */
  release() {
    this.node?.port.close();
    this.node?.disconnect();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.audio?.close().catch(() => {});
  }

  /** 录下的打成 wav。 */
  wav() {
    const all = new Float32Array(this.length);
    let at = 0;
    for (const c of this.chunks) {
      all.set(c, at);
      at += c.length;
    }
    return wav(downsample(all, this.rate), RATE);
  }

  /** 录下了多少毫秒。 */
  get duration() { return this.ms; }
}
