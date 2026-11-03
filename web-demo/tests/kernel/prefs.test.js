// @ts-check
//! 个人那一层跟着人走（蓝图 `web/architecture.md`「配置」第 2 条，核心 HP-1）：订上拿整份照它换；本地改当场换、只送改了的键；
//! 别处改了推来的整份照它换；掉了队重订；第一次连上、核心那份空的推一次原来的，之后以核心为准；旧核心、走桥的照只记在这台设备上；
//! 整份超过上限的说一句、这一次的退回；断着时改的留着，重订以后再送。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prefs, PACKAGE } from '../../src/kernel/prefs.js';

/** 核心拒绝的样子（同 `Refusal`） */
const refusal = (/** @type {string|null} */ reason, code = -32010, data = null) => Object.assign(new Error(reason ?? 'no'), { reason, code, data });

/**
 * 假的核心和这台浏览器：核心那份 `stored`，照顶层的键并；记下问了什么、浏览器里记着的、对了几次账、说了几次存不下。
 * @param {{stored?: Record<string, any>, cached?: Record<string, any>, moved?: boolean, refuse?: (method: string, params: any) => any}} [opts]
 */
function world({ stored = {}, cached = {}, moved = false, refuse = () => null } = {}) {
  const core = { stored: structuredClone(stored), refuse };
  /** @type {any[]} */
  const sent = [];
  const local = { layer: structuredClone(cached), moved, changed: 0, tooBig: 0 };
  const prefs = new Prefs({
    request: async (method, params) => {
      sent.push([method, structuredClone(params)]);
      const no = core.refuse(method, params);
      if (no) throw no;
      if (method === 'subscribe') return { values: structuredClone(core.stored) };
      if (method === 'prefs.set') {
        for (const [k, v] of Object.entries(params.values)) {
          if (v === null) delete core.stored[k];
          else core.stored[k] = v;
        }
        return { values: structuredClone(core.stored) };
      }
      throw refusal(null, -32601);
    },
    cache: { get: () => structuredClone(local.layer), set: (layer) => { local.layer = structuredClone(layer); } },
    moved: { get: () => local.moved, set: () => { local.moved = true; } },
    changed: async () => { local.changed += 1; },
    tooBig: () => { local.tooBig += 1; },
  });
  return { prefs, core, sent, local };
}

/** 等排着的都跑完 */
const settle = () => new Promise((done) => setTimeout(done, 0));

test('起来先照浏览器里记着的；订上了拿整份照它换掉，浏览器里那份跟着换', async () => {
  const w = world({ stored: { skin: { config: { pack: 'paper' } } }, cached: { skin: { config: { pack: 'pixel' } } }, moved: true });
  assert.deepEqual(w.prefs.get(), { skin: { config: { pack: 'pixel' } } });
  await w.prefs.follow();
  assert.deepEqual(w.sent, [['subscribe', { stream: 'prefs', package: PACKAGE }]]);
  assert.equal(w.prefs.mode, 'core');
  assert.deepEqual(w.prefs.get(), { skin: { config: { pack: 'paper' } } });
  assert.deepEqual(w.local.layer, { skin: { config: { pack: 'paper' } } });
  assert.equal(w.local.changed, 1);
});

test('核心交回的和浏览器里一样（键排的先后不同也算）：不重新对账', async () => {
  const w = world({ stored: { theme: { config: { scheme: 'dark', palette: 'mono' } } }, cached: { theme: { config: { palette: 'mono', scheme: 'dark' } } }, moved: true });
  await w.prefs.follow();
  assert.equal(w.local.changed, 0);
});

test('本地改了当场换上、只送改了的那个顶层键；核心交回的整份照它换', async () => {
  const w = world({ stored: { theme: { config: { scheme: 'dark' } }, skin: { config: { pack: 'paper' } } }, moved: true });
  await w.prefs.follow();
  w.sent.length = 0;
  const done = w.prefs.edit('theme', (had) => ({ ...had, config: { ...had?.config, scheme: 'light' } }));
  // 不等核心：这一刻已经照新的画
  assert.deepEqual(w.prefs.get().theme, { config: { scheme: 'light' } });
  await done;
  await settle();
  assert.deepEqual(w.sent, [['prefs.set', { package: PACKAGE, values: { theme: { config: { scheme: 'light' } } } }]]);
  assert.deepEqual(w.core.stored, { theme: { config: { scheme: 'light' } }, skin: { config: { pack: 'paper' } } });
  assert.deepEqual(w.local.layer, w.core.stored);
});

