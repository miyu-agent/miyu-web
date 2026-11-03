// @ts-check
//! 二维码（`src/lib/qr/`，W-1086）：几个已知的串编出来，照规范一格格读回去（格式信息、掩码、Z 字读法、字节模式）还是原来那几个字节；
//! 版本照长短挑、三个角的定位块在；SVG 路径一格一段、四边留白。读回去只认单块的版本 1–3（M 级），局域网地址都在这个范围里。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrPath, QUIET } from '../../src/lib/qr/index.js';

/** M 级各版本的数据码字个数（单块） */
const DATA_WORDS = { 1: 16, 2: 28, 3: 44 };

/** 八种掩码（规范 8.8.1；`y` 是行、`x` 是列） */
const MASKS = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (_, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

/** 格式信息（左上角那一份）：交回纠错级别的两位、掩码，和 BCH 校验对不对。 @param {boolean[][]} m */
function format(m) {
  const at = (x, y) => (m[y][x] ? 1 : 0);
  const spots = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  let bits = 0;
  spots.forEach(([x, y], i) => { bits |= at(x, y) << i; });
  bits ^= 0x5412;
  const data = bits >> 10;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return { level: data >> 3, mask: data & 7, ok: ((data << 10) | rem) === bits };
}

/** 是不是功能格（定位块和分隔、格式信息、定时线、对齐块、那一个固定的深色格）：读数据时跳过。 */
function functional(n, y, x) {
  const v = (n - 17) / 4;
  if ((y < 9 && x < 9) || (y < 9 && x >= n - 8) || (y >= n - 8 && x < 9)) return true;
  if (y === 6 || x === 6) return true;
  if (v >= 2) {
    const c = 4 * v + 10;
    if (Math.abs(y - c) <= 2 && Math.abs(x - c) <= 2) return true;
  }
  return false;
}

/** 照规范读回去：去掉掩码，Z 字读出码字，取字节模式的那几个字节。 @param {boolean[][]} m */
function decode(m) {
  const n = m.length;
  const v = (n - 17) / 4;
  const { level, mask, ok } = format(m);
  assert.ok(ok, '格式信息的校验对得上');
  assert.equal(level, 0, 'M 级（两位是 00）');
  const bits = [];
  let up = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let i = 0; i < n; i += 1) {
      const y = up ? n - 1 - i : i;
      for (const x of [right, right - 1]) {
        if (!functional(n, y, x)) bits.push(m[y][x] !== MASKS[mask](y, x) ? 1 : 0);
      }
    }
    up = !up;
  }
  const words = [];
  for (let i = 0; i + 8 <= bits.length && words.length < DATA_WORDS[v]; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  const stream = words.flatMap((w) => Array.from({ length: 8 }, (_, i) => (w >> (7 - i)) & 1));
  const read = (from, len) => stream.slice(from, from + len).reduce((a, b) => (a << 1) | b, 0);
  assert.equal(read(0, 4), 0b0100, '字节模式');
  const count = read(4, 8);
  return Uint8Array.from({ length: count }, (_, i) => read(12 + i * 8, 8));
}

const utf8 = (/** @type {string} */ s) => new TextEncoder().encode(s);

test('已知的几个串：编出来照规范读回去还是那几个字节', () => {
  for (const text of ['HELLO', 'http://192.168.1.23:8300/', 'http://192.168.100.200:8300/', 'http://[fe80::1]:8300/', 'Miyu 你好']) {
    assert.deepEqual(decode(qrMatrix(text)), utf8(text), text);
  }
});

test('版本照长短挑：短的 21 格，局域网地址 25、29 格；三个角是定位块', () => {
  assert.equal(qrMatrix('HELLO').length, 21);
  assert.equal(qrMatrix('http://192.168.1.23:8300/').length, 25);
  assert.equal(qrMatrix('http://192.168.100.200:8300/').length, 29);
  const m = qrMatrix('http://192.168.1.23:8300/');
  const n = m.length;
  for (const [oy, ox] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const ring = Math.max(Math.abs(y - 3), Math.abs(x - 3));
        assert.equal(m[oy + y][ox + x], ring !== 2, `定位块 ${oy},${ox} 的 ${y},${x}`);
      }
    }
  }
});

test('SVG 路径：一个深色格一段，坐标加上四边留白', () => {
  const { path, size } = qrPath([[true, false], [false, true]]);
  assert.equal(size, 2 + QUIET * 2);
  assert.equal(path, `M${QUIET} ${QUIET}h1v1h-1zM${QUIET + 1} ${QUIET + 1}h1v1h-1z`);
  const m = qrMatrix('HELLO');
  assert.equal(qrPath(m).path.split('M').length - 1, m.flat().filter(Boolean).length);
});
