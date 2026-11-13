// @ts-check
//! 输入框右上方的循环标记写哪个、写成什么、放不放得下（软件包 `schedules` 的 `model.js`；蓝图 `web.md`「定时任务」第 2b 条，
//! 2026-11-14 主人：照终端 `loop_tag.rs` 补上）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loopOn, loopTag, fitOf } from '../../packages/schedules/model.js';

const manifest = JSON.parse(readFileSync(new URL('../../packages/schedules/manifest.json', import.meta.url), 'utf8'));
/** 照包里的字填（没有的交回键本身，同 `ctx.text`） @param {'zh'|'en'|'ja'} lang */
const textOf = (lang) => (/** @type {string} */ path, /** @type {any} */ fields = {}) => {
  const got = path.split('.').reduce((/** @type {any} */ o, k) => o?.[k], manifest.text[lang]);
  return typeof got === 'string' ? got.replace(/\{(\w+)\}/g, (_, k) => String(fields[k])) : path;
};
const t = textOf('zh');
const local = (/** @type {number[]} */ [y, mo, d, hh = 0, mm = 0]) => new Date(y, mo - 1, d, hh, mm);
const now = local([2026, 11, 14, 9, 30]);
const at = (/** @type {number[]} */ p) => local(p).toISOString();
/** @param {Partial<import('../../packages/schedules/model.js').Schedule>} s @returns {import('../../packages/schedules/model.js').Schedule} */
const one = (s) => ({ id: 't1', prompt: '你好', when: { every: 600 }, loop: 'fixed', target: { session: 's1' }, ...s });

test('写哪个：只看跑在这个会话上的循环；在跑的在前、有下一次的在前、下一次早的在前', () => {
  const list = [
    one({ id: 't1', paused: true, next: at([2026, 11, 14, 9, 31]) }),
    one({ id: 't2', loop: 'dynamic', next: undefined }),
    one({ id: 't3', next: at([2026, 11, 14, 11, 0]) }),
    one({ id: 't4', next: at([2026, 11, 14, 10, 0]) }),
    one({ id: 't5', loop: undefined, next: at([2026, 11, 14, 9, 35]) }),
    one({ id: 't6', target: { session: 's2' }, next: at([2026, 11, 14, 9, 32]) }),
  ];
  assert.equal(loopOn(list, 's1')?.id, 't4', '不是循环的定时任务（t5）不算');
  assert.equal(loopOn(list.filter((s) => s.id !== 't3' && s.id !== 't4'), 's1')?.id, 't2', '没定下一次的排在停着的前面');
  assert.equal(loopOn([list[0]], 's1')?.id, 't1');
});

test('换会话：照看着的会话挑，别的会话的、没有会话的不写', () => {
  const list = [one({ id: 't1', next: at([2026, 11, 14, 10, 0]) }), one({ id: 't6', target: { session: 's2' }, next: at([2026, 11, 14, 9, 32]) })];
  assert.equal(loopOn(list, 's2')?.id, 't6');
  assert.equal(loopOn(list, 's3'), null);
  assert.equal(loopOn(list, null), null);
});

test('写成什么：今天只写时分、明天「明天 13:07」、再往后「月/日 时分」；停着的已暂停；没定下一次的只画图标', () => {
  assert.deepEqual(loopTag(one({ next: at([2026, 11, 14, 13, 7]) }), now, t), { state: 'next', text: '13:07' });
  assert.deepEqual(loopTag(one({ next: at([2026, 11, 15, 8, 0]) }), now, t), { state: 'next', text: '明天 08:00' });
  assert.deepEqual(loopTag(one({ next: at([2026, 11, 30, 8, 5]) }), now, t), { state: 'next', text: '11/30 08:05' });
  assert.deepEqual(loopTag(one({ next: at([2026, 11, 14, 13, 7]), paused: true }), now, t), { state: 'paused', text: '已暂停' });
  assert.deepEqual(loopTag(one({ loop: 'dynamic', next: undefined }), now, t), { state: 'mark', text: '' });
  assert.equal(loopTag(one({ next: at([2026, 11, 15, 8, 0]) }), now, textOf('en')).text, 'tomorrow 08:00');
  assert.equal(loopTag(one({ paused: true }), now, textOf('ja')).text, '一時停止中');
});

test('放不放得下（照终端 fit）：整截、只有图标、都不画', () => {
  assert.equal(fitOf(120, 80, 14), 'full');
  assert.equal(fitOf(80, 80, 14), 'full');
  assert.equal(fitOf(40, 80, 14), 'mark');
  assert.equal(fitOf(10, 80, 14), 'none');
});

test('右边有东西时这一行分三格：运行状态行在左、截掉，循环标记挨着目标、不压它（styles/dock.css）', () => {
  const css = readFileSync(new URL('../../styles/dock.css', import.meta.url), 'utf8');
  const on = '.dock-above:has(> .dock-goal.is-on, > .dock-beside.is-on)';
  const rule = (/** @type {string} */ sel, /** @type {string} */ body) => assert.ok(css.includes(`${sel} { ${body} }`), `${sel} { ${body} }`);
  rule(on, 'grid-template-columns: minmax(0, 1fr) minmax(0, max-content) auto;');
  rule(`${on} > .dock-lane`, 'grid-column: 1;');
  rule(`${on} > .dock-beside.is-on`, 'grid-column: 2;');
  rule(`${on} > .dock-goal.is-on`, 'grid-column: 3;');
  rule('.dock-above > *', 'grid-column: 1 / -1;');
});
