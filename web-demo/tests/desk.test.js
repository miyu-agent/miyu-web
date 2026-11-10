// 输入框跟着会话走（W-1137，src/model/desk.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import { Desks, emptyDesk } from '../src/model/desk.js';

/** @param {Partial<import('../src/model/desk.js').Desk>} over */
const desk = (over = {}) => ({ text: '', start: 0, end: 0, blocks: [], stashed: null, putBackText: null,
  recall: { at: -1, shown: null, draft: '', cleared: null, prefix: null }, parts: {}, ...over });

test('切会话（W-1137，2026-11-10 项目主人）：切走记在原来的会话名下，切回来放回去；别的会话、新会话页是空的', () => {
  const desks = new Desks();
  let box = desk({ text: '给 A 写了一半', start: 3, end: 3 });
  const swap = (/** @type {string|null} */ from, /** @type {string|null} */ to) => desks.swap(from, to, () => { const was = box; box = desk(); return was; }, (d) => { box = d ?? desk(); });
  swap('A', 'B');
  assert.equal(box.text, '', 'B 没打过字：空的');
  box = desk({ text: 'B 的', parts: { attachments: [{ id: 1 }] } });
  swap('B', 'A');
  assert.deepEqual([box.text, box.start], ['给 A 写了一半', 3], 'A 的字、光标回来了');
  swap('A', null);
  assert.equal(box.text, '', '新会话页是空的');
  box = desk({ text: '新会话页上打的' });
  swap(null, 'B');
  assert.equal(box.text, 'B 的');
  assert.deepEqual(box.parts, { attachments: [{ id: 1 }] }, '附件跟着 B');
  swap('B', null);
  swap(null, 'A');
  assert.equal(box.text, '给 A 写了一半');
  swap('A', 'B');
  box = desk();
  swap('B', 'A');
  swap('A', 'B');
  assert.equal(box.text, '', '新会话页上的、B 清空了的都不记');
});

test('什么都没有的不记；暂存的、清掉的那句、翻历史翻到一半的也算有；删掉的会话忘掉', () => {
  assert.ok(emptyDesk(desk()));
  assert.ok(!emptyDesk(desk({ stashed: { text: 'x', blocks: [] } })));
  assert.ok(!emptyDesk(desk({ recall: { at: -1, shown: null, draft: '', cleared: '清掉的', prefix: null } })));
  assert.ok(!emptyDesk(desk({ recall: { at: 2, shown: 'x', draft: '', cleared: null, prefix: null } })));
  assert.ok(!emptyDesk(desk({ blocks: [['[a.txt]', '/tmp/a.txt']] })));
  const desks = new Desks();
  desks.swap('A', 'B', () => desk({ text: 'x' }), () => {});
  assert.equal(desks.byId.size, 1);
  desks.drop('A');
  assert.equal(desks.byId.size, 0);
});
