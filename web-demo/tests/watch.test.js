// @ts-check
//! 只能看的会话（W-1168，im 第 59 条）：会话表读到了、表里没有、订阅成了的才算；读到表以前、表里有的、整理记忆的、样张、坏了的都不算。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchOnly } from '../src/model/watch.js';

const base = { id: 'a', loaded: true, listed: false, dream: false, gallery: false, subscribed: true };

test('场所会话（表里没有、订阅成了）只能看', () => {
  assert.equal(watchOnly(base), true);
});

test('本机的会话、读到表以前、整理记忆、样张、没订阅成、没有会话都不算', () => {
  assert.equal(watchOnly({ ...base, listed: true }), false);
  assert.equal(watchOnly({ ...base, loaded: false }), false, '托盘点通知开的本机会话不先锁一下');
  assert.equal(watchOnly({ ...base, dream: true }), false);
  assert.equal(watchOnly({ ...base, gallery: true }), false);
  assert.equal(watchOnly({ ...base, subscribed: false }), false);
  assert.equal(watchOnly({ ...base, id: null }), false);
});
