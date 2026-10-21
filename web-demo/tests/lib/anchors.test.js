// @ts-check
//! 吉祥物的落脚点（`src/lib/anchors.js`，蓝图 `web.md`「吉祥物」第 11 条、「皮肤」第 4 条）：一项认不认、主题加的点和挪的点守不守
//! 规矩、照主题挪、量出台面、站点、扒边、互动点、头顶放不下的不算、互动点站哪、够不够得着、跳过去落得到、扒着露多少。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anchorProblem, combine, hangAt, knownTo, launchFrom, leap, measure, PERCH_HALF, roomy, standFor, tableProblems, themeProblem } from '../../src/lib/anchors.js';
import { KINDS } from '../../packages/mascot/anchors.js';

const parts = JSON.parse(readFileSync(new URL('../../resources/parts.json', import.meta.url), 'utf8'));
const table = JSON.parse(readFileSync(new URL('../../resources/mascot-anchors.json', import.meta.url), 'utf8'));
const ids = new Set(table.anchors.map((/** @type {any} */ a) => a.id));
const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
const o = { key: 'k', inset: 22, w: 52 };

test('一项认不认：种类、边对得上，部件名在表里，动作只认戳、拍、看，只有台面写 carry 这类', () => {
  const ok = { id: 'a.b', part: 'composer', kind: 'ground', edge: 'top', zh: '说明' };
  assert.equal(anchorProblem(ok, parts), null);
  assert.match(String(anchorProblem({ ...ok, id: 'A B' }, parts)), /编号/);
  assert.match(String(anchorProblem({ ...ok, kind: 'wall' }, parts)), /种类 wall/);
  assert.match(String(anchorProblem({ ...ok, edge: 'left' }, parts)), /边只有 top、bottom/);
  assert.match(String(anchorProblem({ ...ok, part: 'nope' }, parts)), /部件名表里没有 nope/);
  assert.match(String(anchorProblem({ ...ok, layer: 'nope' }, parts)), /layer/);
  assert.match(String(anchorProblem({ ...ok, color: 'red' }, parts)), /不认 color/);
  assert.match(String(anchorProblem({ ...ok, kind: 'perch', carry: true }, parts)), /只有台面/);
  assert.match(String(anchorProblem({ ...ok, dy: 'x' }, parts)), /dy/);
  const spot = { id: 's', part: 'composer.send', kind: 'hotspot', edge: 'top', actions: ['poke'] };
  assert.equal(anchorProblem(spot, parts), null);
  assert.match(String(anchorProblem({ ...spot, actions: [] }, parts)), /要写 actions/);
  assert.match(String(anchorProblem({ ...spot, actions: ['kick'] }, parts)), /动作 kick/);
  assert.match(String(anchorProblem({ ...ok, actions: ['poke'] }, parts)), /只有互动点/);
  assert.match(String(anchorProblem({ ...ok, when: 'appear' }, parts)), /when/);
  assert.equal(anchorProblem({ id: 'u', part: 'brand.avatar', kind: 'under', edge: 'bottom' }, parts), null);
  assert.match(String(anchorProblem({ id: 'u', part: 'brand.avatar', kind: 'under', edge: 'top' }, parts)), /边只有 bottom/);
});

test('吉祥物会的那几种：不会的那一种直接跳过；我们的吉祥物不会扒下沿，左上角那三处不量、不去（2026-10-21 项目主人）', () => {
  assert.ok(!KINDS.includes(/** @type {any} */ ('under')));
  const ours = knownTo(table.anchors, KINDS).map((/** @type {any} */ a) => a.id);
  for (const id of ['brand.avatar', 'stage.info', 'sidebar.toggle']) assert.ok(!ours.includes(id), id);
  assert.equal(ours.length, table.anchors.length - 3);
  assert.equal(knownTo(table.anchors, [...KINDS, 'under']).length, table.anchors.length, '会这一种的吉祥物照常算');
});

