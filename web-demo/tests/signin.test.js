// @ts-check
//! 起页面时握手（`src/kernel/signin.js`，蓝图 `web.md`「连核心」第 1 条下面几款）：被拒的几种写什么，「账号」那一屏查什么，
//! 走桥的不带凭据一次就成，登录令牌作废了的忘掉、重开一条线。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { refusedText, accountProblem, registerProblem, signIn, accessOf } from '../src/kernel/signin.js';
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

test('被拒的几种：令牌作废的不写字（出登录框），密码不对、试太多次、链接用过了照原因写；别的交 null（照原来的出错走）', () => {
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_login')), '');
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_password')), '用户名或密码不对');
  assert.equal(refusedText(new Refusal('x', -32010, 'login_throttled', { retry_after_ms: 41200 })), '尝试次数过多，42 秒后再试');
  assert.match(refusedText(new Refusal('x', -32010, 'bad_code')) ?? '', /miyu web/);
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_params')), null);
  assert.equal(refusedText(new Error('x')), null);
});

test('「账号」那一屏：用户名照账号编号的写法（核心 Y-12 中上：注册的是机主），密码至少 8 个字节、不能全是空白，两次要一样', () => {
  assert.equal(accountProblem('shorin', 'password1', 'password1'), null);
  assert.match(accountProblem('my_name', 'password1', 'password1') ?? '', /小写字母开头/, '账号编号不收下划线');
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

test('凭邀请码注册（核心 Y-1 上）：邀请码不对的照原因写；用户名照账号编号的写法（没有 _、不能叫 users），密码同「账号」那一屏', () => {
  assert.equal(refusedText(new Refusal('x', -32010, 'bad_invite')), '邀请码不对、过期了或已经用过');
  assert.equal(registerProblem('bob-2', 'password1', 'password1'), null);
  assert.match(registerProblem('bob_2', 'password1', 'password1') ?? '', /小写字母开头/);
  assert.match(registerProblem('users', 'password1', 'password1') ?? '', /小写字母开头/);
  assert.match(registerProblem('bob', 'short', 'short') ?? '', /至少 8/);
  assert.match(registerProblem('bob', 'password1', 'password2') ?? '', /不一样/);
});

test('是谁：握手带 admin 的照它（核心 Y-2下下中上）；没带的先试 persona.list（被拒是 Y-2 以前的成员）、再试 config.get（被拒是 Y-2下下上 的成员）；走桥的、admin 不试', async () => {
  const no = () => { throw new Refusal('没有权限。', -32010, 'not_permitted'); };
  /** 假核心：`refuse` 里的方法回 not_permitted，别的回空对象；记下问了哪几个 @param {string[]} refuse */
  const core = (refuse) => {
    const asked = /** @type {string[]} */ ([]);
    return { asked, request: async (/** @type {string} */ m) => { asked.push(m); if (refuse.includes(m)) no(); return {}; } };
  };
  const c1 = core([]);
  assert.equal(await accessOf(c1, { account: 'bob', admin: false }), 'member', 'hello 带 admin 的不试');
  assert.equal(await accessOf(c1, { account: 'bob', admin: true }), 'owner');
  assert.equal(await accessOf(c1, { view: 1 }), 'owner', '走桥的、没带账号的是机主');
  assert.equal(await accessOf(c1, { account: 'admin' }), 'owner');
  assert.deepEqual(c1.asked, []);
  const member = core(['config.get']);
  assert.equal(await accessOf(member, { account: 'bob' }), 'member-old', '老核心：配置调不了');
  assert.deepEqual(member.asked, ['persona.list', 'config.get']);
  const old = core(['persona.list', 'config.get']);
  assert.equal(await accessOf(old, { account: 'bob' }), 'blocked', 'Y-2 以前：人格都调不了');
  assert.deepEqual(old.asked, ['persona.list'], '被挡的不再试第二样');
  assert.equal(await accessOf(core([]), { account: 'shorin' }), 'owner', '起了名字的机主照样认出来');
  // 别的错（旧核心没有这个方法）不算被拒
  const odd = { request: async () => { throw new Refusal('x', -32601, null); } };
  assert.equal(await accessOf(odd, { account: 'bob' }), 'owner');

  // 连起来：成员照常起页面，交回 member
  const sent = [];
  const methods = [];
  const served = {
    kind: 'served', check: async () => 'down',
    channel: fakeLine((p, m) => (m === 'config.get' ? no() : m === 'hello' ? { view: 1, account: 'bob' } : {}), sent, methods),
    credential: () => ({ login: 'tok' }), remember: () => {}, forget: () => {},
  };
  const got = await signIn(served, { head: { kind: 'web' } }, /** @type {any} */ ({}), async (err) => { throw err; });
  assert.equal(got.hello.account, 'bob');
  assert.equal(got.member, true);
  assert.equal(got.configless, true, '试探出来的是老核心上的成员');
  assert.deepEqual(methods, ['hello', 'persona.list', 'config.get']);
  const admin = [];
  const bridgeGot = await signIn({ ...served, channel: fakeLine(() => ({ view: 1, account: 'admin' }), admin) }, { head: { kind: 'web' } }, /** @type {any} */ ({}), async (err) => { throw err; });
  assert.equal(admin.length, 1, '管理员只握手');
  assert.equal(bridgeGot.member, false);
  assert.equal(bridgeGot.configless, false);
});
