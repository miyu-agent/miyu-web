// @ts-check
//! 左栏的先后（2026-11-16 项目主人，W-1200）：只切进去不挪，人发了话才挪到顶上；循环、定时任务、人生自己醒这些没人说话的轮不算
//! （核心 SX-1 的 `last_spoken`）；没人说过话的照开的时刻（编号里的时间）。和终端侧边栏「最近会话」一个先后。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { Store } from '../src/core/store.js';
import { rank } from '../src/model/session.js';

loadRes();

/** 2026-11-16 零点起第 `m` 分钟 */
const at = (m) => new Date(Date.UTC(2026, 10, 16, 0, m)).toISOString();
/** 开在第 `m` 分钟的会话编号（UUIDv7：前 48 位是毫秒）；`tag` 是一个十六进制字 */
const id = (m, tag) => {
  const hex = Date.parse(at(m)).toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-${tag.repeat(12)}`;
};
/** 会话表的一项：`spoken` 是人最后一次发话的那一分钟（没有的不写），`active` 是最近动静 */
const entry = (session, spoken, active, more = {}) => ({ session, parent: null, oneshot: false, last_active: at(active), ...(spoken == null ? {} : { last_spoken: at(spoken) }), ...more });

function withIndex(listed) {
  /** @type {((method: string, params: any) => void)[]} */
  const pushes = [];
  const conn = {
    onPush: (fn) => pushes.push(fn),
    request: async (method, params) => (method === 'subscribe' && params.stream === 'sessions' ? { sessions: listed } : {}),
  };
  const store = new Store(/** @type {any} */ (conn));
  return { store, push: (/** @type {any} */ e) => { for (const fn of pushes) fn('sessions.changed', { session: e.session, entry: e }); } };
}

/** 左栏画的先后（`ui/app.js` 的 `render`） */
const sidebar = (store) => rank(store.order.map((x) => store.summary(x))).map((x) => x.session);

const [A, B, C] = [id(1, 'a'), id(2, 'b'), id(3, 'c')];

test('切进一个会话不挪它：核心推来 viewed、动静跟着动也不挪', async () => {
  // 核心照最近动静交回：C 刚被循环叫醒过
  const { store, push } = withIndex([entry(C, 10, 50), entry(A, 30, 30), entry(B, 20, 20)]);
  await store.boot();
  assert.deepEqual(sidebar(store), [A, B, C], '照人最后一次发话');
  store.view(C);
  push(entry(C, 10, 51, { viewed: true }));
  assert.deepEqual(sidebar(store), [A, B, C], '切进去不挪');
});

test('人发了话才挪到顶上：挪过刚被循环叫醒的', async () => {
  const { store, push } = withIndex([entry(B, 20, 50), entry(A, 30, 30), entry(C, 10, 10)]);
  await store.boot();
  push(entry(C, 40, 40));
  assert.deepEqual(sidebar(store), [C, A, B]);
});

test('没人说话的一轮（循环、定时任务、人生自己醒）不挪：只有最近动静变了', async () => {
  const { store, push } = withIndex([entry(A, 30, 30), entry(B, 20, 20), entry(C, 10, 10)]);
  await store.boot();
  push(entry(C, 10, 60));
  assert.deepEqual(sidebar(store), [A, B, C]);
});

test('没人说过话的照开的时刻排，不照最近动静', async () => {
  const late = id(40, 'c');
  const early = id(20, 'd');
  const { store } = withIndex([entry(early, null, 90), entry(B, 10, 10), entry(late, null, 41), entry(A, 30, 30)]);
  await store.boot();
  assert.deepEqual(sidebar(store), [late, A, early, B]);
});

test('左栏只露最近的几个时也照人发话挑：没人理、老被叫醒的不挤掉人刚说过话的', async () => {
  const many = Array.from({ length: 31 }, (_, i) => entry(id(100 + i, 'e'), 100 + i, 100 + i));
  const woken = entry(id(5, 'f'), 5, 900);
  const { store } = withIndex([woken, ...many]);
  await store.boot();
  assert.equal(store.order.includes(woken.session), false, '30 个都比它说得晚');
});
