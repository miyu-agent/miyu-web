// @ts-check
//! 这台浏览器记着的设备令牌（`src/host/served.js`，蓝图 `web.md`「连核心」第 1 条；核心 SU-1：只有主人一个人）：读一份令牌、原来多账号的表迁成一份。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLogin, migrateAccounts } from '../src/host/served.js';

const NOW = Date.parse('2026-10-28T00:00:00Z');
const LATER = '2999-01-01T00:00:00Z';

test('读一份设备令牌：坏的、空的、过期了的当没有', () => {
  assert.deepEqual(readLogin(JSON.stringify({ token: 't1', expires: LATER }), NOW), { token: 't1', expires: LATER });
  assert.deepEqual(readLogin(JSON.stringify({ token: 't1' }), NOW), { token: 't1', expires: null }, '没写过期的照用');
  assert.equal(readLogin(JSON.stringify({ token: 't1', expires: '2026-10-01T00:00:00Z' }), NOW), null, '过期了');
  assert.equal(readLogin(JSON.stringify({ token: '' }), NOW), null);
  assert.equal(readLogin('{坏的', NOW), null);
  assert.equal(readLogin(null, NOW), null);
  assert.deepEqual(readLogin(JSON.stringify({ account: 'bob', token: 'b1', expires: LATER }), NOW), { token: 'b1', expires: LATER }, '原来标签页那一份带账号的照读');
});

test('原来多账号的表迁成一份（核心 SU-1）：上次用的那个账号存着的令牌；它没存的照最近用过、存着令牌的；都没有的不迁', () => {
  const list = (/** @type {any} */ current, /** @type {any[]} */ accounts) => JSON.stringify({ v: 1, current, accounts });
  assert.deepEqual(migrateAccounts(list('owner1', [{ account: 'bob', token: 'b1', expires: LATER, used: '2026-10-27T00:00:00Z' }, { account: 'owner1', token: 'o1', expires: LATER, used: '2026-10-20T00:00:00Z' }]), NOW),
    { token: 'o1', expires: LATER, account: 'owner1' }, '上次用的那个');
  assert.deepEqual(migrateAccounts(list('owner1', [{ account: 'owner1', used: '2026-10-28T00:00:00Z' }, { account: 'a', token: 'a1', expires: LATER, used: '2026-10-20T00:00:00Z' }, { account: 'b', token: 'b1', expires: LATER, used: '2026-10-26T00:00:00Z' }]), NOW),
    { token: 'b1', expires: LATER, account: 'b' }, '上次用的没存令牌：最近用过、存着的');
  assert.equal(migrateAccounts(list('x', [{ account: 'x', used: '2026-10-27T00:00:00Z' }, { account: 'y', token: 'y1', expires: '2026-01-01T00:00:00Z' }]), NOW), null, '都没有能用的');
  assert.equal(migrateAccounts('{坏', NOW), null);
  assert.equal(migrateAccounts(null, NOW), null);
});
