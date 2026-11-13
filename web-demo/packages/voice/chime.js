// @ts-check
//! 语音输入的提示音（todolist 第 62 条，W-1176）：浏览器自己录音，语音包不知道什么时候开始、停下（录完才调 `stt.transcribe`），所以网页自己
//! 用 WebAudio 合成两个短音放（`model.js` 的 `chimeTones`）；终端那头由语音包在 `stt.record` 时自己响。放不出来（浏览器不让开声音）的
//! 不出声，不耽误录音。

import { chimeTones, chimeLength, CHIME } from './model.js';

/** @type {AudioContext|null} */
let audio = null;

/** 放一声：开始那一声放完才交回（再开麦），停下那一声不用等。 @param {'start'|'stop'} kind @returns {Promise<void>} */
export async function chime(kind) {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') await audio.resume();
    const t0 = audio.currentTime + 0.01;
    const fade = CHIME.fade_ms / 1000;
    for (const tone of chimeTones(kind)) {
      const start = t0 + tone.at / 1000;
      const end = start + tone.ms / 1000;
      const osc = audio.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = tone.freq;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(CHIME.gain, start + fade);
      gain.gain.setValueAtTime(CHIME.gain, end - fade);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(end + 0.01);
    }
    await new Promise((resolve) => setTimeout(resolve, chimeLength(kind) + 20));
  } catch (err) {
    console.warn(`提示音放不出来：${/** @type {any} */ (err)?.message ?? err}`);
  }
}
