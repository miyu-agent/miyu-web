// @ts-check
//! 链接卡片照 `link.preview` 的回应画（蓝图 `web.md`「链接卡片」第 5 条）：视频的配图上叠播放记号和时长，站名后面接作者。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardView, duration } from '../src/model/linkcard.js';

test('时长：秒数写成 3:33、1:02:03；不到一分钟的 0:07；没有的、不对的是 null', () => {
  assert.equal(duration(213), '3:33');
  assert.equal(duration(3723), '1:02:03');
  assert.equal(duration(7), '0:07');
  assert.equal(duration(59.6), '0:59');
  assert.equal(duration(undefined), null);
  assert.equal(duration(-1), null);
  assert.equal(duration(Number.NaN), null);
});

test('视频：有配图的叠播放记号、写时长；站名后面接作者；别的种类照原来的样子', () => {
  assert.deepEqual(cardView({ kind: 'video', site: '哔哩哔哩', author: 'UP 主', duration: 213, image: { blob: 'sha256:a', media_type: 'image/jpeg' } }),
    { video: true, duration: '3:33', site: '哔哩哔哩 · UP 主' });
  assert.deepEqual(cardView({ kind: 'video', site: 'YouTube', image: null }), { video: false, duration: null, site: 'YouTube' }, '没有配图的不叠记号');
  assert.deepEqual(cardView({ kind: 'article', site: 'ArchWiki', author: '没用' }), { video: false, duration: null, site: 'ArchWiki · 没用' });
  assert.deepEqual(cardView({ site: '' }), { video: false, duration: null, site: '' }, '站名空的交空的，由画的地方照主机名补');
});

test('暂时取不到的（unreachable、断了线）下次画到再问，拿到就换上；no_preview 的整页只问一次（核心 W-7 三补）', async () => {
  const { previewFor, useConnection } = await import('../src/ui/linkcards.js');
  const asked = [];
  const replies = {
    'https://b.example/v': [{ card: null, why: 'unreachable' }, { card: { title: '视频' } }],
    'https://n.example/x': [{ card: null, why: 'no_preview' }, { card: { title: '不该再问' } }],
  };
  const silent = console.error;
  console.error = () => {};
  try {
    useConnection(/** @type {any} */ ({ request: async (m, p) => { asked.push(p.url); return replies[p.url].shift(); } }));
    assert.equal(await previewFor('https://b.example/v'), null);
    assert.deepEqual(await previewFor('https://b.example/v'), { title: '视频' }, '再画到时又问了一次');
    assert.deepEqual(await previewFor('https://b.example/v'), { title: '视频' }, '拿到了的不再问');
    assert.equal(await previewFor('https://n.example/x'), null);
    assert.equal(await previewFor('https://n.example/x'), null, 'no_preview 的不再问');
    assert.deepEqual(asked, ['https://b.example/v', 'https://b.example/v', 'https://n.example/x']);
    useConnection(/** @type {any} */ ({ request: async () => { throw Object.assign(new Error('断了'), { reason: 'disconnected' }); } }));
    assert.equal(await previewFor('https://c.example/'), null);
    useConnection(/** @type {any} */ ({ request: async () => ({ card: { title: '连上了' } }) }));
    assert.deepEqual(await previewFor('https://c.example/'), { title: '连上了' }, '断了线的下次再问');
  } finally {
    console.error = silent;
  }
});
