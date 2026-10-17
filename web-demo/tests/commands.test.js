// @ts-check
//! 斜杠命令怎么认、怎么筛（蓝图 `web.md`「斜杠命令」「命令列表」，照 TUI 演示 `commands.rs`、`menu.rs` 的测试）：
//! 像不像命令名、带参数的、别名、先前缀后包含、`Esc` 关掉以后字变了才再开、撤销放回框里的那句。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { typed, menuTyped, filter, find, read, Menu, keptAttachments, talkAfterRefusal, quietReceipt, refusalText } from '../src/model/commands.js';

const res = loadRes();
const list = res.commands.commands;
const names = (specs) => specs.map((s) => s.name);

test('出厂的清单照蓝图：去掉 /icons、/exit，加 /clear、/stop（O-6，2026-10-07）、/recap、/language、/redo、/edit（/settings、/config、/pkg 由软件包 settings 登记）；/compact、/sessions（带着搜的词，2026-10-02）、/language、/model 带参数；每条都是真的，各有各的做法（/model 2026-10-01 起是真的；假命令 2026-10-07 删了，/help 做成真的）', () => {
  assert.deepEqual(names(list), ['undo', 'restore', 'redo', 'edit', 'compact', 'clear', 'stop', 'recap', 'new', 'sessions', 'language', 'model', 'copy', 'help']);
  assert.deepEqual(list.filter((s) => s.args).map((s) => s.name), ['compact', 'sessions', 'language', 'model']);
  const runs = Object.fromEntries(list.map((s) => [s.name, s.run]));
  assert.deepEqual(runs, { undo: 'revert', restore: 'unrevert', redo: 'redo', edit: 'edit', compact: 'compact', clear: 'clear', stop: 'stop', recap: 'recap', new: 'new', sessions: 'sessions', copy: 'copy',
    language: 'language', model: 'model', help: 'help' });
  assert.deepEqual(find(list, 'resume')?.name, 'sessions', '2026-10-02：/sessions 加 /resume 别名');
});

test('像命令名的才算：英文字母打头，只有字母、数字、-、_；刚打一个 / 也算；路径、中文不算', () => {
  assert.equal(typed('/undo'), 'undo');
  assert.equal(typed('/'), '');
  assert.equal(typed('/home/me/a.txt'), null);
  assert.equal(typed('undo'), null);
  assert.equal(typed('/你吃了吗'), null);
  assert.equal(typed('/1st'), null);
  assert.equal(typed('/foo-bar_2'), 'foo-bar_2');
  assert.equal(typed('/foo 带参数'), 'foo');
  assert.equal(typed(''), null);
});

test('列表开不开：名字后面打了空格就收起（名字打全了）', () => {
  assert.equal(menuTyped('/comp'), 'comp');
  assert.equal(menuTyped('/'), '');
  assert.equal(menuTyped('/compact '), null);
  assert.equal(menuTyped('/compact 重点'), null);
  assert.equal(menuTyped('/你吃了吗'), null);
  assert.equal(menuTyped('/ compact'), null, '名字要紧挨着 /');
  assert.equal(menuTyped('/undo\n'), null, '换行也是空白');
});

test('回车时这一行是什么：命令带着参数；列表里没有的名字交外面（会话里问核心）；别的照普通的话发', () => {
  const r = read(list, '/compact 重点保留 数据库设计');
  assert.equal(r.kind, 'command');
  assert.equal(r.spec?.name, 'compact');
  assert.equal(r.words, '重点保留 数据库设计');
  assert.deepEqual([read(list, '/compact').kind, read(list, '/compact').words], ['command', null]);
  assert.equal(read(list, '/compact   ').words, null, '只有空白：没写');
  assert.equal(read(list, '/undo').spec?.name, 'undo');
  assert.equal(read(list, '/rewind').spec?.name, 'undo', '别名一样执行');
  assert.equal(read(list, '/resume').spec?.name, 'sessions', '别名一样执行（2026-10-02）');
  assert.equal(read(list, '/new 一个话题').kind, 'talk', '不带参数的命令后面跟了字：一句话');
  assert.deepEqual(read(list, '/etc 目录是干什么的'), { kind: 'unlisted', name: 'etc', words: '目录是干什么的' }, '核心不认的外面照话发');
  assert.deepEqual(read(list, '/nosuch'), { kind: 'unlisted', name: 'nosuch', words: null });
  assert.deepEqual(read(list, '/nosuch   '), { kind: 'unlisted', name: 'nosuch', words: null }, '只有空白：没写');
  assert.equal(read(list, '/').kind, 'unknown');
  assert.equal(read(list, '你好').kind, 'talk');
  assert.equal(read(list, '/你吃了吗').kind, 'talk');
  assert.equal(read(list, '/home/me/a.txt').kind, 'talk');
  assert.equal(read(list, '/ compact').kind, 'talk', '名字要紧挨着 /');
});

