// @ts-check
//! 条目 → 正文的几种（蓝图 `web.md`「照条目画」第 2 条）：你的话（开轮那一句、排着的、撤回的）、她的回答、时间线的一段（步、收起那一行）、
//! 收尾那一行、旁白、三个球，藏起的不画。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { itemsOf, stepOf } from '../src/model/entries.js';

loadRes();

const AT = '2026-10-10T04:02:00.000Z';
const brief = (items) => items.map((it) => `${it.type}: ${it.type === 'steps' ? it.steps.map((s) => s.kind).join(',') : it.slot ? `[${it.slot}]` : it.text}`);

const turn3 = [
  { id: 'm2', kind: 'user', text: '你好', turn: 3, level: 'workspace', at: AT },
  { id: 'g6.0', kind: 'group', turn: 3, steps: ['b6.0', 'b6.1'], summary: [{ text: '思考了 1s' }], summary_en: [{ text: 'Thought for 1s' }, { text: ' · ' }, { text: '+3', tone: 'added' }], took_ms: 900, at: AT },
  { id: 'b6.0', kind: 'thought', group: 'g6.0', turn: 3, text: '想一想', took_ms: 300, at: AT },
  { id: 'b6.1', kind: 'tool', group: 'g6.0', turn: 3, call: 'c1', name: 'edit', state: 'ok', args: '{"file_path":"a.txt"}', title: { name: '编辑', object: '~/a.txt', said: '改了 1 处' }, diff: { added: 3, removed: 1 }, took_ms: 40, at: AT },
  { id: 'b6.2', kind: 'reply', turn: 3, text: '汪！', at: AT },
  { id: 'e9', kind: 'end', turn: 3, level: 'workspace', reason: 'completed', endpoint: 'dev', model: 'm1', took_ms: 2216, usage: { uncached: 3000, cache_read: 1000, cache_write: 0, output: 150 }, at: AT },
];

test('一轮：你的话（开轮那一句）、时间线的一段、她的回答、收尾那一行；收起那一行照核心给的（界面语言是自动的照英文那份）', () => {
  const got = itemsOf(turn3, { state: 'idle', permission: { level: 'workspace' } }, { account: 'admin' });
  assert.deepEqual(brief(got.items), ['user: 你好', 'steps: thought,tool', 'reply: 汪！', 'done: ▣  12:02 · dev/m1 · 2.2s · 4.2k(C25%)'.replace('12:02', got.items[3].text.match(/\d\d:\d\d/)[0])]);
  const user = got.items[0];
  assert.equal(user.opens, true);
  assert.deepEqual(user.speaker, { kind: 'person', account: 'admin', name: 'admin' });
  const seg = got.items[1];
  assert.equal(seg.finished, true);
  assert.deepEqual(seg.summary, { failed: false, spans: [{ text: 'Thought for 1s', tone: 'base' }, { text: ' · ', tone: 'base' }, { text: '+3', tone: 'added' }] });
  assert.equal(got.running, null);
  assert.equal(got.level, 'workspace');
});

test('一步：思考的起止照 took_ms；工具做完了照状态、带核心给的标题、改了多少行；在写参数的是 preparing', () => {
  const thought = stepOf(turn3[2]);
  assert.equal(thought.end - thought.start, 300);
  assert.equal(thought.state, 'done');
  const tool = stepOf(turn3[3]);
  assert.equal(tool.state, 'done');
  assert.equal(tool.status, 'ok');
  assert.equal(tool.duration, 40);
  assert.deepEqual(tool.title, { name: '编辑', object: '~/a.txt', said: '改了 1 处' });
  assert.deepEqual(tool.lines, { added: 3, removed: 1 });
  assert.deepEqual(tool.parsed, { file_path: 'a.txt' });
  const preparing = stepOf({ id: 'b7.0', kind: 'tool', name: 'shell', state: 'preparing', args: '{"comm', at: AT });
  assert.equal(preparing.state, 'preparing');
  assert.equal(preparing.parsed, null);
});

