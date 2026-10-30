// @ts-check
//! 第一次引导的「内置语义模型」那一屏（软件包 `welcome`，蓝图 `web.md`「第一次引导」第 9 条下面最后一款，下载那一半照核心 G-8）：装没装照
//! `config.schema` 里 `models.embedding` 的 `local` 选项带不带 `available: false`；没装的照 `package.install` 看一眼要下多大。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedState, installWhy, EMBED_KEY } from '../../packages/welcome/screens.js';

/** 一个假核心：`config.schema` 回 `schema`，`package.install` 回 `preview`（是 Error 的照它拒）；记下问了什么。 @param {any} schema @param {any} [preview] */
const core = (schema, preview) => {
  const asked = /** @type {any[]} */ ([]);
  return {
    asked,
    request: async (/** @type {string} */ method, /** @type {any} */ params) => {
      asked.push([method, params]);
      const reply = method === 'config.schema' ? schema : method === 'package.install' ? preview : assert.fail(method);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
};
const options = (/** @type {any[]} */ list) => ({ items: [{ key: EMBED_KEY, options: list }] });
const refuse = (/** @type {string} */ reason, data = {}) => Object.assign(new Error(`refused ${reason}`), { reason, data });

test('装了：local 选项不带 available: false，不看软件源', async () => {
  const c = core(options([{ value: 'local', name: '内置模型' }, { value: 'off', name: '关' }]));
  assert.deepEqual(await embedState(c), { installed: true });
  assert.deepEqual(c.asked.map(([m]) => m), ['config.schema']);
  assert.deepEqual(await embedState(core(options([{ value: 'local', available: true }]))), { installed: true });
});

test('没装、软件源里有：照看一眼的 download 交大小，问的是 source miyu-embed、preview', async () => {
  const c = core(options([{ value: 'local', available: false }, { value: 'off' }]), { package: 'miyu-embed', download: 59768832, with: [] });
  assert.deepEqual(await embedState(c), { installed: false, size: 59768832 });
  assert.deepEqual(c.asked[1], ['package.install', { source: 'miyu-embed', preview: true }]);
  assert.deepEqual(await embedState(core(options([{ value: 'local', available: false }]), {})), { installed: false, size: null }, '没写大小的不写');
});

test('连不上软件源：这一屏照样出、不写大小；软件源里没有、没有本机的文件、旧核心不认的跳过', async () => {
  const off = options([{ value: 'local', available: false }]);
  assert.deepEqual(await embedState(core(off, refuse('source_unreachable', { why: 'dns error' }))), { installed: false, size: null });
  for (const reason of ['unknown_package', 'wrong_target', 'bad_params', 'unknown_method']) assert.equal(await embedState(core(off, refuse(reason))), null, reason);
});

test('旧核心没有这一项、没有 local 选项、问了拒的：跳过', async () => {
  assert.equal(await embedState(core(options([{ value: 'off' }]))), null);
  assert.equal(await embedState(core({ items: [] })), null);
  assert.equal(await embedState(core(refuse('unknown_config_key'))), null);
});

test('装不上的那一句：有 data.why 的照原话，没有的照核心的话', () => {
  assert.equal(installWhy(refuse('source_unreachable', { why: 'https://miyu-agent.github.io/packages/: dns error' })), 'https://miyu-agent.github.io/packages/: dns error');
  assert.equal(installWhy(Object.assign(new Error('已经在装别的包'), { data: null })), '已经在装别的包');
});
