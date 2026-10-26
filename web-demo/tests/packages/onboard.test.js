// @ts-check
//! 接一家供应商的纯逻辑（蓝图 `web.md`「第一次引导」第 5–7 条，照核心 `cli/setup.md`）：编号怎么起、选一家那一屏的几行和标记、
//! `provider.test` 带什么、存的时候写哪几项、没测成写什么。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configId, customId, validUrl, cleanUrl, providerRows, testParams, setupChanges, noPools, modelOrder, filterNames, failureOf, usableIds, customIdProblem } from '../../packages/settings/onboard/logic.js';

test('目录里的编号不合写法的换成配置里的写法', () => {
  assert.equal(configId('deepseek'), 'deepseek');
  assert.equal(configId('302ai'), 'p-302ai');
  assert.equal(configId('wafer.ai'), 'wafer-ai');
  assert.equal(configId('moonshotai-cn'), 'moonshotai-cn');
  assert.equal(configId('x'.repeat(40)).length, 32);
});

test('自定义的编号照主机名起，本机的是 local，重了加 -2', () => {
  const none = new Set();
  assert.equal(customId('https://api.example.com/v1', none), 'example');
  assert.equal(customId('https://api.example.co.uk/v1', none), 'example');
  assert.equal(customId('https://302.ai/v1', none), 'p-302');
  assert.equal(customId('http://localhost:11434/v1', none), 'local');
  assert.equal(customId('http://127.0.0.1:1234/v1', none), 'local');
  assert.equal(customId('http://[::1]:8080/v1', none), 'local');
  assert.equal(customId('https://relay.io', none), 'relay');
  assert.equal(customId('https://api.example.com/v1', new Set(['example', 'example-2'])), 'example-3');
});

test('地址要 http(s) 开头，去掉末尾的斜杠', () => {
  assert.equal(validUrl('https://api.example.com/v1'), true);
  assert.equal(validUrl('http://localhost:1234'), true);
  assert.equal(validUrl('api.example.com'), false);
  assert.equal(validUrl('ftp://x'), false);
  assert.equal(validUrl('https://'), false);
  assert.equal(cleanUrl('  https://a.b/v1// '), 'https://a.b/v1');
});

test('选一家：配好的、找到密钥的、用不了的照标，本机的写主机和端口', () => {
  const featured = [
    { id: 'deepseek', name: 'DeepSeek', supported: true },
    { id: 'openai', name: 'OpenAI', supported: true },
    { id: 'anthropic', name: 'Anthropic', supported: false },
    { id: 'opencode', name: 'opencode Zen', supported: true },
  ];
  const detect = {
    keys: [
      { env: 'DEEPSEEK_API_KEY', provider: 'deepseek', supported: true },
      { env: 'ANTHROPIC_API_KEY', provider: 'anthropic', supported: false },
      { env: 'OPENAI_API_KEY', provider: 'openai', supported: true, configured: 'work' },
    ],
    local: [{ provider: 'lmstudio', name: 'LMStudio', base_url: 'http://127.0.0.1:1234/v1', models: ['q'] }, { provider: 'ollama', name: 'Ollama', base_url: 'http://localhost:11434/v1', configured: 'ollama' }],
  };
  const rows = providerRows(featured, detect, new Set(['opencode']));
  assert.deepEqual(rows.common.map((r) => [r.id, r.kind === 'catalog' && r.env, r.configured, r.kind === 'catalog' && r.supported]), [
    ['deepseek', 'DEEPSEEK_API_KEY', null, true],
    ['openai', 'OPENAI_API_KEY', 'work', true],
    ['anthropic', null, null, false],
    ['opencode', null, 'opencode', true],
  ]);
  assert.deepEqual(rows.local.map((r) => [r.id, r.kind === 'local' && r.host, r.configured]), [['lmstudio', '127.0.0.1:1234', null], ['ollama', 'localhost:11434', 'ollama']]);
  assert.deepEqual(providerRows([], null, new Set()), { common: [], local: [] });
});

