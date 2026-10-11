// @ts-check
//! 长期目标在框下面那一行写成什么（软件包 `goal`，蓝图 `web.md`「长期目标」）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { goalLine } from '../../packages/goal/model.js';

const zh = JSON.parse(readFileSync(new URL('../../packages/goal/manifest.json', import.meta.url), 'utf8')).text.zh;
/** 照包里的中文填字 */
const t = (path, fields = {}) => String(path.split('.').reduce((o, k) => o?.[k], zh) ?? path).replace(/\{(\w+)\}/g, (_, k) => String(fields[k]));
const line = (goal) => goalLine(goal, t);

test('跑着的写第几轮，有上限的带上限；还没开过轮的写进行中', () => {
  assert.deepEqual(line({ text: '把测试修绿', state: 'running', round: 2 }), { text: '把测试修绿', tail: '第 2 轮', state: 'running', title: '把测试修绿 · 进行中 · 第 2 轮' });
  assert.equal(line({ text: '把测试修绿', state: 'running', round: 3, limit: 10 })?.tail, '第 3/10 轮');
  assert.equal(line({ text: '把测试修绿', state: 'running', round: 0 })?.tail, '进行中');
});

test('停着、等回复、受阻写状态；受阻带原因', () => {
  assert.equal(line({ text: 'x', state: 'paused', round: 2 })?.tail, '已暂停');
  assert.equal(line({ text: 'x', state: 'waiting', round: 1 })?.tail, '等待回复');
  assert.deepEqual(line({ text: 'x', state: 'blocked', reason: '要你给密钥', round: 4 }), { text: 'x', tail: '受阻：要你给密钥', state: 'blocked', title: 'x · 受阻：要你给密钥 · 第 4 轮' });
  assert.equal(line({ text: 'x', state: 'blocked', round: 4 })?.tail, '受阻');
  assert.equal(line({ text: 'x', state: 'later', round: 1 })?.state, 'running', '认不得的状态照跑着');
});

test('没有目标、完成了的不写', () => {
  assert.equal(line(null), null);
  assert.equal(line(undefined), null);
  assert.equal(line({ text: '把测试修绿', state: 'completed', round: 5 }), null);
  assert.equal(line({ text: '  ', state: 'running', round: 1 }), null);
});
