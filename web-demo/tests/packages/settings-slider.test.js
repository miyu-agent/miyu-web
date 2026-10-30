// @ts-check
//! 设置页的滑块（`packages/settings/slider.js`，蓝图 `web.md`「设置页」第 5 条「软件包配置项的词汇」，核心设计 53 第三节）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digitsOf, sliderOf } from '../../packages/settings/slider.js';

test('数写几位小数照一格多大', () => {
  assert.equal(digitsOf(1), 0);
  assert.equal(digitsOf(0.05), 2);
  assert.equal(digitsOf(0.1), 1);
  assert.equal(digitsOf(1e-7), 7);
  assert.equal(digitsOf(0), 0, '没给的不写小数');
});

test('一格多大、画在哪：照核心给的；没给 step 的 int 是 1、小数是范围的百分之一；没写过的照默认、再没有的照最小', () => {
  assert.deepEqual(sliderOf({ type: 'int', min: 0, max: 10 }, 3), { min: 0, max: 10, step: 1, now: 3, set: true, digits: 0 });
  const f = sliderOf({ type: 'number', min: 0, max: 2, default: 0.7 }, null);
  assert.equal(f.step, 0.02);
  assert.equal(f.now, 0.7, '没写过的照默认');
  assert.equal(f.set, false, '没写过的淡一档');
  assert.equal(sliderOf({ type: 'number', min: 0, max: 1, step: 0.05 }, 0.25).digits, 2);
  assert.equal(sliderOf({ type: 'int', min: 5, max: 9 }, null).now, 5, '没有默认的照最小');
  assert.equal(sliderOf({ type: 'int', min: 0, max: 10 }, 99).now, 10, '超了范围的夹回来画');
});