test('测试的参数：配好的带 provider，别的带 candidate，贴的密钥照 value 交', () => {
  assert.deepEqual(testParams({ kind: 'configured', id: 'deepseek' }, null, null), { provider: 'deepseek' });
  assert.deepEqual(testParams({ kind: 'catalog', catalog: 'deepseek', env: null }, { value: 'sk-1' }, null), { candidate: { catalog: 'deepseek', key: { value: 'sk-1' } } });
  assert.deepEqual(testParams({ kind: 'catalog', catalog: 'deepseek', env: 'DEEPSEEK_API_KEY' }, { env: 'DEEPSEEK_API_KEY' }, null), { candidate: { catalog: 'deepseek', key: { env: 'DEEPSEEK_API_KEY' } } });
  assert.deepEqual(testParams({ kind: 'local', catalog: 'lmstudio' }, null, null), { candidate: { catalog: 'lmstudio' } });
  assert.deepEqual(testParams({ kind: 'custom', driver: 'anthropic', base_url: 'https://r.example.com/v1' }, null, 'm-1'), { candidate: { driver: 'anthropic', base_url: 'https://r.example.com/v1' }, model: 'm-1' });
});

test('配好了的一家「重新设置」贴了新的密钥：照它的接口、地址当候选测，存的时候照同一个编号写新的 key（2026-10-24 项目主人）', () => {
  const zen = { kind: /** @type {const} */ ('configured'), id: 'deepseek', driver: 'openai-chat', base_url: 'https://api.deepseek.com' };
  assert.deepEqual(testParams(zen, { value: 'sk-2' }, null), { candidate: { driver: 'openai-chat', base_url: 'https://api.deepseek.com', key: { value: 'sk-2' } } });
  assert.deepEqual(testParams(zen, null, null), { provider: 'deepseek' }, '没贴的照配置里那一份测');
  assert.deepEqual(testParams({ kind: 'configured', id: 'deepseek' }, { value: 'sk-2' }, null), { provider: 'deepseek' }, '不知道地址的照配置里那一份测');
  assert.deepEqual(setupChanges(zen, { secret: 'deepseek-new' }, { chat: null, taken: new Set() }), { id: 'deepseek', changes: [{ key: 'providers.deepseek.key', value: { secret: 'deepseek-new' } }] });
  assert.deepEqual(setupChanges(zen, null, { chat: null, taken: new Set() }).changes, [], '跳过、没贴新的：什么都不写');
});

test('另配一份自用的（2026-10-26 项目主人）：照填的接口、地址、密钥当候选测；存同一个编号的密钥，地址、接口改了的才写', () => {
  const from = { driver: 'openai-chat', base_url: 'http://127.0.0.1:18792/v1' };
  const same = { kind: /** @type {const} */ ('copy'), id: 'relay', driver: 'openai-chat', base_url: 'http://127.0.0.1:18792/v1', from };
  assert.deepEqual(testParams(same, { value: 'sk-1' }, null), { candidate: { driver: 'openai-chat', base_url: 'http://127.0.0.1:18792/v1', key: { value: 'sk-1' } } });
  assert.deepEqual(setupChanges(same, { secret: 'relay-1' }, { taken: new Set() }), { id: 'relay', changes: [{ key: 'providers.relay.key', value: { secret: 'relay-1' } }] }, '地址、接口没改的照共用那份');
  const moved = { ...same, driver: 'anthropic', base_url: 'https://other.example.com/v1' };
  assert.deepEqual(setupChanges(moved, { secret: 'relay-1' }, { taken: new Set() }).changes, [
    { key: 'providers.relay.key', value: { secret: 'relay-1' } },
    { key: 'providers.relay.base_url', input: 'https://other.example.com/v1' },
    { key: 'providers.relay.driver', value: 'anthropic' },
  ]);
});