test('挂进来的（别的包）：可以不写部件名、自己量（at），可以写 group；表里的不行', () => {
  const free = { id: 'welcome.top', kind: 'ground', edge: 'top', group: 'welcome', at: () => null };
  assert.equal(anchorProblem(free, parts, { free: true }), null);
  assert.match(String(anchorProblem(free, parts)), /不写 at/);
  assert.match(String(anchorProblem({ ...free, at: undefined }, parts, { free: true })), /部件名表里没有/);
  assert.match(String(anchorProblem({ ...free, at: 'x' }, parts, { free: true })), /函数/);
  assert.match(String(anchorProblem({ id: 'x', part: 'composer', kind: 'ground', edge: 'top', group: 'w' }, parts)), /group/);
});

test('落脚点表：每一项的部件名都在部件名表里、都有说明，编号不重，needs 指的在表里，平常站的只有一项（输入框）', () => {
  assert.deepEqual(tableProblems(table, parts), []);
  for (const a of table.anchors) {
    assert.ok(parts[a.part], `${a.id} 的部件名 ${a.part} 在表里`);
    if (a.within) assert.ok(parts[a.within], `${a.id} 的 within`);
    if (a.layer) assert.ok(parts[a.layer], `${a.id} 的 layer`);
  }
  assert.deepEqual(table.anchors.filter((/** @type {any} */ a) => a.home).map((/** @type {any} */ a) => a.id), ['composer']);
  // 第一批（2026-10-21）：五种都有；窗口顶上那三处（头像、那一条、左栏开关）是扒下沿
  const kinds = Object.groupBy(table.anchors, (/** @type {any} */ a) => a.kind);
  assert.deepEqual(Object.keys(kinds).sort(), ['ground', 'hotspot', 'ledge', 'perch', 'under']);
  assert.deepEqual(kinds.under?.map((/** @type {any} */ a) => a.id).sort(), ['brand.avatar', 'sidebar.toggle', 'stage.info']);
  assert.deepEqual(tableProblems({ anchors: [...table.anchors, table.anchors[0]] }, parts).filter((x) => x.includes('重了')), ['落脚点 floor 重了']);
  assert.ok(tableProblems({ anchors: [{ ...table.anchors[1], needs: 'gone' }] }, parts).some((x) => x.includes('gone')));
  assert.ok(tableProblems({ anchors: table.anchors.filter((/** @type {any} */ a) => !a.home) }, parts).some((x) => x.includes('home')));
});

test('主题加的点：编号以主题的编号打头、不和表里的重、不写 home；挪的点：键是表里的、自己加的或者一种，dx、dy 在 ±40 以内', () => {
  const mine = { id: 'pixel.code', part: 'code', kind: 'ground', edge: 'top', zh: '' };
  assert.equal(themeProblem({ id: 'pixel', anchors: [mine], anchorOffsets: { composer: { dy: -3 }, ground: { dy: 1 }, under: { dy: 2 }, 'pixel.code': { dx: 2 } } }, parts, ids), null);
  assert.match(String(themeProblem({ id: 'pixel', anchors: [{ ...mine, id: 'code' }] }, parts, ids)), /以 pixel\. 开头/);
  assert.match(String(themeProblem({ id: 'pixel', anchors: [mine, mine] }, parts, ids)), /重了/);
  assert.match(String(themeProblem({ id: 'composer', anchors: [{ ...mine, id: 'composer' }] }, parts, ids)), /以 composer\. 开头|重了/);
  assert.match(String(themeProblem({ id: 'pixel', anchors: [{ ...mine, home: true }] }, parts, ids)), /home/);
  assert.match(String(themeProblem({ id: 'pixel', anchors: [{ ...mine, part: 'nope' }] }, parts, ids)), /nope/);
  assert.match(String(themeProblem({ id: 'pixel', anchors: {} }, parts, ids)), /一串/);
  assert.match(String(themeProblem({ id: 'pixel', anchorOffsets: { nope: { dy: 1 } } }, parts, ids)), /没有落脚点 nope/);
  assert.match(String(themeProblem({ id: 'pixel', anchorOffsets: { composer: { dy: 41 } } }, parts, ids)), /±40/);
  assert.match(String(themeProblem({ id: 'pixel', anchorOffsets: { composer: { dz: 1 } } }, parts, ids)), /只认 dx、dy/);
  assert.match(String(themeProblem({ id: 'pixel', anchorOffsets: [] }, parts, ids)), /anchorOffsets/);
  assert.equal(themeProblem({ id: 'pixel' }, parts, ids), null, '都没写的不查');
});

