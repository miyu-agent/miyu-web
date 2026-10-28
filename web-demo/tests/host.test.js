// @ts-check
//! 宿主（蓝图 `web/architecture.md`「宿主」「多用户、多终端」）：平台的 API 只在 `src/host/` 里用；浏览器那一份的地址带口令、
//! 下载带名字；这台设备上存的东西按账号分开；连核心只认一条「像 WebSocket」的线，桌面端换一条线就能用。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urls } from '../src/host/browser.js';
import { ownerStorage } from '../src/kernel/storage.js';
import { Connection, Refusal, LINE_MAX, tooLong } from '../src/core/connection.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 目录下全部 `.js`。 */
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : [];
  });
}

/** 平台的 API、写死的桥的地址（「宿主」的「页面自己守的」第 1 条） */
const PLATFORM = [
  /new WebSocket\b/, /\blocation\.hash\b/, /\blocalStorage\b/, /\bsessionStorage\b/, /\bwindow\.open\(/, /\bnavigator\.clipboard\b/,
  /\bdataTransfer\b/, /['"`]\/(ws|upload)\b/, /['"`]\/(file|blob|link-image)\?/,
];

test('平台的 API、桥的地址只在 src/host/ 里用', () => {
  const host = join(ROOT, 'src', 'host');
  const bad = [];
  for (const file of [...files(join(ROOT, 'src')), ...files(join(ROOT, 'packages'))]) {
    if (file.startsWith(host)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/^\s*\*/.test(line)) return;
      for (const re of PLATFORM) if (re.test(code)) bad.push(`${relative(ROOT, file)}:${i + 1} ${re}`);
    });
  }
  assert.deepEqual(bad, []);
});

test('浏览器那一份的地址：带口令，不带会话（核心照账号、照路径给，W-6）；下载的带 download，blob 另带原来的名字', async () => {
  const u = urls('k1');
  const file = new URL(await u.file('/home/a b/x.png'), 'http://x');
  assert.equal(file.pathname, '/file');
  assert.deepEqual(Object.fromEntries(file.searchParams), { k: 'k1', path: '/home/a b/x.png' });
  assert.equal(new URL(await u.file('/x', true), 'http://x').searchParams.get('download'), '1');
  const blob = new URL(await u.blob('sha256:ab', 'application/pdf', { download: true, name: '报告.pdf' }), 'http://x');
  assert.equal(blob.pathname, '/blob');
  assert.deepEqual(Object.fromEntries(blob.searchParams), { k: 'k1', hash: 'sha256:ab', type: 'application/pdf', download: '1', name: '报告.pdf' });
  assert.equal(new URL(await u.blob('sha256:ab', 'image/png'), 'http://x').searchParams.has('name'), false, '不下载的不带名字');
  assert.equal('linkImage' in u, false, '链接卡片的图是 blob，照 /blob 取（核心施工 W-7）');
});

/** 一个假的存法：一张表，`broken` 时读写都抛（隐私窗口、清过数据） */
function fakeStore(broken = false) {
  const table = new Map();
  return {
    table,
    getItem: (k) => { if (broken) throw new Error('no'); return table.get(k) ?? null; },
    setItem: (k, v) => { if (broken) throw new Error('no'); table.set(k, v); },
    removeItem: (k) => { table.delete(k); },
  };
}

test('这台设备上存的（核心 SU-1 起只有主人一份）：键是 miyu.me.<键>；原来按账号分的、更早不分账号的旧键搬过来', () => {
  const store = fakeStore();
  const me = ownerStorage(store);
  me.set('packages', { rail: { disabled: true } });
  assert.equal(store.table.get('miyu.me.packages'), '{"rail":{"disabled":true}}');
  assert.deepEqual(me.get('packages', {}), { rail: { disabled: true } });

  const old = fakeStore();
  old.table.set('miyu.shorin.cards', '[1]');
  old.table.set('miyu.admin.cards', '[2]');
  old.table.set('miyu.admin.theme', '"dark"');
  old.table.set('miyu.packages', '{"todo":{"disabled":true}}');
  const moved = ownerStorage(old, { packages: 'miyu.packages' }, ['shorin', 'admin']);
  assert.deepEqual(moved.get('cards', null), [1], '先照上次用的那个账号');
  assert.deepEqual(moved.get('theme', null), 'dark', '再照 admin（走桥的）');
  assert.deepEqual(moved.get('packages', {}), { todo: { disabled: true } }, '更早不分账号的旧键');
  assert.equal(old.table.has('miyu.shorin.cards'), false);
  assert.equal(old.table.has('miyu.packages'), false);
});