test('存：目录里的一家写密钥，改过写法的另写 catalog，本机的写 local，自定义写接口和地址，没池的建三个', () => {
  const taken = new Set(['example']);
  assert.deepEqual(setupChanges({ kind: 'catalog', catalog: 'deepseek', env: null }, { secret: 'deepseek-abc' }, { chat: 'deepseek-v4', taken }), {
    id: 'deepseek',
    changes: [{ key: 'providers.deepseek.key', value: { secret: 'deepseek-abc' } }, { key: 'models.chat', value: 'deepseek/deepseek-v4' }],
  });
  assert.deepEqual(setupChanges({ kind: 'catalog', catalog: '302ai', env: 'X' }, { env: 'X' }, { taken }).changes, [
    { key: 'providers.p-302ai.catalog', value: '302ai' },
    { key: 'providers.p-302ai.key', value: { env: 'X' } },
  ]);
  assert.deepEqual(setupChanges({ kind: 'local', catalog: 'lmstudio' }, null, { taken }).changes, [{ key: 'providers.lmstudio.local', value: true }]);
  assert.deepEqual(setupChanges({ kind: 'custom', driver: 'anthropic', base_url: 'https://api.example.com/v1' }, null, { chat: 'm', taken }), {
    id: 'example-2',
    changes: [
      { key: 'providers.example-2.driver', value: 'anthropic' },
      { key: 'providers.example-2.base_url', input: 'https://api.example.com/v1' },
      { key: 'models.chat', value: 'example-2/m' },
    ],
  });
  const pooled = setupChanges({ kind: 'configured', id: 'zen' }, null, { chat: 'big', pools: true, taken });
  assert.equal(pooled.id, 'zen');
  assert.deepEqual(pooled.changes.map((c) => c.key), ['models.chat', 'pools.lite.models', 'pools.lite.subagent', 'pools.standard.models', 'pools.standard.subagent', 'pools.flagship.models', 'pools.flagship.subagent']);
  assert.deepEqual(pooled.changes[1], { key: 'pools.lite.models', value: [] });
  assert.equal(noPools({ 'models.chat': {} }), true);
  assert.equal(noPools({ 'pools.fast.models': {} }), false);
});

test('模型的先后：试的那一个排第一，去重；搜索不分大小写', () => {
  assert.deepEqual(modelOrder(['a', 'b', 'c', 'b'], 'c'), ['c', 'a', 'b']);
  assert.deepEqual(modelOrder(['a'], null), ['a']);
  assert.deepEqual(filterNames(['DeepSeek-V4', 'gpt-5'], 'deep'), ['DeepSeek-V4']);
  assert.deepEqual(filterNames(['a', 'b'], '  '), ['a', 'b']);
});

test('没测成：核心说要模型名的要填模型名，列模型时认证错的照分类，配置错的、别的照分类，带状态码（核心 8-11 五补）', () => {
  assert.deepEqual(failureOf({ ok: false, stage: 'list', need_model: true, error: { class: 'other', message: 'no models listed' } }), { key: 'onboard.no_list', status: null, needsModel: true, message: 'no models listed' });
  assert.deepEqual(failureOf({ ok: false, stage: 'list', error: { class: 'auth', status: 401, message: 'bad key' } }), { key: 'onboard.classes.auth', status: 401, needsModel: false, message: 'bad key' });
  assert.deepEqual(failureOf({ ok: false, stage: 'config', error: { class: 'no_model', message: 'needs base_url' } }).key, 'onboard.config_error');
  assert.deepEqual(failureOf({ ok: false, stage: 'request', error: { class: 'auth', status: 401, message: 'bad key' } }), { key: 'onboard.classes.auth', status: 401, needsModel: false, message: 'bad key' });
  assert.equal(failureOf({ ok: false, stage: 'request', error: { class: 'weird' } }).key, 'onboard.classes.other');
});

