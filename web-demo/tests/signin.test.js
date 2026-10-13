// @ts-check
//! 起页面时握手（`src/kernel/signin.js`，蓝图 `web.md`「连核心」第 1 条下面几款）：被拒的几种写什么，「账号」那一屏查什么，
//! 走桥的不带凭据一次就成，登录令牌作废了的忘掉、重开一条线。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { refusedText, accountProblem, signIn } from '../src/kernel/signin.js';
import { Refusal } from '../src/core/connection.js';

loadRes();

/** 一条假的线：收到 `hello` 照 `answer(参数)` 回（抛 `Refusal` 的回成拒绝、回完断开）；记下每一次握手的参数。 */
function fakeLine(answer, sent) {
  return () => {
    const ws = { readyState: 0, onopen: null, onmessage: null, onclose: null, onerror: null,
      send(text) {
        const m = JSON.parse(text);
        sent.push(m.params);
        let reply;
        try {
          reply = { jsonrpc: '2.0', id: m.id, result: answer(m.params) };
        } catch (err) {
          reply = { jsonrpc: '2.0', id: m.id, error: { code: -32010, message: err.message, data: { reason: err.reason, ...(err.data ?? {}) } } };
        }
        queueMicrotask(() => ws.onmessage?.({ data: JSON.stringify(reply) }));
      },
      close() { ws.readyState = 3; queueMicrotask(() => ws.onclose?.()); },
    };
    queueMicrotask(() => { ws.readyState = 1; ws.onopen?.(); });
    return ws;
  };
}

test('被拒的几种：令牌作废的不写字（出登录框），密码不对、试太多次、链接用过了照原因写；别的交 null（照原来的出错走）', () => {
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_login')), '');
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_password')), '用户名或密码不对');
  assert.equal(refusedText(new Refusal('x', -32010, 'login_throttled', { retry_after_ms: 41200 })), '尝试次数过多，42 秒后再试');
  assert.match(refusedText(new Refusal('x', -32010, 'bad_code')) ?? '', /miyu web/);
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_params')), null);
  assert.equal(refusedText(new Error('x')), null);
});

test('「账号」那一屏：用户名照路径里的名字的写法，密码至少 8 个字节、不能全是空白，两次要一样', () => {
  assert.equal(accountProblem('admin', 'password1', 'password1'), null);
  assert.match(accountProblem('Admin', 'password1', 'password1') ?? '', /小写字母开头/);
  assert.match(accountProblem('admin', 'short', 'short') ?? '', /至少 8/);
  assert.match(accountProblem('admin', '        ', '        ') ?? '', /至少 8/);
  assert.equal(accountProblem('admin', '密码密码密码', '密码密码密码'), null, '照字节数：六个汉字 18 个字节');
  assert.match(accountProblem('admin', 'password1', 'password2') ?? '', /不一样/);
});

test('走桥的不带凭据一次就成；直接连的带记着的令牌，作废了的忘掉、重开一条线，回应里新给的令牌记下', async () => {
  const sent = [];
  const bridge = { kind: 'browser', channel: fakeLine(() => ({ view: 1 }), sent), check: async () => 'ok', credential: () => null, remember: () => {}, forget: () => {} };
  const got = await signIn(bridge, { head: { kind: 'web' } }, /** @type {any} */ ({}), async (err) => { throw err; });
  assert.equal(got.setup, false);
  assert.deepEqual(sent, [{ head: { kind: 'web' } }]);

  const calls = [];
  let token = 'old';
  const served = {
    kind: 'served', check: async () => 'down',
    channel: fakeLine((p) => {
      if (p.login === 'old') throw Object.assign(new Error('bad'), { reason: 'bad_login' });
      return { view: 1 };
    }, calls),
    credential: () => (token ? { login: token } : { code: 'c1' }),
    remember: (l) => { token = l.token; },
    forget: () => { token = null; },
  };
  const again = await signIn(served, { head: { kind: 'web' } }, /** @type {any} */ ({}), async (err) => { throw err; });
  assert.equal(again.setup, false);
  assert.deepEqual(calls.map((p) => p.login ?? p.code), ['old', 'c1'], '作废了的忘掉，下一次换别的凭据、新开一条线');
});
