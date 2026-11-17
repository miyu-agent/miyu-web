// @ts-check
//! 人停的核心（核心 CS-5，蓝图 `web.md`「连核心」第 1 条，W-1210）：页面刚打开、点「启动」时照常连（网页软件、桥照 `connect_or_start` 拉起核心）；
//! 断线以后自己重连的在地址上带 `again=1`，那一头照 `reconnect_or_start`：人停的不拉起，推一条带 `reason: "stopped_by_user"` 的
//! `web.error`（桥是 `bridge.error`）。页面照它出「核心已停止」的卡（标题照那一句），卡上「启动」照常连；不再问口令，接着隔一会儿试
//! （别处把核心起来了就自己连上）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRes } from './support.js';
import { Connection } from '../src/core/connection.js';
import { socketUrl } from '../src/host/socket.js';

loadRes();

const STOPPED = '核心已停止';

/**
 * 假的宿主一头：每开一条线记下 `again`；`stopped()` 是真的时候，带 `again` 的线握手时推「人停的」再关，别的照常通。
 * @param {() => boolean} stopped @param {string} method
 */
function host(stopped, method = 'web.error') {
  /** @type {boolean[]} */
  const opened = [];
  const open = (/** @type {boolean} */ again = false) => {
    opened.push(again);
    const refuse = again && stopped();
    const ws = { readyState: 0, onopen: null, onmessage: null, onclose: null, onerror: null,
      /** @param {string} line */
      send(line) {
        const { id } = JSON.parse(line);
        queueMicrotask(() => {
          if (refuse) {
            ws.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method, params: { message: STOPPED, reason: 'stopped_by_user' } }) });
            ws.readyState = 3;
            ws.onclose?.();
            return;
          }
          ws.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result: {} }) });
        });
      },
      close() { ws.readyState = 3; queueMicrotask(() => ws.onclose?.()); },
    };
    queueMicrotask(() => { ws.readyState = 1; ws.onopen?.(); });
    return /** @type {any} */ (ws);
  };
  return { open, opened };
}

const until = async (/** @type {() => boolean} */ ok) => {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 2));
  assert.ok(ok());
};

for (const method of ['web.error', 'bridge.error']) {
  test(`${method}：自己重连带 again，人停的出卡、不问口令、接着试；「启动」不带 again，连上了收卡`, async () => {
    let off = false;
    const { open, opened } = host(() => off, method);
    let checks = 0;
    const conn = new Connection(open, [1], async () => { checks += 1; return 'ok'; });
    /** @type {string[]} */
    const cards = [];
    let rejoined = 0;
    conn.onStopped((message) => cards.push(message));
    // 照内核（`boot.js`）：线又开了重新握手，握手成了才算补完（`rejoined`）；那一头等到握手才去连核心
    conn.onReopen(() => { conn.request('hello', {}).then(() => conn.rejoined()).catch(() => {}); });
    conn.onRejoin(() => { rejoined += 1; });
    await conn.connect();
    assert.deepEqual(opened, [false], '刚打开：照常连');
    off = true;
    conn.ws?.close();
    await until(() => cards.length >= 2);
    assert.equal(cards[0], STOPPED, '卡的标题照那一头给的那一句');
    assert.ok(opened.slice(1).every((x) => x === true), '自己重连都带 again');
    assert.equal(checks, 0, '人停的不去问口令');
    off = false;
    const before = opened.length;
    await conn.start();
    assert.equal(opened[before], false, '「启动」照常连（那一头拉起核心）');
    await until(() => rejoined === 1);
    assert.equal(cards.length, cards.filter((c) => c === STOPPED).length);
  });
}

test('人停的拒等着的请求，原因码 stopped_by_user', async () => {
  const { open } = host(() => true);
  const conn = new Connection(open);
  await conn.connect(true);
  const err = await conn.request('hello', {}).catch((e) => e);
  assert.equal(err.reason, 'stopped_by_user');
  assert.equal(err.message, STOPPED);
});

test('线的地址：网页软件 /ws，重连 /ws?again=1；桥带口令 /ws?k=…，重连再接 &again=1', () => {
  const at = { protocol: 'http:', host: '127.0.0.1:8771' };
  assert.equal(socketUrl(at, null, false), 'ws://127.0.0.1:8771/ws');
  assert.equal(socketUrl(at, null, true), 'ws://127.0.0.1:8771/ws?again=1');
  assert.equal(socketUrl(at, 'abc', false), 'ws://127.0.0.1:8771/ws?k=abc');
  assert.equal(socketUrl(at, 'abc', true), 'ws://127.0.0.1:8771/ws?k=abc&again=1');
  assert.equal(socketUrl({ protocol: 'https:', host: 'x' }, null, false), 'wss://x/ws');
});

test('三种语言都有「启动」「正在启动…」「启动失败」，英文那一份不是中文', () => {
  for (const code of ['zh', 'en', 'ja']) {
    const text = JSON.parse(readFileSync(new URL(`../resources/text/${code}.json`, import.meta.url), 'utf8'));
    for (const got of [text.boot.start, text.boot.starting, text.boot.start_failed]) {
      assert.equal(typeof got, 'string', code);
      if (code === 'en') assert.doesNotMatch(got, /[一-鿿]/, got);
    }
  }
});

test('那一头先接了线、握手时才说连不上（人停的、拉不起来）：不算连上过，重连照退避一次比一次等得久，不每秒一次（W-1210 实测：原来线一开就把次数清零，一直隔 1 秒问）', async () => {
  const { open } = host(() => true);
  const conn = new Connection(open, [1, 2, 3]);
  conn.onReopen(() => { conn.request('hello', {}).catch(() => {}); });
  /** @type {string[]} */
  const cards = [];
  conn.onStopped((m) => cards.push(m));
  try {
    await conn.connect();
    conn.ws?.close();
    await until(() => cards.length >= 3);
    assert.ok(conn.tries >= 3, `退避往后走：${conn.tries}`);
  } finally {
    conn.close();
  }
});