test('配好了的照密钥取不取得到算：引用的密钥没了的不算，没写密钥的算（2026-10-13 项目主人实测）', () => {
  const got = usableIds([
    { id: 'deepseek', key: { ref: 'secret:deepseek-1', set: false } },
    { id: 'magpie', key: { ref: 'secret:magpie-1', set: true } },
    { id: 'local', models: [] },
  ]);
  assert.deepEqual([...got].sort(), ['local', 'magpie']);
  const rows = providerRows([{ id: 'deepseek', name: 'DeepSeek', supported: true }], null, got);
  assert.equal(rows.common[0].configured, null, '密钥没了的那一家照没配过的走，不标已配置');
});

test('自定义的编号：人起的照它存，写法不对、重了的说哪里不对（2026-10-13 项目主人）', () => {
  assert.equal(customIdProblem('my-relay', new Set(['dev'])), null);
  assert.equal(customIdProblem('My', new Set()), 'bad_id');
  assert.equal(customIdProblem('9x', new Set()), 'bad_id');
  assert.equal(customIdProblem('dev', new Set(['dev'])), 'taken_id');
  const { id, changes } = setupChanges({ kind: 'custom', driver: 'openai-chat', base_url: 'https://api.example.com/v1', id: 'my-relay' }, null, { taken: new Set() });
  assert.equal(id, 'my-relay');
  assert.ok(changes.some((c) => c.key === 'providers.my-relay.base_url'));
  assert.equal(setupChanges({ kind: 'custom', driver: 'openai-chat', base_url: 'https://api.example.com/v1' }, null, { taken: new Set() }).id, 'example', '没起的照主机名');
});

test('找模型：空格分开的几个词都要有，词也可以跳着；连着含着的排前面（2026-10-23 项目主人：搜索不支持模糊搜索）', async () => {
  const { filterNames } = await import('../../packages/settings/onboard/logic.js');
  const list = ['clinepass/cline-free/mimo-v2.6-flash', 'clinepass/cline-pass/deepseek-v4.1-flash', 'deepseek/deepseek-flash', 'anthropic/claude-haiku-5-5'];
  assert.deepEqual(filterNames(list, 'cline deepseek'), ['clinepass/cline-pass/deepseek-v4.1-flash']);
  assert.deepEqual(filterNames(list, 'dsflash'), ['clinepass/cline-pass/deepseek-v4.1-flash', 'deepseek/deepseek-flash']);
  assert.deepEqual(filterNames(list, 'flash'), ['clinepass/cline-free/mimo-v2.6-flash', 'clinepass/cline-pass/deepseek-v4.1-flash', 'deepseek/deepseek-flash']);
  assert.deepEqual(filterNames(list, '  '), list);
});

test('自定义的显示名称写进 providers.<id>.name，空着的不写', async () => {
  const { setupChanges } = await import('../../packages/settings/onboard/logic.js');
  const named = setupChanges({ kind: 'custom', driver: 'openai-chat', base_url: 'http://h:1/v1', id: 'magpie', name: 'Magpie 中转' }, null, { taken: new Set() });
  assert.ok(named.changes.some((c) => c.key === 'providers.magpie.name' && c.value === 'Magpie 中转'));
  const plain = setupChanges({ kind: 'custom', driver: 'openai-chat', base_url: 'http://h:1/v1', id: 'magpie', name: null }, null, { taken: new Set() });
  assert.ok(!plain.changes.some((c) => c.key === 'providers.magpie.name'));
});

test('配置里有、常用和本机里都没有的几家另列一组「已配好」（2026-10-23 项目主人：建好了自定义的点了返回，列表里没有）', async () => {
  const { mineRows } = await import('../../packages/settings/onboard/logic.js');
  const shown = [{ kind: 'catalog', id: 'deepseek', name: 'DeepSeek', supported: true, configured: 'deepseek', env: null }];
  const rows = mineRows([{ id: 'deepseek', name: 'DeepSeek' }, { id: 'magpie', name: { value: 'Magpie 中转' } }, { id: 'local2' }], shown);
  assert.deepEqual(rows.map((r) => [r.kind, r.id, r.name, r.configured]), [['mine', 'magpie', 'Magpie 中转', 'magpie'], ['mine', 'local2', 'local2', 'local2']]);
});
