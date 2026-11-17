// @ts-check
//! 左栏头上交互区里软件包挂的入口（挂载位 `sidebar.nav`，W-1211；2026-11-17 项目主人本机验收第 31 条：「推演人生」从「更多」拿出来，
//! 和别的主入口同一级）：画哪几行、哪一行照选中的亮着、哪一行带记号；推演人生挂在这里，不再挂「更多」。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navRows } from '../src/model/nav.js';

const read = (/** @type {string} */ p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('画哪几行：有名字、点了有事做的；正在看的会话归它的亮着；带记号的照 mark；挂的人出错的当不亮、不带', () => {
  const life = { id: 'life', label: '推演人生', icon: 'sprout', run: () => {}, owns: (/** @type {any} */ e) => e?.life === true, mark: () => true };
  const bad = { id: 'bad', label: '坏的', run: () => {}, owns: () => { throw new Error('x'); }, mark: () => { throw new Error('y'); } };
  const rows = navRows([life, bad, { id: 'noop', label: '没做法' }, { id: 'noname', run: () => {} }], { session: 's', life: true });
  assert.deepEqual(rows, [
    { id: 'life', label: '推演人生', icon: 'sprout', here: true, mark: true },
    { id: 'bad', label: '坏的', icon: null, here: false, mark: false },
  ]);
  assert.equal(navRows([life], { session: 'n' })[0].here, false, '普通会话不亮');
  assert.equal(navRows([life], null)[0].here, false, '空会话不亮');
});

test('推演人生挂在左栏头上交互区（sidebar.nav），不挂「更多」；左栏照挂的画在「项目」下面、「更多」上面', () => {
  const life = read('packages/life/index.js');
  assert.match(life, /ctx\.slots\.mount\('sidebar\.nav'/);
  assert.doesNotMatch(life, /'sidebar\.more'/);
  const app = read('src/ui/app.js');
  assert.match(app, /ctx\.slots\.declare\('sidebar\.nav', 'list'\)/);
  const bar = read('src/ui/sidebar.js');
  assert.match(bar, /this\.navProjects,\s*this\.navSlot,\s*this\.moreBox\)/);
});
