// @ts-check
//! 定时任务写成什么、新建的表交给核心什么（软件包 `schedules` 的 `model.js`；蓝图 `web.md`「定时任务」，协议照核心 J-1 下）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sorted, cronText, everyText, dayText, whenText, whereText, nextText, metaText, skipText, cardText, whenOf, fieldOf, applyChange, onSession } from '../../packages/schedules/model.js';

const manifest = JSON.parse(readFileSync(new URL('../../packages/schedules/manifest.json', import.meta.url), 'utf8'));
/** 照包里的字填（没有的交回键本身，同 `ctx.text`） @param {'zh'|'en'|'ja'} lang */
const textOf = (lang) => (/** @type {string} */ path, /** @type {any} */ fields = {}) => {
  const got = path.split('.').reduce((/** @type {any} */ o, k) => o?.[k], manifest.text[lang]);
  return typeof got === 'string' ? got.replace(/\{(\w+)\}/g, (_, k) => String(fields[k])) : path;
};
const t = textOf('zh');
/** 本地时间的某一刻 */
const local = (/** @type {number[]} */ [y, mo, d, hh = 0, mm = 0]) => new Date(y, mo - 1, d, hh, mm);
const now = local([2026, 10, 27, 9, 30]);

test('cron 认得的几种写人话：每天、工作日、每周几（0、7 都是周日）、每月几日；别的交回 null', () => {
  assert.equal(cronText('0 8 * * *', t), '每天 08:00');
  assert.equal(cronText('30 7 * * 1-5', t), '工作日 07:30');
  assert.equal(cronText('0 8 * * 1', t), '每周一 08:00');
  assert.equal(cronText('0 8 * * 7', t), '每周日 08:00');
  assert.equal(cronText('5 0 1 * *', t), '每月 1 日 00:05');
  assert.equal(cronText('0 */2 * * *', t), null);
  assert.equal(cronText('0 8 * 1 *', t), null, '照月份的不认');
  assert.equal(cronText('0 8 * *', t), null, '不是五段');
  assert.equal(textOf('en')('when.daily', { time: '08:00' }), 'Every day at 08:00');
});

test('隔多久：整天、整小时、整分钟，不然秒', () => {
  assert.equal(everyText(600, t), '每 10 分钟');
  assert.equal(everyText(7200, t), '每 2 小时');
  assert.equal(everyText(86400, t), '每 1 天');
  assert.equal(everyText(90, t), '每 90 秒');
});

test('某个时刻：今天、明天、往后写几月几日，跨年的带年（浏览器本地时区）', () => {
  assert.equal(dayText(local([2026, 10, 27, 18, 5]).toISOString(), now, t), '今天 18:05');
  assert.equal(dayText(local([2026, 10, 28, 8, 0]).toISOString(), now, t), '明天 08:00');
  assert.equal(dayText(local([2026, 10, 30, 8, 0]).toISOString(), now, t), '10月30日 08:00');
  assert.equal(dayText(local([2027, 1, 2, 8, 0]).toISOString(), now, t), '2027年1月2日 08:00');
  assert.equal(dayText(local([2026, 10, 30, 8, 0]).toISOString(), now, textOf('en')), 'Oct 30 08:00');
  assert.equal(dayText('不是时刻', now, t), '');
});

test('什么时候：cron 认不得的照原样、every、at、循环（固定间隔、由 AI 定）', () => {
  assert.equal(whenText({ id: 't1', prompt: 'x', when: { cron: '0 */2 * * *', recurring: true } }, now, t), 'cron 0 */2 * * *');
  assert.equal(whenText({ id: 't1', prompt: 'x', when: { every: 600 } }, now, t), '每 10 分钟');
  assert.equal(whenText({ id: 't1', prompt: 'x', when: { at: local([2026, 10, 28, 8, 0]).toISOString() } }, now, t), '一次 · 明天 08:00');
  assert.equal(whenText({ id: 't1', prompt: 'x', when: { every: 600 }, loop: 'fixed' }, now, t), '循环 · 每 10 分钟');
  assert.equal(whenText({ id: 't1', prompt: 'x', when: { every: 600 }, loop: 'dynamic' }, now, t), '循环 · 由 AI 定');
});

