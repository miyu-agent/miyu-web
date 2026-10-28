// @ts-check
//! 宿主（蓝图 `web/architecture.md`「宿主」「多用户、多终端」）：平台的 API 只在 `src/host/` 里用；浏览器那一份的地址带口令、
//! 下载带名字；这台设备上存的东西按账号分开；连核心只认一条「像 WebSocket」的线，桌面端换一条线就能用。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urls } from '../src/host/browser.js';
import { accountStorage } from '../src/kernel/storage.js';
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

test('这台设备上存的按账号分开：键带账号，换一个账号看不到（「多用户、多终端」第 5 条）', () => {
  const store = fakeStore();
  const admin = accountStorage(store, 'admin');
  admin.set('packages', { rail: { disabled: true } });
  assert.equal(store.table.get('miyu.admin.packages'), '{"rail":{"disabled":true}}');
  assert.deepEqual(admin.get('packages', {}), { rail: { disabled: true } });
  assert.deepEqual(accountStorage(store, 'alice').get('packages', {}), {});
});

test('存法读写抛错、存的不是 JSON 的，照没有算，不让页面起不来', () => {
  assert.equal(accountStorage(fakeStore(true), 'admin').get('x', 7), 7);
  accountStorage(fakeStore(true), 'admin').set('x', 1);
  const store = fakeStore();
  store.table.set('miyu.admin.x', '{坏的');
  assert.equal(accountStorage(store, 'admin').get('x', 7), 7);
});

