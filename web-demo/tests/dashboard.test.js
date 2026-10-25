// @ts-check
//! 仪表盘的纯逻辑（软件包 `dashboard`，蓝图 `web.md`「仪表盘」第 4、5 条）：任务树、摊行、收起、文件归并、待办、差异行号。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskTree, rowsOf, counts, stoppable, fileChanges, splitPath, todoView, diffRows, attentionOf, badgeOf } from '../packages/dashboard/model.js';

const AT = '2026-10-23T10:00:00Z';
const job = (id, what, state, extra = {}) => ({ job: id, what, title: `t${id}`, state, started: AT, ...extra });

test('任务树：子代理照它自己的会话状态往下挂，在等人的照它的 waiting 认（确认在前）', () => {
  const statuses = {
    main: { jobs: [job('j1', 'agent', 'running', { session: 's1' }), job('j2', 'command', 'running')] },
    s1: { jobs: [job('j1', 'agent', 'running', { session: 's2' })], waiting: [{ what: 'ask' }, { what: 'approve' }] },
    s2: { jobs: [] },
  };
  const tree = taskTree('main', statuses.main, (id) => statuses[id] ?? null);
  const agent = tree.find((x) => x.job === 'j1');
  assert.equal(agent?.attention, 'confirm');
  assert.equal(agent?.kids.length, 1);
  assert.equal(agent?.kids[0].owner, 's1');
  assert.deepEqual(counts(tree), { running: 3, waiting: 1 });
  assert.deepEqual(stoppable(tree).map((x) => x.key).sort(), ['main:j1', 'main:j2']);
  assert.equal(attentionOf({ waiting: [{ what: 'ask' }] }), 'ask');
  assert.equal(attentionOf(null), null);
});

test('摊行：做完的顶层收成最后一行「✓ (N)」，开着的接着列；同一层兄弟多于 3 个只露前 2 个，剩下的收成一行；人收起的不露', () => {
  const kids = ['j1.1', 'j1.2', 'j1.3', 'j1.4', 'j1.5'].map((id) => job(id, 'agent', 'running'));
  const statuses = {
    main: { jobs: [job('j1', 'agent', 'running', { session: 's1' }), job('j2', 'command', 'exited', { state: 'done' }), job('j3', 'command', 'done')] },
    s1: { jobs: kids },
  };
  const tree = taskTree('main', statuses.main, (id) => statuses[id] ?? null);
  const rows = rowsOf(tree);
  assert.deepEqual(rows.map((r) => (r.type === 'task' ? r.node.job : r.type === 'more' ? `more${r.count}${r.running ? '跑' : ''}` : `done${r.count}`)),
    ['j1', 'j1.5', 'j1.4', 'more3跑', 'done2']);
  // 第二层的线：上面那一层是最后一个，不穿竖线；收起来的兄弟那一行是这一层最后一个
  const child = rows[1];
  assert.equal(child.type === 'task' && child.depth, 1);
  // 展开兄弟、做完的
  const open = rowsOf(tree, { expanded: new Set(['main:j1']), doneOpen: true });
  assert.equal(open.filter((r) => r.type === 'task').length, 1 + 5 + 2);
  assert.ok(!open.some((r) => r.type === 'more'));
  // 展开了的兄弟最后一行「收起」（2026-10-24 项目主人：展开了收不回），接在第二层、它前面那一个不再是这一层最后一个
  const less = open.findIndex((r) => r.type === 'less');
  assert.ok(less > 0 && open[less].type === 'less' && open[less].parent === 'main:j1' && open[less].depth === 1);
  const before = open[less - 1];
  assert.equal(before.type === 'task' && before.last, false);
  // 收起 j1
  const shut = rowsOf(tree, { collapsed: new Set(['main:j1']) });
  assert.deepEqual(shut.map((r) => r.type), ['task', 'done']);
  assert.equal(shut[0].type === 'task' && shut[0].open, false);
});

test('文件修改：做成了的、带 diff 的工具步按文件归在一起（先改的在前），新建的认出来；撤掉的、没做成的、没路径的不算', () => {
  const entries = [
    { kind: 'tool', call: 'c1', state: 'ok', args: '{"file_path":"/w/a.js"}', diff: { added: 3, removed: 1 } },
    { kind: 'tool', call: 'c2', state: 'ok', args: '{"file_path":"/w/b.js"}', diff: { added: 5, removed: 0 }, files: [{ action: 'created' }] },
    { kind: 'tool', call: 'c3', state: 'ok', args: { file_path: '/w/a.js' }, diff: { added: 2, removed: 2 } },
    { kind: 'tool', call: 'c4', state: 'error', args: '{"file_path":"/w/c.js"}', diff: { added: 1, removed: 0 } },
    { kind: 'tool', call: 'c5', state: 'ok', hidden: true, args: '{"file_path":"/w/d.js"}', diff: { added: 1, removed: 0 } },
    { kind: 'tool', call: 'c6', state: 'ok', args: 'not json', diff: { added: 1, removed: 0 } },
    { kind: 'tool', call: 'c7', state: 'ok', name: 'shell', args: '{"command":"sed -i x"}' },
  ];
  assert.deepEqual(fileChanges(entries), [
    { path: '/w/a.js', added: 5, removed: 3, calls: ['c1', 'c3'], created: false },
    { path: '/w/b.js', added: 5, removed: 0, calls: ['c2'], created: true },
  ]);
  assert.deepEqual(splitPath('/w/src/a.js', { workdir: '/w' }), { name: 'a.js', dir: 'src' });
  assert.deepEqual(splitPath('/home/me/x/a.js', { workdir: '/w', home: '/home/me' }), { name: 'a.js', dir: '~/x' });
});

