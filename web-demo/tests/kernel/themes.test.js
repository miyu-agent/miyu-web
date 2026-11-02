// @ts-check
//! 外观包（蓝图 `web/architecture.md`「外观包」，核心 TH-1）：从 `package.list` 挑出带网页外观的；清单的编号照核心的、种类一律可选；
//! 起来时订 `packages` 对一遍，订不上照 `package.list`；推来装了的换票据、叫内核对账，卸了的丢掉；升级、这一页加载过又装回来的只说一句
//! 刷新；换不到票据的照样列着、加载时故障；一件件来。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Themes, themeIds, themeManifest } from '../../src/kernel/themes.js';

const look = (/** @type {string} */ id, extra = {}) => ({ package: id, kind: 'theme', name: `名字 ${id}`, theme: { web: { dir: 'web' } }, ...extra });

/** 不出声地跑（编号不对时内核往控制台写一句） @param {() => void} fn */
function quiet(fn) {
  const had = console.error;
  console.error = () => {};
  try { fn(); } finally { console.error = had; }
}

test('package.list 里挑出带网页外观的，照先后；只带终端主题的、编号放不进地址的、和网页自带的包撞了的不要', () => {
  const listed = {
    packages: [
      look('miyu-webui-theme-claude-style'),
      { package: 'tui-only', kind: 'theme', theme: { tui: { file: 'theme.json' } } },
      { package: 'onebot', page: true },
      look('bad name'),
      look('skin'),
      look('both', { theme: { tui: { file: 't.json' }, web: { dir: 'web' } } }),
      look('miyu-webui-theme-claude-style'),
      { package: 'broken', code: 'bad_theme_dir', problem: '…' },
    ],
  };
  quiet(() => assert.deepEqual(themeIds(listed, new Set(['skin', 'app'])), ['miyu-webui-theme-claude-style', 'both']));
  assert.deepEqual(themeIds({}, new Set()), []);
  assert.deepEqual(themeIds(null, new Set()), []);
});

test('外观包的清单：编号照核心的包编号，种类一律可选；不是 JSON 对象的抛错', () => {
  assert.deepEqual(themeManifest({ id: 'claude', kind: 'base', name: { zh: '克' }, styles: ['a.css'] }, 'miyu-webui-theme-claude'), {
    id: 'miyu-webui-theme-claude', kind: 'optional', name: { zh: '克' }, styles: ['a.css'],
  });
  for (const bad of [null, [], 'x', 3]) assert.throws(() => themeManifest(bad, 'x'), /不是 JSON 对象/);
});

/** 假的核心和网页软件：记下问了什么、换了哪些票据、对了几次账、说了什么。 */
function world(listed = { packages: [look('a'), look('b')] }) {
  const log = /** @type {string[]} */ ([]);
  const said = /** @type {string[]} */ ([]);
  let subscribable = true;
  const themes = new Themes({
    request: async (method, params) => {
      log.push(`${method}${params?.stream ? ` ${params.stream}` : ''}`);
      if (method === 'subscribe' && !subscribable) throw Object.assign(new Error('没有这个流'), { code: -32602 });
      return listed;
    },
    open: async (id) => {
      log.push(`open ${id}`);
      return id === 'nope' ? null : `/t/t-${id}/${id}/`;
    },
    taken: new Set(['skin']),
    changed: async () => { log.push(`sync ${themes.ids.join(',')}`); },
    say: (name) => said.push(name),
  });
  return { themes, log, said, oldCore: () => { subscribable = false; } };
}

test('起来时订 packages、照回应换票据、对一遍账；根照网页软件给的地址', async () => {
  const { themes, log } = world();
  await themes.follow();
  assert.deepEqual(log, ['subscribe packages', 'open a', 'open b', 'sync a,b']);
  assert.deepEqual(themes.rows(), [{ id: 'a' }, { id: 'b' }]);
  assert.equal(themes.base('a'), '/t/t-a/a/');
  assert.equal(themes.has('a'), true);
  assert.equal(themes.has('skin'), false);
  // 重连以后重订：没变的不换票据、不对账
  log.length = 0;
  await themes.follow();
  assert.deepEqual(log, ['subscribe packages']);
});

