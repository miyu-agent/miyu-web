// 输入框空着时的小提示（`model/tips.js`，蓝图「输入框」写字的地方）：有哪几条、换一条挑哪条；每一条三种语言都有字。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPS, KEYS, tipsFor, pickTip } from '../src/model/tips.js';

const text = (lang) => JSON.parse(readFileSync(new URL(`../resources/text/${lang}.json`, import.meta.url), 'utf8'));

test('附件的那一条照软件包挂没挂上', () => {
  assert.deepEqual(tipsFor({}), TIPS);
  assert.ok(!tipsFor({ attachments: false }).includes('attach'));
  assert.deepEqual(tipsFor({ attachments: true }), [...TIPS, 'attach']);
});

test('主要指针是手指的（手机）不出要按键的几条，剩下的照样有（2026-11-03 项目主人，W-1082）', () => {
  assert.deepEqual(tipsFor({ touch: true }), ['slash', 'mention']);
  assert.deepEqual(tipsFor({ touch: true, attachments: true }), ['slash', 'mention', 'attach']);
  assert.deepEqual(tipsFor({ touch: false }), TIPS);
  for (const key of KEYS) assert.ok(TIPS.includes(key), key);
});

test('换一条不和上一条一样，照随机数挑', () => {
  const list = ['a', 'b', 'c'];
  assert.equal(pickTip(list, null, 0), 'a');
  assert.equal(pickTip(list, null, 0.999), 'c');
  assert.equal(pickTip(list, 'a', 0), 'b');
  for (let i = 0; i < 50; i++) assert.notEqual(pickTip(list, 'b', i / 50), 'b');
  // 随机数是 1 的也不出界
  assert.equal(pickTip(list, null, 1), 'c');
});

test('只剩一条、一条都没有', () => {
  assert.equal(pickTip(['a'], 'a', 0.5), 'a');
  assert.equal(pickTip([], null, 0.5), null);
});

test('每一条三种语言都有字，不再有「给 X 发消息」', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const t = text(lang);
    for (const key of tipsFor({ attachments: true })) assert.equal(typeof t.tips?.[key], 'string', `${lang} tips.${key}`);
    assert.equal(t.placeholder, undefined);
    assert.equal(t.placeholder_bare, undefined);
    assert.ok(!Object.values(t.tips).some((s) => s.includes('她')));
  }
});
