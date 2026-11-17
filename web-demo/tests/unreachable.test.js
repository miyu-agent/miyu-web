// @ts-check
//! 连不上核心的那张卡（蓝图 `web.md`「连核心」第 9 条，W-1204）：宿主那一头先接了线、后来连不上、拉不起核心的，推一条
//! `bridge.error`（演示的桥）或 `web.error`（网页软件），带核心那一整句原因。页面照它出「连不上核心」，原因照原话写；
//! 「核心断开了」照界面语言说。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRes } from './support.js';
import { Connection, Refusal } from '../src/core/connection.js';
import { signIn } from '../src/kernel/signin.js';
import { offline } from '../src/model/offline.js';

loadRes();

const WHY = 'The core cannot start: another program holds /tmp/x/run/core.sock';

/** 一条假线：开了以后不管发什么，推一条 `method`（带 `WHY`）再关 */
function refusing(method) {
  return () => {
    const ws = { readyState: 0, onopen: null, onmessage: null, onclose: null, onerror: null,
      send() {
        queueMicrotask(() => {
          ws.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method, params: { message: WHY } }) });
          ws.readyState = 3;
          ws.onclose?.();
        });
      },
      close() { ws.readyState = 3; },
    };
    queueMicrotask(() => { ws.readyState = 1; ws.onopen?.(); });
    return /** @type {any} */ (ws);
  };
}

for (const method of ['bridge.error', 'web.error']) {
  test(`线开了以后推 ${method}：等着的请求照那一句拒，原因码 core_unreachable，不是「核心断开了」`, async () => {
    const conn = new Connection(refusing(method));
    await conn.connect();
    const err = await conn.request('hello', {}).catch((e) => e);
    assert.ok(err instanceof Refusal);
    assert.equal(err.reason, 'core_unreachable');
    assert.equal(err.message, WHY);
  });

  test(`握手时推 ${method}：signIn 交给 offline 的是那一句`, async () => {
    const host = { kind: method === 'web.error' ? 'served' : 'browser', channel: refusing(method), check: async () => 'ok',
      credential: () => ({ login: 't' }), remember: () => {}, forget: () => {} };
    /** @type {any[]} */
    const told = [];
    const got = await signIn(/** @type {any} */ (host), { head: { kind: 'web' } }, /** @type {any} */ ({}), async (err) => {
      told.push(err);
      throw new Error('offline');
    }).catch((e) => e);
    assert.equal(got.message, 'offline');
    assert.equal(told.length, 1);
    assert.equal(told[0].reason, 'core_unreachable');
    assert.equal(told[0].message, WHY);
  });
}

test('卡：标题「连不上核心」，为什么照原话；走桥的叫看终端，网页软件的叫处理好再刷新', () => {
  const bridge = offline('core', WHY);
  assert.equal(bridge.title, '连不上核心');
  assert.equal(bridge.why, WHY);
  assert.match(bridge.how, /终端里的报错/);
  const served = offline('served', WHY);
  assert.equal(served.title, '连不上核心');
  assert.equal(served.why, WHY);
  assert.match(served.how, /刷新页面/);
});

test('三种语言都有卡的标题、网页软件的怎么办、「核心断开了」，英文、日文那一份不是中文', () => {
  for (const code of ['zh', 'en', 'ja']) {
    const text = JSON.parse(readFileSync(new URL(`../resources/text/${code}.json`, import.meta.url), 'utf8'));
    for (const got of [text.boot.core_title, text.boot.served_how, text.disconnected]) {
      assert.equal(typeof got, 'string', `${code}`);
      if (code === 'en') assert.doesNotMatch(got, /[一-鿿]/, got);
    }
  }
});

test('断了：等着的请求照界面的字拒（「核心断开了」不写死）', async () => {
  const conn = new Connection(() => { throw new Error('不开线'); });
  const err = await conn.request('hello', {}).catch((e) => e);
  assert.equal(err.reason, 'disconnected');
  assert.equal(err.message, '核心断开了');
});
