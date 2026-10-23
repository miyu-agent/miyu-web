// @ts-check
// 成员的第一次引导（蓝图「连核心」第 1 条「成员」那一款，核心 Y-2下下上）：只走不写配置的几步

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memberStep, MEMBER_STEPS, NUMBERED } from '../../packages/welcome/guide.js';

test('成员只走欢迎 → 人格 → 主题 → 完成：写配置的几步照走的方向跳到下一个走得了的', () => {
  assert.deepEqual(MEMBER_STEPS, ['hello', 'persona', 'theme', 'done']);
  // 往前
  assert.equal(memberStep('language', 1), 'persona', '欢迎页的「开始」去界面语言：成员直接到人格');
  assert.equal(memberStep('model', 1), 'persona');
  assert.equal(memberStep('profile', 1), 'done', '主题之后（或人格跳过了）直接完成');
  assert.equal(memberStep('preset', 1), 'done');
  assert.equal(memberStep('embed', 1), 'done');
  // 往回
  assert.equal(memberStep('embed', -1), 'theme', '完成那一屏往回是主题');
  assert.equal(memberStep('model', -1), 'hello', '人格往回是欢迎');
  assert.equal(memberStep('language', -1), 'hello');
  // 走得了的不动；认不出的照原样
  for (const s of MEMBER_STEPS) assert.equal(memberStep(s, 1), s);
  assert.equal(memberStep('nope', 1), 'nope');
  // 步骤条：成员只列人格、主题
  assert.deepEqual(NUMBERED.filter((s) => MEMBER_STEPS.includes(s)), ['persona', 'theme']);
});
