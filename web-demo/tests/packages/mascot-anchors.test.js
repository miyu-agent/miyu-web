// @ts-check
//! 吉祥物去落脚点（软件包 `mascot`，蓝图 `web.md`「吉祥物」第 11 条）：跳过去扒住一道边、扒着不受重力、露多少、边没了掉下去；
//! 跳上一段台面落在那里；戳、拍、看的姿势和碰那一块的那几下；你的话跟着对话滚不掉。主题包（像素风）的落脚点守规矩。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Body } from '../../packages/mascot/body.js';
import { packProblem, vocabulary } from '../../packages/skin/model.js';
import { tokens as pixel, anchors as pixelAnchors, anchorOffsets as pixelOffsets } from '../../packages/skin-pixel/index.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('packages/mascot/manifest.json'));
const config = Object.fromEntries(Object.entries(manifest.settings).map(([k, s]) => [k, s.default]));
const parts = JSON.parse(read('resources/parts.json'));
const table = JSON.parse(read('resources/mascot-anchors.json'));
Object.assign(globalThis, { innerWidth: 1280, innerHeight: 860 });
const composer = { id: 'composer', x1: 332, x2: 1225, y: 724, bottom: 816 };
const floor = { id: 'floor', x1: 0, x2: 1280, y: 860 };
const side = { id: 'sidebar.edge', x: 277, y1: 52, y2: 860, side: /** @type {const} */ ('right') };

/** 一间屋子：台子、扒得住的边可以换 */
function room(extra = /** @type {any[]} */ ([]), ledges = [side]) {
  const r = {
    list: [composer, floor, ...extra],
    edges: ledges,
    platforms: () => r.list,
    home: () => ({ x: 1161, platform: composer }),
    size: () => ({ w: 52, h: 48 }),
    reduced: () => false,
    ledges: () => r.edges,
  };
  return r;
}
/** 一帧一帧推到 `until` 返回真（最多 `max` 帧），交回推到的时刻 */
function run(body, now, until, max = 400) {
  for (let i = 0; i < max; i++) {
    now += 16;
    const out = body.move(16, now);
    if (until(out)) return now;
  }
  throw new Error('没等到');
}

test('跳过去扒住左栏的右边沿：到那一点扒住，不受重力，身子在边外面露一截、边里面那一截裁掉；朝外转、往外歪', () => {
  const r = room();
  const body = new Body(config, r);
  let now = performance.now();
  body.move(16, now);
  body.at = { x: 354, y: 724, vx: 0, vy: 0, ground: composer };
  assert.ok(body.leapTo(279.6, 690, { kind: 'hang', id: 'sidebar.edge' }));
  now = run(body, now, (o) => !!o.hung);
  assert.equal(body.hang?.id, 'sidebar.edge');
  assert.ok(Math.abs(/** @type {any} */ (body.at).x - (277 + (config.visit.peek - 0.5) * 52)) < 0.01);
  assert.equal(/** @type {any} */ (body.at).y, 690);
  for (let i = 0; i < 100; i++) body.move(16, (now += 16));
  assert.equal(/** @type {any} */ (body.at).y, 690, '扒着不往下掉');
  const s = body.shape(16, now, 0);
  assert.ok(s.clip && s.clip.left > 20 && s.clip.right === 0, '往右探：裁掉左边那一截');
  assert.ok(s.turn > 0 && s.rot > 0, '朝外（右）转、往外歪');
});

test('扒着的边没了（左栏收起）：松手掉下去，落到下面', () => {
  const r = room();
  const body = new Body(config, r);
  let now = performance.now();
  body.move(16, now);
  body.hang = { id: 'sidebar.edge', side: 'right', y: 690, at: now, clip: { left: 0, right: 0 } };
  body.at = { x: 280, y: 690, vx: 0, vy: 0, ground: null };
  body.move(16, (now += 16));
  assert.ok(body.hang, '还在');
  r.edges = [];
  body.move(16, (now += 16));
  assert.equal(body.hang, null, '松手了');
  run(body, now, (o) => o.landed != null && !!body.at?.ground);
  assert.equal(body.at?.ground?.id, 'floor');
});

