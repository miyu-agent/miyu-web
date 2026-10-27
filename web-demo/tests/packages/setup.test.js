// @ts-check
//! 人格、工作区（软件包 setup，蓝图 web.md「人格、预设、工作区」）：按钮上写什么、默认的人格能不能用、路径怎么认、最近用过的。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personaName, presetName, defaultUsable, presetInUse, personaInUse, dirName, readPath, remember, tilde, problemsOf, cleanPairs, halfPair, personaSave, featureGroups, presetSections } from '../../packages/setup/model.js';

const list = [{ persona: 'engineer', name: null }, { persona: 'miyu', name: 'Miyu' }, { persona: 'bad', problem: 'persona.toml:2: …' }];

test('人格的名字：有显示名的写显示名，没有的写编号', () => {
  assert.equal(personaName(list[0]), 'engineer');
  assert.equal(personaName(list[1]), 'Miyu');
});

test('默认的人格能不能用：在列表里、没写错才算；没设、指着没有的、写错的都锁住（第 2 条）', () => {
  assert.equal(defaultUsable(list, 'engineer'), true);
  assert.equal(defaultUsable(list, 'nope'), false);
  assert.equal(defaultUsable(list, 'bad'), false);
  assert.equal(defaultUsable(list, null), false);
});

test('路径：只认 ~、~/…、/…，去掉前后空白和末尾的 /；相对的不认', () => {
  assert.equal(readPath('  ~/src/miyu/ '), '~/src/miyu');
  assert.equal(readPath('~'), '~');
  assert.equal(readPath('/'), '/');
  assert.equal(readPath('src/miyu'), null);
  assert.equal(readPath(''), null);
});

test('路径在 Windows 上的写法也认（核心在哪个系统上都行）：C:\\…、C:/…、\\\\服务器\\…，盘符的根留着分隔符', () => {
  assert.equal(readPath('C:\\Users\\a\\'), 'C:\\Users\\a');
  assert.equal(readPath('C:\\'), 'C:\\');
  assert.equal(readPath('D:/work/'), 'D:/work');
  assert.equal(readPath('\\\\srv\\share'), '\\\\srv\\share');
  assert.equal(dirName('C:\\Users\\a'), 'a');
  assert.equal(tilde('C:\\Users\\a\\src', 'C:\\Users\\a'), '~\\src');
});

test('按钮上写目录名；家目录下的写成 ~/…', () => {
  assert.equal(dirName('~/Documents/github/Miyu'), 'Miyu');
  assert.equal(dirName('~'), '~');
  assert.equal(dirName('/'), '/');
  assert.equal(tilde('/home/a/src', '/home/a'), '~/src');
  assert.equal(tilde('/home/a', '/home/a'), '~');
  assert.equal(tilde('/home/ab', '/home/a'), '/home/ab');
});

test('最近用过的：排到最前、去重、最多几个，默认工作区不记', () => {
  assert.deepEqual(remember(['/b', '/a'], '/a', '/w', 3), ['/a', '/b']);
  assert.deepEqual(remember(['/a', '/b', '/c'], '/d', '/w', 3), ['/d', '/a', '/b']);
  assert.deepEqual(remember(['/a'], '/w', '/w', 3), ['/a']);
});

test('预设：名字照显示名、没有的写编号；默认的能不能用照 preset 那一格认（P-2）', () => {
  const presets = [{ preset: 'dev', name: '开发' }, { preset: 'full', name: null }, { preset: 'bad', problem: 'x' }];
  assert.equal(presetName(presets[0]), '开发');
  assert.equal(presetName(presets[1]), 'full');
  assert.equal(defaultUsable(presets, 'dev', 'preset'), true);
  assert.equal(defaultUsable(presets, 'bad', 'preset'), false);
  assert.equal(defaultUsable(presets, 'nope', 'preset'), false);
});