test('改成没有（交 null）的送 null 删掉这个键；改得和原来一样的不送', async () => {
  const w = world({ stored: { mascot: { disabled: false }, skin: { config: { pack: 'paper' } } }, moved: true });
  await w.prefs.follow();
  w.sent.length = 0;
  await w.prefs.edit('skin', (had) => ({ ...had }));
  await w.prefs.edit('mascot', () => null);
  await settle();
  assert.deepEqual(w.sent, [['prefs.set', { package: PACKAGE, values: { mascot: null } }]]);
  assert.deepEqual(w.core.stored, { skin: { config: { pack: 'paper' } } });
  assert.equal(w.prefs.get().mascot, undefined);
});

test('连着改好几下（同一个键）：照改的先后一件件送，后一下照前一下改完的算', async () => {
  const w = world({ moved: true });
  await w.prefs.follow();
  w.sent.length = 0;
  const seam = (/** @type {string} */ name, /** @type {string} */ id) => w.prefs.edit('kernel', (had) => ({ ...had, config: { ...had?.config, seams: { ...had?.config?.seams, [name]: id } } }));
  seam('render.timeline', 'plain');
  seam('render.markdown', 'plain');
  assert.deepEqual(w.prefs.get().kernel.config.seams, { 'render.timeline': 'plain', 'render.markdown': 'plain' });
  await settle();
  assert.equal(w.sent.length, 2);
  assert.deepEqual(w.core.stored.kernel.config.seams, { 'render.timeline': 'plain', 'render.markdown': 'plain' });
});

test('别处改了推来的整份：当场照它换；别的包的、没订上时推来的不认', async () => {
  const w = world({ stored: { skin: { config: { pack: 'paper' } } }, moved: true });
  assert.equal(w.prefs.push('prefs.changed', { package: PACKAGE, values: { skin: { config: { pack: 'x' } } } }), false);
  await w.prefs.follow();
  const before = w.local.changed;
  assert.equal(w.prefs.push('prefs.changed', { package: 'miyu-tui', values: {} }), false);
  assert.equal(w.prefs.push('prefs.changed', { package: PACKAGE, values: { theme: { config: { scheme: 'dark' } } } }), true);
  assert.deepEqual(w.prefs.get(), { theme: { config: { scheme: 'dark' } } });
  assert.deepEqual(w.local.layer, { theme: { config: { scheme: 'dark' } } });
  assert.equal(w.local.changed, before + 1);
});

test('掉了队（resync）重新订、照这一刻的整份换', async () => {
  const w = world({ stored: { skin: { config: { pack: 'paper' } } }, moved: true });
  await w.prefs.follow();
  w.core.stored = { skin: { config: { pack: 'pixel' } } };
  assert.equal(w.prefs.push('resync', { stream: 'prefs', package: PACKAGE }), true);
  assert.equal(w.prefs.push('resync', { stream: 'config' }), false);
  await settle();
  assert.deepEqual(w.sent.map((s) => s[0]), ['subscribe', 'subscribe']);
  assert.deepEqual(w.prefs.get(), { skin: { config: { pack: 'pixel' } } });
});

test('第一次连上、核心那份是空的：把浏览器里原来的那一层整份推上去一次，记下搬过了；再连上不再推', async () => {
  const old = { theme: { config: { scheme: 'dark' } }, kernel: { config: { seams: { 'render.timeline': 'plain' } } } };
  const w = world({ cached: old });
  await w.prefs.follow();
  assert.deepEqual(w.sent, [['subscribe', { stream: 'prefs', package: PACKAGE }], ['prefs.set', { package: PACKAGE, values: old }]]);
  assert.deepEqual(w.core.stored, old);
  assert.deepEqual(w.prefs.get(), old);
  assert.equal(w.local.moved, true);
  // 别处全改回出厂（核心那份空了）：这台再连上照核心的，不再推原来的
  w.core.stored = {};
  w.sent.length = 0;
  await w.prefs.follow();
  assert.deepEqual(w.sent.map((s) => s[0]), ['subscribe']);
  assert.deepEqual(w.prefs.get(), {});
  assert.deepEqual(w.local.layer, {});
});

test('第一次连上、核心那份不空：以核心的为准，浏览器里原来的不推、换成核心的', async () => {
  const w = world({ stored: { skin: { config: { pack: 'paper' } } }, cached: { theme: { config: { scheme: 'dark' } } } });
  await w.prefs.follow();
  assert.deepEqual(w.sent.map((s) => s[0]), ['subscribe']);
  assert.deepEqual(w.prefs.get(), { skin: { config: { pack: 'paper' } } });
  assert.equal(w.local.moved, true);
});

test('第一次连上、两边都是空的：没什么可搬，记下搬过了', async () => {
  const w = world();
  await w.prefs.follow();
  assert.deepEqual(w.sent.map((s) => s[0]), ['subscribe']);
  assert.equal(w.local.moved, true);
});

