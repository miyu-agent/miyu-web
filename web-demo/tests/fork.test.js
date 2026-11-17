// @ts-check
//! 分叉出来的子代理（核心 A-F；2026-10-24 项目主人：只把机器人换成分叉 git-fork）：时间线那一步照调用参数的 fork，后台任务照会话状态 jobs 的
//! fork，左栏照会话表那一行的 forked；没有这一格的照普通子代理
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forkedCall } from '../src/model/words.js';
import { tasksFromStatus } from '../src/lib/jobs.js';
import { taskTree } from '../packages/dashboard/model.js';

test('时间线：subagent 的参数里 fork 是真的才算分叉；没写完、写坏了的、没有这一格的照普通子代理', () => {
  assert.equal(forkedCall('{"description":"查资料","prompt":"…","fork":true}'), true);
  assert.equal(forkedCall({ fork: true }), true);
  assert.equal(forkedCall('{"description":"查资料","fork":false}'), false);
  assert.equal(forkedCall('{"description":"查资料","prompt":"…"}'), false, '旧核心、没写 fork');
  assert.equal(forkedCall('{"description":"查资料","fork":tr'), false, '参数还在写');
  assert.equal(forkedCall('{"fork":"true"}'), false, '只认布尔');
  assert.equal(forkedCall(null), false);
});

test('场所会话的并行支线（核心 VW-2：jobs 里 {job: 支线的会话编号, what: agent, fork: true}）：列成分叉的子代理，在跑的在前、做完的进「已完成」，各照开始的时刻从新到旧', () => {
  const at = (s) => new Date(Date.UTC(2026, 10, 17, 10, 0, 0) + s * 1000).toISOString();
  const B1 = '019a0000-0000-7000-8000-000000000001';
  const B2 = '019a0000-0000-7000-8000-000000000002';
  const B3 = '019a0000-0000-7000-8000-000000000003';
  const tasks = tasksFromStatus([
    { job: 'j1', what: 'command', title: '数秒', state: 'done', started: at(0), ended: at(1) },
    { job: B1, what: 'agent', fork: true, session: B1, title: '支线一', state: 'done', started: at(10), ended: at(20) },
    { job: B2, what: 'agent', fork: true, session: B2, title: '支线二', state: 'stopped', started: at(30), ended: at(40) },
    { job: B3, what: 'agent', fork: true, session: B3, title: '支线三', state: 'running', started: at(50) },
  ]);
  assert.deepEqual(tasks.map((x) => [x.title, x.state, x.fork, x.session]), [
    ['支线三', 'running', true, B3],
    ['支线二', 'stopped', true, B2],
    ['支线一', 'done', true, B1],
    ['数秒', 'done', false, null],
  ]);
});

test('后台任务：jobs 里 what: agent 的那一项带 fork: true 才是分叉的；命令带了也不算；没有这一格的照普通子代理', () => {
  const tasks = tasksFromStatus([
    { job: 'j1', what: 'agent', title: '查资料', state: 'running', session: 's1', fork: true },
    { job: 'j2', what: 'agent', title: '写报告', state: 'running', session: 's2' },
    { job: 'j3', what: 'command', title: '数秒', state: 'running', fork: true },
  ]);
  assert.deepEqual(tasks.map((x) => [x.job, x.fork]), [['j3', false], ['j2', false], ['j1', true]]);
  // 仪表盘的树照样带着
  const tree = taskTree('main', { jobs: [{ job: 'j1', what: 'agent', title: '查资料', state: 'running', session: 's1', fork: true }] }, () => null);
  assert.equal(tree[0].fork, true);
});
