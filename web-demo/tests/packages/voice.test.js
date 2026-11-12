// 语音（软件包 voice，W-1128）的纯逻辑：总线上能不能用、降采样、打 wav、静下来算说完、切句、出错码。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ready, downsample, wav, loudness, Silence, sentences, errorKey, micErrorKey, insertAt, RATE, interrupted, playSentence } from '../../packages/voice/model.js';

test('总线上 stt、tts 有人提供、ready 才算能用，不认包名', () => {
  const names = [
    { name: 'stt', kind: 'provides', package: 'voice-input', ready: true },
    { name: 'tts', kind: 'provides', package: 'say', ready: false },
    { name: 'stt.engine', kind: 'plugs', package: 'x', ready: true },
  ];
  assert.equal(ready(names, 'stt'), true);
  assert.equal(ready(names, 'tts'), false, '没配好的不画');
  assert.equal(ready([{ name: 'stt', kind: 'provides', package: 'other', ready: true }], 'stt'), true, '别家提供的也认');
  assert.equal(ready(names, 'stt.engine'), false, 'plugs 不算');
  assert.equal(ready(null, 'stt'), false);
});

test('降到 16 kHz：48 kHz 三个一组取平均，同采样率原样', () => {
  const s = new Float32Array([0.3, 0.3, 0.3, -0.6, -0.6, -0.6]);
  assert.deepEqual([...downsample(s, 48000)].map((x) => +x.toFixed(3)), [0.3, -0.6]);
  assert.equal(downsample(s, RATE), s);
  assert.equal(downsample(new Float32Array(441), 44100).length, 160);
});

test('wav：RIFF 头写 16 kHz、单声道、16 位，样本照小端写、超出的削掉', () => {
  const bytes = wav(new Float32Array([0, 1, -1, 2]));
  const v = new DataView(bytes.buffer);
  const tag = (at) => String.fromCharCode(...bytes.subarray(at, at + 4));
  assert.equal(tag(0), 'RIFF');
  assert.equal(tag(8), 'WAVE');
  assert.equal(tag(36), 'data');
  assert.equal(v.getUint16(20, true), 1, 'PCM');
  assert.equal(v.getUint16(22, true), 1, '单声道');
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 8);
  assert.equal(bytes.length, 52);
  assert.deepEqual([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true)), [0, 32767, -32768, 32767]);
});

test('静下来：开过口以后连着安静够久才算说完，还没开口的不算', () => {
  const s = new Silence({ threshold: 0.1, quiet: 1000 });
  assert.equal(s.feed(0, 5000), false, '没开口');
  assert.equal(s.feed(0.5, 100), false);
  assert.equal(s.feed(0.01, 600), false);
  assert.equal(s.feed(0.3, 100), false, '又说了：重新数');
  assert.equal(s.feed(0.01, 600), false);
  assert.equal(s.feed(0.01, 400), true);
  assert.ok(Math.abs(loudness(new Float32Array([0.5, -0.5])) - 0.5) < 1e-9);
});

test('切句：照句末标点、换行切，短的并进下一句，长的照逗号再切', () => {
  assert.deepEqual(sentences('好的。今天下午三点开会，记得带电脑。明天见！'), ['好的。今天下午三点开会，记得带电脑。', '明天见！']);
  assert.deepEqual(sentences('First sentence here. Second one is here.\nThird line'), ['First sentence here.', 'Second one is here.', 'Third line']);
  assert.deepEqual(sentences('   \n  '), []);
  // 代码块整块一段，不切开、不和前后的并
  assert.deepEqual(sentences('下面是图：\n```svg\n<svg>。</svg>\n```\n图在上面，看看吧。'), ['下面是图：', '```svg\n<svg>。</svg>\n```', '图在上面，看看吧。']);
  const long = sentences(`${'一二三四五，'.repeat(20)}。`, { max: 30 });
  assert.ok(long.length > 1 && long.every((x) => x.length <= 30), JSON.stringify(long));
});