test('存法读写抛错、存的不是 JSON 的，照没有算，不让页面起不来', () => {
  assert.equal(ownerStorage(fakeStore(true)).get('x', 7), 7);
  ownerStorage(fakeStore(true)).set('x', 1);
  const store = fakeStore();
  store.table.set('miyu.me.x', '{坏的');
  assert.equal(ownerStorage(store).get('x', 7), 7);
});

/** 一条假的线：样子照 WebSocket（`send`、`readyState`、`onopen`、`onmessage`、`onclose`、`onerror`） */
function fakeChannel() {
  const ch = { readyState: 0, sent: /** @type {any[]} */ ([]), onopen: null, onmessage: null, onclose: null, onerror: null,
    send(text) { this.sent.push(JSON.parse(text)); } };
  return ch;
}

test('连核心只认一条像 WebSocket 的线：通了才发，回应对上请求，拒绝是 Refusal，断了等着的都拒掉', async () => {
  const ch = /** @type {any} */ (fakeChannel());
  const conn = new Connection(() => ch);
  const states = [];
  conn.onStatus((s) => states.push(s));
  const up = conn.connect();
  await assert.rejects(conn.request('x'), (e) => e instanceof Refusal && e.reason === 'disconnected');
  ch.readyState = 1;
  ch.onopen();
  await up;
  const got = conn.request('session.list', {});
  const [m] = ch.sent;
  assert.equal(m.method, 'session.list');
  ch.onmessage({ data: JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { ok: 1 } }) });
  assert.deepEqual(await got, { ok: 1 });
  const refused = conn.request('session.send', {});
  ch.onmessage({ data: JSON.stringify({ jsonrpc: '2.0', id: ch.sent[1].id, error: { code: -32010, message: '不行', data: { reason: 'turn_running' } } }) });
  await assert.rejects(refused, (e) => e instanceof Refusal && e.reason === 'turn_running');
  const pending = conn.request('slow', {});
  ch.readyState = 3;
  ch.onclose();
  await assert.rejects(pending, (e) => e.reason === 'disconnected');
  assert.deepEqual(states, ['connecting', 'online', 'offline']);
});

test('断了自己重连：隔一会儿再开一条线，连上了告诉外面（重新握手、补上漏掉的由外面做）；一开始就连不上的不在这里重连', async () => {
  const lines = /** @type {any[]} */ ([]);
  const conn = new Connection(() => { const ch = fakeChannel(); lines.push(ch); return ch; }, [0, 0]);
  const states = [];
  conn.onStatus((s) => states.push(s));
  let reopened = 0;
  conn.onReopen(() => { reopened += 1; });
  const up = conn.connect();
  lines[0].readyState = 1;
  lines[0].onopen();
  await up;
  // 核心重启：桥把线关了
  lines[0].readyState = 3;
  lines[0].onclose();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(lines.length, 2, '又开了一条');
  // 这一次也没连上（核心还没起来）：接着试
  lines[1].onerror();
  lines[1].onclose();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(lines.length, 3, '再试一次');
  lines[2].readyState = 1;
  lines[2].onopen();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(reopened, 1, '连上了告诉外面一次');
  assert.deepEqual(states, ['connecting', 'online', 'offline', 'connecting', 'offline', 'connecting', 'online']);
});

test('重连时口令用不了了（桥重启过）：不再白试，告诉外面一声（对话区顶上挂提示）；口令还对的照常接着试', async () => {
  const lines = /** @type {any[]} */ ([]);
  let key = 'ok';
  const conn = new Connection(() => { const ch = fakeChannel(); lines.push(ch); return ch; }, [0, 0], async () => key);
  let lost = 0;
  conn.onLost(() => { lost += 1; });
  const up = conn.connect();
  lines[0].readyState = 1;
  lines[0].onopen();
  await up;
  lines[0].readyState = 3;
  lines[0].onclose();
  await new Promise((r) => setTimeout(r, 5));
  lines[1].onerror();
  lines[1].onclose();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(lines.length, 3, '口令还对：接着试');
  key = 'bad';
  lines[2].onerror();
  lines[2].onclose();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(lost, 1, '口令用不了了：说一声');
  assert.equal(lines.length, 3, '不再试');
});

