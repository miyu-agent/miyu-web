// @ts-check
//! 设置页左栏的分组、软件包页的筛选和搜索、一项配置归哪个包（`packages/settings/model.js`，蓝图 `web.md`「设置页」第 3、13 条；2026-10-20 项目主人）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navGroups, pkgKinds, pkgTag, pkgMatch, ownerOf } from '../../packages/settings/model.js';

const ORDER = ['general', 'user', 'models', 'usage', 'personas', 'memory', 'knowledge', 'presets', 'skills', 'scripts', 'mcp', 'packages', 'backstage', 'advanced'];

test('左栏分四组：开头那一页起是新的一组；order 里没有的（核心多出来的页）算最后一组', () => {
  const g = navGroups(ORDER, ['personas', 'skills', 'packages']);
  assert.deepEqual(ORDER.map(g), [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
  assert.equal(g('something-new'), 3);
  // 开头写了不在 order 里的不算
  assert.deepEqual(['general', 'personas'].map(navGroups(ORDER, ['nope', 'personas'])), [0, 1]);
  assert.equal(navGroups(ORDER, [])('advanced'), 0);
});

test('一个包落在哪几个筛选：照它带了什么，一个包带好几样的几个里都有', () => {
  assert.deepEqual(pkgKinds({ kind: 'builtin' }), ['builtin']);
  assert.deepEqual(pkgKinds({ kind: 'process', connection: { platform: 'qq' } }), ['extension', 'connection']);
  assert.deepEqual(pkgKinds({ kind: 'worker' }), ['extension']);
  assert.deepEqual(pkgKinds({ kind: 'ui' }), ['ui']);
  assert.deepEqual(pkgKinds({ kind: 'process', mascot: { model: 'x' }, mcp: [{ name: 'a' }] }), ['extension', 'mascot', 'mcp']);
  assert.deepEqual(pkgKinds({ kind: 'bundle', mcp: [] }), []);
  assert.deepEqual(pkgKinds({ kind: 'mascot' }), ['mascot']);
});

test('小标签：接入的写接入，只带技能脚本的 bundle 写技能包、带服务的写 MCP', () => {
  assert.equal(pkgTag({ kind: 'process', connection: { platform: 'qq' } }), 'connection');
  assert.equal(pkgTag({ kind: 'process' }), 'extension');
  assert.equal(pkgTag({ kind: 'bundle' }), 'bundle');
  assert.equal(pkgTag({ kind: 'bundle', mcp: [{ name: 'gh' }] }), 'mcp');
  assert.equal(pkgTag({ kind: 'ui' }), 'ui');
  assert.equal(pkgTag({ kind: 'builtin' }), 'builtin');
  assert.equal(pkgTag({ kind: 'unheard-of' }), 'builtin');
});

test('搜索：名字、说明、编号里有就算，不分大小写，空的都算', () => {
  assert.ok(pkgMatch('', '联网搜索'));
  assert.ok(pkgMatch('  ', null));
  assert.ok(pkgMatch('搜索', '联网搜索', null, 'net'));
  assert.ok(pkgMatch('NET', '联网搜索', '', 'net'));
  assert.ok(!pkgMatch('mermaid', '联网搜索', '搜网页', 'net'));
});

test('一项配置归哪个包：package 对得上照它，对不上照键的头一段（联网搜索的 key 在组 net_keys），都对不上的是 null', () => {
  const ids = new Set(['net', 'memory']);
  assert.equal(ownerOf({ key: 'net.search.source', package: 'net' }, ids), 'net');
  assert.equal(ownerOf({ key: 'net.search.exa.key', package: 'net_keys' }, ids), 'net');
  assert.equal(ownerOf({ key: 'memory.extract_idle', package: 'memory' }, ids), 'memory');
  assert.equal(ownerOf({ key: 'packages.source', package: 'source' }, ids), null);
  assert.equal(ownerOf({ key: 'whatever' }, ids), null);
});

test('只有网页界面的（只装了桌面端）不列「默认界面」和「终端会话」那一组', async () => {
  const { headless } = await import('../../packages/settings/model.js');
  assert.deepEqual(headless([{ package: 'miyu-webui' }]), ['ui.head', 'terminal.']);
  assert.deepEqual(headless([]), ['ui.head', 'terminal.']);
  assert.deepEqual(headless([{ package: 'miyu-webui' }, { package: 'miyu-tui' }]), []);
});
