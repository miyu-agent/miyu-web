// @ts-check
//! 下载软件页（蓝图 `web.md`「设置页」第 12a 条，`packages/settings/market-model.js`）：筛选、个数、按钮是哪一种、带了什么写成一行。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shownOf, actionOf, kindsOf, faceOf, needsLook, hasProgram, providesLine, percentOf, found, capabilityRows } from '../../packages/settings/market-model.js';

const embed = { package: 'embed', version: '1.0.0', name: '语义模型', summary: '本机的语义检索模型', official: true, installed: '1.0.0', blocked: null, provides: { features: ['embed'] }, depends: [] };
const memes = { package: 'memes', version: '0.2.0', name: '表情包', summary: '发表情包的技能', official: true, installed: null, blocked: null, provides: { skills: ['memes'], content: ['stickers'] }, depends: [] };
const cat = { package: 'cat', version: '0.1.0', name: '猫', summary: '一个人格', official: false, installed: null, blocked: null, provides: { personas: ['cat'] }, depends: [] };
const bad = { package: 'bad', version: '1.0.0', name: '坏的', summary: '', official: false, installed: null, blocked: '偷东西', provides: {}, depends: [] };
const all = [embed, memes, cat, bad];

test('筛选：已安装、可升级、官方、社区、种类；搜索照名字、说明、编号，几个词都得有', () => {
  const up = new Set(['embed']);
  const view = (filter, kind = null, query = '') => shownOf(all, { query, filter, kind }, up).list.map((p) => p.package);
  assert.deepEqual(view('all'), ['embed', 'memes', 'cat', 'bad']);
  assert.deepEqual(view('installed'), ['embed']);
  assert.deepEqual(view('upgradable'), ['embed']);
  assert.deepEqual(view('official'), ['embed', 'memes']);
  assert.deepEqual(view('community'), ['cat', 'bad']);
  assert.deepEqual(view('all', 'skills'), ['memes']);
  assert.deepEqual(view('community', 'personas'), ['cat']);
  assert.deepEqual(view('all', null, '表情 技能'), ['memes']);
  assert.deepEqual(view('all', null, 'EMBED'), ['embed']);
  const got = shownOf(all, { query: '', filter: 'all', kind: null }, up);
  assert.deepEqual(got.kinds, ['skills', 'personas', 'features', 'content'], '只露有的种类，照先后');
  assert.equal(got.counts.community, 2);
  assert.equal(got.counts.skills, 1);
  assert.ok(found(cat, '人格'));
});

test('按钮：被拉黑的不画、在装的进度、能升级的、装着的、没装的', () => {
  const up = new Set(['embed']);
  assert.equal(actionOf(bad, up, null), 'blocked');
  assert.equal(actionOf(memes, up, 'memes'), 'busy');
  assert.equal(actionOf(embed, up, null), 'upgrade');
  assert.equal(actionOf(embed, new Set(), null), 'installed');
  assert.equal(actionOf(memes, up, null), 'install');
});

test('卡片上点安装：要权限、要一起装依赖的先开详情；带了什么写成一行；进度的百分数', () => {
  assert.equal(needsLook({ capabilities: [], with: [] }), false);
  assert.equal(needsLook({ capabilities: ['network'], with: [] }), true);
  assert.equal(needsLook({ capabilities: [], with: [{ package: 'embed', version: '1.0.0' }] }), true);
  assert.equal(providesLine(memes.provides, { skills: '技能', content: '内容' }), '技能 memes；内容 stickers');
  assert.equal(providesLine({}, {}), '');
  assert.deepEqual(kindsOf(memes), ['skills', 'content']);
  assert.equal(faceOf(cat), 'user-round');
  assert.equal(faceOf(bad), 'package');
  assert.equal(percentOf({ done: 21, total: 50 }), 42);
  assert.equal(percentOf({ done: 0, total: 0 }), null);
  assert.equal(percentOf(null), null);
});

test('种类是动态的：清单的种类（kind，核心 G-11）加上带了的几样；认得的排前面，没见过的照编号排在后面', () => {
  const theme = { package: 'night', name: '夜', official: true, installed: null, blocked: null, kind: 'theme', provides: {} };
  const odd = { package: 'x', name: 'X', official: false, installed: null, blocked: null, kind: 'newkind', provides: { gadgets: ['g'] } };
  const got = shownOf([theme, odd, memes], { query: '', filter: 'all', kind: null }, new Set());
  assert.deepEqual(got.kinds, ['theme', 'skills', 'content', 'gadgets', 'newkind']);
  assert.deepEqual(shownOf([theme, odd, memes], { query: '', filter: 'all', kind: 'theme' }, new Set()).list.map((p) => p.package), ['night']);
  assert.equal(got.counts.newkind, 1);
  assert.deepEqual(kindsOf(odd), ['newkind', 'gadgets']);
});

test('核心 G-11 的种类原样：process、worker 都算插件、并成一种；bundle 不单列，照它带的筛；没有 kind 的不筛', () => {
  const ext = { package: 'qq', kind: 'process', provides: {} };
  const wk = { package: 'w', kind: 'worker', provides: {} };
  const pack = { package: 'memes', kind: 'bundle', provides: { skills: ['memes'] } };
  const old = { package: 'o', provides: {} };
  assert.deepEqual([kindsOf(ext), kindsOf(wk), kindsOf(pack), kindsOf(old)], [['extension'], ['extension'], ['skills'], []]);
  const got = shownOf([ext, wk, pack, old], { query: '', filter: 'all', kind: null }, new Set());
  assert.deepEqual(got.kinds, ['extension', 'skills']);
  assert.equal(got.counts.extension, 2);
});

test('带不带程序（核心 U23下上：自己那一层只收不带程序的；2026-10-28 项目主人：成员那张卡灰着「需要管理员安装」）：插件、界面、内置，带子命令、MCP 服务的算', () => {
  assert.equal(hasProgram({ kind: 'process' }), true);
  assert.equal(hasProgram({ kind: 'worker' }), true);
  assert.equal(hasProgram({ kind: 'ui' }), true);
  assert.equal(hasProgram({ kind: 'bundle', provides: { mcp: ['github'] } }), true);
  assert.equal(hasProgram({ kind: 'bundle', provides: { command: ['dice'] } }), true);
  assert.equal(hasProgram({ kind: 'bundle', provides: { scripts: ['dice'], skills: ['x'] } }), false);
  assert.equal(hasProgram({ kind: 'theme', provides: {} }), false);
  assert.equal(hasProgram({ kind: 'mascot' }), false);
  assert.equal(hasProgram({ provides: { mcp: [] } }), false, '空的不算');
  assert.equal(hasProgram(undefined), false);
});

test('所需权限：核心 IN-3 起写人话的名字、带说明；旧核心给编号的写编号，认不出的不写', () => {
  assert.deepEqual(capabilityRows([{ id: 'network', name: '联网', summary: '访问网络上的服务' }, { id: 'files', name: '', summary: '' }]),
    [{ name: '联网', summary: '访问网络上的服务' }, { name: 'files', summary: null }]);
  assert.deepEqual(capabilityRows(['network', { name: 'exec' }, null, 3, '']), [{ name: 'network', summary: null }, { name: 'exec', summary: null }]);
  assert.deepEqual(capabilityRows(undefined), []);
});
