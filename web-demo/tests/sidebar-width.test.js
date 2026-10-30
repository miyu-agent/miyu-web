// @ts-check
//! 左栏多宽（蓝图「整页」左栏的宽那一条，2026-10-30 项目主人：左栏太宽，窗口窄的时候跟着收窄，或者能拖、记住）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoWidth, dragWidth, SIDEBAR_MIN, SIDEBAR_MAX } from '../src/ui/sidebar-width.js';

test('没拖过的：照窗口宽的 22% 收窄，夹在最窄 200 和出厂之间', () => {
  assert.equal(autoWidth(1600), 252, '宽屏照出厂');
  assert.equal(autoWidth(1000), 220, '窗口窄了跟着收窄');
  assert.equal(autoWidth(700), SIDEBAR_MIN, '再窄也不比 200 窄');
  assert.equal(autoWidth(1600, 300), 300, '出厂照主题的');
  assert.equal(autoWidth(700, 180), 180, '主题写得比最窄还窄的照主题的');
});

test('拖到的宽：夹在 200 和 400、窗口宽的 36% 之间；离出厂 10px 以内吸过去当没拖过', () => {
  assert.equal(dragWidth(320, 1600), 320);
  assert.equal(dragWidth(120, 1600), SIDEBAR_MIN, '最窄 200');
  assert.equal(dragWidth(600, 1600), SIDEBAR_MAX, '最宽 400');
  assert.equal(dragWidth(600, 1000), 360, '窗口窄的不超过 36%');
  assert.equal(dragWidth(600, 500), 0, '36% 比最窄还窄的照最窄，正好是这时的出厂：当没拖过');
  assert.equal(dragWidth(258, 1600), 0, '离出厂 252 不到 10px：当没拖过');
  assert.equal(dragWidth(228, 1000), 0, '吸的是这时照窗口算出来的出厂（220）');
  assert.equal(dragWidth(240, 1600), 240, '离出厂 12px 的照拖的');
});
