// @ts-check
//! 「隐私与安全」页的私密目录那张表（蓝图 `web.md`「设置页」第 12b 条，`packages/settings/privacy-model.js`）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateRows, dropChange, addChange, canRestore, ADD, REMOVE } from '../../packages/settings/privacy-model.js';

const shipped = [{ value: '~/.ssh', name: '~/.ssh' }, { value: '~/.gnupg', name: '~/.gnupg' }, { value: '~/.aws', name: '~/.aws' }];
const items = (add, remove) => [{ key: ADD, entry: { value: add } }, { key: REMOVE, options: shipped, entry: { value: remove } }];

test('表：出厂的去掉去掉了的，后面接加了的，重了的不重复', () => {
  const [add, remove] = items(['/srv/keys', '~/.ssh'], ['~/.aws']);
  assert.deepEqual(privateRows(add, remove), [
    { path: '~/.ssh', shipped: true }, { path: '~/.gnupg', shipped: true }, { path: '/srv/keys', shipped: false },
  ]);
  assert.deepEqual(privateRows({ key: ADD, entry: null, default: [] }, { key: REMOVE, options: shipped, entry: null, default: [] }).length, 3);
});

test('删：出厂的往 remove 里加，加了的从 add 里拿掉', () => {
  const [add, remove] = items(['/srv/keys'], []);
  assert.deepEqual(dropChange({ path: '~/.ssh', shipped: true }, add, remove), { key: REMOVE, value: ['~/.ssh'] });
  assert.deepEqual(dropChange({ path: '/srv/keys', shipped: false }, add, remove), { key: ADD, value: [] });
});

test('加：空的、已经在的不加；去掉过的出厂项再加是从 remove 里拿掉；恢复默认只在去掉过出厂项时有', () => {
  const [add, remove] = items([], ['~/.aws']);
  assert.equal(addChange('  ', add, remove), null);
  assert.equal(addChange('~/.ssh', add, remove), null);
  assert.deepEqual(addChange(' ~/secret ', add, remove), { key: ADD, value: ['~/secret'] });
  assert.deepEqual(addChange('~/.aws', add, remove), { key: REMOVE, value: [] });
  assert.equal(canRestore(remove), true);
  assert.equal(canRestore(items([], [])[1]), false);
});
