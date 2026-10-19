// @ts-check
//! 软件自己的网页（软件包 `backstage` 的 `external.js`，接入通讯平台的页面服务）：跳过去的网址 `#miyu=<base64url(JSON)>` 的写法、端口照 `status` 的 `web`。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64url, siteUrl, sitePort, COLOR_NAMES } from '../../packages/backstage/external.js';

/** base64url 解回来（同 im 那边读的） @param {string} s */
const decode = (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

test('base64url：UTF-8、不带 =、没有 + /', () => {
  const s = base64url('接入通讯平台 ✓ ?>>');
  assert.doesNotMatch(s, /[=+/]/);
  assert.equal(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'), '接入通讯平台 ✓ ?>>');
});

test('网址：127.0.0.1 加端口，片段里 v、scheme、colors、ticket、lang；值里有 ; { } 的颜色不交', () => {
  const url = siteUrl(8302, { scheme: 'dark', colors: { surface: 'rgb(26, 27, 38)', accent: 'rgb(1, 2, 3); x', card_shadow: 'rgba(0, 0, 0, 0.2) 0px 1px 3px 0px', text: '' }, ticket: 'tk-1', lang: 'zh' });
  assert.match(url, /^http:\/\/127\.0\.0\.1:8302\/#miyu=[A-Za-z0-9_-]+$/);
  assert.deepEqual(decode(url.split('#miyu=')[1]), { v: 1, scheme: 'dark', colors: { surface: 'rgb(26, 27, 38)', card_shadow: 'rgba(0, 0, 0, 0.2) 0px 1px 3px 0px' }, ticket: 'tk-1', lang: 'zh' });
});

test('交的颜色名照 im 认的那一组', () => {
  assert.ok(COLOR_NAMES.includes('sidebar_active_shadow'));
  assert.ok(COLOR_NAMES.includes('on_primary_container'));
  assert.equal(new Set(COLOR_NAMES).size, COLOR_NAMES.length);
});

test('端口：照 status 回应的 web；没有、不是整数、问了拒的是 null', async () => {
  const core = (/** @type {any} */ reply) => ({ request: async (/** @type {string} */ m, /** @type {any} */ p) => { assert.equal(m, 'package.call'); assert.deepEqual(p, { package: 'im', method: 'status' }); if (reply instanceof Error) throw reply; return reply; } });
  assert.equal(await sitePort(core({ web: 8302, connected: true }), 'im'), 8302);
  assert.equal(await sitePort(core({ connected: true }), 'im'), null);
  assert.equal(await sitePort(core({ web: '8302' }), 'im'), null);
  assert.equal(await sitePort(core(new Error('unknown_method')), 'im'), null);
});