test('出错码：提供方的在 data.code，总线的在 reason；不认得的交 null 照原话说', () => {
  assert.equal(errorKey({ reason: 'method_failed', data: { code: 'mic_busy' } }), 'mic_busy');
  assert.equal(errorKey({ reason: 'no_provider', data: { name: 'stt' } }), 'no_provider');
  assert.equal(errorKey({ reason: 'method_failed', data: { code: 'weird' } }), null);
  assert.equal(errorKey(new Error('x')), null);
  assert.equal(micErrorKey({ name: 'NotAllowedError' }), 'mic_denied');
  assert.equal(micErrorKey({ name: 'NotFoundError' }), 'no_microphone');
  assert.equal(micErrorKey({ name: 'NotReadableError' }), 'mic_busy');
  assert.equal(micErrorKey({ name: 'TypeError' }), null);
});

test('认出的字插在光标那里、换掉选着的', () => {
  assert.deepEqual(insertAt('帮我看', 2, 2, '一下'), { value: '帮我一下看', caret: 4 });
  assert.deepEqual(insertAt('abc', 1, 2, 'X'), { value: 'aXc', caret: 2 });
});

test('麦克风挂在发送左边（composer.send_side），不在左边那一排（2026-11-10 项目主人，W-1139）', async () => {
  const { readFile } = await import('node:fs/promises');
  const index = await readFile(new URL('../../packages/voice/index.js', import.meta.url), 'utf8');
  assert.match(index, /slots\.mount\('composer\.send_side', \{ id: 'voice-mic'/);
  assert.doesNotMatch(index, /slots\.mount\('composer\.bar', \{ id: 'voice-mic'/);
  const composer = await readFile(new URL('../../src/ui/composer.js', import.meta.url), 'utf8');
  assert.match(composer, /this\.sendSide, this\.sendButton\)/, '发送按钮左边挨着');
});

// 发版前 check 29（2026-11-11 项目主人）：朗读时冒出「语音出错：The fetching process for the media resource was aborted by the user agent
// at the user's request」——浏览器的 AbortError（还没放起来就被停、被换掉），原来当出错说给人。
const abort = () => Object.assign(new Error("The fetching process for the media resource was aborted by the user agent at the user's request"), { name: 'AbortError' });
/** 假的播放器：`plays` 一个个照着来，'end' 放完、'abort' 被打断、'bad' 音频坏了、'never' 一直放着、别的错原样抛 */
const player = (plays) => {
  let made = 0;
  const make = () => {
    const how = plays[made++];
    const audio = { onended: null, onerror: null, play: () => {
      if (how === 'end') { queueMicrotask(() => audio.onended()); return Promise.resolve(); }
      if (how === 'bad') { queueMicrotask(() => audio.onerror()); return Promise.resolve(); }
      if (how === 'never') return new Promise(() => {});
      return Promise.reject(how === 'abort' ? abort() : how);
    } };
    return audio;
  };
  return { make, made: () => made };
};
const run = () => ({ audio: null, stopped: false, cancel: null });
const broken = () => new Error('这一句放不出来');

test('朗读被打断（AbortError）不算出错：再放一次，放得出来就照常放完', async () => {
  assert.equal(interrupted(abort()), true);
  assert.equal(interrupted(new Error('x')), false);
  const p = player(['abort', 'end']);
  await playSentence(run(), p.make, broken);
  assert.equal(p.made(), 2, '再放了一次');
});

test('朗读连着被打断：跳过这一句，不抛出错', async () => {
  const p = player(['abort', 'abort', 'end']);
  await playSentence(run(), p.make, broken);
  assert.equal(p.made(), 2, '只再放一次');
});

test('人点了停：放着的那一句当场交回，随后浏览器抛的 AbortError 不再放、不出错', async () => {
  const p = player(['never']);
  const r = run();
  const done = playSentence(r, p.make, broken);
  r.stopped = true;
  r.cancel();
  await done;
  // 停的那一刻 play() 还没放起来：抛 AbortError，照停了的算
  const q = player(['abort', 'end']);
  const stopped = { ...run(), stopped: true };
  await playSentence(stopped, q.make, broken);
  assert.equal(q.made(), 1, '停了的不再放');
});

test('音频坏了、别的错照旧抛：这一句放不出来', async () => {
  await assert.rejects(playSentence(run(), player(['bad']).make, broken), /放不出来/);
  const denied = Object.assign(new Error('not allowed'), { name: 'NotAllowedError' });
  await assert.rejects(playSentence(run(), player([denied]).make, broken), /not allowed/);
});
