// @ts-check
//! `$` 点名技能（蓝图 `web.md`「`$` 点名技能」，W-1124）：光标前面的 `$` 词、照名字筛、一句话点了哪几个、气泡里哪几段着色。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillWordAt, readSkills, filterSkills, skillsIn, skillPieces } from '../src/model/skills.js';

test('光标前面是 $ 打头的词才开：$ 在最前面或者前面是空白；US$5、a$b 不算；到光标为止没有空白', () => {
  assert.deepEqual(skillWordAt('帮我 $rev', 7), { start: 3, end: 7, word: 'rev' });
  assert.deepEqual(skillWordAt('$', 1), { start: 0, end: 1, word: '' });
  assert.equal(skillWordAt('花了 US$5', 7), null);
  assert.equal(skillWordAt('$review 然后', 10), null, '光标前面有空白');
  assert.deepEqual(skillWordAt('$pkg:draw', 9), { start: 0, end: 9, word: 'pkg:draw' });
});

test('核心交回的 skills：名字是字符串的留下，说明没有的写空；旧核心没有这一格交空的', () => {
  assert.deepEqual(readSkills([{ name: 'review', summary: '看代码' }, { name: 3 }, null, { name: 'draw', argument: '<主题>' }]),
    [{ name: 'review', summary: '看代码' }, { name: 'draw', summary: '', argument: '<主题>' }]);
  assert.deepEqual(readSkills(undefined), []);
});

test('照名字模糊筛，没打字的照原样', () => {
  const all = [{ name: 'review', summary: '' }, { name: 'package-creator', summary: '' }];
  assert.deepEqual(filterSkills(all, 'pc').map((s) => s.name), ['package-creator']);
  assert.equal(filterSkills(all, '').length, 2);
});

test('一句话点了哪几个：照先后、重复的算一次；没有的技能、US$5、紧跟名字字的不算；末尾的标点退掉', () => {
  const names = ['review', 'draw', 'pkg:draw'];
  assert.deepEqual(skillsIn('$draw 一张图，再 $review 一下，$draw 第二张', names), ['draw', 'review']);
  assert.deepEqual(skillsIn('用 $review. 和 $nope 还有 US$5', names), ['review']);
  assert.deepEqual(skillsIn('$reviewer 不是', names), []);
  assert.deepEqual(skillsIn('$pkg:draw', names), ['pkg:draw']);
  assert.deepEqual(skillsIn('$review帮我看看', names), ['review'], '紧跟中文的算完了');
  assert.deepEqual(skillsIn('没有点名', names), []);
});

test('气泡里切段：点了名的那一段带 skill，别的照原样，拼回去和原话一样', () => {
  const names = new Set(['review']);
  const text = '先 $review，再 $nope';
  const pieces = skillPieces(text, names);
  assert.deepEqual(pieces, [{ text: '先 ' }, { text: '$review', skill: true }, { text: '，再 $nope' }]);
  assert.equal(pieces.map((p) => p.text).join(''), text);
  assert.deepEqual(skillPieces('$review', names), [{ text: '$review', skill: true }]);
});
