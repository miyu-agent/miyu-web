// @ts-check
//! 给人看的字（蓝图 `web.md`「时间线的数」第 5 条）：握手以后照界面语言问核心的 `human.get`（核心施工 W-1），只留
//! 页面用得上的几格；包的图标另问 `package.list`；问不到的交回一句话，由开机那里照工具名写。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHuman, iconsOf } from '../src/core/human.js';

/** 记下问了什么、照给的回的假连接：`human.get` 回 `reply`，`package.list` 回 `listed`。 */
function fakeConn(reply, listed = { packages: [] }) {
  const asked = [];
  return {
    asked,
    request(method, params) {
      asked.push([method, params]);
      const got = method === 'package.list' ? listed : reply;
      return got instanceof Error ? Promise.reject(got) : Promise.resolve(got);
    },
  };
}

test('照界面语言问核心的 human.get，留 tools、said、packages；回应里别的格子不要；包的图标照 package.list', async () => {
  const conn = fakeConn({ language: 'ja', tools: { shell: { name: 'コマンド実行', subject: 'description' } }, said: { 'core/x': '{a} 件' }, packages: { meme_send: 'miyu-memes' } },
    { packages: [{ package: 'miyu-memes', icon: 'smile' }] });
  const human = await loadHuman(/** @type {any} */ (conn), 'ja');
  assert.deepEqual(conn.asked, [['human.get', { language: 'ja' }], ['package.list', {}]]);
  assert.deepEqual(human, { tools: { shell: { name: 'コマンド実行', subject: 'description' } }, said: { 'core/x': '{a} 件' }, packages: { meme_send: 'miyu-memes' }, icons: { 'miyu-memes': 'smile' } });
});

test('回应缺了格子的当空的、包的列表问不到的当没有图标；字问不到（核心太旧、读不懂资源）照原样报出去', async () => {
  assert.deepEqual(await loadHuman(/** @type {any} */ (fakeConn({ language: 'zh' }, new Error('old'))), 'zh'), { tools: {}, said: {}, packages: {}, icons: {} });
  await assert.rejects(loadHuman(/** @type {any} */ (fakeConn(new Error('no such method'))), 'zh'), /no such method/);
});

test('包的图标：只留写了图标的包；列表不是数组的当没有', async () => {
  assert.deepEqual(iconsOf([{ package: 'miyu-memes', icon: 'smile' }, { package: 'plain' }, { package: 'blank', icon: '' }, { icon: 'x' }]), { 'miyu-memes': 'smile' });
  assert.deepEqual(iconsOf(null), {});
});
