// @ts-check
//! 右边窄栏拖宽（蓝图「仪表盘」第 2 条，2026-10-24 项目主人：「让这个能被鼠标拖动调整宽度呗」）：夹在最窄和放得下的最宽之间
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sideWidth, NARROW_WIDTH } from '../src/ui/side.js';

test('窄栏多宽：照拖过的，最窄是左栏的宽、最宽到对话那一列只剩 chat_min；放不下时照放得下的最宽，比最窄还窄的照最窄', () => {
  assert.equal(NARROW_WIDTH, 252, '量不到左栏时同左栏出厂的宽');
  assert.equal(sideWidth(420, 900, 252), 420, '放得下照拖过的');
  assert.equal(sideWidth(200, 900, 252), 252, '最窄是左栏的宽');
  assert.equal(sideWidth(200, 900, 224), 224, '左栏窄了（1078px 以下 224）最窄也跟着');
  assert.equal(sideWidth(900, 500, 252), 500, '放不下照放得下的最宽');
  assert.equal(sideWidth(420, 100, 252), 252, '放得下的比最窄还窄：照最窄');
  assert.equal(sideWidth(0, 900, 252), 252, '没拖过的同左栏（2026-10-24 项目主人：原来 312 比左栏宽一点）');
  assert.equal(sideWidth(312, 900, 252), 312, '已经拖过、记着的照记的');
  assert.equal(sideWidth(Number.NaN, 900, 252), 252, '记坏了的当没拖过');
  assert.equal(sideWidth(400.6, Infinity, 252), 401, '取整数像素');
  assert.equal(sideWidth(0, 900), 252, '不给最窄的照出厂');
});