test('在跑：这一轮还没有她的条目画三个球；排着的话不进正文；撤回的、藏起的不画；在收的回答 streaming', () => {
  const entries = [
    ...turn3,
    { id: 'm10', kind: 'user', text: '再来', turn: 4, at: AT },
    { id: 'm11', kind: 'user', text: '排着的', turn: 4, queued: true, at: AT },
    { id: 'm12', kind: 'user', text: '撤回了', turn: 4, withdrawn: true, at: AT },
  ];
  const running = { state: 'running', since: AT, permission: { level: 'full' } };
  let got = itemsOf(entries, running);
  assert.deepEqual(brief(got.items).slice(-2), ['user: 再来', 'waiting: undefined']);
  assert.deepEqual(got.queued.map((q) => q.text), ['排着的']);
  assert.equal(got.running.turn, 4);
  assert.equal(got.running.start, Date.parse(AT));
  assert.equal(got.level, 'full');
  got = itemsOf([...entries, { id: 'b13.0', kind: 'reply', turn: 4, text: '写到一半', open: true, at: AT }], running);
  assert.deepEqual(brief(got.items).slice(-1), ['reply: 写到一半']);
  assert.equal(got.items.at(-1).streaming, true);
  got = itemsOf(turn3.map((e) => (e.turn === 3 ? { ...e, hidden: true } : e)), { state: 'idle' });
  assert.deepEqual(got.items, []);
  const compact = [{ id: 'm30', kind: 'user', text: '/compact', turn: 5, at: AT }, { id: 'c31', kind: 'notice', what: 'compaction', trigger: 'manual', state: 'running', turn: 5, at: AT }];
  got = itemsOf(compact, { ...running, doing: { what: 'compacting', entry: 'c31', written: 0 } });
  assert.equal(got.items.some((it) => it.type === 'waiting'), false, '在压缩的不画三个球，压缩的进度那一行说着');
});

test('收尾那一行：打断的接后台还在跑的任务数，出错的照出错那一句，别的原因照界面的字', () => {
  const end = (reason, extra = {}) => itemsOf([{ id: 'e1', kind: 'end', turn: 1, level: 'workspace', reason, at: AT, ...extra }], { state: 'idle', jobs: [{ job: 'j1', state: 'running' }, { job: 'j2', state: 'done' }] }).items[0];
  assert.equal(end('interrupted').interrupted, true);
  assert.equal(end('interrupted').jobs, 1);
  assert.equal(end('error', { error: { class: 'auth', status: 401, message: 'bad key' } }).tone, 'error');
  assert.match(end('error', { error: { class: 'auth', status: 401, message: 'bad key' } }).text, /bad key/);
  assert.match(end('step_limit').text, /已达请求次数上限/);
});

test('旁白：压缩、清空、后台任务、换了模型、工作区、别的会话、回顾照原来的写法；答题交给 asking 画；撤销那一条不画', () => {
  const notices = [
    { id: 'c20', kind: 'notice', what: 'compaction', trigger: 'auto', state: 'done', before: 120000, after: 30000, at: AT },
    { id: 'c21', kind: 'notice', what: 'compaction', trigger: 'auto', state: 'running', at: AT },
    { id: 'e22', kind: 'notice', what: 'cleared', at: AT },
    { id: 'e23', kind: 'notice', what: 'job', job: 'j1', job_kind: 'command', title: '跑测试', mark: 'done', reason: 'exited', command: 'npm test', output: { blob: 'sha256:x', chars: 10 }, at: AT },
    { id: 'e24', kind: 'notice', what: 'job', job: 'j2', job_kind: 'command', title: '编译', mark: 'failed', reason: 'exited', at: AT },
    { id: 'x24.0', kind: 'notice', what: 'model', why: 'failover', endpoint: 'dev', model: 'm2', at: AT },
    { id: 'e25', kind: 'notice', what: 'workspace', cwd: '/home/a/src', at: AT },
    { id: 'e26', kind: 'notice', what: 'peer', session: '0000abcd-1111', reason: 'expired', at: AT },
    { id: 'e27', kind: 'notice', what: 'answered', questions: [{ question: '选哪个？', options: [{ label: 'A' }] }], answers: [{ picked: ['A'] }], at: AT },
    { id: 'e28', kind: 'notice', what: 'reverted', turns: [3], said: '你好', at: AT },
    { id: 'e29', kind: 'notice', what: 'recap', text: '做了这些', covers: 3, at: AT },
  ];
  const prepared = { id: 'c30', kind: 'notice', what: 'compaction', trigger: 'auto', state: 'done', prepared: true, before: 90000, after: 20000, at: AT };
  assert.deepEqual(itemsOf([prepared], { state: 'idle' }).items, [], '提前压好直接换上的不画（核心 6-11 三补）');
  const got = itemsOf(notices, { state: 'idle' });
  assert.deepEqual(brief(got.items), [
    'note: 上下文已压缩：120k → 30k token',
    'note: 上下文已清空',
    'note: 后台命令完成 · 跑测试',
    'note: 后台命令失败 · 编译',
    'note: 已切换到 dev/m2（原模型出错）',
    'note: 工作区切换：/home/a/src',
    'note: 会话 bcd-1111 等待超时',
    'note: [asking]',
    'note: ',
  ]);
  assert.deepEqual(got.items[2].detail, { kind: 'output', command: 'npm test', hash: 'sha256:x', chars: 10, job: 'j1', nested: false });
  assert.equal(got.items[1].compaction, 'clear');
  assert.deepEqual(got.items[0].detail, { kind: 'compaction', upto: 20 }, '压缩那一行点开照序号问摘要');
  assert.equal(got.items[1].detail, null, '清空的不能点');
  assert.equal(got.items[7].event.kind, 'question.answered');
  assert.equal(got.items[8].recap, '做了这些');
  assert.equal(got.items[8].covers, 3);
});