test('没选时实际用哪个：预设照 preset.default、没写是 full；人格照选的 → persona.default，指着没有的当没设，都没有是没有人格；选了「无人格」是没有；预设不参与', () => {
  assert.equal(presetInUse('dev', 'full'), 'dev');
  assert.equal(presetInUse(null, 'dev'), 'dev');
  assert.equal(presetInUse(null, null), 'full');
  assert.equal(personaInUse('miyu', 'engineer', list), 'miyu');
  assert.equal(personaInUse(null, 'miyu', list), 'miyu');
  assert.equal(personaInUse(null, 'gone', list), null, '默认人格没了：没有人格，不锁');
  assert.equal(personaInUse(null, null, list), null, '出厂不带人格');
  assert.equal(personaInUse(false, 'miyu', list), null, '明着选了无人格');
  assert.equal(personaInUse(null, 'bad', list), 'bad', '写错的照样算出来，由锁那边管');
});

test('写错的人格、预设：照 check 的文件认是谁的（哪一层都算、Windows 的分隔符也认），只挑这一种、这一个；文件只留人格目录里的那一截', () => {
  const problems = [
    { kind: 'config', file: 'system/config.toml', line: 6, message: '环境变量没设' },
    { kind: 'persona', file: 'home/admin/personas/broken/persona.toml', line: 3, message: '不认识的键 persona.color' },
    { kind: 'persona', file: '/opt/miyu/personas/broken/prompts/examples.md', message: '示范对话要一问一答' },
    { kind: 'persona', file: 'home/admin/personas/broken2/persona.toml', line: 1, message: '别的' },
    { kind: 'preset', file: 'C:\\miyu\\home\\admin\\presets\\dev.toml', line: 2, message: '不是开关' },
  ];
  assert.deepEqual(problemsOf(problems, 'persona', 'broken'), [
    { line: 3, message: '不认识的键 persona.color', file: 'persona.toml' },
    { line: null, message: '示范对话要一问一答', file: 'prompts/examples.md' },
  ]);
  assert.deepEqual(problemsOf(problems, 'preset', 'dev'), [{ line: 2, message: '不是开关', file: 'dev.toml' }]);
  assert.deepEqual(problemsOf(problems, 'persona', 'dev'), []);
});

test('示范对话：去掉空白和两头都空的；只写了一头的那一对是第几对', () => {
  const pairs = [{ user: ' 你好 ', assistant: '嗨 ' }, { user: '', assistant: '  ' }, { user: '在吗', assistant: '' }];
  assert.deepEqual(cleanPairs(pairs), [{ user: '你好', assistant: '嗨' }, { user: '在吗', assistant: '' }]);
  assert.equal(halfPair(pairs), 2);
  assert.equal(halfPair(pairs.slice(0, 2)), -1);
});

test('人格点「保存」发什么：只发变了的，提示词带读进来的版本；清空的发空字；什么都没变是 null；名字清空不发；说明清空发空字', () => {
  const before = { name: 'Miyu', summary: '陪你聊天', persona: '你是 Miyu', reminders: '', pairs: [{ user: '累', assistant: '歇会儿' }], versions: { persona: 'sha256:a', reminders: null, examples: 'sha256:e' } };
  assert.equal(personaSave(before, { ...before, persona: '你是 Miyu  ', pairs: [...before.pairs, { user: '', assistant: '' }] }), null);
  assert.deepEqual(personaSave(before, { ...before, name: '小美' }), { changes: [{ key: 'persona.name', value: '小美' }] });
  // 子代理可选（核心 P-10 补）：拨了才发，没读到这一格的当关着
  assert.deepEqual(personaSave(before, { ...before, subagent: true }), { changes: [{ key: 'persona.subagent', value: true }] });
  assert.deepEqual(personaSave({ ...before, subagent: true }, { ...before, subagent: false }), { changes: [{ key: 'persona.subagent', value: false }] });
  assert.equal(personaSave(before, { ...before, subagent: false }), null);
  assert.deepEqual(personaSave(before, { ...before, persona: '', reminders: '别变成客服腔' }), {
    prompts: { persona: { text: '', expect: 'sha256:a' }, reminders: { text: '别变成客服腔', expect: null } },
  });
  assert.deepEqual(personaSave(before, { ...before, pairs: [] }), { prompts: { examples: { pairs: [], expect: 'sha256:e' } } });
  assert.equal(personaSave(before, { ...before, name: '  ' }), null);
  assert.deepEqual(personaSave(before, { ...before, summary: '写代码的帮手' }), { changes: [{ key: 'persona.summary', value: '写代码的帮手' }] });
  assert.deepEqual(personaSave(before, { ...before, summary: ' ' }), { changes: [{ key: 'persona.summary', value: '' }] });
});

