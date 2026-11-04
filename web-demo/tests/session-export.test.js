// @ts-check
//! 导出会话（核心 SE-1 中（f8f8a9bae）`session.export`，设计 58，W-1098）：用途换成默认的选项、拼参数、拒绝怎么说、存下来叫什么、隐去的密钥。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PURPOSES, DEFAULT_TURNS, defaultsFor, localeOf, turnsOf, markdownParams, exportProblem, fileBase, redactedList } from '../src/model/session-export.js';

test('四种用途，原始包在最后', () => {
  assert.deepEqual(PURPOSES, ['read', 'agent', 'chat', 'bundle']);
});

test('用途的默认照核心参考：read 全部、带思考、她看到的；agent 现在的上下文、不带思考；chat 全部、不带思考、一行', () => {
  assert.deepEqual(defaultsFor('read'), { range: 'all', turns: DEFAULT_TURNS, thinking: true, tools: 'seen', children: 'reports' });
  assert.deepEqual(defaultsFor('agent'), { range: 'context', turns: DEFAULT_TURNS, thinking: false, tools: 'seen', children: 'reports' });
  assert.deepEqual(defaultsFor('chat'), { range: 'all', turns: DEFAULT_TURNS, thinking: false, tools: 'line', children: 'reports' });
  assert.equal(DEFAULT_TURNS, 20);
  // 每次给一份新的：框里改了不碰下一次的默认
  const one = defaultsFor('read');
  one.thinking = false;
  assert.equal(defaultsFor('read').thinking, true);
});

test('页面语言换成核心的 locale：zh、ja 打头的照它，别的英文', () => {
  assert.equal(localeOf('zh'), 'zh');
  assert.equal(localeOf('zh-CN'), 'zh');
  assert.equal(localeOf('ja-JP'), 'ja');
  assert.equal(localeOf('en'), 'en');
  assert.equal(localeOf('fr'), 'en');
  assert.equal(localeOf(null), 'en');
});

test('最近几轮：1 到 9999 的整数，别的不收', () => {
  assert.equal(turnsOf('20'), 20);
  assert.equal(turnsOf(' 5 '), 5);
  assert.equal(turnsOf('1'), 1);
  assert.equal(turnsOf('9999'), 9999);
  for (const bad of ['0', '-3', '2.5', '', 'abc', '10000', '1e3']) assert.equal(turnsOf(bad), null, bad);
});

test('Markdown 的参数：放进回应、照用途、最近几轮写成 {turns}、带页面语言', () => {
  const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
  assert.deepEqual(markdownParams(id, 'read', defaultsFor('read'), 'zh'),
    { session: id, format: 'markdown', to: 'inline', for: 'read', range: 'all', thinking: true, tools: 'seen', children: 'reports', locale: 'zh' });
  assert.deepEqual(markdownParams(id, 'agent', { ...defaultsFor('agent'), range: 'turns', turns: 7, tools: 'full', children: 'append' }, 'en'),
    { session: id, format: 'markdown', to: 'inline', for: 'agent', range: { turns: 7 }, thinking: false, tools: 'full', children: 'append', locale: 'en' });
});

test('没成怎么说：export_too_big 另写一句，别的照核心的原话，没有原话的写原因码', () => {
  assert.deepEqual(exportProblem({ reason: 'export_too_big', message: '导出超过 512 KiB，请存成文件。' }), { key: 'too_big' });
  assert.deepEqual(exportProblem({ reason: 'session_broken', message: '会话载入不了。' }), { key: 'failed', reason: '会话载入不了。' });
  assert.deepEqual(exportProblem({ reason: 'session_not_found' }), { key: 'failed', reason: 'session_not_found' });
  assert.deepEqual(exportProblem(new Error('HTTP 502')), { key: 'failed', reason: 'HTTP 502' });
});

test('存下来叫什么：标题去掉文件名里不能有的字，最多 80 个字；没有的照会话编号', () => {
  const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
  assert.equal(fileBase('修 bug', id), '修 bug');
  assert.equal(fileBase('a/b:c*d?"e"<f>|g\\h', id), 'a b c d e f g h');
  assert.equal(fileBase('  ..隐藏..  ', id), '隐藏');
  assert.equal(fileBase('一\n二\t三', id), '一 二 三');
  assert.equal(fileBase('', id), id);
  assert.equal(fileBase(null, id), id);
  assert.equal(fileBase('///', id), id);
  assert.equal([...fileBase('字'.repeat(200), id)].length, 80);
});

test('隐去的密钥：多的在前、一样多的照名字，算一共几处；不是数的、0 的不算', () => {
  assert.deepEqual(redactedList({ github: 1, openai: 2, anthropic: 1, bad: 'x', none: 0 }),
    { total: 4, items: [{ name: 'openai', count: 2 }, { name: 'anthropic', count: 1 }, { name: 'github', count: 1 }] });
  assert.deepEqual(redactedList(undefined), { total: 0, items: [] });
  assert.deepEqual(redactedList({}), { total: 0, items: [] });
});
