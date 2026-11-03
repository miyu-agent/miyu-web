// @ts-check
//! 打开时去哪（`src/lib/launch.js`，蓝图 `web-ui.md`「怎么走」第二条第 9 款，W-1085）：`miyu web --session`、`--settings` 打出的网址里
//! `session=`、`settings=` 认不认；读完抹掉这两项，别的几项留着。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionOf, settingsOf, without, ACCESS } from '../../src/lib/launch.js';

const ID = '019a4b2c-7d3e-7f10-8a2b-3c4d5e6f7a8b';

test('会话：只认核心会话编号的写法，和别的几项混着也认', () => {
  assert.equal(sessionOf(`#session=${ID}`), ID);
  assert.equal(sessionOf(`package=wx&session=${ID}&settings=`), ID, '不带 # 也行、在中间也行');
  assert.equal(sessionOf(`#session=${ID.toUpperCase()}`), ID.toUpperCase());
  assert.equal(sessionOf(''), null);
  assert.equal(sessionOf('#package=wx'), null);
  assert.equal(sessionOf('#session='), null);
  assert.equal(sessionOf('#session=notes'), null);
  assert.equal(sessionOf(`#session=${ID}x`), null);
  assert.equal(sessionOf('#session=..%2F'), null);
});

test('设置：空的是首页，写了的照分页编号的写法，access 是「访问」那一组', () => {
  assert.equal(settingsOf('#settings='), '', '首页');
  assert.equal(settingsOf('#settings'), '', '不带 = 的也当首页');
  assert.equal(settingsOf(`#ticket=ab&settings=${ACCESS}`), 'access');
  assert.equal(settingsOf('#settings=models&package=wx'), 'models');
  assert.equal(settingsOf('#package=wx'), null, '没写');
  assert.equal(settingsOf('#settings=a%26b'), null, '写法不对');
  assert.equal(settingsOf(`#settings=${'a'.repeat(65)}`), null, '最多 64 个');
});

test('抹掉：只去掉点名的几项，别的留着，什么都不剩的去掉整个 #', () => {
  assert.equal(without(`#session=${ID}`, ['session']), '');
  assert.equal(without(`#package=wx&session=${ID}&widget=today`, ['session']), '#package=wx&widget=today');
  assert.equal(without('#settings=access&package=wx', ['settings']), '#package=wx');
  assert.equal(without('#package=wx', ['session']), '#package=wx', '没有的照原样');
  assert.equal(without('', ['settings']), '');
});