test('别处来的话写是谁：子代理照任务的标题，父会话写「父会话」', () => {
  const entries = [
    { id: 'm1', kind: 'user', text: '报告', from: { kind: 'session', id: 'kid-1' }, at: AT },
    { id: 'm2', kind: 'user', text: '交代', from: { kind: 'session', id: 'dad-1' }, at: AT },
  ];
  const got = itemsOf(entries, { state: 'idle', jobs: [{ job: 'j1', what: 'agent', title: '查文档', session: 'kid-1', state: 'running' }] }, { parent: 'dad-1' });
  assert.deepEqual(got.items.map((it) => it.speaker.name), ['子代理 · 查文档', '父会话']);
});

test('模块替她开的一轮（长期目标的续轮）：一行「目标 · 第 N 轮」，不能点开、不当你的话；没有轮次的只写名字（2026-10-12）', async () => {
  const { group } = await import('../src/model/group.js');
  const prompt = '<goal_round>\nYour standing objective, set by the user with `/goal`.\n</goal_round>';
  const entries = [
    { id: 'm4', kind: 'user', text: prompt, turn: 5, round: 2, from: { kind: 'module', id: 'goal' }, at: AT },
    { id: 'b9.0', kind: 'reply', turn: 5, text: '修好了一个。', at: AT },
    { id: 'e9', kind: 'end', turn: 5, level: 'workspace', reason: 'completed', at: AT },
    { id: 'm5', kind: 'user', text: prompt, turn: 6, from: { kind: 'module', id: 'goal' }, at: AT },
    { id: 'm6', kind: 'user', text: '别的', turn: 7, from: { kind: 'module', id: 'later' }, at: AT },
  ];
  const got = itemsOf(entries, { state: 'idle' });
  const shown = got.items.filter((it) => it.type !== 'done');
  assert.deepEqual(brief(shown), ['note: 目标 · 第 2 轮', 'reply: 修好了一个。', 'note: 目标', 'note: later'], '没有轮次的只写名字，认不得的模块写编号');
  assert.equal(got.items[0].tone, 'module');
  assert.equal(got.items[0].detail, null, '给模型看的原文不给人');
  assert.ok(got.items.every((it) => it.type !== 'user'));
  assert.deepEqual(group(got.items).map((b) => b.kind), ['note', 'her', 'note', 'note'], '下一轮的那一行不并进她上一轮');
});

test('核心补上的格（9-8 三补）：后台命令的回报带退出码、用时', () => {
  const jobs = [
    { id: 'e1', kind: 'notice', what: 'job', job: 'j1', job_kind: 'command', title: '跑测试', mark: 'done', took_ms: 20000, at: AT },
    { id: 'e2', kind: 'notice', what: 'job', job: 'j2', job_kind: 'command', title: '编译', mark: 'failed', exit_code: 101, at: AT },
    { id: 'e3', kind: 'notice', what: 'job', job: 'j3', job_kind: 'command', title: '睡', mark: 'failed', signal: 9, at: AT },
  ];
  assert.deepEqual(itemsOf(jobs, { state: 'idle' }).items.map((it) => it.text), ['后台命令完成 · 跑测试 · 20.0s', '后台命令失败 · 编译 · 退出码 101', '后台命令失败 · 睡 · 信号 9']);
});

