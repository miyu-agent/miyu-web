// @ts-check
// 管理员模式（蓝图「管理员模式」，核心 Y-12下上）：哪些请求带 scope；开关只给管理员、重连回到平常

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemWrite } from '../src/model/admin-mode.js';
import { AdminMode } from '../src/kernel/admin.js';

test('改系统那一层的请求：名单里的方法、写系统那一层的 config.set、不写或写 system 的 secret.set/delete；别的不带', () => {
  for (const m of ['account.invite', 'account.list', 'account.set_admin', 'package.install', 'package.restart', 'package.members', 'extension.enable', 'mcp.set', 'mcp.login_finish', 'provider.rename']) assert.equal(systemWrite(m, {}), true, m);
  assert.equal(systemWrite('config.set', { layer: 'system', changes: [] }), true);
  assert.equal(systemWrite('config.set', { layer: 'personal', changes: [] }), false);
  assert.equal(systemWrite('secret.set', { name: 'a', value: 'b' }), true, '不写 layer 的：管理员模式里存共用那一份');
  assert.equal(systemWrite('secret.delete', { name: 'a', layer: 'system' }), true);
  assert.equal(systemWrite('secret.set', { name: 'a', value: 'b', layer: 'personal' }), false);
  for (const m of ['config.get', 'secret.list', 'model.list', 'package.list', 'session.send', 'persona.set']) assert.equal(systemWrite(m, {}), false, m);
});

test('开关：只有管理员开得了；开、关告诉听着的；平时锁着系统那一层', () => {
  const seen = [];
  const a = new AdminMode(true);
  a.onChange((on) => seen.push(on));
  assert.equal(a.locked, true);
  a.set(true);
  a.set(true);
  assert.equal(a.on, true);
  assert.equal(a.locked, false);
  a.set(false);
  assert.deepEqual(seen, [true, false], '一样的不再叫');
  const m = new AdminMode(false);
  m.set(true);
  assert.equal(m.on, false, '成员开不了');
  assert.equal(m.locked, false, '成员没有锁的说法（不露）');
});