test('新会话先选上上一次的：最新的顶层会话的人格、预设（工作区不跟）；没人格的选无人格；没了的不选；子会话、一次性的不算', async () => {
  const { lastChoice } = await import('../../packages/setup/model.js');
  const personas = [{ persona: 'miyu', name: 'Miyu' }, { persona: 'bad', problem: 'x' }];
  const presets = [{ preset: 'full', name: '全部功能' }, { preset: 'dev', name: '基础功能' }];
  assert.deepEqual(lastChoice([{ parent: 'p', persona: 'miyu' }, { oneshot: true }, { persona: 'miyu', preset: 'dev', cwd: '/w' }], personas, presets), { persona: 'miyu', preset: 'dev' }, '工作区不跟（2026-10-22 项目主人）');
  assert.deepEqual(lastChoice([{ preset: 'full', cwd: '/w' }], personas, presets), { persona: false, preset: 'full' });
  assert.deepEqual(lastChoice([{ persona: 'miyu', preset: null, no_tools: true }], personas, presets), { persona: 'miyu', preset: false }, '上一个是「无工具」的接着选它（核心 P-16 下）');
  // 上一个会话在它自己的默认工作区里（核心 5-14）：不预选目录
  assert.deepEqual(lastChoice([{ preset: 'full', cwd: '/w/s1', default_workspace: '/w/s1' }], personas, presets), { persona: false, preset: 'full' });
  assert.deepEqual(lastChoice([{ preset: 'full', cwd: '/src', default_workspace: '/w/s1' }], personas, presets), { persona: false, preset: 'full' });
  assert.deepEqual(lastChoice([{ persona: 'gone', preset: 'gone', cwd: '/w' }], personas, presets), {});
  assert.equal(lastChoice([], personas, presets), null);
  // 新核心（P-17）没有单拿的无工具，换成出厂的「无功能」：上一个是无工具的选 `none`；列表里没有它的不选
  const withNone = [...presets, { preset: 'none', name: '无功能' }];
  assert.deepEqual(lastChoice([{ persona: 'miyu', preset: null, no_tools: true }], personas, withNone, 'none'), { persona: 'miyu', preset: 'none' });
  assert.deepEqual(lastChoice([{ persona: 'miyu', preset: null, no_tools: true }], personas, presets, null), { persona: 'miyu' });
  assert.deepEqual(lastChoice([{ preset: 'none' }], personas, withNone, 'none'), { persona: false, preset: 'none' });
});

test('无工具的老会话算在哪个预设上：旧核心单拿的那一项（false），新核心出厂的 none（P-17），都没有的 null', async () => {
  const { Catalog } = await import('../../packages/setup/catalog.js');
  const reply = (presets) => ({ request: async (m) => (m === 'preset.list' ? { presets } : m === 'persona.list' ? { personas: [] } : { items: {} }) });
  const old = new Catalog(reply([{ preset: 'full', name: '全部' }, { preset: null, name: '无工具' }]));
  await old.load();
  assert.equal(old.noToolsAs(), false);
  assert.deepEqual(old.presets.map((p) => p.preset), ['full']);
  const fresh = new Catalog(reply([{ preset: 'full', name: '全部' }, { preset: 'none', name: '无功能' }]));
  await fresh.load();
  assert.equal(fresh.noTools, null);
  assert.equal(fresh.noToolsAs(), 'none');
  assert.deepEqual(fresh.presets.map((p) => p.preset), ['full', 'none'], '「无功能」是普通预设，照列表画、能编辑');
  const neither = new Catalog(reply([{ preset: 'full', name: '全部' }]));
  await neither.load();
  assert.equal(neither.noToolsAs(), null);
});

