// @ts-check
//! 界面块的数（软件包 `widgets`，蓝图 `web.md`「界面块」；核心 `widgets.md`）：订阅时屏上有哪几个位置、推来的一块并进记着的那份、按位置取、
//! 超过行数上限截到哪、右边那段字的几小段。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showingOf, Blocks, rowsOf, clip, rightParts, toneOf, LIMITS } from '../../packages/widgets/model.js';

const block = (id, place, extra = {}) => ({ package: 'wx', id, place, scope: 'global', source: '天气', running: true, content: null, ...extra });

test('屏上有哪几个位置：首页露着有 home，面板那一页露着有 sidebar，底栏一直有', () => {
  assert.deepEqual(showingOf({ home: true, panel: false }), ['home', 'status']);
  assert.deepEqual(showingOf({ home: false, panel: true }), ['sidebar', 'status']);
  assert.deepEqual(showingOf({ home: false, panel: false }), ['status']);
});

test('记着的那份：订阅回应换掉整份；推来的一块换那一块、null 是没了、新来的接在后面；按位置取', () => {
  const b = new Blocks();
  b.reset([block('a', 'sidebar'), block('b', 'home'), block('c', 'sidebar')]);
  assert.deepEqual(b.at('sidebar').map((x) => x.id), ['a', 'c']);
  b.apply({ package: 'wx', id: 'a', widget: block('a', 'sidebar', { title: '新标题' }) });
  assert.equal(b.get('wx', 'a')?.title, '新标题');
  b.apply({ package: 'wx', id: 'd', widget: block('d', 'sidebar') });
  assert.deepEqual(b.at('sidebar').map((x) => x.id), ['a', 'c', 'd'], '新来的接在后面');
  b.apply({ package: 'wx', id: 'c', widget: null });
  assert.deepEqual(b.at('sidebar').map((x) => x.id), ['a', 'd']);
  b.reset([]);
  assert.deepEqual(b.at('sidebar'), []);
});

test('一段占几行：字照换行，一对一条各一行，进度条带字两行，别的一行', () => {
  assert.equal(rowsOf({ type: 'text', text: 'a\nb\nc' }), 3);
  assert.equal(rowsOf({ type: 'list', items: [{}, {}] }), 2);
  assert.equal(rowsOf({ type: 'pairs', items: [{}] }), 1);
  assert.equal(rowsOf({ type: 'progress', value: 0.5 }), 1);
  assert.equal(rowsOf({ type: 'progress', value: 0.5, text: '一半' }), 2);
  assert.equal(rowsOf({ type: 'heading', text: 'x' }), 1);
  assert.equal(rowsOf({ type: 'buttons', items: [{}, {}, {}] }), 1);
});

test('截行：前面整段留着，截在字里截到那几行、截在列表里截到那几条，后面的算收起；按钮、进度条不拆', () => {
  const content = [{ type: 'heading', text: '本周' }, { type: 'text', text: '1\n2\n3' }, { type: 'list', items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] }, { type: 'buttons', items: [{ label: '刷新' }] }];
  const r = clip(content, 3);
  assert.deepEqual(r.shown, [{ type: 'heading', text: '本周' }, { type: 'text', text: '1\n2' }]);
  assert.equal(r.hidden, 1 + 3 + 1);
  const r2 = clip(content, 5);
  assert.deepEqual(r2.shown.map((s) => s.type), ['heading', 'text', 'list']);
  assert.equal(r2.shown[2].items.length, 1);
  assert.equal(r2.hidden, 2 + 1);
  assert.deepEqual(clip(content, Infinity), { shown: content, hidden: 0 });
  assert.deepEqual(clip([{ type: 'progress', value: 1, text: '满' }], 1).shown.length, 1, '进度条不拆');
  assert.equal(LIMITS.home.rows, 8);
  assert.equal(LIMITS.sidebar.blocks, 8);
});

test('右边那段字：一句字，或者最多 4 小段各带语气（核心 X-15 补）；语气只认那几种', () => {
  assert.deepEqual(rightParts('3m'), [{ text: '3m', tone: 'normal' }]);
  assert.deepEqual(rightParts(''), []);
  assert.deepEqual(rightParts([{ text: '+12', tone: 'good' }, { text: '−3', tone: 'bad' }]), [{ text: '+12', tone: 'good' }, { text: '−3', tone: 'bad' }]);
  assert.equal(rightParts([{ text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }, { text: '5' }]).length, 4);
  assert.deepEqual(rightParts([{ text: 'x' }, { nope: 1 }]), [{ text: 'x', tone: 'normal' }]);
  assert.equal(toneOf('warn'), 'warn');
  assert.equal(toneOf('purple'), 'normal');
});
