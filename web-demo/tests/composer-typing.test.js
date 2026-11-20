// @ts-check
// 粘了一大段以后打字不卡（W-1237）：框里没有文件块时底下垫的那层不放字；框到最高以后字只增不减时不再量高度。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { backdropPlan } from '../src/model/blocks.js';
import { keepsHeight } from '../src/model/grow.js';
import { wordAt } from '../src/model/mention.js';
import { skillWordAt } from '../src/model/skills.js';

const big = 'x'.repeat(200000);

test('框里没有文件块：底下垫的那层清空、不放字；接着打字不再动它', () => {
  const first = backdropPlan(null, big, []);
  assert.deepEqual(first.pieces, [], '没画过的：清空');
  assert.equal(first.drawn.text, '', '记下的不带整段字');
  assert.equal(backdropPlan(first.drawn, `${big}a`, []).pieces, null, '还是没有块：不动');
  // 原来垫过块的（块删掉了）：清空一次
  const had = backdropPlan(null, '看 [a.rs] ', ['[a.rs]']).drawn;
  assert.deepEqual(backdropPlan(had, '看 ', []).pieces, []);
});

test('框里有文件块：照原来的切法画，字或块变了重画，没变的不动', () => {
  const r = backdropPlan(null, '看 [a.rs] 和', ['[a.rs]']);
  assert.deepEqual(r.pieces, [{ text: '看 ', block: false }, { text: '[a.rs]', block: true }, { text: ' 和', block: false }]);
  assert.equal(backdropPlan(r.drawn, '看 [a.rs] 和', ['[a.rs]']).pieces, null);
  assert.ok(backdropPlan(r.drawn, '看 [a.rs] 和b', ['[a.rs]']).pieces);
  assert.ok(backdropPlan(r.drawn, '看 [a.rs] 和', ['[a.rs]', '[b.rs]']).pieces);
});

test('框到最高以后：字只增（在末尾、中间、开头插）不再量；删了字、换了字、没到最高、行高变了的照量', () => {
  const at = (text) => ({ text, full: true, line: 22.4 });
  // 在末尾打字：光标在末尾
  assert.equal(keepsHeight(at(big), `${big}a`, big.length + 1, 22.4), true);
  // 在中间插：光标停在插进去的后面
  const mid = `${big.slice(0, 1000)}abc${big.slice(1000)}`;
  assert.equal(keepsHeight(at(big), mid, 1003, 22.4), true);
  assert.equal(keepsHeight(at('ab\ncd'), 'ab\nXcd', 4, 22.4), true);
  // 删字、选中一段换成别的（字数没少也算：换行可能少了）
  assert.equal(keepsHeight(at(big), big.slice(1), 0, 22.4), false);
  assert.equal(keepsHeight(at('\n\n\n\n'), 'abcde', 5, 22.4), false);
  // 没到最高、没量过、行高变了（字号变了）
  assert.equal(keepsHeight({ text: 'a', full: false, line: 22.4 }, 'ab', 2, 22.4), false);
  assert.equal(keepsHeight(null, 'ab', 2, 22.4), false);
  assert.equal(keepsHeight(at(big), `${big}a`, big.length + 1, 25.6), false);
});

test('光标前面的 `@`、`$` 词只看光标这一行：认出来的和原来从头扫的一样', () => {
  // 原来的认法（从头扫整段）
  const oldWord = (value, caret) => {
    const before = value.slice(0, caret);
    const m = /(?:^|\s)@((?:\\ |[^\s])*)$/.exec(before);
    return m ? { start: before.length - m[1].length - 1, end: caret, word: m[1].replace(/\\ /g, ' ') } : null;
  };
  const oldSkill = (value, caret) => {
    const before = value.slice(0, caret);
    const m = /(?:^|\s)\$([\p{L}\p{N}_.:-]*)$/u.exec(before);
    return m ? { start: before.length - m[1].length - 1, end: caret, word: m[1] } : null;
  };
  const samples = ['@a\n@b', '\n@x', '看\n @my\\ docs/a', 'a@b\nc', '$rev\n$', '\n\n$a.b', 'x\r\n@y', '@\n', '\n', ''];
  for (const s of samples) {
    for (let c = 0; c <= s.length + 1; c++) {
      assert.deepEqual(wordAt(s, c), oldWord(s, c), `@ ${JSON.stringify(s)} ${c}`);
      assert.deepEqual(skillWordAt(s, c), oldSkill(s, c), `$ ${JSON.stringify(s)} ${c}`);
    }
  }
  const long = `${'一行字 @不是这个\n'.repeat(1000)}末行 @src/ma`;
  assert.deepEqual(wordAt(long, long.length), oldWord(long, long.length));
  assert.equal(wordAt(long, long.length)?.word, 'src/ma');
});

test('输入框照这两样做：垫的那层不再把整段字写进 HTML 属性，长高前先看要不要量', async () => {
  const src = await readFile(new URL('../src/ui/composer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /backdrop\.dataset\.sig/, '整段字不进 data-sig');
  assert.match(src, /backdropPlan\(/);
  assert.match(src, /keepsHeight\(/);
});
