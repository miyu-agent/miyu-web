// @ts-check
//! 握手回应的 `host`（核心施工 W-3）：新会话的工作目录是账号的工作区，家目录照它写 `~`；不再问桥的 `web.info`。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeOf } from '../src/model/paths.js';

test('新会话的工作目录照 host.workspace，家目录照 host.home；没有的是 null', () => {
  assert.deepEqual(placeOf({ account: 'admin', host: { home: '/home/me', platform: 'linux', workspace: '/data/home/admin/workspace' } }),
    { cwd: '/data/home/admin/workspace', home: '/home/me', platform: 'linux' });
  assert.deepEqual(placeOf({ host: { home: null, platform: 'linux', workspace: '/w' } }), { cwd: '/w', home: null, platform: 'linux' });
  assert.deepEqual(placeOf({}), { cwd: null, home: null, platform: null });
  assert.deepEqual(placeOf(null), { cwd: null, home: null, platform: null });
});

test('握手的 host.platform：认得的三种照原样，别的是 null', async () => {
  const { placeOf } = await import('../src/model/paths.js');
  assert.equal(placeOf({ host: { platform: 'windows', home: 'C:\\Users\\a' } }).platform, 'windows');
  assert.equal(placeOf({ host: { platform: 'beos' } }).platform, null);
  assert.equal(placeOf({}).platform, null);
});
