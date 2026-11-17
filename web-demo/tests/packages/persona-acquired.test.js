// @ts-check
//! 人格详情的「后天」（核心 LF-11，设计 70 第六节；`packages/setup/acquired.js`）：读哪几条、怎么排、为什么怎么写；编辑器里有这一行、只看；三种语言都有字。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { acquiredOf } from '../../packages/setup/model.js';

const read = (/** @type {string} */ p) => readFileSync(new URL(`../../packages/setup/${p}`, import.meta.url), 'utf8');

test('排成旧的在前（核心交回的新的在前）；只留「后天」里没作废的；为什么空着的是 null', () => {
  const got = acquiredOf([
    { id: 'm12', class: 'change', text: '现在每天早起手冲一杯', why: ' 连着七天每天冲 ', at: '2026-11-20T08:00:00Z', retired: null },
    { id: 'm9', class: 'change', text: '以前十一点睡，这阵子常到十二点多', at: '2026-11-18T08:00:00Z', retired: null },
    { id: 'm10', class: 'change', text: '淡掉了的', at: '2026-11-19T08:00:00Z', retired: '' },
    { id: 'm11', class: 'episode', text: '别的类', at: '2026-11-19T09:00:00Z', retired: null },
    { id: 'm13', class: 'change', text: '  ', at: '2026-11-21T08:00:00Z', retired: null },
  ]);
  assert.deepEqual(got, [
    { text: '以前十一点睡，这阵子常到十二点多', why: null },
    { text: '现在每天早起手冲一杯', why: '连着七天每天冲' },
  ]);
});

test('同一时刻的照编号排；交回的不是列表的当没有', () => {
  const at = '2026-11-18T08:00:00Z';
  assert.deepEqual(acquiredOf([{ id: 'm10', class: 'change', text: 'b', at }, { id: 'm9', class: 'change', text: 'a', at }]).map((n) => n.text), ['a', 'b']);
  assert.deepEqual(acquiredOf(null), []);
  assert.deepEqual(acquiredOf({ memories: [] }), []);
});

test('编辑器：核心有推演人生的才画这一行；照 memory.list 的 class change 读；只看（不调 update、forget）；没有的写一行；三种语言都有字、不写她', () => {
  const editor = read('persona-editor.js');
  assert.match(editor, /this\.acquiredRow\(\)/);
  assert.match(editor, /acquiredField\(this\.ctx, this\.id\)/);
  const src = read('acquired.js');
  assert.match(src, /'memory\.list', \{ persona: id, class: 'change'/);
  assert.match(src, /edit\.acquired_none/);
  assert.doesNotMatch(src, /memory\.(update|forget|restore|remember)/);
  const manifest = JSON.parse(read('manifest.json'));
  const label = { zh: '后天提示词', en: 'Acquired prompt', ja: '後天プロンプト' };
  for (const lang of ['zh', 'en', 'ja']) {
    const edit = manifest.text[lang].edit;
    assert.equal(edit.acquired, label[lang], `${lang} edit.acquired`);
    for (const key of ['acquired_desc', 'acquired_none']) assert.ok(edit[key], `${lang} edit.${key}`);
    assert.doesNotMatch(`${edit.acquired_desc} ${edit.acquired_none}`, /她|彼女|\b(she|her)\b/i);
  }
});
