// @ts-check
//! 配置里写着、那一家的模型列表里没有的模型（`packages/settings/model-bits.js` 的 `withdrawn`）：2026-11-22 主人定，上游的列表是什么样
//! 就显示什么样，核心不再列已经没有的模型，默认模型、池成员那几行头自己比对，就地写「供应商已不提供此模型」。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withdrawn } from '../../packages/settings/model-bits.js';

const providers = [
  { id: 'fake', models: [{ ref: 'fake/new-flash' }, { ref: 'fake/new-pro' }] },
  { id: 'relay', models: [{ ref: 'relay/cline/deepseek-v4' }] },
];

test('那一家还在、列表里没有的才算；列着的、连那一家都没有的、没写的都不算', () => {
  assert.equal(withdrawn(providers, 'fake/old-flash'), true);
  assert.equal(withdrawn(providers, 'fake/new-flash'), false);
  assert.equal(withdrawn(providers, 'relay/cline/deepseek-v4'), false, '模型名里带斜杠的照整串比');
  assert.equal(withdrawn(providers, 'relay/cline/gone'), true);
  assert.equal(withdrawn(providers, 'nobody/x'), false, '连那一家都没有的照原样写，不说「不提供」');
  assert.equal(withdrawn(providers, 'fakeish/x'), false, '编号是前缀的另一家不算');
  assert.equal(withdrawn(providers, null), false);
  assert.equal(withdrawn(providers, '@daily'), false);
});

test('默认模型、池成员两处都用它，字在三种语言里都有', () => {
  const read = (/** @type {string} */ f) => readFileSync(new URL(`../../packages/settings/${f}`, import.meta.url), 'utf8');
  assert.match(read('defaults.js'), /withdrawn\(providers, current\)/);
  assert.match(read('pools.js'), /withdrawn\(list\.providers \?\? \[\], r\.ref\)/);
  const manifest = JSON.parse(read('manifest.json'));
  const all = JSON.stringify(manifest);
  for (const w of ['供应商已不提供此模型', 'No longer offered by the provider', 'プロバイダーが提供を終了']) assert.ok(all.includes(w), w);
});
