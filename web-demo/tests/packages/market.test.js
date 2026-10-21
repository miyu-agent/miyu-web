// @ts-check
//! 下载软件页（蓝图 `web.md`「设置页」第 12a 条，`packages/settings/market-model.js`）：筛选、个数、按钮是哪一种、带了什么写成一行。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shownOf, actionOf, kindsOf, faceOf, needsLook, providesLine, percentOf, found } from '../../packages/settings/market-model.js';

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
  assert.deepEqual(got.kinds, ['features', 'skills', 'personas', 'content'], '只露有的种类，照先后');
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