test('边打边筛：名字（或别名）开头的排前面，含着的排后面，各照清单的先后；不分大小写', () => {
  assert.deepEqual(names(filter(list, 're')), ['undo', 'restore', 'redo', 'clear', 'recap', 'sessions'], 'rewind、reset（别名）、restore、redo、recap、resume（别名）开头');
  assert.deepEqual(names(filter(list, 'e')), ['edit', 'undo', 'restore', 'redo', 'clear', 'recap', 'new', 'sessions', 'language', 'model',
    'help'], 'e 开头的只有 /edit，排前面；别的都是含着的，照清单的先后');
  assert.deepEqual(names(filter(list, 'rew')), ['undo'], '筛的时候别名也算，列表里写正名');
  assert.deepEqual(names(filter(list, 'T')), ['restore', 'edit', 'compact', 'clear', 'stop']);
  assert.equal(filter(list, '').length, list.length, '刚打一个 /：全部');
  assert.deepEqual(filter(list, 'zzz'), []);
});

test('名字或别名正好对上的那一条；/redo 是重做（原来恢复撤销的旧名字，现在照 TUI 是 session.redo）', () => {
  assert.equal(find(list, 'restore')?.run, 'unrevert');
  assert.equal(find(list, 'rewind')?.run, 'revert');
  assert.equal(find(list, 'redo')?.run, 'redo');
  assert.equal(find(list, 'resume')?.name, 'sessions', '2026-10-02：/resume 别名');
  assert.equal(find(list, ''), null);
});

test('列表：字变了选中回到第一条；上下到头就停', () => {
  const m = new Menu();
  assert.equal(m.sync('/', list).length, list.length);
  m.step(true, list.length);
  m.step(true, list.length);
  assert.equal(m.selected, 2);
  m.step(false, list.length);
  m.step(false, list.length);
  m.step(false, list.length);
  assert.equal(m.selected, 0, '到头就停');
  for (let i = 0; i < 30; i++) m.step(true, list.length);
  assert.equal(m.selected, list.length - 1);
  m.sync('/t', list);
  assert.equal(m.selected, 0, '字变了回到第一条');
});

test('列表：Esc 关掉以后，字变了才再打开；删掉 / 再打一个照常打开', () => {
  const m = new Menu();
  assert.ok(m.sync('/u', list).length > 0);
  m.dismiss('/u');
  assert.deepEqual(m.sync('/u', list), []);
  assert.ok(m.sync('/un', list).length > 0);
  m.dismiss('/un');
  assert.deepEqual(m.sync('', list), []);
  assert.ok(m.sync('/', list).length > 0, '不是命令了再打 /：照常打开');
  assert.deepEqual(m.sync('/compact ', list), [], '打了空格收起');
  assert.deepEqual(m.sync('/zzz', list), [], '一条都没有不开');
});

test('撤掉的那一句带的附件回到框里：照条目的附件换成附件包的样子，大小照输入历史，查不到是 null，没名字的照种类起一个', () => {
  const said = { id: 'm41', kind: 'user', text: '看看这两张', turn: 42, attachments: [
    { kind: 'image', blob: 'b1', media_type: 'image/png', width: 10, height: 10 },
    { kind: 'file', blob: 'b2', media_type: 'application/pdf', name: '报告.pdf' },
  ] };
  const history = [{ sent: '看看这两张', parts: { attachments: [{ blob: 'b2', name: '报告.pdf', media_type: 'application/pdf', size: 2048 }] } }];
  assert.deepEqual(keptAttachments(said, history), [
    { blob: 'b1', name: 'image.png', media_type: 'image/png', size: null },
    { blob: 'b2', name: '报告.pdf', media_type: 'application/pdf', size: 2048 },
  ]);
  assert.deepEqual(keptAttachments({ attachments: [{ kind: 'image', blob: 'b3', media_type: 'image/svg+xml' }] }, []), [{ blob: 'b3', name: 'image.svg', media_type: 'image/svg+xml', size: null }]);
  assert.deepEqual(keptAttachments({}, []), [], '不带附件的');
});