test('这一回算哪几个：表里的、挂进来的（和表里重了编号的不要）、主题加的；主题照种类、照编号挪，叠起来', () => {
  const t = [{ id: 'composer', part: 'composer', kind: 'ground', edge: 'top', dy: 1 }, { id: 'side', part: 'sidebar', kind: 'ledge', edge: 'right' }];
  const mounted = [{ id: 'composer', part: 'sidebar', kind: 'ground', edge: 'top' }, { id: 'w', part: 'composer', kind: 'ground', edge: 'top' }];
  const got = combine(/** @type {any} */ (t), /** @type {any} */ (mounted), {
    anchors: [/** @type {any} */ ({ id: 'p.x', part: 'code', kind: 'ground', edge: 'top' })],
    offsets: { ground: { dy: -3 }, composer: { dy: -1, dx: 2 }, side: { dx: 3 } },
  });
  assert.deepEqual(got.map((a) => [a.id, a.part, a.dx ?? 0, a.dy ?? 0]), [['composer', 'composer', 2, -3], ['side', 'sidebar', 3, 0], ['w', 'composer', 0, -3], ['p.x', 'code', 0, -3]]);
  assert.equal(combine(/** @type {any} */ (t), [], null)[0], t[0], '没有主题的原样交回');
});

test('量台面：上边沿两头各让多少（不写的照默认）、只取正中一段、挪多少、实心的下沿、顶得上去的、跟着挪的；整页的底照下边沿', () => {
  const r = rect(100, 300, 500, 400);
  assert.deepEqual(measure(/** @type {any} */ ({ kind: 'ground', edge: 'top' }), r, o).platform, { id: 'k', x1: 122, x2: 478, y: 300 });
  assert.deepEqual(measure(/** @type {any} */ ({ kind: 'ground', edge: 'top', inset: 0, solid: true, carry: true, stick: true, dy: -3 }), r, o).platform,
    { id: 'k', x1: 100, x2: 500, y: 297, bottom: 397, carry: true, stick: true });
  assert.deepEqual(measure(/** @type {any} */ ({ kind: 'ground', edge: 'top', span: 160, dx: 10 }), r, o).platform, { id: 'k', x1: 230, x2: 390, y: 300 });
  assert.equal(measure(/** @type {any} */ ({ kind: 'ground', edge: 'bottom', inset: 0 }), rect(0, 0, 1280, 860), o).platform?.y, 860);
});

test('量站点、扒边、互动点：站点是上边沿正中一小段；扒边是哪一道边、往哪边探；互动点站在正上方或者旁边（隔半个身子）', () => {
  const r = rect(100, 300, 140, 340);
  assert.deepEqual(measure(/** @type {any} */ ({ kind: 'perch', edge: 'top' }), r, o).platform, { id: 'k', x1: 120 - PERCH_HALF, x2: 120 + PERCH_HALF, y: 300, perch: true });
  assert.deepEqual(measure(/** @type {any} */ ({ kind: 'ledge', edge: 'right', dx: 3 }), rect(0, 0, 277, 860), o).ledge, { id: 'k', x: 280, y1: 0, y2: 860, side: 'right' });
  assert.equal(measure(/** @type {any} */ ({ kind: 'ledge', edge: 'left' }), rect(180, 90, 1100, 770), o).ledge?.side, 'left');
  const top = measure(/** @type {any} */ ({ kind: 'hotspot', edge: 'top', actions: ['poke'] }), r, o).hotspot;
  assert.deepEqual([top?.x, top?.y, top?.side, top?.actions], [120, 320, 'top', ['poke']]);
  assert.equal(measure(/** @type {any} */ ({ kind: 'hotspot', edge: 'right', actions: ['pat'] }), r, o).hotspot?.x, 140 + 26 + 4);
  assert.equal(measure(/** @type {any} */ ({ kind: 'hotspot', edge: 'left', actions: ['look'], when: 'appear' }), r, o).hotspot?.when, 'appear');
  assert.deepEqual(measure(/** @type {any} */ ({ kind: 'under', edge: 'bottom', dy: 1 }), rect(57, 16, 99, 58), o).under, { id: 'k', x1: 57, x2: 99, y: 59 }, '扒下沿：那一块的下沿，不写 inset 的不让');
});

