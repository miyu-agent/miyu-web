// @ts-check
//! 待办（蓝图 `web.md`「待办」，照 `tui.md`「后台命令、子代理和侧边栏」第 4 条和 TUI 演示 `ui/sidebar.rs` 的 `todo_lines`）：
//! 做完几项、收成几行。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { progress, allDone, fold } from '../../packages/todo/model.js';

/** 这个包的设置项的出厂值 */
const config = Object.fromEntries(Object.entries(JSON.parse(readFileSync(new URL('../../packages/todo/manifest.json', import.meta.url), 'utf8')).settings).map(([k, s]) => [k, s.default]));


/** 收成的几行写成字：记号照状态，收起的、还有的照种类。 */
const show = (rows) => rows.map((r) => (r.kind === 'item' ? `${r.todo.state}:${r.todo.text}` : `${r.kind}:${r.count}`));

/** `n` 项，前 `steps` 项做完、下一项在做、别的没做。 */
function todos(n, steps = 0) {
  return Array.from({ length: n }, (_, i) => ({ text: `第${i + 1}项`, state: i < steps ? 'done' : i === steps ? 'active' : 'pending' }));
}

test('做完几项、一共几项；全做完了才算做完，没有待办不算', () => {
  assert.deepEqual(progress(todos(3, 1)), { done: 1, total: 3 });
  assert.ok(!allDone(todos(3, 2)));
  assert.ok(allDone(todos(3, 3)));
  assert.ok(!allDone([]), '没有待办不算做完');
});

test('放得下、做完的不到两项：一项一行，没做完的照先后在前、做完的那一项排在最后（2026-10-17 项目主人在终端）', () => {
  assert.deepEqual(show(fold(todos(3), config.rows, false)), ['active:第1项', 'pending:第2项', 'pending:第3项']);
  assert.deepEqual(show(fold(todos(5, 1), config.rows, false)), ['active:第2项', 'pending:第3项', 'pending:第4项', 'pending:第5项', 'done:第1项'], '只做完一项的划线排最后');
});

test('做完两项及以上：做完的收成最底下一行，上面是没做完的（TUI 的例子：做完 4、共 7）', () => {
  const list = Array.from({ length: 7 }, (_, i) => ({ text: ['一号', '二号', '三号', '四号', '五号', '六号', '七号'][i], state: i < 4 ? 'done' : i === 4 ? 'active' : 'pending' }));
  assert.deepEqual(show(fold(/** @type {any} */ (list), 5, false)), ['active:五号', 'pending:六号', 'pending:七号', 'folded:4']);
  assert.deepEqual(show(fold(todos(5, 2), config.rows, false)), ['active:第3项', 'pending:第4项', 'pending:第5项', 'folded:2']);
});

test('放不下：没做完的在前，放不下的收成「还有 N 项」，排在「已完成」上面（TUI 的例子：做完 12、共 20）', () => {
  const rows = fold(todos(20, 12), 5, false);
  assert.deepEqual(show(rows), ['active:第13项', 'pending:第14项', 'pending:第15项', 'more:5', 'folded:12']);
  assert.equal(rows.length, 5, '最多 5 行');
});

test('放不下、还没做完一项：没有「已完成」那一行，最后一行是还有几项', () => {
  assert.deepEqual(show(fold(todos(9), 5, false)), ['active:第1项', 'pending:第2项', 'pending:第3项', 'pending:第4项', 'more:5']);
});

test('放不下、只做完一项：照 TUI 也收成「已完成 1 项」', () => {
  assert.deepEqual(show(fold(todos(9, 1), 5, false)), ['active:第2项', 'pending:第3项', 'pending:第4项', 'more:5', 'folded:1']);
});

test('放不下、剩下的正好放得下：不写还有几项', () => {
  assert.deepEqual(show(fold(todos(9, 5), 5, false)), ['active:第6项', 'pending:第7项', 'pending:第8项', 'pending:第9项', 'folded:5']);
});

test('展开：全部列出，做完的也排在末尾', () => {
  assert.deepEqual(show(fold(todos(4, 2), 5, true)), ['active:第3项', 'pending:第4项', 'done:第1项', 'done:第2项']);
  assert.deepEqual(fold([], 5, true), []);
});

test('出厂露 5 行（照 TUI）；全做完了不停，没有停多久那一项', () => {
  assert.equal(config.rows, 5);
  assert.equal(config.hold_ms, undefined);
});

test('核心的清单换成这一块的样子：pending 没做、in_progress 在做、completed 做完，不认识的当没做；空的是空的', async () => {
  const { fromCore } = await import('../../packages/todo/model.js');
  assert.deepEqual(fromCore([{ content: '读代码', status: 'completed' }, { content: '改', status: 'in_progress' }, { content: '测', status: 'pending' }, { content: '?', status: 'odd' }]),
    [{ text: '读代码', state: 'done' }, { text: '改', state: 'active' }, { text: '测', state: 'pending' }, { text: '?', state: 'pending' }]);
  assert.deepEqual(fromCore([]), []);
  assert.deepEqual(fromCore(undefined), []);
});