test('核心认的命令（command.catalog）：写成交给核心的命令，带参数的照提示；和网页自己的撞名、撞别名的不要，接在后面', async () => {
  const { coreSpecs, mergeSpecs } = await import('../src/model/commands.js');
  const core = coreSpecs([
    { name: 'clear', aliases: ['reset'], summary: '清空上下文' },
    { name: 'remember', aliases: [], summary: '记一条记忆', argument: '<内容>' },
    { name: 'wipe', aliases: ['reset'], summary: '撞了网页的别名' },
  ]);
  assert.deepEqual(core[1], { name: 'remember', aliases: [], summary: '记一条记忆', run: 'core', args: true, argument: '<内容>' });
  const local = [{ name: 'clear', aliases: ['reset'], summary: '网页的清空', run: 'clear' }, { name: 'help', summary: '帮助', run: 'help' }];
  assert.deepEqual(mergeSpecs(local, core).map((s) => `${s.name}:${s.run}`), ['clear:clear', 'help:help', 'remember:core']);
});

test('空会话里打了核心认的命令（要造好的会话才能用）：不当话发出去，交 later；别的照旧（2026-10-10）', () => {
  const later = new Set(['remember', 'dream', 'memo', 'reset']);
  assert.equal(read(list, '/remember 我喜欢猫', later).kind, 'later', '带着内容的也不发');
  assert.equal(read(list, '/remember', later).kind, 'later');
  assert.equal(read(list, '/Dream', later).kind, 'later', '不分大小写');
  assert.equal(read(list, '/memo', later).kind, 'later', '别名一样');
  assert.equal(read(list, '/reset', later).kind, 'command', '网页自己也有的（/clear 的别名）照网页的，它自己管空会话怎么说');
  assert.equal(read(list, '/etc 目录是干什么的', later).kind, 'unlisted', '不是核心的照旧交外面');
  assert.equal(read(list, '/nosuch', later).kind, 'unlisted');
  assert.equal(read(list, '/compact 重点', later).kind, 'command', '网页自己的照旧执行');
});

test('空会话里打 /goal <目标>（opens_session）：交外面先开会话；不带字的、别的核心命令照旧要等会话（2026-10-12）', () => {
  const later = new Set(['goal', 'remember']);
  const opens = new Set(res.commands.opens_session);
  assert.deepEqual([...opens], ['goal']);
  assert.deepEqual(read(list, '/goal 把测试修绿', later, opens), { kind: 'unlisted', name: 'goal', words: '把测试修绿' });
  assert.equal(read(list, '/Goal 把测试修绿', later, opens).kind, 'unlisted', '不分大小写');
  assert.equal(read(list, '/goal', later, opens).kind, 'later', '不带字的看不了，照旧');
  assert.equal(read(list, '/remember 喜欢猫', later, opens).kind, 'later');
});

test('列表里没有的命令被核心拒了：只有认不出、带着字的照话发；数字码一样的别的拒绝不发（2026-10-12）', () => {
  assert.equal(talkAfterRefusal('unknown_command', '目录是干什么的'), true);
  assert.equal(talkAfterRefusal('unknown_command', null), false, '不带字的写拒绝那一句');
  assert.equal(talkAfterRefusal('memory_unavailable', '喜欢猫'), false, '无人格会话里的 /remember 内容不发给她');
  assert.equal(talkAfterRefusal(null, '喜欢猫'), false);
});

test('设长期目标不写回执；看、改、停、继续、清掉照旧写（2026-10-12）', () => {
  assert.equal(quietReceipt('goal', '把测试修绿'), true);
  assert.equal(quietReceipt('goal', '--rounds 3 把测试修绿'), true);
  assert.equal(quietReceipt('goal', 'pause the build'), true, '带字的整句当目标');
  assert.equal(quietReceipt('goal', null), false, '看');
  for (const sub of ['pause', 'resume', 'clear', 'edit 新的目标']) assert.equal(quietReceipt('goal', sub), false, sub);
  assert.equal(quietReceipt('remember', '喜欢猫'), false);
});

test('拒绝写什么：有 why 的写 why；扩展的命令答了错（command_failed，核心 X-14 下）两行：拒绝的话、扩展的原话', () => {
  assert.equal(refusalText({ message: '命令不可用。', reason: 'command_not_allowed', data: { why: '这个预设关了 /review' } }), '这个预设关了 /review');
  assert.equal(refusalText({ message: '命令执行失败。', reason: 'command_failed', data: { why: 'token expired' } }), '命令执行失败。\ntoken expired');
  assert.equal(refusalText({ message: '命令暂时不可用。', reason: 'command_unavailable', data: null }), '命令暂时不可用。');
  assert.equal(refusalText(new Error('断了')), '断了');
});

