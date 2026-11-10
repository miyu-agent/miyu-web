// @ts-check
//! 交给吉祥物的状态和站的那条边（`packages/character/model.js`，蓝图「选吉祥物」第 3 条，2026-11-02）：统一算，混搭的两只动作、站位一致。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nowOf, endedOf, surfaceOf, characterOf, DENIRO, FLOAT_MIN } from '../../packages/character/model.js';

test('这一刻在做什么：没在跑 idle；等人 waiting；压缩 compacting；照 doing 分想、写、工具，派子代理的工具算 subagent', () => {
  assert.equal(nowOf(null), 'idle');
  assert.equal(nowOf({ running: null, status: { doing: { what: 'writing' } } }), 'idle');
  const run = { running: { turn: 3 } };
  assert.equal(nowOf({ ...run, status: { waiting: [{ what: 'ask' }], doing: { what: 'tool', entry: 't1' } } }), 'waiting', '等人盖过在做的');
  assert.equal(nowOf({ ...run, compacting: true, status: { doing: { what: 'thinking' } } }), 'compacting');
  assert.equal(nowOf({ ...run, status: { doing: { what: 'compacting' } } }), 'compacting');
  assert.equal(nowOf({ ...run, status: { doing: { what: 'thinking' } } }), 'thinking');
  assert.equal(nowOf({ ...run, status: { doing: { what: 'writing' } } }), 'writing');
  const entries = [{ id: 't1', kind: 'tool', name: 'shell' }, { id: 't2', kind: 'tool', name: 'subagent' }];
  assert.equal(nowOf({ ...run, entries, status: { doing: { what: 'tool', entry: 't1' } } }), 'tool');
  assert.equal(nowOf({ ...run, entries, status: { doing: { what: 'tool', entry: 't2' } } }), 'subagent');
  assert.equal(nowOf({ ...run, status: { doing: { what: 'retrying' } } }), 'thinking');
  assert.equal(nowOf({ ...run, status: {} }), 'thinking', '刚开始、还没有 doing');
});

test('一轮怎么收的尾：照最后一条收尾的 reason，completed、别的照 done', () => {
  assert.equal(endedOf([{ kind: 'end', reason: 'completed' }]), 'done');
  assert.equal(endedOf([{ kind: 'end', reason: 'completed' }, { kind: 'end', reason: 'error' }]), 'error');
  assert.equal(endedOf([{ kind: 'end', reason: 'interrupted' }, { kind: 'reply' }]), 'interrupted');
  assert.equal(endedOf([{ kind: 'end', reason: 'max_steps' }]), 'done');
  assert.equal(endedOf([{ kind: 'reply' }]), null);
});

test('站的那条边：弹出的列表露着的照最上面那一个，不然照输入框；加上主题挪的', () => {
  const box = { top: 700, left: 300, right: 900 };
  assert.deepEqual(surfaceOf(box, [], {}), { top: 700, left: 300, right: 900 });
  assert.deepEqual(surfaceOf(box, [{ top: 500, left: 310, right: 600 }, { top: 450, left: 320, right: 700 }], {}), { top: 450, left: 320, right: 700 });
  assert.deepEqual(surfaceOf(box, [], { composer: { dy: -20 } }), { top: 680, left: 300, right: 900 }, '大肥鱼的丝带比框高出 20px');
  assert.deepEqual(surfaceOf(box, [{ top: 450, left: 320, right: 700 }], { composer: { dy: -20 }, floats: { dy: -3, dx: 2 } }), { top: 447, left: 322, right: 702 });
  assert.equal(surfaceOf(null, [], {}), null);
});

test('站的那条边：站不下的小浮层（跳到底部的圆钮）不算，照旧站在输入框上', () => {
  const box = { top: 700, left: 300, right: 900 };
  const jump = { top: 658, left: 584, right: 616 };
  assert.deepEqual(surfaceOf(box, [jump], { composer: { dy: -20 } }), { top: 680, left: 300, right: 900 });
  assert.deepEqual(surfaceOf(box, [jump, { top: 450, left: 300, right: 900 }], {}), { top: 450, left: 300, right: 900 }, '同时露着命令列表的照命令列表');
  assert.deepEqual(surfaceOf(box, [{ top: 660, left: 306, right: 306 + FLOAT_MIN }], {}), { top: 660, left: 306, right: 306 + FLOAT_MIN }, '刚好够宽的提示条算');
});

test('吉祥物改名 deniro（2026-11-10 项目主人）：设置里改名以前存的 miyu 读成 deniro，别的照原样，没设的是空的', () => {
  assert.equal(DENIRO, 'deniro');
  assert.equal(characterOf('miyu'), 'deniro', '改名以前选的那只照旧认');
  assert.equal(characterOf('deniro'), 'deniro');
  assert.equal(characterOf('clawd'), 'clawd', '外观包挂的照原样');
  assert.equal(characterOf(''), '');
  assert.equal(characterOf(undefined), '');
  assert.equal(characterOf(null), '');
});
