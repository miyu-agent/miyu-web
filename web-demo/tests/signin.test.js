// @ts-check
//! 起页面时握手（`src/kernel/signin.js`，蓝图 `web.md`「连核心」第 1 条下面几款；核心 SU-1 起只有主人一个人）：被拒的几种写什么，
//! 「设置访问密码」那一屏查什么，走桥的不带凭据一次就成，设备令牌作废了的忘掉、重开一条线。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { refusedText, passwordProblem, signIn } from '../src/kernel/signin.js';
import { Refusal } from '../src/core/connection.js';

loadRes();

/** 一条假的线：收到 `hello` 照 `answer(参数, 方法)` 回（抛 `Refusal` 的回成拒绝、回完断开）；记下每一次握手的参数（`methods` 给了的另记方法名）。 */
function fakeLine(answer, sent, methods = []) {
  return () => {
    const ws = { readyState: 0, onopen: null, onmessage: null, onclose: null, onerror: null,
      send(text) {
        const m = JSON.parse(text);
        sent.push(m.params);
        methods.push(m.method);
        let reply;
        try {
          reply = { jsonrpc: '2.0', id: m.id, result: answer(m.params, m.method) };
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

test('被拒的几种：令牌作废、没带凭据、票作废、还没设访问密码的不写字（出对应的那一屏），密码不对、试太多次、链接用过了照原因写；别的交 null', () => {
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_login')), '');
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_token')), '');
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_ticket')), '');
  assert.equal(refusedText(new Refusal('x', -32010, 'password_not_set')), '');
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_password')), '访问密码错误');
  assert.equal(refusedText(new Refusal('x', -32010, 'login_throttled', { retry_after_ms: 41200 })), '尝试次数过多，42 秒后再试');
  assert.match(refusedText(new Refusal('x', -32010, 'bad_code')) ?? '', /miyu web/);
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_invite')), null, '没有邀请了（核心 SU-1）');
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_params')), null);
  assert.equal(refusedText(new Error('x')), null);
});

test('「设置访问密码」那一屏：至少 8 个字节、不能全是空白、最多 1024 个字节，两次要一样（核心 SU-1）', () => {
  assert.equal(passwordProblem('password1', 'password1'), null);
  assert.match(passwordProblem('short', 'short') ?? '', /至少 8/);
  assert.match(passwordProblem('        ', '        ') ?? '', /至少 8/);
  assert.equal(passwordProblem('密码密码密码', '密码密码密码'), null, '照字节数：六个汉字 18 个字节');
  assert.match(passwordProblem('a'.repeat(1025), 'a'.repeat(1025)) ?? '', /最多 1024/);
  assert.match(passwordProblem('password1', 'password2') ?? '', /不一样/);
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

test('握手回应给了新令牌的（票、密码换的）连同勾没勾自动登录一起记下；回应没有 account（核心 SU-1）', async () => {
  const kept = [];
  const fresh = {
    kind: 'served', check: async () => 'down',
    channel: fakeLine(() => ({ view: 1, login: { token: 'new', expires: 'x' } }), []),
    credential: () => ({ ticket: 'a'.repeat(64) }),
    remember: (/** @type {any} */ l, /** @type {boolean} */ k) => kept.push([l.token, k]),
    forget: () => {},
  };
  const got = await signIn(fresh, { head: { kind: 'web' } }, /** @type {any} */ ({}), async (err) => { throw err; });
  assert.deepEqual(kept, [['new', false]]);
  assert.equal('member' in got, false, '没有成员这一说了');
});
