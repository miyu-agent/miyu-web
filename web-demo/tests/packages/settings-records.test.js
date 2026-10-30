// @ts-check
//! 设置页的一组字段的列表（`packages/settings/records.js`，蓝图 `web.md`「设置页」第 5 条「软件包配置项的词汇」，核心设计 53 第二节）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldsOf, titleOf, blankRecord, problemSpots, withField, moved, fieldValue, MOST } from '../../packages/settings/records.js';

const item = {
  key: 'imagegen.accounts',
  title: 'name',
  fields: {
    name: { type: 'text', name: '备注' },
    kind: { type: 'option', options: [{ value: 'oa', name: 'OpenAI 兼容' }], default: 'oa' },
    key: { type: 'secret', name: 'Key' },
    weight: { type: 'int', default: 1 },
  },
};

test('字段照核心给的先后；给数组的照每个字段的名字', () => {
  assert.deepEqual(fieldsOf(item).map(([k]) => k), ['name', 'kind', 'key', 'weight']);
  assert.deepEqual(fieldsOf({ fields: [{ field: 'a', type: 'text' }, { key: 'x.accounts.b', type: 'int' }] }).map(([k]) => k), ['a', 'b']);
  assert.deepEqual(fieldsOf({}), []);
});

test('卡片标题照 title 那个字段，选项照显示名；没写、空着的交 null（写「第 N 项」）', () => {
  assert.equal(titleOf(item, { name: '主号' }), '主号');
  assert.equal(titleOf({ ...item, title: 'kind' }, { kind: 'oa' }), 'OpenAI 兼容');
  assert.equal(titleOf(item, { name: '' }), null);
  assert.equal(titleOf({ ...item, title: undefined }, { name: '主号' }), null);
});

test('新加的一项照默认值填，没有默认的空着', () => {
  assert.deepEqual(blankRecord(fieldsOf(item)), { kind: 'oa', weight: 1 });
});

test('核心报的问题挂到第几项的哪一格；只到第几项的挂在卡片头上；别的项的不算', () => {
  const spots = problemSpots('imagegen.accounts', [
    { key: 'imagegen.accounts[2].key', message: '少写了 key' },
    { key: 'imagegen.accounts[2].weight', message: '要是整数' },
    { key: 'imagegen.accounts[0]', message: '不认识的字段 foo' },
    { key: 'imagegen.accountsx[1].a', message: '别的项' },
    { key: 'imagegen.size', message: '别的项' },
  ]);
  assert.deepEqual([...spots.keys()].sort(), [0, 2]);
  assert.deepEqual(spots.get(2)?.get('key'), ['少写了 key']);
  // 写在那一格下面的不再带开头的键（核心的话是「键 + 原因」）
  const said = problemSpots('draw.accounts', [{ key: 'draw.accounts[0].name', message: 'draw.accounts[0].name 没写：这个字段没有默认值，要写。' }]);
  assert.deepEqual(said.get(0)?.get('name'), ['没写：这个字段没有默认值，要写。']);
  assert.deepEqual(spots.get(0)?.get(''), ['不认识的字段 foo']);
});

test('改一格、去掉一格、挪一项都交新的整条，不动原来的', () => {
  const rows = [{ name: 'a' }, { name: 'b', weight: 2 }];
  assert.deepEqual(withField(rows, 1, 'weight', { value: 3 }), [{ name: 'a' }, { name: 'b', weight: 3 }]);
  assert.deepEqual(withField(rows, 1, 'weight', { unset: true }), [{ name: 'a' }, { name: 'b' }]);
  assert.deepEqual(rows[1], { name: 'b', weight: 2 }, '原来的没动');
  assert.deepEqual(moved(rows, 0, 1), [{ name: 'b', weight: 2 }, { name: 'a' }]);
  assert.equal(moved(rows, 0, -1), rows, '挪不动的原样');
});

test('框里写的字照字段的类型读：数的读成数，读不成的照原样交给核心', () => {
  assert.equal(fieldValue({ type: 'int' }, '42'), 42);
  assert.equal(fieldValue({ type: 'number' }, '0.5'), 0.5);
  assert.equal(fieldValue({ type: 'int' }, 'abc'), 'abc');
  assert.equal(fieldValue({ type: 'text' }, '42'), '42');
  assert.equal(MOST, 100);
});
