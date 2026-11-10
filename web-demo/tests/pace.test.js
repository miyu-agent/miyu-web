// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restBefore, BUDGET_MS, MAX_REST_MS } from '../src/model/pace.js';

test('画得快的不歇；画得久的歇上一次两倍那么久，扣掉已经过去的，最多歇 MAX_REST_MS（施工 YC-11，压测报告 O21）', () => {
  assert.equal(restBefore(0, 0), 0, '还没画过');
  assert.equal(restBefore(BUDGET_MS, 0), 0, '一帧半以内照旧一帧画一次');
  assert.equal(restBefore(100, 0), 200);
  assert.equal(restBefore(100, 150), 50, '画完已经过了一会儿的扣掉');
  assert.equal(restBefore(100, 500), 0);
  assert.equal(restBefore(5000, 0), MAX_REST_MS, '再久也不让字停太久');
  assert.equal(restBefore(Number.NaN, 0), 0);
});
