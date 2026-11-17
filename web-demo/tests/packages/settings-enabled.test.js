// @ts-check
//! 包的「启用」（核心 UX-1、UX-1补，W-1208）：每个包都有开关；`packages.<编号>.enabled` 来源是 `package`，信息页不再画这一行、
//! 名字后面不写「默认」、开关换了读到的值跟着换；软件的后台页不给它；关着的外观包不加载。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enabledKey, isEnabledItem, switchOrigin, followEnabled, ownSettings } from '../../packages/settings/pkg-enabled.js';
import { pkgSwitch } from '../../packages/settings/model.js';
import { ownItems } from '../../packages/backstage/frame.js';
import { themeIds } from '../../src/kernel/themes.js';

test('每个包都有开关：不带 enabled 的也是总闸，必需的照旧写「必需」', () => {
  assert.deepEqual(pkgSwitch({ package: 'skin-only' }, {}), { kind: 'system' });
  assert.deepEqual(pkgSwitch({ package: 'mascot-pack', enabled: false }, {}), { kind: 'system' });
  assert.deepEqual(pkgSwitch({ package: 'base-read', required: true }, {}), { kind: 'required' });
});

test('「启用」那一项：键、认得出来、来源 package 不写「默认」', () => {
  assert.equal(enabledKey('web-search'), 'packages.web-search.enabled');
  assert.ok(isEnabledItem({ key: 'packages.web-search.enabled' }));
  assert.ok(!isEnabledItem({ key: 'packages.web-search.enabled.x' }));
  assert.ok(!isEnabledItem({ key: 'web-search.enabled' }));
  assert.ok(switchOrigin({ origin: { layer: 'package' }, value: true, layers: [] }));
  assert.ok(!switchOrigin({ origin: { layer: 'default' }, value: true }));
  assert.ok(!switchOrigin(null));
});

test('开关换了：读到的那一项跟着换，配置清单里同一个对象也是新的；没有这一项、值不是真假的不动', () => {
  const entry = { origin: { layer: 'package' }, value: true, layers: [] };
  const got = { items: { 'packages.kit.enabled': entry } };
  const page = { items: [{ key: 'packages.kit.enabled', entry: got.items['packages.kit.enabled'] }] };
  assert.equal(followEnabled(got, 'kit', false), true);
  assert.equal(page.items[0].entry.value, false, '设置页搜出来的那一行读的是同一个对象');
  assert.equal(followEnabled(got, 'kit', false), false, '没变');
  assert.equal(followEnabled(got, 'other', false), false);
  assert.equal(followEnabled(got, 'kit', undefined), false);
  assert.equal(followEnabled(null, 'kit', true), false);
});

test('信息页的设置项：只要这个包的，去掉它的「启用」（顶上已经有开关）', () => {
  const items = [{ key: 'packages.kit.enabled', package: 'kit' }, { key: 'kit.level', package: 'kit' }, { key: 'other.x', package: 'other' }];
  const owner = (/** @type {any} */ item) => item.package;
  assert.deepEqual(ownSettings(items, 'kit', owner).map((i) => i.key), ['kit.level']);
});

test('软件的后台页：它自己的设置项，不给「启用」', () => {
  const schema = { items: [{ key: 'packages.qq.enabled', package: 'qq' }, { key: 'qq.token', package: 'qq' }, { key: 'x.y', package: 'x' }] };
  assert.deepEqual(ownItems(schema, 'qq').map((i) => i.key), ['qq.token']);
  assert.deepEqual(ownItems(null, 'qq'), []);
});

test('关着的外观包（enabled 是 false）不加载，皮肤、吉祥物都不列', () => {
  const look = (/** @type {string} */ id, extra = {}) => ({ package: id, kind: 'theme', theme: { web: { dir: 'web' } }, ...extra });
  const listed = { packages: [look('fish', { enabled: false }), look('claude', { enabled: true }), look('old')] };
  assert.deepEqual(themeIds(listed, new Set()), ['claude', 'old']);
});