/** 照浏览器的样子换掉几个全局（`location`、`history`、`localStorage`、`sessionStorage`……），跑完换回来 @param {Record<string, any>} with_ @param {() => Promise<void>} run */
async function withGlobals(with_, run) {
  const keep = Object.fromEntries(Object.keys(with_).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, v] of Object.entries(with_)) Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v });
  try {
    await run();
  } finally {
    for (const [k, d] of Object.entries(keep)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
}
const fakeStorage = (/** @type {Map<string, string>} */ m) => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) });
const at = (/** @type {string} */ hash) => ({ hash, pathname: '/', search: '', protocol: 'http:', host: 'x', hostname: '127.0.0.1', reload: () => {} });
const LATER = '2999-01-01T00:00:00Z';

test('直接连网页软件的那一份（核心 SU-1）：一次性码只交一次；勾了自动登录的令牌存这台浏览器、没勾的只在这个标签页；作废了忘掉；地址带令牌换票据，同一样东西只换一次', async () => {
  const disk = new Map();
  const tab = new Map();
  const calls = [];
  await withGlobals({
    location: at('#setup=abc123'),
    history: { replaceState: (_s, _t, url) => { globalThis.location.hash = String(url).includes('#') ? String(url).slice(String(url).indexOf('#')) : ''; } },
    localStorage: fakeStorage(disk),
    sessionStorage: fakeStorage(tab),
    fetch: async (path, init) => { calls.push([path, init.headers.Authorization, init.body]); return { ok: true, json: async () => ({ url: `/media/t${calls.length}` }) }; },
  }, async () => {
    const { servedHost } = await import('../src/host/served.js');
    const host = servedHost();
    assert.equal(location.hash, '', '一次性码从地址栏抹掉');
    assert.deepEqual(host.credential(), { code: 'abc123' });
    assert.equal(host.credential(), null, '码只用一次，没令牌的出「输入访问密码」');
    assert.equal(await host.urls.blob('sha256:ab', 'image/png'), '', '没登录换不到票据');
    host.remember({ token: 'tok', expires: LATER }, true);
    assert.equal(JSON.parse(disk.get('miyu.web.login') ?? '{}').token, 'tok', '勾了自动登录的存这台浏览器');
    assert.deepEqual(host.credential(), { login: 'tok' });
    assert.equal(await host.urls.blob('sha256:ab', 'image/png'), '/media/t1');
    assert.equal(await host.urls.blob('sha256:ab', 'image/png'), '/media/t1', '同一样东西不再换');
    assert.deepEqual([calls[0][0], calls[0][1], JSON.parse(calls[0][2])], ['/media', 'Bearer tok', { blob: 'sha256:ab', type: 'image/png' }]);
    assert.equal(servedHost().credential().login, 'tok', '刷新以后照记着的令牌');
    host.forget();
    assert.equal(disk.has('miyu.web.login'), false);
    assert.equal(servedHost().credential(), null, '忘掉了的出「输入访问密码」');
    const tabOnly = servedHost();
    tabOnly.remember({ token: 't2', expires: LATER }, false);
    assert.equal(disk.has('miyu.web.login'), false, '没勾的不存这台浏览器');
    assert.equal(JSON.parse(tab.get('miyu.web.session') ?? '{}').token, 't2');
    assert.deepEqual(servedHost().credential(), { login: 't2' }, '同一个标签页刷新照它');
    tab.clear();
    assert.equal(servedHost().credential(), null, '关了标签页（新开一个）要再输');
    // 邀请码不认了（核心 SU-1）
    globalThis.location.hash = '#invite=Ab3';
    assert.equal(servedHost().credential(), null);
  });
});