test('子代理的报告是空的（只有空白的也算）：那一行不能点开（2026-10-23 项目主人）；有字的照旧能点开', () => {
  const jobs = [
    { id: 'e1', kind: 'notice', what: 'job', job: 'j1', job_kind: 'agent', title: '三号', mark: 'stopped', reason: 'stopped', report: '', at: AT },
    { id: 'e2', kind: 'notice', what: 'job', job: 'j2', job_kind: 'agent', title: '五号', mark: 'stopped', reason: 'stopped', report: '  \n ', at: AT },
    { id: 'e3', kind: 'notice', what: 'job', job: 'j3', job_kind: 'agent', title: '九号', mark: 'stopped', reason: 'stopped', at: AT },
    { id: 'e4', kind: 'notice', what: 'job', job: 'j4', job_kind: 'agent', title: '四号', mark: 'done', report: '查完了', at: AT },
  ];
  const got = itemsOf(jobs, { state: 'idle' }).items;
  assert.deepEqual(got.map((it) => it.detail?.text ?? null), [null, null, null, '查完了']);
});

test('脚本里调过工具的（核心 M-5 上）：执行命令那一步带上 nested；后台命令的回报后面接 #n 显示名', () => {
  const nested = { count: 4, last: { n: 4, name: 'memory_search', title: { name: '翻记忆', object: '猫' }, state: 'ok' } };
  const entries = [
    { id: 'g1.0', kind: 'group', turn: 1, steps: ['t1.1'], summary: [], at: AT },
    { id: 't1.1', kind: 'tool', turn: 1, call: 'c1', name: 'shell', state: 'ok', nested, at: AT },
    { id: 'e2', kind: 'notice', what: 'job', job: 'j1', job_kind: 'command', title: '批量', mark: 'done', took_ms: 2000, nested, at: AT },
  ];
  const got = itemsOf(entries, { state: 'idle' }).items;
  assert.deepEqual(got[0].steps[0].nested, nested);
  assert.equal(got[1].text, '后台命令完成 · 批量 · 2.0s · #4 翻记忆');
});

test('执行中的进度（核心 X-45 补）：在跑的那一步带上 progress（去掉首尾空白），做完了的、空的不带', () => {
  const entries = [
    { id: 'g1.0', kind: 'group', turn: 1, steps: ['t1.1', 't1.2', 't1.3'], summary: [], at: AT },
    { id: 't1.1', kind: 'tool', turn: 1, call: 'c1', name: 'shell', state: 'running', progress: '  视频 3.0 MiB / 16.5 MiB（18%） ', at: AT },
    { id: 't1.2', kind: 'tool', turn: 1, call: 'c2', name: 'shell', state: 'ok', progress: '残留的', at: AT },
    { id: 't1.3', kind: 'tool', turn: 1, call: 'c3', name: 'shell', state: 'running', progress: '   ', at: AT },
  ];
  const steps = itemsOf(entries, { state: 'running' }).items[0].steps;
  assert.deepEqual(steps.map((x) => x.progress), ['视频 3.0 MiB / 16.5 MiB（18%）', null, null]);
});

test('要人确认、没定就取消了的那一步：这一段后面一行交给 asking 画「批准已取消」；定了的、没要确认的不出（验收 W-99）', async () => {
  const { reportOf } = await import('../packages/asking/model.js');
  const approval = { access: 'write', detail: { paths: [{ path: '/etc/x' }] } };
  const entries = [
    { id: 'g8.0', kind: 'group', turn: 4, steps: ['t8.1', 't8.2', 't8.3'], summary: [], at: AT },
    { id: 't8.1', kind: 'tool', turn: 4, call: 'c1', name: 'write', state: 'ok', approval: { ...approval, decision: 'allow' }, at: AT },
    { id: 't8.2', kind: 'tool', turn: 4, call: 'c2', name: 'read', state: 'cancelled', at: AT },
    { id: 't8.3', kind: 'tool', turn: 4, call: 'c3', name: 'write', state: 'cancelled', approval, at: AT },
  ];
  const got = itemsOf(entries, { state: 'idle' }).items;
  assert.deepEqual(got.map((it) => it.type), ['steps', 'note']);
  assert.equal(got[1].slot, 'asking');
  assert.equal(got[1].turn, 4);
  assert.deepEqual(reportOf(got[1].event, got[1].asked), { type: 'cancelled', kind: 'approve' });
});

