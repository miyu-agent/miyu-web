// @ts-check
//! 整页里的表单（软件包 `widgets` 的 `forms.js`，蓝图 `web.md`「界面块」第 7 条；核心 `widgets.md`「整页里能改」）：只交改过的格、改回默认的
//! 交 `null`；推来新内容时人改的留着、打架的标出来；包回的保存结果；数字框；分段按钮；列表里一行的几样。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, edit, dirty, changes, revert, savedAll, merge, outcome, current, numberOf, segmented, initialOf, matches, badgeOf, stateOf } from '../../packages/widgets/forms.js';

/** 一张表单：人格（下拉，默认）、触发词（一排）、字号（数字）。 */
const form = (values = {}) => /** @type {any} */ ({
  type: 'form', id: 'chat-1', submit: { label: '保存', call: 'cards.save', params: { id: '1' } },
  fields: [
    { key: 'persona', label: '人格', control: 'select', value: null, options: [{ value: 'miyu', label: 'Miyu' }], default: { text: '默认 · Miyu' }, ...values.persona },
    { key: 'triggers', label: '触发词', control: 'list', value: ['miyu'], ...values.triggers },
    { key: 'font', label: '字号', control: 'number', value: 14, min: 8, max: 40, integer: true, ...values.font },
  ],
});

test('只交改过的格；改回默认的交 null；改回和推来的一样的不算改过', () => {
  const s = fresh(form());
  assert.ok(!dirty(s));
  edit(s, 'persona', 'miyu');
  edit(s, 'font', null);
  assert.deepEqual(changes(s), { persona: 'miyu', font: null });
  edit(s, 'persona', null);
  assert.deepEqual(changes(s), { font: null }, '改回推来的（null）不算改过');
  assert.equal(current(s, 'triggers').join(), 'miyu', '没动的照推来的');
  revert(s);
  assert.ok(!dirty(s));
});

test('推来新内容：人改过的格留着；推来的值和开始改时的不一样的标「已在别处修改」；没动的照新的；推来的正好是人改成的不算改过', () => {
  const s = fresh(form());
  edit(s, 'font', 16);
  edit(s, 'triggers', ['miyu', '米优']);
  merge(s, form({ font: { value: 18 }, persona: { value: 'miyu' } }));
  assert.equal(current(s, 'font'), 16, '人改的留着');
  assert.ok(s.conflicts.has('font'), '别处改成了 18');
  assert.ok(!s.conflicts.has('triggers'), '别处没动');
  assert.equal(current(s, 'persona'), 'miyu', '没动的照新的');
  merge(s, form({ font: { value: 18 }, triggers: { value: ['miyu', '米优'] } }));
  assert.ok(!('triggers' in s.edits), '推来的就是人改成的');
  // 表单上没了的格丢掉
  const fewer = form();
  fewer.fields = fewer.fields.filter((/** @type {any} */ f) => f.key !== 'font');
  merge(s, fewer);
  assert.ok(!('font' in s.edits));
});

test('存成了：改的当成推来的（包推新内容前不闪回旧值），没存的清掉', () => {
  const s = fresh(form());
  edit(s, 'font', 20);
  savedAll(s, 1000);
  assert.ok(!dirty(s));
  assert.equal(current(s, 'font'), 20);
  assert.equal(s.saved, 1000);
});

test('包回的保存结果：存成了；逐格的错；key 不在这张表单上的、整张表单的 message 写在底下', () => {
  const f = form();
  assert.deepEqual(outcome({ saved: true }, f), { saved: true });
  assert.deepEqual(outcome({ saved: false, problems: [{ key: 'font', message: '这个群不让改字号' }, { key: 'nope', message: '别的错' }] }, f),
    { saved: false, problems: { font: '这个群不让改字号' }, message: '别的错' });
  assert.deepEqual(outcome({ saved: false, message: '群已经退了' }, f), { saved: false, problems: {}, message: '群已经退了' });
  assert.deepEqual(outcome(null, f), { saved: false, problems: {}, message: null });
});

test('数字框：空的是 null（沿用默认）；认不出、出了范围、要整数却不是的不收', () => {
  const field = /** @type {any} */ ({ key: 'font', min: 8, max: 40, integer: true });
  assert.equal(numberOf('', field), null);
  assert.equal(numberOf(' 14 ', field), 14);
  assert.equal(numberOf('abc', field), false);
  assert.equal(numberOf('7', field), false);
  assert.equal(numberOf('41', field), false);
  assert.equal(numberOf('14.5', field), false);
  assert.equal(numberOf('14.5', /** @type {any} */ ({ key: 'x' })), 14.5);
});

test('下拉：选项不多于 4 个、每个不超过 6 个字的画成分段按钮', () => {
  const opts = (/** @type {string[]} */ labels) => /** @type {any} */ ({ options: labels.map((l) => ({ value: l, label: l })) });
  assert.ok(segmented(opts(['不插嘴', '少插嘴', '偶尔', '常插嘴'])));
  assert.ok(!segmented(opts(['a', 'b', 'c', 'd', 'e'])), '五个');
  assert.ok(!segmented(opts(['跟随核心（deepseek-v4.1-flash）'])), '太长');
  assert.ok(!segmented(opts([])));
});

test('列表里一行：头像字、找的框、标签、状态点', () => {
  assert.equal(initialOf('miyu 测试群'), 'M');
  assert.equal(initialOf('周末桌游'), '周');
  assert.equal(initialOf(''), '·');
  assert.ok(matches({ title: 'Miyu 测试群', subtitle: '100200300' }, 'miyu'));
  assert.ok(matches({ title: 'Miyu 测试群', subtitle: '100200300' }, '1002'));
  assert.ok(!matches({ title: 'Miyu 测试群' }, '桌游'));
  assert.deepEqual(badgeOf('关'), { text: '关', tone: 'normal' });
  assert.deepEqual(badgeOf({ text: '禁言中', tone: 'warn' }), { text: '禁言中', tone: 'warn' });
  assert.equal(badgeOf(''), null);
  assert.equal(stateOf('good'), 'good');
  assert.equal(stateOf('doing'), null, '只认 good、warn、bad、off');
});
