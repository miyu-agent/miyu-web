// @ts-check
//! 带 `choices_from` 的项（核心 SG-2）：选项记在哪（W-1208）。每次打开设置重新问；问到以前照上一次问到的画，写选项的名字，不写存着的原值。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChoiceMemo } from '../../packages/settings/choices-memo.js';

const engines = [{ value: '', name: '本机的 SenseVoice' }, { value: 'deepseek-tools', name: 'DeepSeek 功能全家桶' }];
const key = 'voice-input\nengines';

test('头一次：还没问到的照文字框（没有上一次的）；问到了这一次照它', async () => {
  const memo = new ChoiceMemo();
  assert.deepEqual(memo.now(key), { list: null, fresh: false });
  const got = await memo.ask(key, async () => engines);
  assert.deepEqual(got, engines);
  assert.deepEqual(memo.now(key), { list: engines, fresh: true });
});

test('再打开设置：重新问，问到以前先照上一次问到的画下拉（写「DeepSeek 功能全家桶」，不是 deepseek-tools）', async () => {
  const memo = new ChoiceMemo();
  await memo.ask(key, async () => engines);
  memo.reset();
  assert.deepEqual(memo.now(key), { list: engines, fresh: false });
  let asked = 0;
  const pending = memo.ask(key, async () => { asked += 1; return engines.slice(1); });
  assert.deepEqual(memo.now(key), { list: engines, fresh: false }, '还在问');
  assert.deepEqual(await memo.ask(key, async () => { asked += 1; return []; }), engines.slice(1), '同一次只问一回');
  await pending;
  assert.equal(asked, 1);
  assert.deepEqual(memo.now(key), { list: engines.slice(1), fresh: true });
});

test('问不到（包没在跑、出错）：这一次是文字框；上一次问到的留着，下次打开先照它画', async () => {
  const memo = new ChoiceMemo();
  await memo.ask(key, async () => engines);
  memo.reset();
  assert.equal(await memo.ask(key, async () => { throw Object.assign(new Error('x'), { reason: 'program_not_running' }); }), null);
  assert.deepEqual(memo.now(key), { list: null, fresh: true });
  memo.reset();
  assert.deepEqual(memo.now(key), { list: engines, fresh: false });
});