test('跳上一段台面（设置页的上边沿）：落在那里；动作里拖一下全停', () => {
  const top = { id: 'settings.top', x1: 202, x2: 1078, y: 300 };
  const body = new Body(config, room([top]));
  let now = performance.now();
  body.move(16, now);
  body.at = { x: 1100, y: 724, vx: 0, vy: 0, ground: composer };
  assert.ok(body.leapTo(1056, 300, { kind: 'land', id: 'settings.top' }));
  run(body, now, (o) => o.landed != null && !!body.at?.ground);
  assert.equal(body.at?.ground?.id, 'settings.top');
  body.startAct('pat', { x: 900, y: 280 }, 1000);
  body.grab(1056, 280);
  assert.equal(body.act, null);
  assert.equal(body.trip, null);
});

test('戳：低头弯腰、鳍往下戳，碰那一块两下，做完收；拍：抬起朝它那边的鳍，碰三下；看：侧过身朝它、不碰', () => {
  for (const [kind, hits, target] of /** @type {const} */ ([['poke', 2, { x: 1183, y: 444 }], ['pat', 3, { x: 1250, y: 700 }], ['look', 0, { x: 600, y: 700 }]])) {
    const body = new Body(config, room());
    let now = performance.now();
    body.move(16, now);
    body.at = { x: 1183, y: 724, vx: 0, vy: 0, ground: composer };
    assert.ok(body.startAct(kind, target, 1000));
    let hit = 0;
    let crouch = 0;
    let stride = 0;
    let turn = 0;
    let done = false;
    for (let i = 0; i < 80 && !done; i++) {
      now += 16;
      const o = body.move(16, now);
      if (o.hit) hit += 1;
      if (o.acted) done = true;
      const s = body.shape(16, now, 0);
      crouch = Math.max(crouch, s.crouch);
      stride = Math.abs(s.stride) > Math.abs(stride) ? s.stride : stride;
      turn = Math.abs(s.turn) > Math.abs(turn) ? s.turn : turn;
    }
    assert.ok(done, `${kind} 做完了`);
    assert.equal(hit, hits, `${kind} 碰了几下`);
    if (kind === 'poke') assert.ok(crouch > 0.3 && stride > 1 && Math.abs(turn) < 1, '戳：弯腰、鳍往前、正对着');
    if (kind === 'pat') assert.ok(stride < -1 && turn > 10, '拍：朝右的抬右鳍（stride 负）、侧过身');
    if (kind === 'look') assert.ok(turn < -10 && stride === 0, '看：朝左侧过身，鳍不动');
    assert.equal(body.at?.ground?.id, 'composer', '还站在原地');
  }
});

test('你的话跟着对话滚（stick）：一帧挪了几十像素也跟着下去，不掉；别的台子挪多了照旧掉', () => {
  const bubble = { id: 'message.user#1', x1: 1000, x2: 1200, y: 300, stick: true };
  const r = room([bubble]);
  const body = new Body(config, r);
  let now = performance.now();
  body.move(16, now);
  body.at = { x: 1100, y: 300, vx: 0, vy: 0, ground: bubble };
  r.list = [composer, floor, { ...bubble, y: 380 }];
  body.move(16, (now += 16));
  assert.equal(body.at?.ground?.id, 'message.user#1');
  assert.equal(body.at?.y, 380);
  const plain = { id: 'x', x1: 1000, x2: 1200, y: 300 };
  r.list = [composer, floor, plain];
  body.at = { x: 1100, y: 300, vx: 0, vy: 0, ground: plain };
  r.list = [composer, floor, { ...plain, y: 380 }];
  body.move(16, (now += 16));
  assert.equal(body.at?.ground, null, '挪多了掉');
});

