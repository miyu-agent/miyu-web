// @ts-check
//! 模糊搜索（蓝图「仪表盘」第 4 条展示文件的搜索，2026-10-24 项目主人）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyScore, fuzzyFilter, fileFilter } from '../src/lib/fuzzy.js';

test('对得上：不分大小写，字按先后出现就算；对不上是 null；没写字的都对得上', () => {
  assert.notEqual(fuzzyScore('rdm', 'README.md'), null);
  assert.equal(fuzzyScore('mdr', 'README.md'), null, '先后不对');
  assert.equal(fuzzyScore('xyz', 'readme.md'), null);
  assert.equal(fuzzyScore('', 'anything'), 0);
  assert.equal(fuzzyScore('  ', 'anything'), 0);
  assert.notEqual(fuzzyScore('shot png', 'shot.png'), null, '空格不算');
  assert.notEqual(fuzzyScore('ab', 'zab-a'), null, '挑一段开头的字以后剩下的对不上，就不挑它');
});

test('排前面的：在开头的、连着的、一段开头的', () => {
  assert.ok(/** @type {number} */ (fuzzyScore('read', 'readme.md')) > /** @type {number} */ (fuzzyScore('read', 'thread.md')), '开头的分高');
  assert.ok(/** @type {number} */ (fuzzyScore('web', 'miyu-web')) > /** @type {number} */ (fuzzyScore('web', 'w_e_b')), '连着的分高');
  assert.ok(/** @type {number} */ (fuzzyScore('w', 'miyu-web')) > /** @type {number} */ (fuzzyScore('w', 'awful')), '一段开头的分高');
});

test('筛一串：照标题、文件名、路径，照分排，一样的照原来的先后；没写字的照原样', () => {
  const list = [
    { name: 'shot.png', path: '~/dash/shot.png' },
    { name: 'readme.md', path: '~/dash/readme.md' },
    { name: 'page.html', path: '~/web/page.html' },
  ];
  const by = (/** @type {any} */ x) => [x.name, x.path];
  assert.deepEqual(fuzzyFilter(list, 'md', by).map((x) => x.name), ['readme.md']);
  assert.deepEqual(fuzzyFilter(list, 'web', by).map((x) => x.name), ['page.html'], '路径里对得上的也算');
  assert.deepEqual(fuzzyFilter(list, '', by), list);
  assert.deepEqual(fuzzyFilter(list, 'zzz', by), []);
});

test('照文件筛：文件名模糊，目录只认连着的一截；文件名对得上的排前面（2026-10-26 项目主人：搜「md」b.py 也留着）', () => {
  const files = [
    { name: 'b.py', dir: '~/.cache/miyu-web-demo' },
    { name: 'README.md', dir: '~/.cache/miyu-web-demo' },
    { name: 'plan.txt', dir: '~/notes/md-drafts' },
    { name: 'mod.js', dir: '~/src' },
  ];
  const names = (q) => fileFilter(files, q, (f) => ({ names: [f.name], dirs: [f.dir] })).map((f) => f.name);
  assert.deepEqual(names('md'), ['README.md', 'mod.js', 'plan.txt'], 'b.py 不再因为目录里有 m…d 留着；文件名对得上的在前，目录连着有「md」的在后');
  assert.deepEqual(names('demo'), ['b.py', 'README.md'], '目录连着的一截');
  assert.deepEqual(names('mwd'), [], '目录不再逐字母比');
  assert.deepEqual(names('rdm'), ['README.md'], '文件名照旧模糊');
  assert.deepEqual(names(''), ['b.py', 'README.md', 'plan.txt', 'mod.js']);
  assert.deepEqual(names('DEMO'), ['b.py', 'README.md'], '不分大小写');
});
