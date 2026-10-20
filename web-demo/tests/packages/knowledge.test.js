// @ts-check
//! 知识库页的纯逻辑（`packages/knowledge/model.js`，蓝图 `web.md`「知识库页」）：来源和能不能改、编号、读不了的原因、大小、搜到的段头上写什么、看原文滚到哪。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceOf, writable, deletable, reasonKey, idFor, nextId, validId, sizeText, docIcon, hitHead, probeOf, treeOf, countOf, pathsOf, folderAt, removalOf } from '../../packages/knowledge/model.js';

test('来源：随包的、挂的只读，随包的不能删', () => {
  const own = { id: 'notes' };
  const mount = { id: 'docs', mount: '~/Docs' };
  const pkg = { id: 'manual', package: 'miyu-help' };
  assert.deepEqual([own, mount, pkg].map(sourceOf), ['own', 'mount', 'package']);
  assert.deepEqual([own, mount, pkg].map(writable), [true, false, false]);
  assert.deepEqual([own, mount, pkg].map(deletable), [true, true, false]);
});

test('读不了的原因：认得的照原因，认不得的写读不了，没原因的没有', () => {
  assert.equal(reasonKey({ reason: 'no_text' }), 'reasons.no_text');
  assert.equal(reasonKey({ reason: 'something_new' }), 'reasons.unreadable');
  assert.equal(reasonKey({}), null);
});

test('编号：英文名字照名字，中文名字用时间编号，撞了加 -2', () => {
  assert.equal(idFor('Rust Notes', new Set(), 0), 'rust-notes');
  assert.equal(idFor('日语语法', new Set(), 1760000000000), `kb-${(1760000000000).toString(36)}`);
  assert.equal(idFor('notes', new Set(['notes']), 0), 'notes-2');
  assert.equal(nextId('notes', new Set(['notes']), 'notes-2', 0), 'notes-3');
  assert.equal(idFor('1st', new Set(), 5), 'kb-5');
  const long = idFor('a'.repeat(40), new Set(['a'.repeat(32)]), 0);
  assert.ok(validId(long) && long.endsWith('-2'), long);
});

test('大小：B、KB、MB', () => {
  assert.equal(sizeText(512), '512 B');
  assert.equal(sizeText(1536), '1.5 KB');
  assert.equal(sizeText(2 * 1024 * 1024), '2 MB');
  assert.equal(sizeText(undefined), '');
});

test('图标照种类', () => {
  assert.deepEqual(['pdf', 'html', 'markdown', 'text'].map(docIcon), ['file', 'file-code', 'file-text', 'file-text']);
});

test('搜到的段头上：库名 / 路径 · 标题，没标题的 PDF 写第几页', () => {
  const name = (/** @type {string} */ id) => (id === 'jp' ? '日语' : id);
  const page = (/** @type {number} */ n) => `第 ${n} 页`;
  assert.equal(hitHead({ kb: 'jp', path: 'grammar.md', heading: '语法 › て形' }, name, page), '日语 / grammar.md · 语法 › て形');
  assert.equal(hitHead({ kb: 'jp', path: 'book.pdf', page: 3 }, name, page), '日语 / book.pdf · 第 3 页');
  assert.equal(hitHead({ kb: 'x', path: 'a.txt' }, name, page), 'x / a.txt');
});

test('看原文滚到哪：片段头一行像样的字，去掉 Markdown 记号', () => {
  assert.equal(probeOf('## て形的用法\n正文'), 'て形的用法');
  assert.equal(probeOf('- **重要**：[链接](http://x) 后面'), '重要：链接 后面');
  assert.equal(probeOf('ab\n\n这一行足够长了，能拿来找到它在哪里'), '这一行足够长了，能拿来找到它在哪');
  assert.equal(probeOf(''), null);
});

test('文件树：照路径一层层分，文件夹在前、文件在后，各照名字排；读不了的子目录放在它那一层；数篇数不算读不了的子目录', () => {
  const root = treeOf([
    { path: '笔记/日语/语法.md' },
    { path: 'README.md' },
    { path: '笔记/日语/单词.md' },
    { path: '笔记/a.txt' },
    { path: '笔记/私密', dir: true, reason: 'unreadable' },
    { path: '附件/图.pdf' },
  ]);
  assert.deepEqual(root.folders.map((f) => f.name), ['笔记', '附件']);
  assert.deepEqual(root.docs.map((d) => d.name), ['README.md']);
  const notes = root.folders[0];
  assert.equal(notes.path, '笔记');
  assert.deepEqual(notes.folders.map((f) => f.path), ['笔记/日语']);
  assert.deepEqual(notes.docs.map((d) => [d.name, !!d.dir]), [['a.txt', false], ['私密', true]]);
  assert.deepEqual(notes.folders[0].docs.map((d) => d.name).sort(), ['单词.md', '语法.md']);
  assert.equal(countOf(notes), 3);
  assert.equal(countOf(root), 5);
  assert.deepEqual(treeOf([]), { name: '', path: '', folders: [], docs: [] });
});

test('一个文件夹里（连子文件夹）每一篇的路径：多选勾文件夹、删文件夹照它；读不了的子目录不算', () => {
  const tree = treeOf([
    { path: 'a.md' }, { path: 'docs/b.md' }, { path: 'docs/new/c.md' }, { path: 'docs/locked', dir: true },
  ]);
  assert.deepEqual(pathsOf(tree).sort(), ['a.md', 'docs/b.md', 'docs/new/c.md']);
  const docs = folderAt(tree, 'docs');
  assert.ok(docs);
  assert.deepEqual(pathsOf(/** @type {any} */ (docs)).sort(), ['docs/b.md', 'docs/new/c.md']);
  assert.equal(folderAt(tree, 'nope'), null);
});

test('多选要删的：整个都勾上的文件夹写文件夹（只写最上面那一层），别的一篇篇', () => {
  const tree = treeOf([{ path: 'a.md' }, { path: 'docs/b.md' }, { path: 'docs/new/c.md' }, { path: 'docs/new/d.md' }, { path: 'x/y.md' }]);
  assert.deepEqual(removalOf(tree, new Set(['docs/b.md', 'docs/new/c.md', 'docs/new/d.md'])), ['docs']);
  assert.deepEqual(removalOf(tree, new Set(['docs/new/c.md', 'docs/new/d.md', 'a.md'])).sort(), ['a.md', 'docs/new']);
  assert.deepEqual(removalOf(tree, new Set(['docs/new/c.md'])), ['docs/new/c.md']);
});
