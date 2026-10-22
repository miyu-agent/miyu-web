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
