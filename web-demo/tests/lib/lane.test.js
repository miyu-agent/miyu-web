// @ts-check
//! 手机上吉祥物缩着站在输入框右上沿、框上面那一行右边给它让一格（`src/lib/lane.js`；蓝图 web.md「手机上」吉祥物那条，
//! 2026-11-14 主人选：原来窄屏不画）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NARROW_DEFAULT, narrowOf, scaleOf, laneOf, homeLaneOf, setLane } from '../../src/lib/lane.js';

const read = (/** @type {string} */ path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('设置项 narrow：照能用的读，不对的照出厂的六成、8px', () => {
  assert.deepEqual(narrowOf(undefined), { scale: 0.6, gap: 8 });
  assert.deepEqual(narrowOf({ scale: 0.5, gap: 4 }), { scale: 0.5, gap: 4 });
  assert.deepEqual(narrowOf({ scale: 0, gap: -1 }), NARROW_DEFAULT);
  assert.deepEqual(narrowOf({ scale: 1.5, gap: 'x' }), NARROW_DEFAULT);
  assert.equal(scaleOf(true, { scale: 0.7 }), 0.7);
  assert.equal(scaleOf(false, { scale: 0.7 }), 1, '宽屏原大小');
});

test('让多宽：从框右边到吉祥物看得见的左边再加 gap；没画的不让', () => {
  assert.equal(laneOf({ left: 300, width: 40 }, 380, 8), 88);
  assert.equal(laneOf({ left: 300, width: 0 }, 380, 8), 0);
  assert.equal(laneOf(null, 380, 8), 0);
  assert.equal(laneOf({ left: 400, width: 10 }, 380, 8), 0, '在框外面右边的不让负的');
  // Deniro：中心离框右边 64，身子 52 宽缩六成：左边离框右边 64 + 15.6
  assert.equal(homeLaneOf(64, 52, 0.6, 8), 88);
  assert.equal(homeLaneOf(64, 52, 1, 8), 98, '宽屏照原大小让');
});

test('两个包各报各的，写在 html 上的是最宽的；都撤了就拿掉', () => {
  const props = new Map();
  const root = /** @type {any} */ ({ style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) } });
  setLane('mascot', 98, root);
  setLane('character', 70, root);
  assert.equal(props.get('--character-lane'), '98px');
  setLane('mascot', 0, root);
  assert.equal(props.get('--character-lane'), '70px');
  setLane('character', 0, root);
  assert.equal(props.has('--character-lane'), false);
});

test('窄屏不再藏吉祥物：两个包的样式里没有窄屏 display: none；外观包的绕脚缩里面那一层', () => {
  for (const path of ['packages/mascot/style.css', 'packages/character/style.css']) {
    assert.doesNotMatch(read(path), /@media \(max-width: 836px\)\s*\{[^}]*(mascot-layer|character-layer)[^}]*display:\s*none/, path);
  }
  assert.match(read('packages/character/style.css'), /\.character-layer > \* > \* \{[^}]*scale: var\(--character-scale, 1\)/);
  assert.doesNotMatch(read('packages/mascot/index.js'), /hidden: \(\) => [^\n]*narrow\.matches/, 'Deniro 窄屏不再算藏着');
});

test('框上面那一行照 --character-lane 让出右边一列（宽屏也让）', () => {
  const dock = read('styles/dock.css');
  assert.match(dock, /--lane-col: max\(0px, calc\(var\(--character-lane, 0px\)/);
  assert.match(dock, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, max-content\) auto var\(--lane-col\)/);
  assert.doesNotMatch(dock, /@media[^{]*\{[^}]*--lane-col/, '不只在窄屏');
  assert.match(read('packages/setup/style.css'), /\.setup-row \{ padding-right: var\(--character-lane, 0px\); \}/, '空会话里框上面那排按钮也让');
});

test('两个包的清单都有设置项 narrow，出厂六成、8px', () => {
  for (const id of ['mascot', 'character']) {
    const m = JSON.parse(read(`packages/${id}/manifest.json`));
    assert.deepEqual(m.settings.narrow.default, { scale: 0.6, gap: 8 }, id);
  }
});