test('待办：没做完的照先后最多露几项，剩下的、做完的数出来', () => {
  const todos = [
    { content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }, { content: 'c', status: 'pending' }, { content: 'd', status: 'pending' },
  ];
  const v = todoView(todos, 2);
  assert.deepEqual(v.shown.map((x) => x.content), ['b', 'c']);
  assert.equal(v.more, 1);
  assert.equal(v.done, 1);
  assert.equal(v.total, 4);
  assert.equal(v.fold, false);
  assert.deepEqual(v.finished, []);
  // 人展开了：全露、要「收起」那一行；做完的列出来
  const w = todoView(todos, 2, { open: true, doneOpen: true });
  assert.deepEqual(w.shown.map((x) => x.content), ['b', 'c', 'd']);
  assert.equal(w.more, 0);
  assert.equal(w.fold, true);
  assert.deepEqual(w.finished.map((x) => x.content), ['a']);
  // 放得下的展开了也不要「收起」
  assert.equal(todoView(todos, 5, { open: true }).fold, false);
});

test('差异的一行行：段头起新旧行号，加的只有新号、删的只有旧号，「文件末尾没有换行」那一句不要', () => {
  const rows = diffRows(['@@ -10,3 +10,3 @@ fn a()', ' same', '-old', '+new', '\\ No newline at end of file', ' tail']);
  assert.deepEqual(rows, [
    { kind: 'hunk', text: '@@ -10,3 +10,3 @@ fn a()' },
    { kind: 'same', old: 10, now: 10, text: 'same' },
    { kind: 'del', old: 11, now: null, text: 'old' },
    { kind: 'add', old: null, now: 11, text: 'new' },
    { kind: 'same', old: 12, now: 12, text: 'tail' },
  ]);
});

test('右栏开关上的提醒点（2026-10-24）：开着不画；等人的在先，来了新展示没看的其次，在跑的最后', () => {
  assert.equal(badgeOf({ running: 3, waiting: 1 }, { open: true, fresh: true }), null);
  assert.equal(badgeOf({ running: 3, waiting: 1 }, { open: false, fresh: true }), 'waiting');
  assert.equal(badgeOf({ running: 3, waiting: 0 }, { open: false, fresh: true }), 'new');
  assert.equal(badgeOf({ running: 3, waiting: 0 }, { open: false, fresh: false }), 'running');
  assert.equal(badgeOf({ running: 0, waiting: 0 }, { open: false, fresh: false }), null);
});

test('右栏的卡片照设置排：cards 里写了的照它在前，没写的照 order 接在后面，cards_off 的不出（2026-10-24 项目主人：卡片做成模块）', async () => {
  const { arrange } = await import('../packages/dashboard/model.js');
  const e = (id, order) => ({ id, order });
  const all = [e('tasks', 20), e('weather', 5), e('session', 0), e('todo', 10), e('usage', 5), e('files', 30), e('shown', 40)];
  assert.deepEqual(arrange(all, { order: ['session', 'todo', 'tasks', 'files', 'shown'] }).map((x) => x.id),
    ['session', 'todo', 'tasks', 'files', 'shown', 'usage', 'weather'], '没写进设置的照 order，一样的照编号');
  assert.deepEqual(arrange(all, { order: ['files', 'session'], off: ['todo', 'weather'] }).map((x) => x.id),
    ['files', 'session', 'usage', 'tasks', 'shown'], '换了先后、关掉两张');
  assert.deepEqual(arrange(all).map((x) => x.id), ['session', 'usage', 'weather', 'todo', 'tasks', 'files', 'shown'], '没设置的全照 order');
  assert.deepEqual(arrange([], { order: ['session'] }), []);
  assert.deepEqual(arrange(all.filter((x) => x.id !== 'session'), { order: ['session', 'files'] }).map((x) => x.id), ['files', 'usage', 'weather', 'todo', 'tasks', 'shown'],
    '记着的先后里有没挂着的卡（删掉了的会话信息）：跳过');
});