test('底下那一行：什么时候 · 在哪 · 下次；停着的写已暂停，没定下一次的不写；会话照标题，没有的写编号', () => {
  const title = (/** @type {string} */ id) => (id === 's1' ? '运维' : null);
  const base = { id: 't1', prompt: '看一眼服务器', when: { cron: '0 8 * * *', recurring: true } };
  assert.equal(metaText({ ...base, next: local([2026, 10, 28, 8, 0]).toISOString() }, now, title, t), '每天 08:00 · 每次新开会话 · 下次 明天 08:00');
  assert.equal(metaText({ ...base, target: { session: 's1' }, paused: true }, now, title, t), '每天 08:00 · 会话「运维」 · 已暂停');
  assert.equal(whereText({ ...base, target: { session: 's9' } }, title, t), '会话「s9」');
  assert.equal(nextText(base, now, t), '');
  assert.equal(cardText({ ...base, paused: true }, now, t), '每天 08:00 · 已暂停');
});

test('上一次跳过了的原因：认得的写人话，认不得的照原样；没跳过的是 null', () => {
  assert.equal(skipText({ id: 't1', prompt: 'x', when: {}, last: { at: 'x', result: 'skipped:session_gone' } }, t), '会话已不在，任务停了');
  assert.equal(skipText({ id: 't1', prompt: 'x', when: {}, last: { at: 'x', result: 'skipped:later' } }, t), '上一次跳过了：later');
  assert.equal(skipText({ id: 't1', prompt: 'x', when: {}, last: { at: 'x', result: 'ran' } }, t), null);
  assert.equal(skipText({ id: 't1', prompt: 'x', when: {} }, t), null);
});

test('新建的「什么时候」：每天 → cron，每隔 → 秒（少于 60 秒 short），一次 → ISO（过了的 past），自定义 → cron 原样（不是五段 cron）', () => {
  assert.deepEqual(whenOf({ kind: 'daily', time: '08:05' }, now), { when: { cron: '5 8 * * *', recurring: true } });
  assert.deepEqual(whenOf({ kind: 'daily', time: '25:00' }, now), { problem: 'when' });
  assert.deepEqual(whenOf({ kind: 'every', n: '10', unit: 'minutes' }, now), { when: { every: 600 } });
  assert.deepEqual(whenOf({ kind: 'every', n: '2', unit: 'hours' }, now), { when: { every: 7200 } });
  assert.deepEqual(whenOf({ kind: 'every', n: '0.5', unit: 'minutes' }, now), { problem: 'short' });
  assert.deepEqual(whenOf({ kind: 'every', n: 'x', unit: 'minutes' }, now), { problem: 'when' });
  assert.deepEqual(whenOf({ kind: 'once', at: '2026-10-28T08:00' }, now), { when: { at: local([2026, 10, 28, 8, 0]).toISOString() } });
  assert.deepEqual(whenOf({ kind: 'once', at: '2026-10-27T09:00' }, now), { problem: 'past' });
  assert.deepEqual(whenOf({ kind: 'once', at: '' }, now), { problem: 'when' });
  assert.deepEqual(whenOf({ kind: 'cron', cron: ' 0  8 * * 1-5 ' }, now), { when: { cron: '0 8 * * 1-5', recurring: true } });
  assert.deepEqual(whenOf({ kind: 'cron', cron: '0 8 * *' }, now), { problem: 'cron' });
});

test('核心拒了写在哪一格：bad_params 照 data.problem，人格、预设照拒绝码；别的写在底下', () => {
  assert.deepEqual(fieldOf({ reason: 'bad_params', data: { problem: 'short' } }), { field: 'when', key: 'bad.short' });
  assert.deepEqual(fieldOf({ reason: 'bad_params', data: { problem: 'prompt' } }), { field: 'prompt', key: 'bad.prompt' });
  assert.deepEqual(fieldOf({ reason: 'bad_params', data: { problem: 'session' } }), { field: 'target', key: 'bad.session' });
  assert.deepEqual(fieldOf({ reason: 'unknown_preset' }), { field: 'preset', key: 'bad.unknown_preset' });
  assert.deepEqual(fieldOf({ reason: 'bad_params', data: { problem: 'later' } }), { field: null, key: null });
  assert.deepEqual(fieldOf(new Error('x')), { field: null, key: null });
  for (const lang of /** @type {const} */ (['zh', 'en', 'ja'])) {
    for (const k of ['prompt', 'when', 'cron', 'past', 'short', 'session', 'target', 'unknown_persona', 'unknown_preset']) assert.notEqual(textOf(lang)(`bad.${k}`), `bad.${k}`, `${lang} bad.${k}`);
  }
});

