// @ts-check
//! 记忆页的纯逻辑（蓝图 `web.md`「记忆页」）：数没作废的、筛、存的时候只带改了的、存不存得了、底下那一行说什么、字数照码点。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counts, visible, isRetired, updateOf, canSave, saveNote, chars, hasKeywords, shortId, TEXT_MAX } from '../../packages/memory/model.js';

const m = (id, cls, text, extra = {}) => ({ id, class: cls, text, ...extra });
const list = [
  m('m1', 'user', '喜欢猫'), m('m2', 'feedback', '用中文'), m('m3', 'user', '用 fish', { retired: '重复了' }),
  m('m4', 'episode', '10 月 12 日卡死'), m('m6', 'episode', '没写原因作废的', { retired: '' }), m('m5', 'reference', '补丁表在 README', { keywords: 'WE-Proton' }),
];

test('数的是没作废的：一共几条、每一类几条', () => {
  assert.deepEqual(counts(list), { all: 4, user: 1, feedback: 1, episode: 1, reference: 1 });
});

test('筛：类别、作废的看不看', () => {
  assert.deepEqual(visible(list, { cls: 'all', retired: false }).map((x) => x.id), ['m1', 'm2', 'm4', 'm5']);
  assert.deepEqual(visible(list, { cls: 'user', retired: true }).map((x) => x.id), ['m1', 'm3']);
  assert.deepEqual(visible(list, { cls: 'user', retired: false }).map((x) => x.id), ['m1']);
  assert.deepEqual(visible(list, { cls: 'episode', retired: true }).map((x) => x.id), ['m4', 'm6'], '没写原因作废的（空字符串）也算作废');
  assert.deepEqual(visible(list, { cls: 'episode', retired: false }).map((x) => x.id), ['m4']);
});

test('存详情只带改了的：只改关键词的不带 text，清空关键词写空字符串，没改的交 null', () => {
  const x = list.find((y) => y.id === 'm5');
  assert.equal(updateOf(x, '补丁表在 README', 'WE-Proton'), null);
  assert.deepEqual(updateOf(x, '补丁表在 README', 'WE-Proton, 补丁'), { id: 'm5', keywords: 'WE-Proton, 补丁' });
  assert.deepEqual(updateOf(x, '补丁表在 README', '  '), { id: 'm5', keywords: '' });
  assert.deepEqual(updateOf(x, ' 补丁编号表在 README ', 'WE-Proton'), { id: 'm5', text: '补丁编号表在 README' });
  assert.deepEqual(updateOf(list[0], '喜欢猫', ''), null, '原来没有关键词、框也空着的不算改');
  assert.deepEqual(updateOf(list[0], '喜欢小猫', null), { id: 'm1', text: '喜欢小猫' }, '不认关键词的核心不带 keywords');
});

test('存不存得了：内容空着、超长、没改的都不行', () => {
  const x = list[0];
  assert.equal(canSave(x, '喜欢猫', ''), false);
  assert.equal(canSave(x, '   ', ''), false);
  assert.equal(canSave(x, '猫'.repeat(TEXT_MAX + 1), ''), false);
  assert.equal(canSave(x, '猫'.repeat(TEXT_MAX), ''), true);
  assert.equal(canSave(x, '喜欢猫', 'k'.repeat(201)), false);
});

test('底下那一行：改了内容是新的一条，只改关键词还是这一条', () => {
  assert.equal(saveNote({ id: 'm1', text: 'x' }), 'detail.note_new');
  assert.equal(saveNote({ id: 'm1', keywords: 'x' }), 'detail.note_same');
  assert.equal(saveNote(null), null);
});

test('字数照码点、关键词这一格认不认、短编号', () => {
  assert.equal(chars('猫🐱a'), 3);
  assert.equal(hasKeywords(list), true);
  assert.equal(hasKeywords([m('m9', 'user', 'x')]), false, '老核心的记忆没有这一格');
  assert.equal(hasKeywords([m('m9', 'user', 'x', { keywords: null })]), true, '有这一格、空着的也算认');
  assert.equal(shortId('0199ab12-3456-7def-8abc-1234567890ab'), '567890ab');
});