test('推原来那一层时断了：留着、不算搬过，重订时核心还是空的接着推；重订时核心已经有了的不再推', async () => {
  const old = { theme: { config: { scheme: 'dark' } } };
  let down = true;
  const w = world({ cached: old, refuse: (method) => (method === 'prefs.set' && down ? refusal('disconnected', -32000) : null) });
  await w.prefs.follow();
  assert.equal(w.local.moved, false);
  assert.deepEqual(w.prefs.get(), old);
  down = false;
  await w.prefs.follow();
  assert.deepEqual(w.core.stored, old);
  assert.equal(w.local.moved, true);

  const v = world({ cached: old, refuse: (method) => (method === 'prefs.set' && down ? refusal('disconnected', -32000) : null) });
  down = true;
  await v.prefs.follow();
  v.core.stored = { skin: { config: { pack: 'paper' } } };
  down = false;
  await v.prefs.follow();
  assert.deepEqual(v.sent.filter((s) => s[0] === 'prefs.set'), [['prefs.set', { package: PACKAGE, values: old }]]);
  assert.deepEqual(v.prefs.get(), { skin: { config: { pack: 'paper' } } });
  assert.equal(v.local.moved, true);
});

test('旧核心（订不上：没有这个流、没有这个方法）、网页不是装着的界面包：照只记在这台设备上，改了不送', async () => {
  for (const no of [refusal('bad_params', -32602), refusal(null, -32601), refusal('not_a_ui_package'), refusal('unknown_package')]) {
    const w = world({ cached: { skin: { config: { pack: 'paper' } } }, refuse: (method) => (method === 'subscribe' ? no : null) });
    const had = console.info;
    console.info = () => {};
    try {
      await w.prefs.follow();
    } finally {
      console.info = had;
    }
    assert.equal(w.prefs.mode, 'local');
    assert.deepEqual(w.prefs.get(), { skin: { config: { pack: 'paper' } } });
    await w.prefs.edit('theme', () => ({ config: { scheme: 'dark' } }));
    await settle();
    assert.deepEqual(w.sent.map((s) => s[0]), ['subscribe']);
    assert.deepEqual(w.local.layer, { skin: { config: { pack: 'paper' } }, theme: { config: { scheme: 'dark' } } });
    assert.equal(w.local.moved, false);
  }
});

test('订上以前改的：先当场换上，订上了接着送', async () => {
  const w = world({ stored: { skin: { config: { pack: 'paper' } } }, moved: true });
  w.prefs.edit('theme', () => ({ config: { scheme: 'dark' } }));
  assert.deepEqual(w.prefs.get().theme, { config: { scheme: 'dark' } });
  assert.deepEqual(w.sent, []);
  await w.prefs.follow();
  assert.deepEqual(w.core.stored, { skin: { config: { pack: 'paper' } }, theme: { config: { scheme: 'dark' } } });
  assert.deepEqual(w.prefs.get(), w.core.stored);
});

test('整份超过上限：说一句，这一次的退回，浏览器里的照改之前的', async () => {
  const before = { skin: { config: { pack: 'paper' } } };
  const w = world({ stored: before, moved: true, refuse: (method, params) => (method === 'prefs.set' && params.values.big ? refusal('prefs_too_big', -32010, /** @type {any} */ ({ size: 70000, limit: 65536 })) : null) });
  await w.prefs.follow();
  w.prefs.edit('big', () => ({ config: { blob: 'x' } }));
  assert.ok(w.prefs.get().big);
  await settle();
  assert.equal(w.local.tooBig, 1);
  assert.deepEqual(w.prefs.get(), before);
  assert.deepEqual(w.local.layer, before);
  assert.deepEqual(w.core.stored, before);
  // 之后照常改
  await w.prefs.edit('theme', () => ({ config: { scheme: 'dark' } }));
  await settle();
  assert.deepEqual(w.core.stored.theme, { config: { scheme: 'dark' } });
});

test('原来那一层推不上去（超过上限）：说一句，不丢它，照旧只记在这台设备上', async () => {
  const old = { theme: { config: { scheme: 'dark' } } };
  const w = world({ cached: old, refuse: (method) => (method === 'prefs.set' ? refusal('prefs_too_big') : null) });
  await w.prefs.follow();
  assert.equal(w.local.tooBig, 1);
  assert.equal(w.prefs.mode, 'local');
  assert.deepEqual(w.prefs.get(), old);
  assert.deepEqual(w.local.layer, old);
  assert.equal(w.local.moved, false);
});

test('断着时改的留着、照新的画；重订以后接着送', async () => {
  let down = false;
  const w = world({ moved: true, refuse: () => (down ? refusal('disconnected', -32000) : null) });
  await w.prefs.follow();
  down = true;
  w.prefs.edit('theme', () => ({ config: { scheme: 'dark' } }));
  await settle();
  assert.deepEqual(w.prefs.get().theme, { config: { scheme: 'dark' } });
  assert.deepEqual(w.core.stored, {});
  down = false;
  await w.prefs.follow();
  assert.deepEqual(w.core.stored, { theme: { config: { scheme: 'dark' } } });
});