test('原来多账号的表（核心 SU-1 以前）：上次用的那个账号的令牌、头像迁成一份，表删掉；那个账号名交出去给本地存储搬家', async () => {
  const disk = new Map([
    ['miyu.web.accounts', JSON.stringify({ v: 1, current: 'owner1', accounts: [{ account: 'owner1', token: 'o1', expires: LATER, used: '2026-10-27T00:00:00Z' }, { account: 'bob', used: '2026-10-26T00:00:00Z' }] })],
    ['miyu.web.avatars', JSON.stringify({ owner1: { v: 'v1', img: 'data:x' }, bob: { v: 'v2', img: 'data:y' } })],
  ]);
  await withGlobals({ location: at(''), history: { replaceState: () => {} }, localStorage: fakeStorage(disk), sessionStorage: fakeStorage(new Map()) }, async () => {
    const { servedHost } = await import('../src/host/served.js');
    const host = servedHost();
    assert.deepEqual(host.credential(), { login: 'o1' });
    assert.equal(host.formerAccount, 'owner1');
    assert.equal(disk.has('miyu.web.accounts'), false);
    assert.equal(disk.has('miyu.web.avatars'), false);
    assert.equal(host.avatar.get(), 'data:x', '那个账号的头像留着');
    assert.equal(servedHost().formerAccount, null, '迁过一次就没有了');
  });
  // 存储整个用不了（隐私窗口、禁了的）：读写都不抛
  const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
  await withGlobals({ location: at(''), history: { replaceState: () => {} }, localStorage: broken, sessionStorage: broken }, async () => {
    const { servedHost } = await import('../src/host/served.js');
    const none = servedHost();
    assert.equal(none.credential(), null);
    none.remember({ token: 't9' }, true);
    assert.deepEqual(none.credential(), { login: 't9' });
  });
});

test('带票过来（#ticket=，miyu web 开的）：记着的令牌先用、作废了再用票；没有的直接用票；票只用一次；原来存在浏览器里的换到了照旧存；片段里的 as 一起抹掉', async () => {
  const disk = new Map([['miyu.web.login', JSON.stringify({ token: 'o1', expires: LATER })]]);
  const tab = new Map();
  await withGlobals({
    location: at('#ticket=' + 'a'.repeat(64) + '&as=owner1&package=im'),
    history: { replaceState: (_s, _t, url) => { globalThis.location.hash = String(url).includes('#') ? String(url).slice(String(url).indexOf('#')) : ''; } },
    localStorage: fakeStorage(disk), sessionStorage: fakeStorage(tab),
  }, async () => {
    const { servedHost } = await import('../src/host/served.js');
    const a = servedHost();
    assert.equal(location.hash, '#package=im', '票、as 抹掉，别的留着');
    assert.deepEqual(a.credential(), { login: 'o1' }, '先用记着的');
    a.forget();
    assert.deepEqual(a.credential(), { ticket: 'a'.repeat(64) }, '作废了再用票');
    a.remember({ token: 'o2', expires: LATER }, false);
    assert.equal(JSON.parse(disk.get('miyu.web.login') ?? '{}').token, 'o2', '原来存在浏览器里的照旧存');
    assert.equal(a.credential().login, 'o2');
    disk.clear();
    globalThis.location.hash = '#ticket=' + 'b'.repeat(64);
    const b = servedHost();
    assert.deepEqual(b.credential(), { ticket: 'b'.repeat(64) });
    assert.equal(b.credential(), null, '票只用一次');
    b.remember({ token: 'b1', expires: LATER }, false);
    assert.equal(disk.has('miyu.web.login'), false, '原来没存的只放这个标签页');
    globalThis.location.hash = '#ticket=xyz';
    assert.deepEqual(servedHost().credential(), { login: 'b1' }, '写法不对的票当没有');
  });
});

test('头像（核心 AV-1，只有主人那一张）：版本和记着的一样不取；不一样的取一次、缩成小图记下；握手没带的扔掉；换了叫一声', async () => {
  const disk = new Map();
  let drawn = 0;
  await withGlobals({
    location: at(''), history: { replaceState: () => {} }, localStorage: fakeStorage(disk), sessionStorage: fakeStorage(new Map()),
    createImageBitmap: async () => ({ width: 200, height: 100, close() {} }),
    document: { createElement: () => ({ getContext: () => ({ drawImage: () => { drawn += 1; } }), toDataURL: () => `data:image/webp;base64,T${drawn}` }) },
  }, async () => {
    const { servedHost } = await import('../src/host/served.js');
    const host = servedHost();
    let asked = 0;
    const fetch = async () => { asked += 1; return { avatar: 'v2', media_type: 'image/png', data: btoa('png') }; };
    let changed = 0;
    host.avatar.watch(() => { changed += 1; });
    await host.avatar.sync('v2', fetch);
    assert.equal(asked, 1, '没记着的取一次');
    assert.equal(host.avatar.get(), 'data:image/webp;base64,T1');
    assert.equal(host.avatar.version(), 'v2');
    await host.avatar.sync('v2', fetch);
    assert.equal(asked, 1, '版本一样的不取');
    await host.avatar.put('v3', new Blob(['x']));
    assert.equal(host.avatar.version(), 'v3', '自己换了记下新的版本');
    await host.avatar.sync(null, fetch);
    assert.equal(host.avatar.get(), null, '握手没带的扔掉');
    assert.ok(changed >= 3, '换了叫一声');
  });
});

