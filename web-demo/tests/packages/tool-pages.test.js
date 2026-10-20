// 技能、脚本、MCP 三页的纯逻辑（蓝图 `web.md`「设置页」第 20 条；核心 X-26、X-27）
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  skillItem, scriptItem, mcpItems, switchValue, featureId, loadingParams, inSource, sourceOf, toolMatch, homeDir, shortTool,
  serverParams, formOf, envShown, editable, commandLine,
} from '../../packages/settings/tool-model.js';
import { pkgKinds, carriedBy, PKG_FILTERS } from '../../packages/settings/model.js';

const PACKAGES = [
  { package: 'authoring', name: '写技能和包', status: 'ready', kind: 'bundle' },
  { package: 'gh', name: 'GitHub', status: 'ready', kind: 'bundle', enabled: true, mcp: [
    { name: 'github', state: 'running', need_load: { value: true, by: 'source' }, on: true, tools: ['mcp__github__search'] },
    { name: 'fs', state: 'off', covered: true, need_load: { value: true, by: 'source' }, on: true },
  ] },
  // 没装上的（没有状态）不算
  { package: 'ghost', mcp: [{ name: 'x' }] },
];

test('技能、脚本的一项：自制照 from，加载方式只有脚本有，开关照 on', () => {
  const own = skillItem({ name: 'weekly', display_name: '写周报', summary: '照格式写', from: 'home', path: '~/.miyu/home/admin/skills/weekly/SKILL.md', on: false });
  assert.equal(own.own, true);
  assert.equal(own.load, null);
  assert.equal(own.on, false);
  assert.equal(own.title, '写周报');
  const pkg = skillItem({ name: 'skill-creator', from: 'package', package: 'authoring', on: true });
  assert.equal(pkg.own, false);
  assert.equal(pkg.package, 'authoring');
  assert.equal(pkg.title, null);
  const script = scriptItem({ tool: 'bili_frames', from: 'home', timeout: 120, need_load: { value: false, by: 'setting' }, on: true });
  assert.deepEqual(script.load, { value: false, by: 'setting' });
  assert.equal(script.id, 'bili_frames');
  // 旧核心没有 on 的：不画开关
  assert.equal(scriptItem({ tool: 'x', from: 'home' }).on, null);
});

test('MCP 服务两处合成一份：自制在前，包里的照包；被替代的不画开关和加载方式', () => {
  const items = mcpItems([{ name: 'playwright', command: ['npx', '@playwright/mcp'], state: 'running', need_load: { value: true, by: 'source' }, on: true }], PACKAGES);
  assert.deepEqual(items.map((x) => x.id), ['~home/playwright', 'gh/github', 'gh/fs']);
  assert.equal(items[0].own, true);
  assert.equal(items[1].package, 'gh');
  assert.deepEqual(items[1].load, { value: true, by: 'source' });
  assert.equal(items[1].raw.enabled, true);
  assert.equal(items[2].covered, true);
  assert.equal(items[2].on, null);
  assert.equal(items[2].load, null);
  // 之前的核心：包里的服务没有 need_load、on，只写状态
  const old = mcpItems(null, [{ package: 'gh', status: 'ready', mcp: [{ name: 'github', state: 'running' }] }]);
  assert.equal(old[0].on, null);
  assert.equal(old[0].load, null);
});

test('开关、加载方式写什么', () => {
  assert.equal(switchValue(true), null);
  assert.equal(switchValue(false), false);
  const [skill] = [skillItem({ name: 'weekly', from: 'home' })];
  assert.equal(featureId(skill), 'skill-weekly');
  assert.equal(featureId(scriptItem({ tool: 'hotel_deals', from: 'home' })), 'script-hotel_deals');
  const [server] = mcpItems([{ name: 'github' }], []);
  assert.equal(featureId(server), 'mcp-github');
  assert.deepEqual(loadingParams(server, false), { server: 'github', need_load: false });
  assert.deepEqual(loadingParams(scriptItem({ tool: 'hotel_deals' }), null), { tool: 'hotel_deals', need_load: null });
});

test('来源：自制、包名（没装的照编号）、出厂；筛选和搜索照它', () => {
  const own = skillItem({ name: 'a', from: 'home' });
  const pkg = skillItem({ name: 'b', from: 'package', package: 'authoring' });
  const gone = skillItem({ name: 'c', from: 'package', package: 'removed' });
  const shipped = skillItem({ name: 'd', from: 'shipped' });
  assert.deepEqual(sourceOf(own, PACKAGES), { key: 'own' });
  assert.deepEqual(sourceOf(pkg, PACKAGES), { name: '写技能和包' });
  assert.deepEqual(sourceOf(gone, PACKAGES), { name: 'removed' });
  assert.deepEqual(sourceOf(shipped, PACKAGES), { key: 'shipped' });
  assert.equal(inSource(own, 'own'), true);
  assert.equal(inSource(own, 'package'), false);
  assert.equal(inSource(shipped, 'package'), true);
  assert.equal(inSource(pkg, 'all'), true);
  assert.equal(toolMatch('写技能', pkg, '写技能和包'), true);
  assert.equal(toolMatch(' B ', pkg, ''), true);
  assert.equal(toolMatch('zzz', pkg, '写技能和包'), false);
  assert.equal(toolMatch('', pkg, ''), true);
});

