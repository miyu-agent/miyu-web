// @ts-check
//! 右边窄栏拖宽（蓝图「仪表盘」第 2 条，2026-10-24 项目主人：「让这个能被鼠标拖动调整宽度呗」）：夹在最窄和放得下的最宽之间
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sideWidth, NARROW_WIDTH } from '../src/ui/side.js';

test('窄栏多宽：照拖过的，最窄 312、最宽到对话那一列只剩 chat_min；放不下时照放得下的最宽，比最窄还窄的照最窄', () => {
  assert.equal(NARROW_WIDTH, 312);
  assert.equal(sideWidth(420, 900), 420, '放得下照拖过的');
  assert.equal(sideWidth(200, 900), 312, '最窄 312');
  assert.equal(sideWidth(900, 500), 500, '放不下照放得下的最宽');
  assert.equal(sideWidth(420, 100), 312, '放得下的比最窄还窄：照最窄');
  assert.equal(sideWidth(0, 900), 312, '没拖过的是最窄');
  assert.equal(sideWidth(Number.NaN, 900), 312, '记坏了的当没拖过');
  assert.equal(sideWidth(400.6, Infinity), 401, '取整数像素');
});
