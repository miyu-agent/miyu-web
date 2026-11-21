// @ts-check
//! 编辑供应商的表只画这一家真有的项（2026-11-21 主人验收第 8 条，核心 FX-11）：`model.list` 每家的 `needs: {key, base_url}`，`none`
//! 的那一项不画；软件包带的那一家（`package`），包给的值画成暗的占位字，人照样能改，没改的不写进配置（写了就盖住包的）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formPlan, driverToWrite, packageValue } from '../../packages/settings/provider-fields.js';
import { providerChanges } from '../../packages/settings/model.js';

const read = (/** @type {string} */ path) => readFileSync(new URL(`../../packages/settings/${path}`, import.meta.url), 'utf8');

// 照核心 dfffbf7f3 的 model.list、config.get 剪的：Antigravity 那个包带的一家（驱动声明 key = "none"），一家普通的 DeepSeek
const antigravity = { id: 'antigravity', name: { value: 'Antigravity', from: 'package' }, driver: 'antigravity/antigravity', needs: { key: 'none', base_url: 'none' }, package: 'antigravity', models: [] };
const deepseek = { id: 'deepseek', name: { value: 'DeepSeek', from: 'catalog' }, driver: 'openai-chat', base_url: 'https://api.deepseek.com', key: { ref: 'secret:deepseek-1', set: true }, needs: { key: 'required', base_url: 'optional' }, models: [] };
const got = {
  items: {
    'providers.antigravity.name': { value: { en: 'Antigravity', zh: 'Antigravity' }, origin: { layer: 'package', package: 'antigravity' } },
    'providers.antigravity.driver': { value: 'antigravity/antigravity', origin: { layer: 'package', package: 'antigravity' } },
    'providers.deepseek.base_url': { value: 'https://api.deepseek.com', origin: { layer: 'system' } },
    'providers.deepseek.driver': { value: 'openai-chat', origin: { layer: 'system' } },
  },
};

test('needs 是 none 的项不画：Antigravity 没有地址、密钥；普通的一家照旧都画', () => {
  const ag = formPlan(antigravity, got, 'antigravity');
  assert.equal(ag.url, null, '地址不画');
  assert.equal(ag.key, false, '密钥不画');
  const ds = formPlan(deepseek, got, 'deepseek');
  assert.deepEqual(ds.url, { value: 'https://api.deepseek.com', hint: null, keepWhenEmpty: false });
  assert.equal(ds.key, true);
  // optional、required 都画；旧核心没有 needs 的照旧全画；新建的（没有这一家）也全画
  assert.equal(formPlan({ ...deepseek, needs: { key: 'optional', base_url: 'required' } }, got, 'deepseek').key, true);
  const old = formPlan({ ...deepseek, needs: undefined }, got, 'deepseek');
  assert.ok(old.url && old.key);
  const fresh = formPlan(null, got, null);
  assert.deepEqual(fresh.url, { value: '', hint: null, keepWhenEmpty: false });
  assert.equal(fresh.key, true);
});

test('包给的地址画成暗的占位字、框是空的，空着存不写；人写了的照写', () => {
  const pkgGot = { items: { ...got.items, 'providers.antigravity.base_url': { value: 'http://127.0.0.1:9000/v1', origin: { layer: 'package', package: 'antigravity' } } } };
  const p = { ...antigravity, base_url: 'http://127.0.0.1:9000/v1', needs: { key: 'none', base_url: 'optional' } };
  assert.deepEqual(formPlan(p, pkgGot, 'antigravity').url, { value: '', hint: { package: 'http://127.0.0.1:9000/v1' }, keepWhenEmpty: true });
  assert.equal(packageValue(pkgGot, 'antigravity', 'base_url'), 'http://127.0.0.1:9000/v1');
  assert.equal(packageValue(got, 'deepseek', 'base_url'), null, '人写的不算包给的');
  // 空着存：base_url 是 null，不写这一项；写了的照常写
  const keep = providerChanges('antigravity', { name: '', base_url: null, driver: null, key: { kind: 'keep', value: '' } }, pkgGot, 'system', null);
  assert.deepEqual(keep, [], '什么都没改就什么都不写');
  const typed = providerChanges('antigravity', { name: '', base_url: 'http://127.0.0.1:9100/v1', driver: null, key: { kind: 'keep', value: '' } }, pkgGot, 'system', null);
  assert.deepEqual(typed.map((c) => [c.key, c.input]), [['providers.antigravity.base_url', 'http://127.0.0.1:9100/v1']]);
  // 地址写成环境变量的照旧：框空着，占位写变量名，空着不改
  assert.deepEqual(formPlan({ ...deepseek, base_url: { env: 'DS_URL' } }, got, 'deepseek').url, { value: '', hint: { env: 'DS_URL' }, keepWhenEmpty: true });
});

test('接口是包给的：没改的不写（原来照选着的整份写进配置，盖住包的驱动）；改了的照写；人自己配的一家照旧写', () => {
  const ag = formPlan(antigravity, got, 'antigravity');
  assert.equal(ag.driver.packaged, 'antigravity/antigravity');
  assert.equal(driverToWrite(ag, 'antigravity/antigravity'), null);
  assert.equal(driverToWrite(ag, 'openai-chat'), 'openai-chat');
  const ds = formPlan(deepseek, got, 'deepseek');
  assert.equal(ds.driver.packaged, null);
  assert.equal(driverToWrite(ds, 'openai-chat'), 'openai-chat');
});

test('表照 formPlan 画：没有的项不出那一行；供应商页的密钥那一块 needs.key 是 none 的不画', () => {
  const form = read('provider-form.js');
  assert.match(form, /formPlan\(p, dialog\.got, editing\)/);
  assert.match(form, /plan\.url \? row\(t\('url'\)/, '地址那一行照 plan.url');
  assert.match(form, /plan\.key \? row\(t\('key'\)/, '密钥那一行照 plan.key');
  assert.match(form, /driver: driverToWrite\(plan, driver\)/);
  const providers = read('providers.js');
  assert.match(providers, /p\.needs\?\.key === 'none' \? null : keyBlock\(dialog, p\)/);
});
