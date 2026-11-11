// @ts-check
//! 手机上的几样（`src/lib/touch.js`，蓝图 `web.md`「手机上」）：可见区域、浮层挪回屏幕里、划一下、写剪贴板的老办法。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleBox, shiftInto, swipeOf, writeText, legacyCopy, SWIPE_MIN } from '../../src/lib/touch.js';

test('可见区域：输入法弹出来照可见的高，矮一大截才算输入法开着；捏着放大的不跟；没有这个接口的是 null', () => {
  assert.deepEqual(visibleBox({ height: 844, offsetTop: 0, scale: 1 }, 844), { height: 844, top: 0, keyboard: false });
  assert.deepEqual(visibleBox({ height: 788.4, offsetTop: 0, scale: 1 }, 844), { height: 788, top: 0, keyboard: false }, '地址栏伸缩不算输入法');
  assert.deepEqual(visibleBox({ height: 508, offsetTop: 336, scale: 1 }, 844), { height: 508, top: 336, keyboard: true }, 'iOS：页面被往上推了');
  assert.equal(visibleBox({ height: 422, offsetTop: 100, scale: 2 }, 844), null, '放大着');
  assert.equal(visibleBox(null, 844), null);
  assert.equal(visibleBox({ height: 0, offsetTop: 0, scale: 1 }, 844), null);
});

test('浮层挪回屏幕里：超出右边往左挪、超出左边往右挪，在里面的不动，比屏幕还宽的贴左边', () => {
  assert.equal(shiftInto(39, 397, 0, 390), -15, '左上角的会话信息卡：右边超出 7px，挪到离右边 8px');
  assert.equal(shiftInto(-20, 200, 0, 390), 28);
  assert.equal(shiftInto(100, 300, 0, 390), 0);
  assert.equal(shiftInto(8, 382, 0, 390), 0, '正好贴着两边的留白');
  assert.equal(shiftInto(30, 430, 0, 390), -22, '比屏幕宽：贴左边');
  assert.equal(shiftInto(0, 100, 0, 390, 0), 0);
});

test('划一下：横着走够远、比竖着多一倍以上才算；竖着滚的、走得短的不算', () => {
  const at = (x, y) => ({ x, y });
  assert.equal(swipeOf(at(300, 400), at(300 - SWIPE_MIN, 410)), 'left');
  assert.equal(swipeOf(at(40, 400), at(160, 380)), 'right');
  assert.equal(swipeOf(at(300, 400), at(300 - SWIPE_MIN + 1, 400)), null, '不够远');
  assert.equal(swipeOf(at(300, 400), at(220, 460)), null, '斜着：竖的太多');
  assert.equal(swipeOf(at(300, 400), at(300, 700)), null, '竖着滚');
});

/** 假的页面：记下放过的文本框、选没选、`execCommand` 回什么 */
function fakeDoc(ok = true) {
  const log = { appended: 0, removed: 0, selected: '', refocused: 0, commands: /** @type {string[]} */ ([]) };
  const active = { focus: () => { log.refocused += 1; }, closest: () => null };
  const doc = {
    body: { append: () => { log.appended += 1; } },
    activeElement: active,
    createElement: () => {
      /** @type {any} */
      const box = { value: '', style: {}, setAttribute: () => {}, focus: () => {}, select: () => { log.selected = box.value; }, setSelectionRange: () => {}, remove: () => { log.removed += 1; } };
      return box;
    },
    execCommand: (/** @type {string} */ name) => { log.commands.push(name); if (ok === null) throw new Error('nope'); return ok; },
  };
  return { doc, log };
}

test('写剪贴板：有 navigator.clipboard 的用它；没有的（局域网 http 打开，不是安全上下文）退回文本框加 execCommand', async () => {
  const written = /** @type {string[]} */ ([]);
  assert.equal(await writeText('甲', { navigator: { clipboard: { writeText: async (/** @type {string} */ s) => { written.push(s); } } }, document: null }), 'api');
  assert.deepEqual(written, ['甲']);
  // 2026-11-11 项目主人：手机上点复制没反应——`navigator.clipboard` 是 undefined，原来直接 `navigator.clipboard.writeText` 抛 TypeError
  const { doc, log } = fakeDoc();
  assert.equal(await writeText('乙丙', { navigator: {}, document: doc }), 'legacy');
  assert.deepEqual(log, { appended: 1, removed: 1, selected: '乙丙', refocused: 1, commands: ['copy'] }, '文本框用完拿掉、焦点还回去');
});

test('写剪贴板：接口拒了的也试老办法；两条路都不行的抛 unsupported', async () => {
  const denied = { clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } } };
  const good = fakeDoc();
  assert.equal(await writeText('丁', { navigator: denied, document: good.doc }), 'legacy');
  for (const ok of [false, null]) {
    const bad = fakeDoc(/** @type {any} */ (ok));
    await assert.rejects(writeText('戊', { navigator: denied, document: bad.doc }), (/** @type {any} */ e) => e.reason === 'unsupported');
    assert.equal(bad.log.removed, 1, '不成也把文本框拿掉');
  }
  await assert.rejects(writeText('己', { navigator: undefined, document: undefined }), (/** @type {any} */ e) => e.reason === 'unsupported');
  assert.equal(legacyCopy('庚', null), false);
});