test('一行超过 1 MiB 的请求不发：当场拒 too_large，连接照旧能用（核心一行最长 1 MiB，超了会断掉整条连接）', async () => {
  const ch = /** @type {any} */ (fakeChannel());
  const conn = new Connection(() => ch);
  const up = conn.connect();
  ch.readyState = 1;
  ch.onopen();
  await up;
  await assert.rejects(conn.request('package.call', { data: 'a'.repeat(LINE_MAX) }), (e) => e instanceof Refusal && e.reason === 'too_large');
  assert.equal(ch.sent.length, 0);
  const got = conn.request('session.list', {});
  ch.onmessage({ data: JSON.stringify({ jsonrpc: '2.0', id: ch.sent[0].id, result: { ok: 1 } }) });
  assert.deepEqual(await got, { ok: 1 });
  // 照 UTF-8 算：汉字一个三个字节
  assert.equal(tooLong('汉'.repeat(Math.floor(LINE_MAX / 3))), false);
  assert.equal(tooLong('汉'.repeat(Math.floor(LINE_MAX / 3) + 1)), true);
  assert.equal(tooLong('a'.repeat(LINE_MAX)), false);
  assert.equal(tooLong('a'.repeat(LINE_MAX + 1)), true);
});

test('前缀要变（核心 OV-1 下 prefix_changing）：开轮的那几样问一声，选的带上 prefix 重发同一个请求；取消的拒 prefix_cancelled；别的方法、带了 prefix 的不问', async () => {
  const ch = /** @type {any} */ (fakeChannel());
  const conn = new Connection(() => ch);
  const up = conn.connect();
  ch.readyState = 1;
  ch.onopen();
  await up;
  const asked = [];
  let answer = /** @type {'keep'|'compact'|null} */ ('keep');
  conn.onPrefixAsk = async (data) => { asked.push(data); return answer; };
  const refuse = (/** @type {any} */ req) => ch.onmessage({ data: JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32010, message: 'x', data: { reason: 'prefix_changing', files: ['home/bob/prompts/a.txt'] } } }) });
  const ok = (/** @type {any} */ req) => ch.onmessage({ data: JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { ok: req.params.prefix } }) });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  // 直接发送：带 prefix: keep 重发同一句
  const sent = conn.request('session.send', { session: 's1', text: '你好' });
  refuse(ch.sent[0]);
  await tick();
  assert.deepEqual(ch.sent[1].params, { session: 's1', text: '你好', prefix: 'keep' });
  ok(ch.sent[1]);
  assert.deepEqual(await sent, { ok: 'keep' });
  assert.deepEqual(asked, [{ reason: 'prefix_changing', files: ['home/bob/prompts/a.txt'] }]);
  // 压缩：带 compact
  answer = 'compact';
  const redo = conn.request('session.redo', { session: 's1' });
  refuse(ch.sent[2]);
  await tick();
  assert.equal(ch.sent[3].params.prefix, 'compact');
  ok(ch.sent[3]);
  assert.deepEqual(await redo, { ok: 'compact' });
  // 取消：不重发
  answer = null;
  const cmd = conn.request('command.run', { session: 's1', text: '/review' });
  refuse(ch.sent[4]);
  await assert.rejects(cmd, (e) => e instanceof Refusal && e.reason === 'prefix_cancelled');
  assert.equal(ch.sent.length, 5);
  // 别的方法照原样拒
  const other = conn.request('session.list', {});
  refuse(ch.sent[5]);
  await assert.rejects(other, (e) => e instanceof Refusal && e.reason === 'prefix_changing');
  assert.equal(asked.length, 3);
});
