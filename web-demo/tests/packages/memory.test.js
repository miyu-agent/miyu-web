// @ts-check
//! 记忆页的纯逻辑（蓝图 `web.md`「记忆页」）：数没作废的、筛、存的时候只带改了的、存不存得了、底下那一行说什么、字数照码点。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { counts, visible, isRetired, updateOf, canSave, saveNote, chars, hasKeywords, shortId, TEXT_MAX, tidying, splitKeywords, joinKeywords, cardMatches, cardProblem, cardChange, CARD_MAX } from '../../packages/memory/model.js';

const m = (id, cls, text, extra = {}) => ({ id, class: cls, text, ...extra });
const list = [
  m('m1', 'user', '喜欢猫'), m('m2', 'feedback', '用中文'), m('m3', 'user', '用 fish', { retired: '重复了' }),
  m('m4', 'episode', '10 月 12 日卡死'), m('m6', 'episode', '没写原因作废的', { retired: '' }), m('m5', 'reference', '补丁表在 README', { keywords: 'WE-Proton' }),
];

test('数的是没作废的：一共几条、每一类几条', () => {
  assert.deepEqual(counts(list), { all: 4, user: 1, person: 0, feedback: 1, episode: 1, reference: 1 });
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

test('后台在整理：不是人叫的 merging 记下，同一批 merged、merge_failed 划掉；人叫的不算', () => {
  const ev = (kind, body) => ({ kind, body });
  let open = new Set();
  open = tidying(open, ev('ext.memory.merging', { upto: 10, fresh: 3, left: 5, manual: false }));
  open = tidying(open, ev('ext.memory.merging', { upto: 20, fresh: 2, left: 2, manual: true }));
  assert.deepEqual([...open], [10]);
  open = tidying(open, ev('ext.memory.saved', { text: 'x' }));
  assert.deepEqual([...open], [10]);
  open = tidying(open, ev('ext.memory.merging', { upto: 30, fresh: 2, left: 2 }));
  open = tidying(open, ev('ext.memory.merged', { upto: 10, given: 3 }));
  assert.deepEqual([...open], [30]);
  open = tidying(open, ev('ext.memory.merge_failed', { upto: 30, why: 'interrupted' }));
  assert.equal(open.size, 0);
});

test('关键词拆成一个个：中文、英文逗号、顿号、分号都算隔开，去掉空的、重的；连回去用英文逗号', () => {
  assert.deepEqual(splitKeywords('猫，豆豆, 宠物、猫 ; 狗'), ['猫', '豆豆', '宠物', '狗']);
  assert.deepEqual(splitKeywords(''), []);
  assert.deepEqual(splitKeywords(null), []);
  assert.equal(joinKeywords(['猫', '豆豆']), '猫, 豆豆');
});

test('认识的人（核心 E-1 上）：是谁改了也存成新的一条；空的不存；不是这一类的不带 who', () => {
  const p = { id: 'm9', class: 'person', text: '喜欢猫', who: 'qq:10086', keywords: null };
  assert.equal(updateOf(p, '喜欢猫', null, 'qq:10086'), null);
  assert.deepEqual(updateOf(p, '喜欢猫', null, ' 小明 '), { id: 'm9', who: '小明' });
  assert.equal(saveNote(updateOf(p, '喜欢猫', null, '小明')), 'detail.note_new');
  assert.equal(canSave(p, '喜欢猫', null, '  '), false);
  assert.equal(canSave(p, '喜欢狗', null, 'qq:10086'), true);
  assert.deepEqual(updateOf({ id: 'm1', class: 'user', text: 'a' }, 'b', null), { id: 'm1', text: 'b' });
});

test('人卡（第 14 条）：照是谁、叫法、正文搜；是谁、内容空的、超 300 字、叫法超 8 个或超 40 字的写不了；内容、叫法有一样不同才算改了', () => {
  const card = { who: 'qq:10086', text: '大学同学，喜欢打球', names: ['明哥', 'Ming'] };
  assert.ok(cardMatches(card, ''));
  assert.ok(cardMatches(card, '10086'));
  assert.ok(cardMatches(card, 'ming'));
  assert.ok(cardMatches(card, '打球'));
  assert.ok(!cardMatches(card, '猫'));
  assert.equal(cardProblem('qq:1', '好', []), null);
  assert.equal(cardProblem(' ', '好', []), 'who');
  assert.equal(cardProblem('a', '  ', []), 'text');
  assert.equal(cardProblem('a', '字'.repeat(CARD_MAX), []), null);
  assert.equal(cardProblem('a', '字'.repeat(CARD_MAX + 1), []), 'text');
  assert.equal(cardProblem('a', '好', Array.from({ length: 9 }, (_, i) => `n${i}`)), 'names');
  assert.equal(cardProblem('a', '好', ['名'.repeat(41)]), 'names');
  assert.ok(!cardChange(card, ' 大学同学，喜欢打球 ', ['明哥', 'Ming']));
  assert.ok(cardChange(card, '大学同学', ['明哥', 'Ming']));
  assert.ok(cardChange(card, '大学同学，喜欢打球', ['明哥']));
  assert.ok(!cardChange({ who: 'b', text: 'x' }, 'x', []));
});
