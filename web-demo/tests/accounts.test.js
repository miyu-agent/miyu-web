// @ts-check
//! 这台浏览器记着的账号（`src/model/accounts.js`，蓝图 `web.md`「连核心」第 1 条「选择账号」）：读表、迁旧的、登录以后进表、令牌作废、
//! 去掉一个、起页面时拿哪一份。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readList, readSession, readIntent, pickLogin, signedIn, usedLogin, dropToken, removeAccount, chooseAccount, shownAccounts, initialOf, emptyList, UNKNOWN } from '../src/model/accounts.js';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const LATER = '2026-11-26T12:00:00Z';
const GONE = '2026-10-01T00:00:00Z';

test('读表：坏的、版本不认的当没有；没名字的项扔掉，令牌空的不算存着；current 不在表上的当没有', () => {
  assert.deepEqual(readList(null), emptyList());
  assert.deepEqual(readList('{'), emptyList());
  assert.deepEqual(readList('{"v": 2, "accounts": []}'), emptyList());
  const got = readList(JSON.stringify({ v: 1, current: 'nobody', accounts: [{ account: 'bob', token: '', used: 'x' }, { token: 't' }, { account: 'amy', token: 't1', expires: LATER, used: 'y' }] }));
  assert.deepEqual(got, { v: 1, current: null, accounts: [{ account: 'bob', used: 'x' }, { account: 'amy', token: 't1', expires: LATER, used: 'y' }] });
});

test('迁旧的 miyu.web.login：成一项（当成勾了自动登录），名字等握手填，当成 current；表上有这份令牌的不再迁', () => {
  const got = readList(null, JSON.stringify({ token: 'old', expires: LATER }), 'T0');
  assert.deepEqual(got, { v: 1, current: UNKNOWN, accounts: [{ account: UNKNOWN, token: 'old', expires: LATER, used: 'T0' }] });
  assert.deepEqual(pickLogin(got, null, NOW), { account: UNKNOWN, token: 'old' }, '起页面时照它握手');
  assert.deepEqual(shownAccounts(got, NOW), [], '名字还不知道的不列');
  const named = usedLogin(got, 'owner1', 'old', 'T1');
  assert.deepEqual(named, { v: 1, current: 'owner1', accounts: [{ account: 'owner1', token: 'old', expires: LATER, used: 'T1' }] }, '握手回应的 account 填上');
  assert.deepEqual(readList(JSON.stringify(named), JSON.stringify({ token: 'old' })), named, '迁过了的不再迁');
  assert.deepEqual(readList(null, '{"token": 5}'), emptyList());
});

test('登录成了：勾了自动登录的存令牌，没勾的只记名字；进表的放最前、当 current；同名的、同一份令牌的、迁过来没名字的换掉', () => {
  let list = signedIn(emptyList(), 'bob', { token: 'b1', expires: LATER }, false, 'T1');
  assert.deepEqual(list, { v: 1, current: 'bob', accounts: [{ account: 'bob', used: 'T1' }] });
  list = signedIn(list, 'owner1', { token: 'o1', expires: LATER }, true, 'T2');
  assert.deepEqual(list.accounts.map((a) => [a.account, a.token ?? null]), [['owner1', 'o1'], ['bob', null]]);
  list = signedIn(list, 'bob', { token: 'b2' }, true, 'T3');
  assert.deepEqual(list.accounts, [{ account: 'bob', token: 'b2', expires: null, used: 'T3' }, { account: 'owner1', token: 'o1', expires: LATER, used: 'T2' }]);
  const migrated = readList(null, JSON.stringify({ token: 'old' }), 'T0');
  assert.deepEqual(signedIn(migrated, 'amy', { token: 'a1' }, true, 'T4').accounts.map((a) => a.account), ['amy']);
});

test('起页面时拿哪一份：这个标签页的那份只给它那个账号；不然 current 存着没过期的；点了的头像（want）先于 current', () => {
  const list = { v: /** @type {1} */ (1), current: 'bob', accounts: [{ account: 'owner1', token: 'o1', expires: LATER, used: 'T2' }, { account: 'bob', used: 'T1' }, { account: 'old', token: 'x', expires: GONE, used: 'T0' }] };
  const tab = { account: 'bob', token: 's1', expires: LATER };
  assert.deepEqual(pickLogin(list, tab, NOW), { account: 'bob', token: 's1' });
  assert.equal(pickLogin(list, null, NOW), null, '没勾自动登录的，标签页关了就要密码');
  assert.deepEqual(pickLogin(list, tab, NOW, 'owner1'), { account: 'owner1', token: 'o1' }, '换到别的账号，不拿这个标签页那份');
  assert.equal(pickLogin(list, tab, NOW, 'old'), null, '过期了的不用');
  assert.equal(pickLogin({ ...list, current: null }, tab, NOW), null);
  assert.equal(pickLogin(list, { ...tab, expires: GONE }, NOW), null);
});

test('令牌作废了（bad_login）：扔掉那份、账号留着；迁过来没名字的整项去掉', () => {
  const list = { v: /** @type {1} */ (1), current: 'owner1', accounts: [{ account: 'owner1', token: 'o1', expires: LATER, used: 'T2' }, { account: UNKNOWN, token: 'old', used: 'T0' }] };
  assert.deepEqual(dropToken(list, 'owner1', 'o1').accounts, [{ account: 'owner1', used: 'T2' }, { account: UNKNOWN, token: 'old', used: 'T0' }]);
  assert.deepEqual(dropToken(list, null, 'old').accounts, [{ account: 'owner1', token: 'o1', expires: LATER, used: 'T2' }]);
});

test('去掉一个、换一个；那一排照上次用的先后，存着能用的令牌标 saved；头像画首字', () => {
  const list = { v: /** @type {1} */ (1), current: 'bob', accounts: [{ account: 'owner1', token: 'o1', expires: LATER, used: 'T1' }, { account: 'bob', used: 'T2' }] };
  assert.deepEqual(shownAccounts(list, NOW), [{ account: 'bob', saved: false }, { account: 'owner1', saved: true }]);
  assert.deepEqual(removeAccount(list, 'bob'), { v: 1, current: null, accounts: [list.accounts[0]] });
  assert.equal(removeAccount(list, 'owner1').current, 'bob');
  assert.equal(chooseAccount(list, 'owner1').current, 'owner1');
  assert.equal(initialOf('bob'), 'B');
  assert.equal(initialOf('小明'), '小');
  assert.equal(initialOf(''), '?');
});

test('这个标签页的那份、重新载入以后的打算：坏的是 null', () => {
  assert.deepEqual(readSession(JSON.stringify({ account: 'bob', token: 's1', expires: LATER })), { account: 'bob', token: 's1', expires: LATER });
  assert.equal(readSession('{"account": "bob"}'), null);
  assert.equal(readSession('nope'), null);
  assert.deepEqual(readIntent('{"add": true}'), { add: true });
  assert.deepEqual(readIntent('{"manage": true}'), { manage: true });
  assert.deepEqual(readIntent('{"pick": "bob"}'), { pick: 'bob' });
  assert.equal(readIntent('{"pick": 1}'), null);
  assert.equal(readIntent(null), null);
});
