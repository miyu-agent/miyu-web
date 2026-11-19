// @ts-check
//! 设置页左栏的分组、软件包页的筛选和搜索、一项配置归哪个包（`packages/settings/model.js`，蓝图 `web.md`「设置页」第 3、13 条；2026-10-20 项目主人）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navGroups, pkgKinds, pkgTag, pkgMatch, pkgWords, ownerOf, search } from '../../packages/settings/model.js';

const ORDER = ['general', 'user', 'models', 'usage', 'personas', 'memory', 'knowledge', 'presets', 'skills', 'scripts', 'mcp', 'packages', 'backstage', 'advanced'];

test('左栏分四组：开头那一页起是新的一组；order 里没有的（核心多出来的页）算最后一组', () => {
  const g = navGroups(ORDER, ['personas', 'skills', 'packages']);
  assert.deepEqual(ORDER.map(g), [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
  assert.equal(g('something-new'), 3);
  // 开头写了不在 order 里的不算
  assert.deepEqual(['general', 'personas'].map(navGroups(ORDER, ['nope', 'personas'])), [0, 1]);
  assert.equal(navGroups(ORDER, [])('advanced'), 0);
});

test('一个包落在哪几个筛选：照它带了什么，一个包带好几样的几个里都有', () => {
  assert.deepEqual(pkgKinds({ kind: 'builtin' }), ['builtin']);
  assert.deepEqual(pkgKinds({ kind: 'process', connection: { platform: 'qq' } }), ['extension', 'connection']);
  assert.deepEqual(pkgKinds({ kind: 'worker' }), ['extension']);
  assert.deepEqual(pkgKinds({ kind: 'ui' }), ['ui']);
  assert.deepEqual(pkgKinds({ kind: 'process', mascot: { model: 'x' }, mcp: [{ name: 'a' }] }), ['extension', 'mascot', 'mcp']);
  assert.deepEqual(pkgKinds({ kind: 'bundle', mcp: [] }), []);
  assert.deepEqual(pkgKinds({ kind: 'mascot' }), ['mascot']);
});

test('小标签：接入的写接入，只带技能脚本的 bundle 写技能包、带服务的写 MCP', () => {
  assert.equal(pkgTag({ kind: 'process', connection: { platform: 'qq' } }), 'connection');
  assert.equal(pkgTag({ kind: 'process' }), 'extension');
  assert.equal(pkgTag({ kind: 'bundle' }), 'bundle');
  assert.equal(pkgTag({ kind: 'bundle', mcp: [{ name: 'gh' }] }), 'mcp');
  assert.equal(pkgTag({ kind: 'ui' }), 'ui');
  assert.equal(pkgTag({ kind: 'builtin' }), 'builtin');
  assert.equal(pkgTag({ kind: 'unheard-of' }), 'builtin');
});

test('搜索：名字、说明、编号里有就算，不分大小写，空的都算', () => {
  assert.ok(pkgMatch('', '联网搜索'));
  assert.ok(pkgMatch('  ', null));
  assert.ok(pkgMatch('搜索', '联网搜索', null, 'net'));
  assert.ok(pkgMatch('NET', '联网搜索', '', 'net'));
  assert.ok(!pkgMatch('mermaid', '联网搜索', '搜网页', 'net'));
});

test('一项配置归哪个包：package 对得上照它，对不上照键的头一段（联网搜索的 key 在组 net_keys），都对不上的是 null', () => {
  const ids = new Set(['net', 'memory']);
  assert.equal(ownerOf({ key: 'net.search.source', package: 'net' }, ids), 'net');
  assert.equal(ownerOf({ key: 'net.search.exa.key', package: 'net_keys' }, ids), 'net');
  assert.equal(ownerOf({ key: 'memory.extract_idle', package: 'memory' }, ids), 'memory');
  assert.equal(ownerOf({ key: 'packages.source', package: 'source' }, ids), null);
  assert.equal(ownerOf({ key: 'whatever' }, ids), null);
});

test('只有网页界面的（只装了桌面端）不列「默认界面」和「终端会话」那一组', async () => {
  const { headless } = await import('../../packages/settings/model.js');
  assert.deepEqual(headless([{ package: 'webui' }]), ['ui.head', 'terminal.']);
  assert.deepEqual(headless([]), ['ui.head', 'terminal.']);
  assert.deepEqual(headless([{ package: 'webui' }, { package: 'tui' }]), []);
});

test('选人格、知识库的选项（核心设计 53 第四节）：人格写错的不列，名字没有的写编号', async () => {
  const { pickOptions } = await import('../../packages/settings/model.js');
  assert.deepEqual(pickOptions('persona', { personas: [{ persona: 'miyu', name: 'Miyu' }, { persona: 'bad', problem: 'x' }, { persona: 'neko' }] }),
    [{ value: 'miyu', name: 'Miyu' }, { value: 'neko', name: 'neko' }]);
  assert.deepEqual(pickOptions('knowledge', { bases: [{ id: 'docs', name: '文档' }, { id: 'raw' }] }), [{ value: 'docs', name: '文档' }, { value: 'raw', name: 'raw' }]);
  assert.deepEqual(pickOptions('preset', { presets: [{ preset: 'full', name: '全功能' }, { preset: 'bad', problem: 'x' }, { preset: 'mine' }, { preset: null, name: '无工具' }] }),
    [{ value: 'full', name: '全功能' }, { value: 'mine', name: 'mine' }], '预设（W-1096）：写错的、旧核心的「无工具」不列');
  assert.deepEqual(pickOptions('knowledge', null), []);
});

/** 联网搜索包（核心 `package.list` 的样子，连接是中文：名字只有中文的；功能的编号是英文的） */
const NET = { package: 'base-net', name: '联网搜索', summary: '搜网页、读网页', features: [{ id: 'web-search', name: '网络搜索' }, { id: 'web-fetch', name: '抓取网页', summary: '把网页读成正文' }] };

test('搜 web 找得到联网搜索（2026-11-17 主人验收第 10 条，W-1206）：包的功能编号、功能名字也算；「-」「_」「.」当空格，web search 也找得到', () => {
  assert.ok(!pkgMatch('web', NET.name, NET.summary, NET.package), '原来只看名字、说明、编号：找不到');
  assert.ok(pkgMatch('web', ...pkgWords(NET)));
  assert.ok(pkgMatch('Web Search', ...pkgWords(NET)));
  assert.ok(pkgMatch('网络搜索', ...pkgWords(NET)));
  assert.ok(pkgMatch('正文', ...pkgWords(NET)), '功能的说明也算');
  assert.ok(!pkgMatch('mermaid', ...pkgWords(NET)));
  assert.deepEqual(pkgWords({ package: 'x' }), [null, null, 'x'], '没有功能的照旧三样');
});

test('配置项的搜索也带上它归的那个包的字：搜 web 列出联网搜索的设置项（W-1206）', () => {
  const item = { key: 'net.search.source', name: '联网服务', description: 'AI 用哪家服务搜网页', problems: [] };
  const other = { key: 'log.level', name: '运行日志的级别', description: '', problems: [] };
  const pages = [{ id: 'packages', name: '软件包', problems: [], groups: [{ id: 'net', name: '联网搜索', items: [item, other] }] }];
  assert.deepEqual(search(pages, 'web'), [], '只看自己的名字、键、说明：找不到');
  const more = (/** @type {any} */ it) => (it.key.startsWith('net.') ? pkgWords(NET) : []);
  assert.deepEqual(search(pages, 'web', more).map((f) => f.item.key), ['net.search.source']);
  assert.deepEqual(search(pages, 'net search', more).map((f) => f.item.key), ['net.search.source'], '键里的点当空格');
});

test('英文名字也能搜（核心 NS-1：连接不是英文时，config.schema 的项、组和 package.list 的包带 name_en）：中文界面打 web 找得到「网络搜索」（W-1210）', async () => {
  const { buildPages } = await import('../../packages/settings/model.js');
  const schema = {
    pages: [{ id: 'packages', name: '软件包' }],
    groups: [{ id: 'net', name: '联网搜索', name_en: 'Web Search', page: 'packages' }, { id: 'log', name: '运行日志', page: 'packages' }],
    items: [
      { key: 'net.search.source', name: '网络搜索', name_en: 'Search provider', description: '', page: 'packages', group: 'net', layers: ['system'] },
      { key: 'net.fetch.mode', name: '抓取方式', description: '', page: 'packages', group: 'net', layers: ['system'] },
      { key: 'log.level', name: '运行日志的级别', name_en: 'Log level', description: '', page: 'packages', group: 'log', layers: ['system'] },
    ],
  };
  const pages = buildPages(/** @type {any} */ (schema), { items: {} });
  assert.deepEqual(search(pages, 'search provider').map((f) => f.item.key), ['net.search.source'], '项的英文名字');
  assert.deepEqual(search(pages, 'web').map((f) => f.item.key), ['net.search.source', 'net.fetch.mode'], '组的英文名字：那一组的项都算');
  assert.deepEqual(search(pages, 'log level').map((f) => f.item.key), ['log.level']);
  const pkg = { package: 'base-net', name: '联网搜索', name_en: 'Networking', summary: '搜网页' };
  assert.ok(pkgMatch('networking', ...pkgWords(pkg)), '包的英文名字');
});

test('借来的值（核心 NS-1：value 是 null，来源 {layer: inherited, from: providers.<编号>.key}）：写「已继承自 <供应商的名字>」，不当空的（W-1210）', async () => {
  const { inheritedFrom } = await import('../../packages/settings/model.js');
  const models = { providers: [{ id: 'deepseek', name: { value: 'DeepSeek 官方' }, models: [] }, { id: 'bare', models: [] }] };
  const entry = (from) => ({ value: null, origin: { layer: 'inherited', from }, layers: [] });
  assert.equal(inheritedFrom(entry('providers.deepseek.key'), models), 'DeepSeek 官方', '照模型列表里那一家的显示名');
  assert.equal(inheritedFrom(entry('providers.bare.key'), models), 'bare', '没写名字的照编号');
  assert.equal(inheritedFrom(entry('providers.gone.key'), null), 'gone', '模型列表还没读到的照编号');
  assert.equal(inheritedFrom(entry('net.other.key'), models), 'net.other.key', '不是供应商的照原样写那一项');
  assert.equal(inheritedFrom({ value: null, origin: { layer: 'default' } }, models), null, '默认的不是借来的');
  assert.equal(inheritedFrom({ value: 'x', origin: { layer: 'system' } }, models), null);
  assert.equal(inheritedFrom(null, models), null);
});

test('软件包带的供应商（核心 PV-4：几项的来源是 {layer: package, package}）：那一家交包的编号，头下面写「来自软件包 <包的名字>」（W-1227）', async () => {
  const { providerPackage, packageNames } = await import('../../packages/settings/model.js');
  const packaged = (value) => ({ value, origin: { layer: 'package', package: 'acme-suite' }, layers: [] });
  const system = (value) => ({ value, origin: { file: 'config.toml', layer: 'system', line: 3 }, layers: [{ origin: { layer: 'system' }, value, used: true }] });
  const got = { items: {
    'providers.acme.name': system('我改的名字'),
    'providers.acme.base_url': packaged('https://acme.example.invalid/v1'),
    'providers.mine.name': system('自己的'),
    'providers.acme-2.name': system('另一家'),
    'packages.acme-suite.enabled': { value: true, origin: { layer: 'package' }, layers: [] },
  } };
  assert.equal(providerPackage('acme', got), 'acme-suite', '有一项是包给的就是包带的那一家');
  assert.equal(providerPackage('mine', got), null, '自己写的不是');
  assert.equal(providerPackage('acme-2', got), null, '编号是前缀的另一家不算');
  assert.equal(providerPackage('acme', null), null, '配置还没读到');
  const overridden = { items: { 'providers.acme.name': system('全改了'), 'providers.acme.package': system('acme-suite') } };
  assert.equal(providerPackage('acme', overridden), 'acme-suite', '人全改了的照核心写的 providers.<编号>.package');
  assert.equal(providerPackage('acme', { items: { 'packages.acme.enabled': { value: true, origin: { layer: 'package' } } } }), null, '包的「启用」不带 package，不算');
  assert.deepEqual(packageNames([{ package: 'acme-suite', name: 'Acme 全家桶' }], ['acme-suite']), ['Acme 全家桶'], '名字照 package.list');
  assert.deepEqual(packageNames([], ['acme-suite']), ['acme-suite'], '取不到的写编号');
  const { readFileSync } = await import('node:fs');
  const manifest = JSON.parse(readFileSync(new URL('../../packages/settings/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.text.zh.models.from_package, '来自软件包 {name}');
});
