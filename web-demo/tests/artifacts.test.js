// @ts-check
//! 预览工作区里放什么（蓝图 `web.md`「预览工作区」第 1 条；核心 D-5）：她 `show` 过的，照视图里工具条目的 `shown`；同一个路径再展示换掉、
//! 排到最前；藏起来的（撤掉的那一轮）不算；种类照核心认的媒体类型；别的文件不进右栏。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { shownOf, shownList, panelList, shownKind, codeLanguage, undismissed } from '../src/model/artifacts.js';

loadRes();

const HASH = (c) => `sha256:${c.repeat(64)}`;
/** 一步 show：编号、路径、媒体类型，别的格照给的 */
const step = (id, path, type, more = {}) => ({ id, kind: 'tool', name: 'show', state: 'ok', turn: 1, shown: { path, blob: HASH('a'), name: path.split('/').pop(), media_type: type, size: 10, ...more } });

test('一个路径一项（最后那一次），最后展示的在前；藏起来的不算；没展示成的（没有 shown、没有 blob）不算', () => {
  const list = shownList([
    step('b1.0', '/w/a.png', 'image/png', { width: 4, height: 3 }),
    step('b2.0', '/w/r.html', 'text/html', { title: '报告' }),
    { id: 'b3.0', kind: 'tool', name: 'show', state: 'failed', turn: 2 },
    step('b4.0', '/w/a.png', 'image/png', { blob: HASH('b') }),
    { ...step('b5.0', '/w/gone.md', 'text/markdown'), hidden: true },
    { id: 'b6.0', kind: 'tool', name: 'show', shown: { path: '/w/x' } },
    { id: 'm7', kind: 'reply', text: '好了' },
  ]);
  assert.deepEqual(list.map((s) => [s.path, s.seq, s.blob]), [['/w/a.png', 4, HASH('b')], ['/w/r.html', 2, HASH('a')]]);
  assert.equal(list[1].title, '报告');
  assert.equal(list[1].name, 'r.html');
  assert.deepEqual([list[0].width, list[0].height], [null, null], '后来那一次没给宽高');
});

test('种类照媒体类型：text/plain 带语言的是代码；别的文件不进右栏', () => {
  assert.deepEqual(
    ['image/png', 'image/svg+xml', 'application/pdf', 'text/html', 'text/markdown', 'application/octet-stream'].map((t) => shownKind(t)),
    ['image', 'image', 'pdf', 'html', 'markdown', 'file'],
  );
  assert.equal(shownKind('text/plain', 'rust'), 'code');
  assert.equal(shownKind('text/plain'), 'text');
  const all = shownList([step('b1.0', '/w/a.zip', 'application/octet-stream'), step('b2.0', '/w/m.rs', 'text/plain', { language: 'Rust' })]);
  assert.deepEqual(panelList(all).map((s) => s.kind), ['code']);
  assert.equal(codeLanguage(all[0].language), 'rust');
  assert.equal(codeLanguage(null), null);
});

test('没写名字的照路径最后一截；不是工具条目的是 null', () => {
  const s = shownOf({ id: 'b9.1', kind: 'tool', shown: { path: '/w/sub/n.txt', blob: HASH('c'), media_type: 'text/plain' } });
  assert.equal(s?.name, 'n.txt');
  assert.equal(s?.seq, 9);
  assert.equal(shownOf({ id: 'm1', kind: 'reply', shown: { path: '/x', blob: HASH('c') } }), null);
});

test('下拉里删掉的不列；同一个路径后来又展示了（序号更新）的照旧列', () => {
  const list = shownList([step('b1.0', '/w/a.png', 'image/png'), step('b2.0', '/w/r.html', 'text/html'), step('b3.0', '/w/m.md', 'text/markdown')]);
  assert.deepEqual(undismissed(list, { '/w/r.html': 2 }).map((s) => s.path), ['/w/m.md', '/w/a.png']);
  assert.deepEqual(undismissed(list, undefined).length, 3);
  const again = shownList([step('b1.0', '/w/a.png', 'image/png'), step('b2.0', '/w/r.html', 'text/html'), step('b5.0', '/w/r.html', 'text/html')]);
  assert.deepEqual(undismissed(again, { '/w/r.html': 2 }).map((s) => s.path), ['/w/r.html', '/w/a.png'], '又展示了一次，回来');
});
