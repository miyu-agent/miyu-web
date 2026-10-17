// @ts-check
//! 系统通知写什么（软件包 `notify` 的 `model.js`）：标题照会话的标题；做完了写最后一段回答的第一行，她在问写第一个问题，要人确认写工具；
//! 子会话、一次性的会话不弹。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noteOf, oneLine, BODY_MAX } from '../../packages/notify/model.js';

const zh = JSON.parse(readFileSync(new URL('../../packages/notify/manifest.json', import.meta.url), 'utf8')).text.zh;
const t = (path, fields = {}) => String(zh[path] ?? path).replace(/\{(\w+)\}/g, (_, k) => String(fields[k]));

test('做完了：写最后一段回答的第一行；没有回答的写这一轮做完了；没标题的照第一句、再没有写 Miyu', () => {
  const list = [{ id: 'm1', kind: 'reply', text: '旧的' }, { id: 'm2', kind: 'reply', text: '\n  改好了，测试都过了。\n第二行' }];
  assert.deepEqual(noteOf('done', { title: '修登录页' }, list, null, t), { title: '修登录页', body: '回答完了：改好了，测试都过了。' });
  assert.deepEqual(noteOf('done', { preview: '帮我看看' }, [], null, t), { title: '帮我看看', body: '这一轮做完了' });
  assert.equal(noteOf('done', null, [], null, t)?.title, 'Miyu');
});

test('她在问：写第一个问题；要人确认：写工具；读不懂的写一句泛的', () => {
  const list = [
    { id: 'b1.0', kind: 'tool', name: 'ask_user', args: JSON.stringify({ questions: [{ question: '旧的 build 目录怎么处理？' }] }) },
    { id: 'b1.1', kind: 'tool', name: 'shell', args: '{}' },
  ];
  assert.equal(noteOf('ask', { title: 'x' }, list, { what: 'ask', entry: 'b1.0' }, t)?.body, '她在问你：旧的 build 目录怎么处理？');
  assert.equal(noteOf('ask', { title: 'x' }, [], { entry: 'nope' }, t)?.body, '她有问题要问你');
  assert.equal(noteOf('approve', { title: 'x' }, list, { what: 'approve', entry: 'b1.1' }, t)?.body, '等你确认：要用 shell');
  assert.equal(noteOf('approve', { title: 'x' }, [], { entry: 'nope' }, t)?.body, '有一件事等你确认');
});

test('子会话、一次性的会话不弹；长的截成一行', () => {
  assert.equal(noteOf('done', { title: 'a', parent: 's1' }, [], null, t), null);
  assert.equal(noteOf('done', { title: 'a', oneshot: true }, [], null, t), null);
  assert.equal(oneLine('x'.repeat(300)).length, BODY_MAX);
});
