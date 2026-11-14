// @ts-check
//! 人生会话的上下文上限那一格（核心 LF-10；蓝图 `web.md`「推演人生」）：写的字怎么认成数、点「保存」发什么（`persona.set` 的 `life.context`）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { personaSave, lifeContextOf } from '../../packages/setup/model.js';

const base = { name: 'm', summary: '', persona: '', reminders: '', pairs: [], versions: { persona: null, reminders: null, examples: null } };

test('认字：空着是 null（用出厂的）；正整数照数，中间的逗号、空格、下划线不算；0、负数、小数、别的字都不对', () => {
  assert.deepEqual(lifeContextOf(''), { ok: true, value: null });
  assert.deepEqual(lifeContextOf('  '), { ok: true, value: null });
  assert.deepEqual(lifeContextOf('64000'), { ok: true, value: 64000 });
  assert.deepEqual(lifeContextOf('100,000'), { ok: true, value: 100000 });
  assert.deepEqual(lifeContextOf(' 32_000 '), { ok: true, value: 32000 });
  for (const bad of ['0', '-5', '1.5', '64k', 'abc', '99999999999999999999']) assert.deepEqual(lifeContextOf(bad), { ok: false }, bad);
});

test('保存：改了数发 life.context 带数；清空发 unset；写法不同、数一样的不发；写错的不发；核心不认这一格（没读到）的不发', () => {
  assert.deepEqual(personaSave({ ...base, lifeContext: '' }, { ...base, lifeContext: '64000' })?.changes, [{ key: 'life.context', value: 64000 }]);
  assert.deepEqual(personaSave({ ...base, lifeContext: '64000' }, { ...base, lifeContext: ' ' })?.changes, [{ key: 'life.context', unset: true }]);
  assert.equal(personaSave({ ...base, lifeContext: '64000' }, { ...base, lifeContext: '64,000' }), null);
  assert.equal(personaSave({ ...base, lifeContext: '64000' }, { ...base, lifeContext: '64k' }), null);
  assert.equal(personaSave(base, { ...base, lifeContext: '64000' }), null);
});

test('编辑器：「推演人生」开着才露这一格，跟着「保存」存；核心拒了 bad_life_context 的写在格子下面；三种语言都有这几句', () => {
  const src = readFileSync(new URL('../../packages/setup/persona-editor.js', import.meta.url), 'utf8');
  assert.match(src, /life_context_default/);
  assert.match(src, /lifeContextRow\(\)/);
  assert.match(src, /bad_life_context/);
  const manifest = JSON.parse(readFileSync(new URL('../../packages/setup/manifest.json', import.meta.url), 'utf8'));
  for (const lang of ['zh', 'en', 'ja']) {
    for (const key of ['life_context', 'life_context_desc', 'life_context_hint', 'life_context_bad']) assert.ok(manifest.text[lang].edit[key], `${lang} edit.${key}`);
  }
});
