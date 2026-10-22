// 网址的 MCP 服务的浏览器登录（蓝图 `web.md`「设置页」第 20 条；核心 X-42 上）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { needsLogin, loginState, loginText, loginError } from '../../packages/settings/mcp-login.js';

const LOGIN = { name: 'notion', state: 'stopped', reason: 'needs_login' };

test('要登录的：停着、原因是 needs_login；关着的、被替代了的、别的原因停的不算', () => {
  assert.equal(needsLogin(LOGIN, true), true);
  assert.equal(needsLogin(LOGIN, false), false);
  assert.equal(needsLogin({ ...LOGIN, covered: true }, true), false);
  assert.equal(needsLogin({ ...LOGIN, reason: 'failed_repeatedly' }, true), false);
  assert.equal(needsLogin({ ...LOGIN, state: 'running' }, true), false);
});

test('记着的「等待」、拒了的话：登录成了（不再要登录）就清掉', () => {
  const dialog = {};
  assert.deepEqual(loginState(dialog, LOGIN, true), { needs: true, waiting: false, error: null });
  dialog.mcpLogin.waiting.add('notion');
  dialog.mcpLogin.errors.set('notion', '登录失败');
  assert.deepEqual(loginState(dialog, LOGIN, true), { needs: true, waiting: true, error: '登录失败' });
  assert.deepEqual(loginState(dialog, { ...LOGIN, state: 'running', reason: null }, true), { needs: false, waiting: false, error: null });
  assert.equal(dialog.mcpLogin.waiting.has('notion'), false);
  assert.equal(dialog.mcpLogin.errors.has('notion'), false);
});

test('状态的字、拒了的话照错误码', () => {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => (f ? `${k}:${JSON.stringify(f)}` : k);
  assert.equal(loginText(t, { waiting: false }), 'mcp_login.needs');
  assert.equal(loginText(t, { waiting: true }), 'mcp_login.waiting');
  assert.equal(loginError(t, { reason: 'oauth_unregistered', message: 'x' }), 'mcp_login.unregistered');
  assert.equal(loginError(t, { reason: 'oauth_failed', message: 'x', data: { why: 'invalid_client' } }), 'mcp_login.failed_why:{"why":"invalid_client"}');
  assert.equal(loginError(t, { reason: 'oauth_failed', message: 'x' }), 'mcp_login.failed');
  assert.equal(loginError(t, { reason: 'bad_params', message: '这张表写了令牌' }), '这张表写了令牌');
});

test('三种语言都有登录的字', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../packages/settings/manifest.json', import.meta.url), 'utf8'));
  for (const lang of ['zh', 'en', 'ja']) {
    const text = manifest.text[lang];
    for (const k of ['needs', 'waiting', 'login', 'reopen', 'blocked', 'unregistered', 'failed', 'failed_why']) assert.ok(text.mcp_login[k], `${lang} mcp_login.${k}`);
    assert.ok(text.pkg.mcp_login, `${lang} pkg.mcp_login`);
    assert.ok(text.ext.reason.needs_login, `${lang} ext.reason.needs_login`);
    assert.ok(text.mcp_login.failed_why.includes('{why}'));
  }
});