test('头顶放不下的不算：离窗口上沿不到一个身子高（左上角的头像、那一条在 16px、13px）', () => {
  assert.equal(roomy({ y: 16 }, 48), false);
  assert.equal(roomy({ y: 48 }, 48), true);
});

test('互动点站哪：那一点下面（或者上面不远）最近的台面，x 要在它里面；站点不算', () => {
  const composer = { id: 'composer', x1: 332, x2: 1225, y: 382 };
  const floor = { id: 'floor', x1: 0, x2: 1280, y: 860 };
  const perch = { id: 'p', x1: 1210, x2: 1222, y: 400, perch: true };
  const send = /** @type {any} */ ({ id: 's', x: 1217, y: 444, rect: rect(1200, 427, 1235, 462), side: 'top', actions: ['poke'] });
  assert.equal(standFor(send, [floor, perch, composer])?.id, 'composer', '发送按钮在框里：站在框的上边沿');
  const notice = /** @type {any} */ ({ id: 'n', x: 700, y: 360, rect: rect(332, 340, 670, 376), side: 'right', actions: ['look'] });
  assert.equal(standFor(notice, [floor, composer])?.id, 'composer', '提示浮在框上面：站在框上、它右边');
  const toggle = /** @type {any} */ ({ id: 't', x: 78, y: 37, rect: rect(15, 21, 48, 54), side: 'right', actions: ['pat'] });
  assert.equal(standFor(toggle, [floor, composer]), null, '左栏开关旁边没有台面');
});

test('够不够得着：走到脚下这一段上离它最近的地方（两头让开），横着、往上都在够得着的以内', () => {
  const me = { x: 1183, ground: { id: 'composer', x1: 332, x2: 1225, y: 724 } };
  const reach = { reach_x: 480, reach_up: 340 };
  assert.equal(launchFrom(me, { x: 280, y: 700 }, reach, 22), 354, '左栏的边：走到框的左头起跳');
  assert.equal(launchFrom(me, { x: 1100, y: 700 }, reach, 22), 1100, '正上方的：原地起跳');
  assert.equal(launchFrom(me, { x: 1100, y: 300 }, reach, 22), null, '太高');
  assert.equal(launchFrom({ ...me, ground: { ...me.ground, x1: 900, x2: 1225 } }, { x: 280, y: 700 }, reach, 22), null, '太远');
});

test('跳过去：照这个速度、重力一步步走，落到那一点（往下落着经过它）的时候正好在那里', () => {
  const g = 2600;
  for (const [x, y, tx, ty] of [[354, 724, 280, 600], [1183, 724, 900, 760], [500, 860, 520, 500]]) {
    const v = leap(x, y, tx, ty, g, 28);
    assert.ok(v.vy < 0, '往上跳');
    let px = x;
    let py = y;
    let vy = v.vy;
    const steps = 2000;
    const dt = v.t / steps;
    for (let i = 0; i < steps; i++) {
      vy += g * dt;
      px += v.vx * dt;
      py += vy * dt;
    }
    assert.ok(Math.abs(px - tx) < 0.5 && Math.abs(py - ty) < 2, `落到 (${tx}, ${ty})：${px.toFixed(1)}, ${py.toFixed(1)}`);
    assert.ok(vy > 0, '经过的时候在往下落');
  }
});

test('扒着露多少：身子中线在边外面，边里面那一截裁掉；往右探的裁左边，往左探的裁右边', () => {
  const right = hangAt({ id: 'x', x: 277, y1: 0, y2: 860, side: 'right' }, 52, 0.55);
  assert.ok(Math.abs(right.x - (277 + 0.05 * 52)) < 1e-9);
  assert.ok(Math.abs(right.left - 0.45 * 52) < 1e-9);
  assert.equal(right.right, 0);
  const left = hangAt({ id: 'y', x: 180, y1: 90, y2: 770, side: 'left' }, 52, 0.55);
  assert.ok(left.x < 180 && left.left === 0 && left.right > 0);
});