test('预设的功能分五段：功能、MCP 服务、脚本、技能、斜杠命令，段里照核心的先后，空的段不要（2026-10-12、10-15）', () => {
  const list = [{ id: 'command-review' }, { id: 'web' }, { id: 'mcp-github' }, { id: 'knowledge' }, { id: 'skill-notes' }, { id: 'script-weather' }, { id: 'skill-writer' }];
  assert.deepEqual(featureGroups(list).map((g) => `${g.group}:${g.items.map((f) => f.id).join(',')}`),
    ['feature:web,knowledge', 'mcp:mcp-github', 'script:script-weather', 'skill:skill-notes,skill-writer', 'command:command-review']);
  assert.deepEqual(featureGroups([{ id: 'web' }]).map((g) => g.group), ['feature'], '只有包的功能：只一段');
  assert.deepEqual(featureGroups([]), []);
});

test('核心 ENV-1 起功能照包分组：包照第一次出现的先后、一个功能也一组；~home 排在包后面；没归包的接在最后照五段，「功能」那段叫 other', () => {
  const list = [
    { id: 'env-time', package: 'env' }, { id: 'read', package: 'read' }, { id: 'skill-notes', package: 'kit' }, { id: 'env-profile', package: 'env' },
    { id: 'script-mine', package: '~home' }, { id: 'skill-loose' }, { id: 'gone', installed: false }, { id: 'mcp-x', package: '~home' },
  ];
  assert.deepEqual(featureGroups(list).map((g) => `${g.group}${g.package ? `(${g.package})` : ''}:${g.items.map((f) => f.id).join(',')}`),
    ['package(env):env-time,env-profile', 'package(read):read', 'package(kit):skill-notes', 'home:script-mine,mcp-x', 'other:gone', 'skill:skill-loose']);
});

test('预设的段和块（2026-10-27 项目主人：包一个总开关，内置的在前、别的按安装先后）：组一段、组内照 PG-1 的先后；别的出厂包；装的照安装先后；我的、不归包的接后面', () => {
  const info = {
    groups: [{ id: 'basesystem', name: '基础系统', packages: ['read', 'write', 'edit'] }],
    packages: [
      { package: 'read', name: '读文件', layer: 'shipped', groups: ['basesystem'] }, { package: 'write', name: '写文件', layer: 'shipped', groups: ['basesystem'] },
      { package: 'edit', name: '改文件', layer: 'shipped', groups: ['basesystem'] }, { package: 'env', name: '注入环境信息', layer: 'shipped' },
      { package: 'late', name: '后装的', layer: 'home', installed_at: '2026-10-27T02:00:00.000Z' }, { package: 'early', name: '先装的', layer: 'home', installed_at: '2026-10-20T02:00:00.000Z' },
      { package: 'web', name: '联网搜索', layer: 'shipped' },
    ],
  };
  const list = [
    { id: 'edit', name: '改文件', package: 'edit' }, { id: 'env-time', name: '时间', package: 'env' }, { id: 'env-cwd', name: '工作目录', package: 'env' },
    { id: 'late', name: '后装的', package: 'late' }, { id: 'write', name: '写文件', package: 'write' }, { id: 'web', name: '搜网页', package: 'web' },
    { id: 'early', name: '先装的', package: 'early' }, { id: 'read', name: '读文件', package: 'read' },
    { id: 'script-mine', package: '~home' }, { id: 'skill-loose', name: '散的' },
  ];
  const shape = presetSections(featureGroups(list), info).map((sec) => `${sec.kind}${sec.title ? `[${sec.title}]` : ''}=${sec.blocks.map((b) => `${b.single ? '·' : ''}${b.package ?? '-'}:${b.items.map((f) => f.id).join(',')}`).join(' ')}`);
  assert.deepEqual(shape, [
    'group[基础系统]=·read:read ·write:write ·edit:edit',
    'package=env:env-time,env-cwd web:web ·early:early ·late:late',
    'home[home]=~home:script-mine',
    'skill[skill]=-:skill-loose',
  ], '名字不一样的（联网搜索 / 搜网页）不算只有一行；装的照装的先后');
  assert.deepEqual(presetSections(featureGroups([{ id: 'web' }]), {}).map((s) => s.kind), ['feature'], '旧核心照五段');
  assert.deepEqual(presetSections(featureGroups([{ id: 'b', package: 'b' }, { id: 'a', package: 'a' }]), {}).map((s) => s.blocks.map((b) => b.package).join()), ['b,a'], '没有 package.list 的照原来的先后');
});
