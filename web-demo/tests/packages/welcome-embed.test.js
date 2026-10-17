// @ts-check
//! 第一次引导的「内置语义模型」那一屏（软件包 `welcome`，蓝图 `web.md`「第一次引导」第 9 条下面最后一款）：装没装照 `config.schema` 里
//! `models.embedding` 的 `local` 选项带不带 `available: false`。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedInstalled, EMBED_KEY } from '../../packages/welcome/screens.js';

/** 一个只回 `config.schema` 的假核心。 @param {any} reply */
const core = (reply) => ({ request: async (/** @type {string} */ method) => { if (reply instanceof Error) throw reply; assert.equal(method, 'config.schema'); return reply; } });
const schema = (options) => ({ items: [{ key: EMBED_KEY, options }] });

test('装了：local 选项不带 available: false', async () => {
  assert.equal(await embedInstalled(core(schema([{ value: 'local', name: '内置模型' }, { value: 'off', name: '关' }]))), true);
  assert.equal(await embedInstalled(core(schema([{ value: 'local', available: true }]))), true);
});

test('没装：local 带 available: false；没有 local 选项；旧核心没有这一项、问了拒的', async () => {
  assert.equal(await embedInstalled(core(schema([{ value: 'local', available: false }, { value: 'off' }]))), false);
  assert.equal(await embedInstalled(core(schema([{ value: 'off' }]))), false);
  assert.equal(await embedInstalled(core({ items: [] })), false);
  assert.equal(await embedInstalled(core(Object.assign(new Error('x'), { reason: 'unknown_config_key' }))), false);
});