test('自己放技能、脚本的文件夹：核心给的 dir 先，没有的照自制那几项倒推', () => {
  assert.equal(homeDir('skills', { dir: '~/.miyu/home/admin/skills', skills: [] }), '~/.miyu/home/admin/skills');
  assert.equal(homeDir('skills', { skills: [{ from: 'home', path: '~/.miyu/home/admin/skills/weekly/SKILL.md' }] }), '~/.miyu/home/admin/skills');
  assert.equal(homeDir('scripts', { scripts: [{ from: 'package', path: '/x/y.py' }, { from: 'home', path: '~/.miyu/home/admin/scripts/ceiling_light.py' }] }), '~/.miyu/home/admin/scripts');
  assert.equal(homeDir('scripts', { scripts: [] }), null);
  assert.equal(homeDir('skills', null), null);
});

test('MCP 的工具名去掉服务前缀；命令写成一行', () => {
  assert.equal(shortTool('github', 'mcp__github__search_code'), 'search_code');
  assert.equal(shortTool('github', 'other'), 'other');
  assert.equal(commandLine(['npx', '@playwright/mcp']), 'npx @playwright/mcp');
  assert.equal(commandLine('npx'), 'npx');
});

test('添加服务：表换成 mcp.set 的参数，写错的说哪一格', () => {
  const base = { name: 'github', command: 'github-mcp-server', args: 'stdio\n\n --read-only ', env: 'GITHUB_TOKEN={secret:gh}\nLOG=1', venues: ['local'], timeout: '' };
  assert.deepEqual(serverParams(base), { params: { name: 'github', command: 'github-mcp-server', args: ['stdio', '--read-only'], env: { GITHUB_TOKEN: '{secret:gh}', LOG: '1' } } });
  assert.deepEqual(serverParams({ ...base, name: 'GitHub' }), { problem: 'name', field: 'name' });
  assert.deepEqual(serverParams({ ...base, name: 'a'.repeat(33) }), { problem: 'name', field: 'name' });
  assert.deepEqual(serverParams({ ...base, command: '  ' }), { problem: 'command', field: 'command' });
  assert.deepEqual(serverParams({ ...base, env: 'LOG=1\nbroken' }), { problem: 'env', field: 'env', line: 2 });
  assert.deepEqual(serverParams({ ...base, timeout: '0' }), { problem: 'timeout', field: 'timeout' });
  // 会话：只勾本机的和不勾一样不写；时限是默认的不写，别的换成毫秒
  const got = serverParams({ ...base, args: '', env: '', venues: ['group', 'local'], timeout: '30' });
  assert.deepEqual(got, { params: { name: 'github', command: 'github-mcp-server', venues: ['local', 'group'], timeout_ms: 30000 } });
  assert.deepEqual(serverParams({ ...base, args: '', env: '', timeout: '600' }), { params: { name: 'github', command: 'github-mcp-server' } });
});

test('编辑：照 mcp.list 先填，引用没改的原样交回，不带 need_load', () => {
  const server = {
    name: 'github', command: ['github-mcp-server', 'stdio'], venues: ['local', 'private'], timeout_ms: 120000,
    env: { GITHUB_TOKEN: { secret: 'gh' }, HOME_DIR: { env: 'HOME' }, LOG: '1' }, need_load: { value: false, by: 'source' },
  };
  const form = formOf(server);
  assert.deepEqual(form, { name: 'github', command: 'github-mcp-server', args: 'stdio', env: 'GITHUB_TOKEN={secret:gh}\nHOME_DIR={env:HOME}\nLOG=1', venues: ['local', 'private'], timeout: '120' });
  const back = serverParams(form, server);
  assert.deepEqual(back, { params: {
    name: 'github', command: 'github-mcp-server', args: ['stdio'], venues: ['local', 'private'], timeout_ms: 120000,
    env: { GITHUB_TOKEN: { secret: 'gh' }, HOME_DIR: { env: 'HOME' }, LOG: '1' },
  } });
  // 改了的照写的字
  const changed = serverParams({ ...form, env: 'GITHUB_TOKEN=plain' }, server);
  assert.deepEqual('params' in changed && changed.params.env, { GITHUB_TOKEN: 'plain' });
  assert.equal(envShown({ other: 1 }), '{"other":1}');
  assert.deepEqual(formOf({ name: 'x', command: ['npx'] }).venues, ['local']);
});

test('编辑得了的：核心同一回补上了 skill.list 的 dir', () => {
  assert.equal(editable({ dir: '~/.miyu/home/admin/skills', skills: [] }), true);
  assert.equal(editable({ skills: [] }), false);
  assert.equal(editable(null), false);
});

test('软件包页的技能、脚本筛选照 skill.list、script.list 的 package', () => {
  const carried = carriedBy({ skills: [{ name: 'a', package: 'authoring' }, { name: 'b', from: 'home' }] }, { scripts: [{ tool: 'f', package: 'bili' }] });
  assert.deepEqual([...carried.skills], ['authoring']);
  assert.deepEqual(pkgKinds({ package: 'authoring', kind: 'bundle' }, carried), ['skill']);
  assert.deepEqual(pkgKinds({ package: 'bili', kind: 'bundle', mcp: [{ name: 'x' }] }, carried), ['script', 'mcp']);
  assert.deepEqual(pkgKinds({ package: 'bili', kind: 'bundle' }), []);
  assert.deepEqual(carriedBy(null, null), { skills: new Set(), scripts: new Set() });
  assert.ok(PKG_FILTERS.indexOf('skill') < PKG_FILTERS.indexOf('mcp'));
});
