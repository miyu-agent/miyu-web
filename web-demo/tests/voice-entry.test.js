// @ts-check
//! 她说出来的语音（核心 SD-1，视图条目 `voice`，W-1212）：正文里一条播放条；放不放照这一轮是谁开的，只有推送里新来的才放。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRes } from './support.js';
import { itemsOf } from '../src/model/entries.js';
import { autoplays } from '../src/model/voice.js';
import { Store, emptySession } from '../src/core/store.js';
import { Connection } from '../src/core/connection.js';

loadRes();

const AT = '2026-11-18T01:00:00.000Z';
const voice = (extra = {}) => ({ id: 's8.0', kind: 'voice', turn: 4, blob: 'sha256:ab12', media_type: 'audio/wav', at: AT, ...extra });

test('语音条目画成正文里的一条（跟着她这一轮，只说了话、还没开口的一轮不画三个球）；名字、时长照原样，没有 blob 的不画', () => {
  const entries = [
    { id: 'm2', kind: 'user', text: '念一句', turn: 4, level: 'full', at: AT },
    voice({ name: 'say.wav', duration_ms: 1200 }),
    voice({ id: 's8.1', blob: undefined }),
  ];
  const got = itemsOf(entries, { state: 'busy', since: AT, permission: { level: 'full' } });
  assert.deepEqual(got.items.map((it) => `${it.type}:${it.key}`), ['user:m2', 'voice:s8.0']);
  assert.deepEqual(got.items[1], { type: 'voice', key: 's8.0', turn: 4, voice: { blob: 'sha256:ab12', media_type: 'audio/wav', name: 'say.wav', duration_ms: 1200 } });
  const bare = itemsOf([voice()], { state: 'idle' }).items[0];
  assert.deepEqual(bare.voice, { blob: 'sha256:ab12', media_type: 'audio/wav', name: null, duration_ms: null });
});

test('放不放：这个页面发的请求开的一轮当场放；到点叫醒、没有 by 的，开着这个会话的才放；别的头上说的只画', () => {
  const mine = (/** @type {string} */ id) => id.startsWith('web-aa-');
  const here = { mine, viewing: true };
  const away = { mine, viewing: false };
  const web = { kind: 'person', head: 'web' };
  assert.equal(autoplays(voice({ by: web, cause: 'web-aa-3' }), away), true, '自己发的话：没开着这个会话也放');
  assert.equal(autoplays(voice({ by: web, cause: 'web-bb-3' }), here), false, '别的网页标签页上说的');
  assert.equal(autoplays(voice({ by: { kind: 'person', head: 'tui' }, cause: 'tui-1' }), here), false, '终端上说的');
  assert.equal(autoplays(voice({ by: { kind: 'external', venue: 'qq:group:1', id: 'qq:2' }, cause: 'c9' }), here), false, '群里的人说的');
  assert.equal(autoplays(voice({ by: { kind: 'schedule', schedule: 't1' }, cause: 'c1' }), here), true, '到点叫醒');
  assert.equal(autoplays(voice({ by: { kind: 'schedule', schedule: 't1' } }), away), false, '到点叫醒、没开着这个会话');
  assert.equal(autoplays(voice(), here), true, '没有 by');
  assert.equal(autoplays(voice(), away), false);
});

test('页面发的请求认得出：编号照这条连接的前缀（重连也接着用），别的不是', () => {
  const conn = new Connection(() => /** @type {any} */ ({}));
  assert.equal(conn.mine(`web-${conn.prefix}-12`), true);
  assert.equal(conn.mine('web-00000000-12'), false);
  assert.equal(conn.mine(`tui-${conn.prefix}-12`), false);
  assert.equal(conn.mine(/** @type {any} */ (null)), false);
});

/** 一个会话已经读进来的仓库；`mine` 是这个页面发过的请求。 */
function storeWith(/** @type {(id: string) => boolean} */ mine) {
  const store = new Store(/** @type {any} */ ({ onPush() {}, request: async () => ({}), mine }));
  store.sessions.set('S', emptySession('S'));
  /** @type {Array<[string, string]>} */
  const played = [];
  store.voiced = (session, entry) => played.push([session, entry.id]);
  return { store, played };
}

test('只有推送里新来的语音才放：订阅、重新订阅换上的老条目，再推一遍已有的、改一条的都不放', () => {
  const { store, played } = storeWith((id) => id === 'web-aa-1');
  const s = /** @type {any} */ (store.sessions.get('S'));
  // 订阅回应、掉队重来换上的一页（老的历史）
  s.view.reset({ entries: [voice({ id: 's1.0', cause: 'web-aa-1', by: { kind: 'person', head: 'web' } })] });
  assert.deepEqual(played, [], '历史不放');
  store.push('view.add', { session: 'S', entry: voice({ id: 's1.0', cause: 'web-aa-1', by: { kind: 'person', head: 'web' } }), after: null });
  store.push('view.update', { session: 'S', entry: voice({ id: 's1.0', cause: 'web-aa-1', by: { kind: 'person', head: 'web' } }) });
  assert.deepEqual(played, [], '已经在手里的再推一遍不放');
  store.push('view.add', { session: 'S', entry: voice({ id: 's2.0', cause: 'web-aa-1', by: { kind: 'person', head: 'web' } }), after: 's1.0' });
  assert.deepEqual(played, [['S', 's2.0']], '这个页面开的一轮新来的：放');
  store.push('view.add', { session: 'S', entry: voice({ id: 's3.0', cause: 'tui-9', by: { kind: 'person', head: 'tui' } }), after: 's2.0' });
  store.push('view.add', { session: 'S', entry: { id: 'b3.1', kind: 'reply', turn: 4, text: '好' }, after: 's3.0' });
  assert.deepEqual(played, [['S', 's2.0']], '终端上说的、不是语音的不放');
});

test('到点叫醒、没有 by 的语音：正在看这个会话才放', () => {
  const { store, played } = storeWith(() => false);
  store.push('view.add', { session: 'S', entry: voice({ id: 's1.0', by: { kind: 'schedule', schedule: 't1' } }), after: null });
  assert.deepEqual(played, [], '没在看');
  store.viewing = 'S';
  store.push('view.add', { session: 'S', entry: voice({ id: 's2.0', by: { kind: 'schedule', schedule: 't1' } }), after: 's1.0' });
  store.push('view.add', { session: 'S', entry: voice({ id: 's3.0' }), after: 's2.0' });
  assert.deepEqual(played, [['S', 's2.0'], ['S', 's3.0']]);
});