test('有几种写法的命令（核心 O-6 四补的 usage）：只收它自己的写法，帮助里一行一种；没有 usage 的照旧', async () => {
  const { coreSpecs } = await import('../src/model/commands.js');
  const [goal, dream] = coreSpecs([
    { name: 'goal', summary: '长期目标', argument: '[<目标> | pause | resume | clear]', usage: [
      { form: '/goal', summary: '看进度' }, { form: '/goal <目标>', summary: '设定长期目标；已经有一个就改它' },
      { form: '/goal pause', summary: '暂停' }, { form: '/other', summary: '不是它的不要' }, { summary: '没写法的不要' },
    ] },
    { name: 'dream', summary: '整理记忆' },
  ]);
  assert.deepEqual(goal.usage?.map((u) => u.form), ['/goal', '/goal <目标>', '/goal pause']);
  assert.equal(goal.argument, '[<目标> | pause | resume | clear]');
  assert.equal(dream.usage, undefined, '没有 usage 的照旧');
});

test('空会话里列着的核心的命令（later）：带着字、开会话的先开会话再交核心；只打名字的提示写上内容，固定写法照核心「没有」的那一句；别的提示开了会话才能用', async () => {
  const { coreSpecs, read } = await import('../src/model/commands.js');
  const list = coreSpecs([
    { name: 'goal', summary: '长期目标', argument: '<目标>', usage: [{ form: '/goal', summary: '看进度' }, { form: '/goal <目标>', summary: '设定' }, { form: '/goal pause', summary: '暂停' }] },
    { name: 'dream', summary: '整理记忆' },
  ]).map((s) => ({ ...s, later: true }));
  const opens = new Set(['goal']);
  assert.deepEqual(read(list, '/goal 写完文档', new Set(), opens), { kind: 'unlisted', name: 'goal', words: '写完文档' });
  assert.equal(read(list, '/goal', new Set(), opens).kind, 'needs_words', '只打 /goal：提示写上内容，不开会话');
  assert.equal(read(list, '/goal pause', new Set(), opens, new Set(['goal'])).kind, 'empty_fixed', '固定写法照核心「没有」的那一句，不为它白开一个会话');
  assert.deepEqual(read(list, '/goal 暂停一下这个思路', new Set(), opens).kind, 'unlisted', '目标里有「暂停」两个字的照目标');
  assert.deepEqual(read(list, '/dream', new Set(), opens), { kind: 'later' });
  assert.deepEqual(read(list, '/dream 现在', new Set(), opens), { kind: 'later' });
});

test('空会话里打 /todo、/todo clear（核心 D-3 再补，empty_none）：还没有待办，照核心「无待办。」，不开会话；别的字照旧要等会话', async () => {
  const { coreSpecs } = await import('../src/model/commands.js');
  const list = coreSpecs([
    { name: 'goal', summary: '长期目标', argument: '<目标>', usage: [{ form: '/goal', summary: '看进度' }, { form: '/goal <目标>', summary: '设定' }, { form: '/goal pause', summary: '暂停' }] },
    { name: 'todo', summary: '待办', argument: '[clear]', usage: [{ form: '/todo', summary: '看待办' }, { form: '/todo clear', summary: '清空' }] },
  ]).map((s) => ({ ...s, later: true }));
  const opens = new Set(res.commands.opens_session);
  const nones = new Set(res.commands.empty_none);
  assert.equal(read(list, '/todo', new Set(), opens, nones).kind, 'empty_fixed');
  assert.equal(read(list, '/todo clear', new Set(), opens, nones).kind, 'empty_fixed');
  assert.equal(read(list, '/todo 别的', new Set(), opens, nones).kind, 'later', '核心不认的写法照旧');
  assert.equal(read(list, '/goal pause', new Set(), opens, nones).kind, 'empty_fixed');
  assert.equal(read(list, '/goal', new Set(), opens, nones).kind, 'needs_words', '开会话的不带字的照旧提示写上内容');
  assert.equal(read(list, '/goal 写完文档', new Set(), opens, nones).kind, 'unlisted');
});

test('空会话里照「没有」说的（/goal 的固定写法、/todo）：网页照抄的那一份和核心资源的一字不差', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = process.env.MIYU_RESOURCES;
  assert.ok(dir, '没设 MIYU_RESOURCES');
  for (const lang of ['zh', 'en', 'ja']) {
    const core = JSON.parse(readFileSync(join(/** @type {string} */ (dir), 'core', 'human', `${lang}.json`), 'utf8')).said;
    const web = JSON.parse(readFileSync(new URL(`../resources/text/${lang}.json`, import.meta.url), 'utf8')).commands.empty_fixed;
    assert.equal(web.goal, core['commands/goal-none'], lang);
    assert.equal(web.todo, core['commands/todo-none'], lang);
    assert.deepEqual(Object.keys(web).sort(), [...res.commands.empty_none].sort(), 'empty_none 里的每一条都有一句');
  }
});
