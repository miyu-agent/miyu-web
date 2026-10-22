// @ts-check
//! 「隐私与安全」页的私密目录那张表（蓝图 `web.md`「设置页」第 12b 条，`packages/settings/privacy-model.js`）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateRows, dropChange, addChange, canRestore, batchChange, findRows, pairIn, inWorkspace, restoreChange, ADD, REMOVE } from '../../packages/settings/privacy-model.js';

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

test('加：空的、已经在的不加；去掉过的出厂项再加是从 remove 里拿掉；重置只在跟出厂不一样时有', () => {
  const [add, remove] = items([], ['~/.aws']);
  assert.equal(addChange('  ', add, remove), null);
  assert.equal(addChange('~/.ssh', add, remove), null);
  assert.deepEqual(addChange(' ~/secret ', add, remove), { key: ADD, value: ['~/secret'] });
  assert.deepEqual(addChange('~/.aws', add, remove), { key: REMOVE, value: [] });
  assert.equal(canRestore(add, remove), true);
  assert.equal(canRestore(...items([], [])), false);
  // 只加过的也能重置（2026-10-22 项目主人）；重置把写过的两项都去掉，没写过的不发
  assert.equal(canRestore(...items(['Makefile'], [])), true);
  assert.deepEqual(restoreChange(...items(['Makefile'], ['~/.aws'])), [{ key: REMOVE, unset: true }, { key: ADD, unset: true }]);
  assert.deepEqual(restoreChange({ key: ADD }, { key: REMOVE, options: shipped, entry: { value: ['~/.aws'] } }), [{ key: REMOVE, unset: true }]);
});

test('一次加好几个（一行一个）：空行、已经在的跳过，去掉过的出厂项再加是从 remove 里拿掉；搜索照路径筛', () => {
  const [add, remove] = items(['/srv/keys'], ['~/.aws']);
  assert.deepEqual(batchChange('~/a\n\n  ~/b \n~/.ssh\n~/.aws\n~/a', add, remove), {
    changes: [{ key: ADD, value: ['/srv/keys', '~/a', '~/b'] }, { key: REMOVE, value: [] }],
    skipped: ['~/.ssh', '~/a'],
  });
  assert.deepEqual(batchChange('~/.ssh', add, remove), { changes: [], skipped: ['~/.ssh'] });
  const rows = privateRows(add, remove);
  assert.deepEqual(findRows(rows, 'GNU').map((r) => r.path), ['~/.gnupg']);
  assert.equal(findRows(rows, '  ').length, rows.length);
});

test('只禁写（核心 5-17）同一个画法：键照那一对的；一组里两项都在才认是哪一对', () => {
  const add = { key: 'sandbox.readonly.add', entry: { value: [] } };
  const remove = { key: 'sandbox.readonly.remove', options: [{ value: '.git/hooks', name: '.git/hooks' }, { value: '~/.bashrc', name: '~/.bashrc' }], entry: { value: [] } };
  assert.deepEqual(privateRows(add, remove).map((r) => r.path), ['.git/hooks', '~/.bashrc']);
  assert.deepEqual(dropChange({ path: '.git/hooks', shipped: true }, add, remove), { key: 'sandbox.readonly.remove', value: ['.git/hooks'] });
  assert.deepEqual(batchChange('~/.zshrc', add, remove).changes, [{ key: 'sandbox.readonly.add', value: ['~/.zshrc'] }]);
  assert.equal(pairIn([add, remove])?.add, 'sandbox.readonly.add');
  assert.equal(pairIn([add]), null);
  assert.equal(pairIn(items([], []))?.enabled, 'sandbox.private.enabled');
  // 受保护的路径（核心 5-17 下上）用自己的说法
  assert.equal(pairIn([add, remove])?.words, 'readonly');
  assert.equal(pairIn(items([], []))?.words, null);
});

test('每个工作区里的那一处：相对路径才算，Windows 的绝对路径不算', () => {
  for (const p of ['.git/hooks', '.mcp.json', 'Makefile', 'src/.env']) assert.equal(inWorkspace(p), true, p);
  for (const p of ['~/.bashrc', '~', '/etc/hosts', 'C:\\Users\\me\\.gitconfig', 'd:/keys', '\\\\server\\share']) assert.equal(inWorkspace(p), false, p);
});