test('先后同核心：有下一次的照时刻在前，停着的、没定下一次的在后，同一档照编号；推送整项换、拿掉、重排', () => {
  const at = (/** @type {number} */ h) => local([2026, 10, 28, h, 0]).toISOString();
  const list = sorted([
    { id: 't10', prompt: 'a', when: {}, next: at(9) },
    { id: 't2', prompt: 'b', when: {}, paused: true },
    { id: 't3', prompt: 'c', when: {}, next: at(8) },
    { id: 't1', prompt: 'd', when: {} },
  ]);
  assert.deepEqual(list.map((s) => s.id), ['t3', 't10', 't1', 't2']);
  assert.deepEqual(applyChange(list, { id: 't1', entry: { id: 't1', prompt: 'd', when: {}, next: at(7) } }).map((s) => s.id), ['t1', 't3', 't10', 't2']);
  assert.deepEqual(applyChange(list, { id: 't3', removed: true }).map((s) => s.id), ['t10', 't1', 't2']);
  assert.equal(applyChange(list, null), list);
});

test('右侧栏卡片只列跑在这个会话上的；没有会话的是空的', () => {
  const list = [{ id: 't1', prompt: 'a', when: {}, target: { session: 's1' } }, { id: 't2', prompt: 'b', when: {}, target: { new: {} } }];
  assert.deepEqual(onSession(list, 's1').map((s) => s.id), ['t1']);
  assert.deepEqual(onSession(list, null), []);
});

test('三种语言的字一样多', () => {
  const keys = (/** @type {any} */ o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
  assert.deepEqual(keys(manifest.text.en), keys(manifest.text.zh));
  assert.deepEqual(keys(manifest.text.ja), keys(manifest.text.zh));
});

test('时区（核心 J-3 上）：cron 的带上浏览器的 zone，别的不带；记下的时区和这里不一样的后面接上；目录不在的写在「在哪跑」下面', () => {
  assert.deepEqual(whenOf({ kind: 'daily', time: '08:00' }, now, 'Asia/Tokyo'), { when: { cron: '0 8 * * *', recurring: true, zone: 'Asia/Tokyo' } });
  assert.deepEqual(whenOf({ kind: 'cron', cron: '0 */2 * * *' }, now, 'Asia/Tokyo'), { when: { cron: '0 */2 * * *', recurring: true, zone: 'Asia/Tokyo' } });
  assert.deepEqual(whenOf({ kind: 'every', n: '2', unit: 'hours' }, now, 'Asia/Tokyo'), { when: { every: 7200 } });
  assert.deepEqual(whenOf({ kind: 'daily', time: '08:00' }, now), { when: { cron: '0 8 * * *', recurring: true } }, '拿不到时区的不写');
  const s = /** @type {any} */ ({ id: 't1', when: { cron: '0 8 * * *', zone: 'America/New_York' } });
  assert.equal(whenText(s, now, t, 'Asia/Tokyo'), '每天 08:00（America/New_York）');
  assert.equal(whenText({ ...s, when: { cron: '0 8 * * *', zone: 'Asia/Tokyo' } }, now, t, 'Asia/Tokyo'), '每天 08:00', '同一个时区不写');
  assert.deepEqual(fieldOf({ reason: 'bad_params', data: { problem: 'cwd' } }), { field: 'target', key: 'bad.cwd' });
  assert.deepEqual(fieldOf({ reason: 'too_many_schedules' }), { field: null, key: null }, '满 200 个的照核心的话写在底下');
});

test('时刻那一格认字、月历的格子、日期按钮上的字（2026-10-27 项目主人：选时间用软件自己画的浮层）', async () => {
  const { parseClock, monthCells, dateLabel } = await import('../../packages/schedules/model.js');
  assert.deepEqual(['8', '08', '8:5', '8:05', '0805', '805', '23：59', '24', '8:60', 'x', ''].map(parseClock), ['08:00', '08:00', '08:05', '08:05', '08:05', '08:05', '23:59', null, null, null, null]);
  const cells = monthCells(2026, 9, now);
  assert.equal(cells.length % 7, 0);
  assert.equal(cells[0].date, '2026-09-28', '周一开头，前面补上个月的');
  assert.deepEqual(cells.find((c) => c.date === '2026-10-27'), { date: '2026-10-27', day: 27, inMonth: true, past: false, today: true });
  assert.equal(cells.find((c) => c.date === '2026-10-26')?.past, true);
  assert.equal(cells.at(-1)?.inMonth, false);
  assert.equal(dateLabel('2026-10-27', now, t), '今天');
  assert.equal(dateLabel('2026-10-28', now, t), '明天');
  assert.equal(dateLabel('2026-10-30', now, t), '10月30日 周五');
});
