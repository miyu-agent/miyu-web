// @ts-check
//! 同编号几层都有的（核心 SD-1，系统加装层）：认的那份照常列，被盖住的挂到它下面（`src/lib/packages.js`），推来的也照这样收（W-1106）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldCovered, foldReply, shadowed } from '../src/lib/packages.js';
import { applyPackageChange } from '../packages/settings/model.js';

const winner = { package: 'notes', layer: 'home', version: '0.2.0', from: 'local' };
const under = { package: 'notes', layer: 'distro', version: '0.3.0', covered: { by: 'home', version: '0.3.0', over: '0.2.0', newer: true } };

test('被盖住的挂到认的那份下面，列表里只留认的那份；别的不动', () => {
  const got = foldCovered([winner, under, { package: 'zed', layer: 'shipped' }]);
  assert.deepEqual(got.map((p) => p.package), ['notes', 'zed']);
  assert.deepEqual(got[0].covers, [{ layer: 'distro', version: '0.3.0', newer: true }]);
  assert.equal(got[1].covers, undefined);
  assert.equal(foldCovered(null), null);
  assert.deepEqual(foldReply({ packages: [winner, under], groups: [1] }).groups, [1]);
});

test('核心 SD-1补 起叫 shadowed，照样认', () => {
  const renamed = { package: 'notes', layer: 'distro', shadowed: { by: 'home', version: '0.1.0', over: '0.2.0', newer: false } };
  assert.equal(shadowed(renamed), true);
  assert.deepEqual(foldCovered([winner, renamed])[0].covers, [{ layer: 'distro', version: '0.1.0', newer: false }]);
});

test('covered: true 是 F-9 的「服务全被自制的替代」，不算被盖住', () => {
  const mcp = { package: 'kit', layer: 'home', covered: true };
  assert.equal(shadowed(mcp), false);
  assert.deepEqual(foldCovered([mcp]), [mcp]);
});

test('推来被盖住的那份：认的那份不换，只换它下面同一层那一项；推来认的那份照旧整项换', () => {
  const list = foldCovered([winner, under]);
  const older = { ...under, version: '0.1.0', covered: { by: 'home', version: '0.1.0', over: '0.2.0', newer: false } };
  const got = applyPackageChange(list, 'notes', older);
  assert.equal(got[0].version, '0.2.0');
  assert.deepEqual(got[0].covers, [{ layer: 'distro', version: '0.1.0', newer: false }]);
  const up = applyPackageChange(list, 'notes', { ...winner, version: '0.4.0' });
  assert.equal(up[0].version, '0.4.0');
});
