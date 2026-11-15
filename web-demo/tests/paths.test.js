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

test('开会话时选的目录核心换了别处（核心 WN-1）：换了的交实际的，没换、没选的是 null；家目录写成 ~ 再比，结尾的 / 不算', async () => {
  const { movedFrom } = await import('../src/model/paths.js');
  const home = '/home/me';
  assert.equal(movedFrom('/home/me', '~/.miyu/workspace/01ab', home), '~/.miyu/workspace/01ab', '家目录太宽，核心改用默认工作区');
  assert.equal(movedFrom('/home/me/src/miyu', '~/src/miyu', home), null, '同一个目录，回应写成 ~/…');
  assert.equal(movedFrom('/home/me/src/miyu/', '~/src/miyu', home), null, '结尾的 / 不算');
  assert.equal(movedFrom('/', '/', home), null, '根目录照用（太宽的另由 wide 提醒）');
  assert.equal(movedFrom(null, '~/.miyu/workspace/01ab', home), null, '没选目录的不说');
  assert.equal(movedFrom('/home/me', null, home), null, '旧核心回应不带 cwd');
});