test('原来不分账号的旧键，第一次读时搬到这个账号名下', () => {
  const store = fakeStore();
  store.table.set('miyu.packages', '{"todo":{"disabled":true}}');
  const admin = accountStorage(store, 'admin', { packages: 'miyu.packages' });
  assert.deepEqual(admin.get('packages', {}), { todo: { disabled: true } });
  assert.equal(store.table.has('miyu.packages'), false);
  assert.equal(store.table.get('miyu.admin.packages'), '{"todo":{"disabled":true}}');
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

test('直接连网页软件的那一份：一次性码只交一次，接着用记着的登录令牌，忘掉以后交 null；地址带令牌换票据，同一样东西只换一次', async () => {
  const saved = new Map();
  const calls = [];
  const keep = Object.fromEntries(['location', 'history', 'localStorage', 'fetch'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  globalThis.location = /** @type {any} */ ({ hash: '#setup=abc123', pathname: '/', search: '', protocol: 'http:', host: 'x', hostname: '127.0.0.1' });
  globalThis.history = /** @type {any} */ ({ replaceState: () => { globalThis.location.hash = ''; } });
  globalThis.localStorage = /** @type {any} */ ({ getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) });
  globalThis.fetch = /** @type {any} */ (async (path, init) => {
    calls.push([path, init.headers.Authorization, init.body]);
    return { ok: true, json: async () => ({ url: `/media/t${calls.length}` }) };
  });
  try {
    const { servedHost } = await import('../src/host/served.js');
    const host = servedHost();
    assert.equal(location.hash, '', '一次性码从地址栏抹掉');
    assert.deepEqual(host.credential(), { code: 'abc123' });
    assert.equal(host.credential(), null, '码只用一次，没令牌的出登录框');
    assert.equal(await host.urls.blob('sha256:ab', 'image/png'), '', '没登录换不到票据');
    host.remember({ token: 'tok', expires: '2999-01-01T00:00:00Z' }, 'owner1', true);
    assert.deepEqual(host.credential(), { login: 'tok' });
    assert.equal(await host.urls.blob('sha256:ab', 'image/png'), '/media/t1');
    assert.equal(await host.urls.blob('sha256:ab', 'image/png'), '/media/t1', '同一样东西不再换');
    assert.equal(calls.length, 1);
    assert.deepEqual([calls[0][0], calls[0][1], JSON.parse(calls[0][2])], ['/media', 'Bearer tok', { blob: 'sha256:ab', type: 'image/png' }]);
    assert.deepEqual(JSON.parse((await host.urls.file('/a', true), calls[1][2])), { path: '/a', download: true });
    assert.equal(servedHost().credential().login, 'tok', '刷新以后照记着的令牌');
    assert.equal(host.forget(), 'owner1', '交回是哪个账号的');
    assert.equal(servedHost().credential(), null, '忘掉了的出登录框');
    assert.deepEqual(servedHost().accounts().list, [{ account: 'owner1', saved: false }], '账号留着');
    // 管理员给的注册链接（核心 Y-1 上）：邀请码读下来、从地址栏抹掉，握手带它、只交一次；账号页的注册链接照这个网页的地址
    globalThis.location.hash = '#invite=Ab3_x-9';
    globalThis.location.origin = 'http://x';
    const invited = servedHost();
    assert.equal(location.hash, '', '邀请码从地址栏抹掉');
    assert.deepEqual(invited.credential(), { invite: 'Ab3_x-9' });
    assert.equal(invited.credential(), null);
    assert.equal(invited.inviteLink('a b'), 'http://x/#invite=a%20b');
  } finally {
    for (const [k, d] of Object.entries(keep)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});

test('直接连网页软件的那一份记几个账号：旧的令牌迁进表；没勾自动登录的只在这个标签页；点头像拿它的令牌；去掉一个交回要作废的令牌；存不了的不抛', async () => {
  const disk = new Map([['miyu.web.login', JSON.stringify({ token: 'old', expires: '2999-01-01T00:00:00Z' })]]);
  const tab = new Map();
  const keep = Object.fromEntries(['location', 'history', 'localStorage', 'sessionStorage'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  let reloads = 0;
  globalThis.location = /** @type {any} */ ({ hash: '', pathname: '/', search: '', protocol: 'http:', host: 'x', hostname: '127.0.0.1', reload: () => { reloads += 1; } });
  globalThis.history = /** @type {any} */ ({ replaceState: () => {} });
  const fake = (/** @type {Map<string, string>} */ m) => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) });
  globalThis.localStorage = /** @type {any} */ (fake(disk));
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: fake(tab) });
  try {
    const { servedHost } = await import('../src/host/served.js');
    const first = servedHost();
    assert.equal(disk.has('miyu.web.login'), false, '迁完删掉旧的');
    assert.deepEqual(first.credential(), { login: 'old' }, '照迁过来的令牌握手');
    first.signedIn('owner1');
    assert.deepEqual(first.accounts(), { current: 'owner1', list: [{ account: 'owner1', saved: true }] }, '握手回应的账号名填上');

    // 「添加账号」：重新载入出登录框，登录 bob 不勾自动登录：令牌只在这个标签页
    first.addAccount();
    assert.equal(reloads, 1);
    const add = servedHost();
    assert.deepEqual(add.intent(), { add: true });
    assert.equal(add.credential(), null, '添加账号的不拿记着的令牌');
    add.remember({ token: 'b1', expires: '2999-01-01T00:00:00Z' }, 'bob', false);
    assert.equal(JSON.parse(disk.get('miyu.web.accounts') ?? '{}').accounts.find((a) => a.account === 'bob').token, undefined, '表上不存没勾的令牌');
    assert.deepEqual(servedHost().credential(), { login: 'b1' }, '同一个标签页刷新照它');
    assert.deepEqual(servedHost().accounts().list.map((a) => [a.account, a.saved]), [['bob', false], ['owner1', true]]);

    // 换到 owner1（存着令牌的直接进），再换回 bob（这个标签页那份还在）
    servedHost().switchTo('owner1');
    const back = servedHost();
    assert.deepEqual(back.intent(), { pick: 'owner1' });
    assert.deepEqual(back.credential(), { login: 'old' });
    back.switchTo('bob');
    assert.deepEqual(servedHost().credential(), { login: 'b1' });
    tab.clear();
    const fresh = servedHost();
    assert.equal(fresh.credential(), null, '关了标签页（新开一个）bob 要密码');
    assert.equal(fresh.choose('bob'), false, '点 bob：没存令牌');
    assert.equal(fresh.choose('owner1'), true, '点 owner1：存着');
    assert.deepEqual(fresh.credential(), { login: 'old' });

    // 账号管理去掉 owner1：交回要作废的令牌，表上没了
    assert.deepEqual(fresh.dropAccount('owner1'), [{ login: 'old' }]);
    assert.deepEqual(servedHost().accounts().list, [{ account: 'bob', saved: false }]);
    assert.deepEqual(servedHost().dropAccount('bob'), []);

    // 存储整个用不了（隐私窗口、禁了的）：读写都不抛，只管这一次
    const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
    globalThis.localStorage = /** @type {any} */ (broken);
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: () => { throw new Error('no'); } });
    const none = servedHost();
    assert.equal(none.credential(), null);
    none.remember({ token: 't9' }, 'amy', true);
    assert.deepEqual(none.credential(), { login: 't9' });
    assert.deepEqual(none.accounts().list, []);
  } finally {
    for (const [k, d] of Object.entries(keep)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});

test('带票过来（#ticket=&as=，im 设计 07 第 3.6 节、网页-乙）：存着 as 的令牌先用它、作废了再用票；没存的直接用票；换到的照原来勾没勾自动登录记；票从地址栏抹掉、别的留着', async () => {
  const later = '2999-01-01T00:00:00Z';
  const disk = new Map([['miyu.web.accounts', JSON.stringify({ v: 1, current: 'bob', accounts: [{ account: 'bob', used: '2026-10-27T00:00:00Z' }, { account: 'owner1', token: 'o1', expires: later, used: '2026-10-26T00:00:00Z' }] })]]);
  const tab = new Map();
  const keep = Object.fromEntries(['location', 'history', 'localStorage', 'sessionStorage'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  globalThis.location = /** @type {any} */ ({ hash: '', pathname: '/', search: '', protocol: 'http:', host: 'x', hostname: '127.0.0.1', reload: () => {} });
  globalThis.history = /** @type {any} */ ({ replaceState: (_s, _t, url) => { globalThis.location.hash = String(url).includes('#') ? String(url).slice(String(url).indexOf('#')) : ''; } });
  const fake = (/** @type {Map<string, string>} */ m) => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) });
  globalThis.localStorage = /** @type {any} */ (fake(disk));
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: fake(tab) });
  const saved = () => JSON.parse(disk.get('miyu.web.accounts') ?? '{}').accounts.map((a) => [a.account, !!a.token]);
  try {
    const { servedHost } = await import('../src/host/served.js');
    // owner1 存着令牌：先用它；作废了（bad_login）再用票，换到的照旧存（原来勾过自动登录）
    globalThis.location.hash = '#ticket=' + 'a'.repeat(64) + '&as=owner1&package=im';
    const a = servedHost();
    assert.equal(location.hash, '#package=im', '票、账号抹掉，别的留着');
    assert.deepEqual(a.credential(), { login: 'o1' }, '先用存着的');
    assert.equal(a.forget(), 'owner1');
    assert.deepEqual(a.credential(), { ticket: 'a'.repeat(64) }, '作废了再用票');
    a.remember({ token: 'o2', expires: later }, 'owner1', false);
    assert.deepEqual(saved(), [['owner1', true], ['bob', false]], '原来勾过自动登录的照旧存');
    assert.equal(a.credential().login, 'o2', '之后（重连）照换到的');

    // bob 没存令牌：直接用票，换到的只放这个标签页
    globalThis.location.hash = '#ticket=' + 'b'.repeat(64) + '&as=bob';
    const b = servedHost();
    assert.deepEqual(b.credential(), { ticket: 'b'.repeat(64) });
    b.remember({ token: 'b1', expires: later }, 'bob', false);
    assert.deepEqual(saved(), [['bob', false], ['owner1', true]], 'bob 当成上次用的，不存令牌');
    assert.equal(JSON.parse(tab.get('miyu.web.session') ?? '{}').token, 'b1');

    // 没见过的账号：用票，进列表；票只用一次
    globalThis.location.hash = '#ticket=' + 'c'.repeat(64) + '&as=amy';
    const c = servedHost();
    assert.deepEqual(c.credential(), { ticket: 'c'.repeat(64) });
    assert.equal(c.credential()?.ticket, undefined, '票只用一次');
    // 写法不对的票当没有（照存着的）
    globalThis.location.hash = '#ticket=xyz&as=owner1';
    assert.deepEqual(servedHost().credential(), { login: 'b1' }, '照这个标签页的 bob');
    assert.equal(location.hash, '');
  } finally {
    for (const [k, d] of Object.entries(keep)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});

test('头像（核心 AV-1）：握手的版本和记着的一样不取；不一样的取一次、缩成小图记下；握手没带的扔掉；账号去掉时一起去掉', async () => {
  const disk = new Map([['miyu.web.accounts', JSON.stringify({ v: 1, current: 'bob', accounts: [{ account: 'bob', used: '2026-10-28T00:00:00Z' }] })]]);
  const keep = Object.fromEntries(['location', 'history', 'localStorage', 'sessionStorage', 'createImageBitmap', 'document'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  globalThis.location = /** @type {any} */ ({ hash: '', pathname: '/', search: '', protocol: 'http:', host: 'x', hostname: '127.0.0.1', reload: () => {} });
  globalThis.history = /** @type {any} */ ({ replaceState: () => {} });
  const fake = (/** @type {Map<string, string>} */ m) => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) });
  globalThis.localStorage = /** @type {any} */ (fake(disk));
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: fake(new Map()) });
  let drawn = 0;
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async () => ({ width: 200, height: 100, close() {} }) });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => ({ drawImage: () => { drawn += 1; } }), toDataURL: () => `data:image/webp;base64,T${drawn}` }) } });
  try {
    const { servedHost } = await import('../src/host/served.js');
    const host = servedHost();
    let asked = 0;
    const fetch = async () => { asked += 1; return { avatar: 'v2', media_type: 'image/png', data: btoa('png') }; };
    await host.avatars.sync('bob', 'v2', fetch);
    assert.equal(asked, 1, '没记着的取一次');
    assert.deepEqual(host.avatars.get('bob'), { v: 'v2', img: 'data:image/webp;base64,T1' });
    assert.equal(host.accounts().list[0].avatar, 'data:image/webp;base64,T1', '「选择账号」那一排带上');
    let changed = 0;
    host.avatars.watch(() => { changed += 1; });
    await host.avatars.sync('bob', 'v2', fetch);
    assert.equal(asked, 1, '版本一样的不取');
    await host.avatars.put('bob', 'v3', new Blob(['x']));
    assert.equal(host.avatars.get('bob')?.v, 'v3', '自己换了记下新的版本');
    await host.avatars.sync('bob', null, fetch);
    assert.equal(host.avatars.get('bob'), null, '握手没带的扔掉');
    assert.equal('avatar' in host.accounts().list[0], false);
    await host.avatars.sync('bob', 'v4', fetch);
    host.dropAccount('bob');
    assert.equal(JSON.parse(disk.get('miyu.web.avatars') ?? '{}').bob, undefined, '去掉账号一起去掉');
    assert.ok(changed >= 3, '换了叫一声');
  } finally {
    for (const [k, d] of Object.entries(keep)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
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