test('旧核心订不上 packages：照 package.list 读一次', async () => {
  const { themes, log, oldCore } = world({ packages: [look('a')] });
  oldCore();
  await themes.follow();
  assert.deepEqual(log, ['subscribe packages', 'package.list', 'open a', 'sync a']);
});

test('换不到票据的照样列着（设置页看得到），加载时抛错、只它故障', async () => {
  const { themes } = world({ packages: [look('nope'), look('a')] });
  await themes.follow();
  assert.deepEqual(themes.rows(), [{ id: 'nope' }, { id: 'a' }]);
  assert.throws(() => themes.base('nope'), /拿不到外观包 nope 的文件/);
  assert.equal(themes.base('a'), '/t/t-a/a/');
});

test('推来装了新的当场加载，卸了的当场撤下；别的包的推送不管', async () => {
  const { themes, log, said } = world({ packages: [look('a')] });
  await themes.follow();
  log.length = 0;
  assert.equal(themes.push('package.changed', { package: 'c', entry: look('c') }), true);
  await themes.queue;
  assert.deepEqual(log, ['open c', 'sync a,c']);
  log.length = 0;
  themes.push('package.changed', { package: 'a', entry: null });
  await themes.queue;
  assert.deepEqual(log, ['sync c']);
  assert.throws(() => themes.base('a'));
  log.length = 0;
  themes.push('package.changed', { package: 'onebot', entry: { package: 'onebot', page: true } });
  themes.push('package.changed', { package: 'skin', entry: look('skin') });
  assert.equal(themes.push('session.changed', {}), false);
  await themes.queue;
  assert.deepEqual(log, [], '不是外观包、撞了编号的不动');
  // 外观包升级成不带网页外观了：撤下
  themes.push('package.changed', { package: 'c', entry: { package: 'c', kind: 'theme', theme: { tui: { file: 't.json' } } } });
  await themes.queue;
  assert.deepEqual(log, ['sync ']);
  assert.deepEqual(said, []);
});

test('升级了、这一页加载过又装回来的：浏览器还拿着原来的脚本，不加载、说一句刷新', async () => {
  const { themes, log, said } = world({ packages: [look('a')] });
  await themes.follow();
  themes.loaded('a');
  log.length = 0;
  themes.push('package.changed', { package: 'a', entry: look('a', { version: '0.2.0' }) });
  await themes.queue;
  assert.deepEqual(log, [], '升级不对账');
  assert.deepEqual(said, ['名字 a']);
  themes.push('package.changed', { package: 'a', entry: null });
  themes.push('package.changed', { package: 'a', entry: look('a') });
  await themes.queue;
  assert.deepEqual(log, ['sync '], '撤下了一次，装回来的不再加载');
  assert.deepEqual(said, ['名字 a', '名字 a']);
  assert.deepEqual(themes.rows(), []);
});

test('掉了队重新订，照新的列表对账；对账一件件来，一件出错不耽误后面', async () => {
  const listed = { packages: [look('a')] };
  const { themes, log } = world(listed);
  await themes.follow();
  listed.packages = [look('b')];
  log.length = 0;
  assert.equal(themes.push('resync', { stream: 'packages' }), true);
  assert.equal(themes.push('resync', { stream: 'config' }), false);
  await themes.queue;
  assert.deepEqual(log, ['subscribe packages', 'open b', 'sync b']);
  const had = console.error;
  console.error = () => {};
  try {
    await themes.serial(async () => { throw new Error('坏了'); });
  } finally { console.error = had; }
  log.length = 0;
  themes.push('package.changed', { package: 'c', entry: look('c') });
  await themes.queue;
  assert.deepEqual(log, ['open c', 'sync b,c']);
});
