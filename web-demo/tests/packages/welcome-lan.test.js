// @ts-check
//! 第一次引导的「在别的设备上用」那一屏（软件包 `welcome` 的 `lan.js`，蓝图 `web.md`「第一次引导」第 9 条下面一款，W-1086）：出不出照宿主有没有
//! `listen`、配置清单里有没有 `web.listen`；点「下一步」做什么照选的、走到哪一段、设没设过访问密码。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lanAction, lanState, LISTEN_KEY } from '../../packages/welcome/lan.js';

/** 假的 ctx：`config.schema` 回 `schema`（是 Error 的照它拒）；宿主有没有 `listen` 照 `listen`。 @param {any} schema @param {boolean} [listen] */
const ctx = (schema, listen = true) => ({
  host: listen ? { listen: { get: async () => null, relisten: async () => null } } : { listen: null },
  core: {
    request: async (/** @type {string} */ method) => {
      assert.equal(method, 'config.schema');
      if (schema instanceof Error) throw schema;
      return schema;
    },
  },
});

test('出不出：直接连着网页软件、配置清单里有 web.listen 的才出', async () => {
  assert.equal(await lanState(ctx({ items: [{ key: LISTEN_KEY }] })), true);
  assert.equal(await lanState(ctx({ items: [{ key: LISTEN_KEY }] }, false)), false, '走桥的没有 listen');
  assert.equal(await lanState(ctx({ items: [] })), false, '网页软件没装');
  assert.equal(await lanState(ctx(Object.assign(new Error('unknown'), { reason: 'unknown_config_key' }))), false);
});

test('下一步：没选的不动；不开放到完成，开过的先关上；开放的没设过密码先设，设过的、旧核心直接开', () => {
  assert.equal(lanAction('choose', null, false, false), null);
  assert.equal(lanAction('choose', 'closed', false, false), 'done');
  assert.equal(lanAction('choose', 'closed', true, true), 'close', '开好以后回去改选了不开放');
  assert.equal(lanAction('choose', 'open', false, false), 'ask');
  assert.equal(lanAction('choose', 'open', true, false), 'open');
  assert.equal(lanAction('choose', 'open', null, false), 'open', '旧核心不说设没设');
  assert.equal(lanAction('password', 'open', false, false), 'set');
  assert.equal(lanAction('shown', 'open', true, true), 'done');
});
