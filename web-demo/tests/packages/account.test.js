// @ts-check
//! 「账号」页（`packages/settings/account.js`，蓝图 `web.md`「设置页」第 12c 条，核心 Y-1 上）：邀请的状态、成员表的先后。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteState, sortAccounts, DAYS } from '../../packages/settings/account.js';

test('邀请的状态：用掉的、过期的、还能用的', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(inviteState({ expires: '2026-10-29T12:00:00Z' }, now), 'open');
  assert.equal(inviteState({ expires: '2026-10-21T12:00:00Z' }, now), 'expired');
  assert.equal(inviteState({ expires: '2026-10-21T12:00:00Z', used: { account: 'bob', at: '2026-10-20T00:00:00Z' } }, now), 'used');
  assert.equal(inviteState({}, now), 'open', '没写到期的照还能用');
  assert.deepEqual(DAYS, [1, 3, 7, 14, 30]);
});

test('成员表：管理员、成员、系统账号；同一种照注册的先后', () => {
  const got = sortAccounts([
    { account: 'im-qq', kind: 'system' },
    { account: 'carol', kind: 'member', created: '2026-10-22T02:00:00Z' },
    { account: 'admin', kind: 'admin' },
    { account: 'bob', kind: 'member', created: '2026-10-22T01:00:00Z' },
  ]);
  assert.deepEqual(got.map((a) => a.account), ['admin', 'bob', 'carol', 'im-qq']);
});

test('管理员后台的网址：#admin=<页>，不认得、没写的是总览；没有 admin 的不是后台', async () => {
  const { parseAdmin } = await import('../../packages/settings/admin.js');
  assert.equal(parseAdmin('#admin=accounts'), 'accounts');
  assert.equal(parseAdmin('admin=overview'), 'overview');
  assert.equal(parseAdmin('#admin'), 'overview');
  assert.equal(parseAdmin('#admin=nope'), 'overview');
  assert.equal(parseAdmin('#package=x'), null);
  assert.equal(parseAdmin(''), null);
});

test('总览的「最近」：注册、生成邀请照时刻倒着排，停用的没时刻排在最后', async () => {
  const { recentEvents } = await import('../../packages/settings/admin.js');
  const got = recentEvents(
    [{ id: 'aaaaaaaa1111', created: '2026-10-22T01:00:00Z', used: { account: 'bob', at: '2026-10-22T03:00:00Z' } }, { id: 'bbbbbbbb2222', created: '2026-10-22T02:00:00Z' }],
    [{ account: 'carol', disabled: true }, { account: 'bob' }]);
  assert.deepEqual(got.map((e) => `${e.kind}:${e.who}`), ['joined:bob', 'invited:bbbbbbbb', 'invited:aaaaaaaa', 'disabled:carol']);
});

test('管理员后台的多选（2026-10-27 项目主人）：能勾的邀请、账号；只看还能用的；勾的成员能做什么；点一行、Shift 连着勾；一个个做不停', async () => {
  const { pickableInvite, pickableAccount, shownInvites, accountMoves, pickOne, runEach } = await import('../../packages/settings/account.js');
  const now = Date.parse('2026-10-27T00:00:00.000Z');
  const open = { id: 'a', expires: '2026-10-29T00:00:00.000Z' };
  const used = { id: 'b', expires: '2026-10-29T00:00:00.000Z', used: { account: 'bob', at: '2026-10-22T00:00:00.000Z' } };
  const gone = { id: 'c', expires: '2026-10-20T00:00:00.000Z' };
  assert.deepEqual([open, used, gone].map((i) => pickableInvite(i, now)), [true, false, false], '已注册、已过期的不能勾');
  assert.deepEqual(shownInvites([open, used, gone], now, true).map((i) => i.id), ['a']);
  assert.deepEqual(shownInvites([open, used, gone], now, false).map((i) => i.id), ['a', 'b', 'c']);
  const accounts = [{ account: 'owner1', kind: 'admin' }, { account: 'bob', kind: 'member' }, { account: 'eve', kind: 'member', disabled: true }, { account: 'me', kind: 'member' }, { account: 'bridge', kind: 'system' }];
  assert.deepEqual(accounts.filter((a) => pickableAccount(a, 'me')).map((a) => a.account), ['bob', 'eve'], '机主、系统账号、自己不能勾');
  assert.deepEqual(accountMoves(accounts, new Set(['bob', 'eve'])), { disable: ['bob'], enable: ['eve'] });
  assert.deepEqual(accountMoves(accounts, new Set(['bob'])), { disable: ['bob'], enable: [] }, '只有开着的：只出停用');
  const order = ['a', 'b', 'c', 'd'];
  let picked = pickOne(new Set(), order, null, 'b', false);
  assert.deepEqual([...picked], ['b']);
  picked = pickOne(picked, order, 'b', 'd', true);
  assert.deepEqual([...picked].sort(), ['b', 'c', 'd'], 'Shift 连着勾');
  assert.deepEqual([...pickOne(picked, order, 'd', 'c', false)].sort(), ['b', 'd'], '再点去掉');
  const got = await runEach(['x', 'y', 'z'], async (id) => { if (id === 'y') throw new Error('不行'); });
  assert.deepEqual(got, { done: ['x', 'z'], failed: [{ id: 'y', why: '不行' }] }, '一个没成不停');
});