test('像素风的落脚点：加的点、挪的点都认（皮肤包照落脚点表查）；挪的是有像素边的那几处', () => {
  const known = vocabulary(read('styles/tokens.css'));
  const rules = { parts, ids: new Set(table.anchors.map((/** @type {any} */ a) => a.id)) };
  assert.equal(packProblem({ id: 'pixel', tokens: pixel, anchors: pixelAnchors, anchorOffsets: pixelOffsets }, known, rules), null);
  assert.deepEqual(pixelOffsets.composer, { dy: -3 });
  assert.match(String(packProblem({ id: 'pixel', tokens: {}, anchorOffsets: { nope: { dy: 1 } } }, known, rules)), /nope/);
  assert.match(String(packProblem({ id: 'pixel', tokens: {}, anchors: [{ id: 'code', part: 'code', kind: 'ground', edge: 'top' }] }, known, rules)), /pixel\./);
});

test('出厂样子不变：站着的命令列表收起、输入框挪走了往下掉，中间你的话的气泡穿过去，落在输入框上（照原来的）；拖着松手落下来的落在气泡上', () => {
  const float = { id: 'composer.floats#1', x1: 332, x2: 1225, y: 300, carry: true };
  const bubble = { id: 'message.user#1', x1: 1000, x2: 1237, y: 518, stick: true };
  const r = room([float, bubble]);
  const body = new Body(config, r);
  let now = performance.now();
  body.move(16, now);
  body.at = { x: 1183, y: 300, vx: 0, vy: 0, ground: float };
  r.list = [composer, floor, bubble];
  run(body, now, (o) => o.landed != null && !!body.at?.ground);
  assert.equal(body.at?.ground?.id, 'composer');
  // 拖着松手（拎起来就不再是往家掉）
  body.grab(1183, 700);
  body.drag = null;
  body.at = { x: 1183, y: 400, vx: 0, vy: 0, ground: null };
  run(body, now, (o) => o.landed != null && !!body.at?.ground);
  assert.equal(body.at?.ground?.id, 'message.user#1');
});

test('睡着不去别处（第 9 条）：扒着边的松手、要去的作罢、动作收掉、不挑点；在别处睡醒了再待一会儿回家', async () => {
  const { Behavior } = await import('../../packages/mascot/behavior.js');
  Object.assign(globalThis, { window: globalThis, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, document: { hidden: false } });
  const top = { id: 'settings.top', x1: 202, x2: 1078, y: 300 };
  const r = room([top]);
  const io = { ...r, draw: () => {}, place: () => {}, head: () => ({ x: 0, y: 0 }), hold: () => {}, nextProp: () => {}, hidden: () => false, sleeping: () => {},
    world: () => ({ platforms: r.list, ledges: r.edges, hotspots: [] }), touch: () => {} };
  const b = new Behavior(config, io);
  try {
    b.body.move(16, performance.now());
    b.body.hang = { id: 'sidebar.edge', side: 'right', y: 690, at: performance.now(), clip: { left: 0, right: 0 } };
    b.body.at = { x: 280, y: 690, vx: 0, vy: 0, ground: null };
    b.plan = /** @type {any} */ ({ kind: 'ledge', id: 'sidebar.edge', stage: 'leap' });
    b.setAsleep(true);
    assert.equal(b.body.hang, null, '扒着的松手');
    assert.equal(b.plan, null, '要去的作罢');
    b.body.at = { x: 600, y: 300, vx: 0, vy: 0, ground: top };
    assert.equal(b.free(), false);
    assert.equal(b.visit(), false, '睡着不挑点');
    b.setAsleep(false);
    assert.equal(b.away?.id, 'settings.top', '醒了在别处的再待一会儿回家');
    assert.ok(b.visit(), '醒着的照常挑点');
  } finally {
    b.destroy();
  }
});