test('她发出去的图（核心 X-19）：一张一条，排在那一步后面、跟着她这一轮；表情包、描述照原样；没有 blob 的、不认识的种类跳过', () => {
  const image = { kind: 'image', blob: 'ab12', media_type: 'image/gif', width: 300, height: 240 };
  const entries = [
    { id: 'm2', kind: 'user', text: '来张图', turn: 4, level: 'workspace', at: AT },
    { id: 'g7.0', kind: 'group', turn: 4, steps: ['b7.0'], summary: [{ text: '发了表情包' }], at: AT },
    { id: 'b7.0', kind: 'tool', group: 'g7.0', turn: 4, call: 'c1', name: 'send_sticker', state: 'ok', args: '{}', at: AT },
    { id: 's8.0', kind: 'media', turn: 4, image, alt: '一只猫在点头', sticker: true, at: AT },
    { id: 's8.1', kind: 'media', turn: 4, image: { ...image, name: 'b.png', media_type: 'image/png' }, at: AT },
    { id: 's8.2', kind: 'media', turn: 4, image: { kind: 'image' }, at: AT },
    { id: 'z9', kind: 'later_kind', turn: 4, at: AT },
    { id: 'b9.0', kind: 'reply', turn: 4, text: '喏', at: AT },
  ];
  const got = itemsOf(entries, { state: 'busy', since: AT, permission: { level: 'workspace' } });
  assert.deepEqual(got.items.map((it) => `${it.type}:${it.key}`), ['user:m2', 'steps:g7.0', 'media:s8.0', 'media:s8.1', 'reply:b9.0']);
  assert.deepEqual(got.items[2], { type: 'media', key: 's8.0', turn: 4, image: { blob: 'ab12', media_type: 'image/gif', width: 300, height: 240, name: null }, alt: '一只猫在点头', sticker: true });
  assert.equal(got.items[3].sticker, false);
  assert.equal(got.items[3].alt, null);
  assert.equal(got.items[3].image.name, 'b.png');
  // 只发了图、还没开口的一轮也算她来过：不画三个球
  const only = itemsOf(entries.slice(0, 4), { state: 'busy', since: AT, permission: { level: 'workspace' } });
  assert.equal(only.items.some((it) => it.type === 'waiting'), false);
});

test('她 show 过的（核心 D-5）：接在那一段后面画在正文里，一样一条；没展示成的那一步不出', () => {
  const blob = `sha256:${'d'.repeat(64)}`;
  const entries = [
    { id: 'u1', kind: 'user', text: '做个图', turn: 5, at: AT },
    { id: 'b9.0', kind: 'tool', name: 'show', state: 'ok', turn: 5, at: AT, args: '{"path":"a.png"}', shown: { path: '/w/a.png', blob, name: 'a.png', media_type: 'image/png', size: 9, width: 4, height: 3 } },
    { id: 'b9.1', kind: 'tool', name: 'show', state: 'failed', turn: 5, at: AT, args: '{"path":"nope"}' },
    { id: 'b9.2', kind: 'tool', name: 'show', state: 'ok', turn: 5, at: AT, args: '{"path":"r.html"}', shown: { path: '/w/r.html', blob, name: 'r.html', media_type: 'text/html', size: 2048, title: '报告' } },
    { id: 'g9.0', kind: 'group', turn: 5, steps: ['b9.0', 'b9.1', 'b9.2'], summary: [{ text: '展示了 2 个' }], at: AT },
    { id: 'm10', kind: 'reply', turn: 5, text: '好了', at: AT },
  ];
  const items = itemsOf(entries, { state: 'idle' }).items;
  assert.deepEqual(items.map((it) => it.type), ['user', 'steps', 'shown', 'shown', 'reply']);
  const shown = items.filter((it) => it.type === 'shown');
  assert.deepEqual(shown.map((it) => [it.key, it.shown.kind, it.shown.title]), [['b9.0.shown', 'image', null], ['b9.2.shown', 'html', '报告']]);
});
