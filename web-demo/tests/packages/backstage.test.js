// @ts-check
//! 软件页面的网址（蓝图 `web.md`「软件的页面」第 1 条，2026-10-15 项目主人定独立整页）：`#package=<编号>`，界面块的整页另带 `&widget=`；
//! 宿主读完口令、一次性码只抹它们，`package=` 留在地址栏里（收藏、新标签页打开都是这一页）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, formatRoute } from '../../packages/backstage/route.js';

test('读网址：#package=<编号>、另带 widget；和别的几项混着也认；写法不对的不认', () => {
  assert.deepEqual(parseRoute('#package=qq-connect'), { package: 'qq-connect', widget: null });
  assert.deepEqual(parseRoute('package=wx&widget=today'), { package: 'wx', widget: 'today' });
  assert.deepEqual(parseRoute('#k=ab12&package=notes.v2'), { package: 'notes.v2', widget: null }, '和桥的口令在一起');
  assert.deepEqual(parseRoute('#package=wx&widget=..%2F'), { package: 'wx', widget: null }, 'widget 写法不对的当没写');
  assert.equal(parseRoute(''), null);
  assert.equal(parseRoute('#setup=12ab'), null);
  assert.equal(parseRoute('#package=../etc'), null);
  assert.equal(parseRoute(`#package=${'a'.repeat(65)}`), null, '最多 64 个');
});

test('写网址：读回来一样', () => {
  for (const r of [{ package: 'wx', widget: null }, { package: 'wx', widget: 'today' }]) assert.deepEqual(parseRoute(formatRoute(r)), r);
  assert.equal(formatRoute({ package: 'wx' }), '#package=wx');
});

test('宿主抹掉口令、一次性码，软件页面那一段留着', async () => {
  const seen = [];
  Object.assign(globalThis, {
    location: { pathname: '/', search: '', hash: '#k=ab12&package=wx' },
    history: { replaceState: (/** @type {any} */ _s, /** @type {string} */ _t, /** @type {string} */ url) => seen.push(url) },
  });
  const { dropFromHash } = await import('../../src/host/files.js');
  dropFromHash(['k']);
  globalThis.location.hash = '#setup=99&package=wx&widget=today';
  dropFromHash(['setup']);
  globalThis.location.hash = '#k=ab12';
  dropFromHash(['k']);
  assert.deepEqual(seen, ['/#package=wx', '/#package=wx&widget=today', '/']);
});
