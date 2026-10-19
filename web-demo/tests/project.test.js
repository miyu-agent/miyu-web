// @ts-check
//! 项目的纯逻辑（`model/project.js`：颜色、左栏里一个项目露哪几个、在项目里新建会话先选上什么；软件包 setup 的 `project-form.js`：新建、项目设置
//! 那一张表交给核心的参数）。蓝图 `web.md`「会话整理和项目」，核心 H-1、H-2。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, colorOf, nextColor, projectRows, draftOf, PROJECT_ROWS } from '../src/model/project.js';
import { formOf, formProblem, createParams, updateParams } from '../packages/setup/project-form.js';

test('颜色：十二种，存浅色那一种；深色里画亮一档的，自选的照原样，没设的是 null', () => {
  assert.equal(PALETTE.length, 12);
  assert.equal(colorOf('#3a63c9', false), '#3a63c9');
  assert.equal(colorOf('#3A63C9', true), '#7aa2f7');
  assert.equal(colorOf('#123456', true), '#123456');
  assert.equal(colorOf(undefined, true), null);
  assert.equal(nextColor(0), PALETTE[0][0]);
  assert.equal(nextColor(12), PALETTE[0][0], '轮着来');
});

test('左栏一个项目露最近的几个：照排好的先后，置顶的不算，别的项目的不混进来', () => {
  const rows = [
    { session: 'pin', project: 'A', pinned: true },
    ...Array.from({ length: 7 }, (_, i) => ({ session: `a${i}`, project: 'A' })),
    { session: 'b0', project: 'B' },
    { session: 'x', project: null },
  ];
  const got = projectRows(rows, [{ project: 'A' }, { project: 'B' }, { project: 'C' }]);
  assert.deepEqual(got.get('A')?.map((r) => r.session), ['a0', 'a1', 'a2', 'a3', 'a4'].slice(0, PROJECT_ROWS));
  assert.deepEqual(got.get('B')?.map((r) => r.session), ['b0']);
  assert.deepEqual(got.get('C'), [], '没有会话的项目交空的');
});

test('在项目里新建会话：人格没写是默认（null）、写 null 是无人格（false）；工作区、预设照项目的', () => {
  assert.deepEqual(draftOf({ project: 'P', name: 'x' }), { persona: null, preset: null, cwd: null, project: 'P' });
  assert.deepEqual(draftOf({ project: 'P', name: 'x', persona: null, preset: 'code', workspace: '~/src/miyu' }), { persona: false, preset: 'code', cwd: '~/src/miyu', project: 'P' });
  assert.deepEqual(draftOf({ project: 'P', name: 'x', persona: 'miyu' }).persona, 'miyu');
});

test('表：名称必填、去掉首尾空白最多 40 个字；说明最多 80；附加提示词最多 8000', () => {
  const f = formOf(null, '#c0603f');
  assert.equal(f.color, '#c0603f', '新建的先选上轮到的颜色');
  assert.deepEqual(formProblem(f), { field: 'name', why: 'required' });
  assert.equal(formProblem({ ...f, name: '  网页  ' }), null);
  assert.deepEqual(formProblem({ ...f, name: '字'.repeat(41) }), { field: 'name', why: 'too_long' });
  assert.equal(formProblem({ ...f, name: '😀'.repeat(40) }), null, '照字数，不照 UTF-16');
  assert.deepEqual(formProblem({ ...f, name: 'a', description: 'x'.repeat(81) }), { field: 'description', why: 'too_long' });
  assert.deepEqual(formProblem({ ...f, name: 'a', prompt: 'x'.repeat(8001) }), { field: 'prompt', why: 'too_long' });
});

test('新建交的参数：没填的不写；无人格写 null；留言开的才写', () => {
  const f = { ...formOf(null, '#c0603f'), name: ' 网页 ', persona: /** @type {string|null|undefined} */ (null) };
  assert.deepEqual(createParams(f), { name: '网页', color: '#c0603f', persona: null });
  assert.deepEqual(createParams({ ...f, persona: undefined, workspace: '~/src', preset: 'code', prompt: '用中文', open: true, description: '说明' }),
    { name: '网页', description: '说明', color: '#c0603f', workspace: '~/src', preset: 'code', prompt: '用中文', open: true });
});

test('项目设置存的参数：只写改了的；清空的列进 unset；人格回到默认是 unset，改成无人格写 null；没改的交 null', () => {
  const p = { project: 'P', name: '网页', description: '旧', color: '#3a63c9', workspace: '~/src', persona: 'miyu', preset: 'code', prompt: '用中文', open: true };
  const was = formOf(p);
  assert.equal(updateParams('P', was, { ...was }), null);
  assert.deepEqual(updateParams('P', was, { ...was, name: '网页版', description: '', persona: undefined, open: false }),
    { project: 'P', name: '网页版', open: false, unset: ['description', 'persona'] });
  assert.deepEqual(updateParams('P', was, { ...was, persona: null, workspace: '', prompt: '  ' }),
    { project: 'P', persona: null, unset: ['workspace', 'prompt'] });
  const bare = formOf({ project: 'Q', name: 'x' });
  assert.equal(bare.persona, undefined, '没写人格的是默认');
  assert.deepEqual(updateParams('Q', bare, { ...bare, preset: 'code', color: '#c0603f' }), { project: 'Q', color: '#c0603f', preset: 'code' });
});

test('全部会话的筛选：全部、一个项目、不在项目里（刚删了的项目照不在算）、在跑、没看过；搜标题', async () => {
  const { filterRows, groupRows, projectStats } = await import('../src/model/session-filter.js');
  const day = 86400000;
  const now = Date.parse('2026-10-19T12:00:00+09:00');
  const rows = [
    { session: 'a', title: '修 CI', project: 'P', active: now - 1000, running: true, unread: false },
    { session: 'b', title: '写文档', project: 'gone', active: now - 3 * day, running: false, unread: true },
    { session: 'c', title: null, project: null, active: now - 40 * day, running: false, unread: false },
  ];
  const known = new Set(['P']);
  const ids = (/** @type {any[]} */ list) => list.map((r) => r.session);
  assert.deepEqual(ids(filterRows(rows, 'all', '', known)), ['a', 'b', 'c']);
  assert.deepEqual(ids(filterRows(rows, 'project:P', '', known)), ['a']);
  assert.deepEqual(ids(filterRows(rows, 'loose', '', known)), ['b', 'c'], '项目没了的算不在项目里');
  assert.deepEqual(ids(filterRows(rows, 'running', '', known)), ['a']);
  assert.deepEqual(ids(filterRows(rows, 'unread', '', known)), ['b']);
  assert.deepEqual(ids(filterRows(rows, 'all', 'ci', known)), ['a'], '不分大小写');
  assert.deepEqual(groupRows(rows, 'active', now).map((g) => [g.group, ids(g.rows)]), [['recent', ['a']], ['week', ['b']], ['older', ['c']]]);
  const stats = projectStats(rows, [{ project: 'P' }, { project: 'E' }]);
  assert.deepEqual(stats.get('P'), { count: 1, active: now - 1000 });
  assert.deepEqual(stats.get('E'), { count: 0, active: null });
});
