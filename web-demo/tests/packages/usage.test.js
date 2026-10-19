// @ts-check
//! 用量页的纯逻辑（`packages/usage/model.js`，蓝图 `web.md`「用量页」）：合计、花费的写法、时间段从哪起、今天一小时一根、
//! 照天还是照月、纵轴一格多少、排法、用途和场所写成什么。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { input, total, sum, money, amountText, offsetOf, fromOf, midnight, hours, hourBars, dayBars, allBars, monthBars, niceStep, sorted, purposeKey, venueOf, splitModel, dayKey } from '../../packages/usage/model.js';

const t = (/** @type {string} */ key, /** @type {any} */ f = {}) => `${key}${Object.keys(f).length ? JSON.stringify(f) : ''}`;
const row = (/** @type {any} */ extra = {}) => ({ requests: 1, usage: { uncached: 10, cache_read: 90, cache_write: 0, output: 5 }, amounts: [], unpriced: 0, ...extra });

test('输入不算输出；合计照币种各加各的，先后照头一次出现的', () => {
  const u = { uncached: 1, cache_read: 2, cache_write: 3, output: 4 };
  assert.equal(input(u), 6);
  assert.equal(total(u), 10);
  const got = sum([
    row({ amounts: [{ currency: 'CNY', amount: 1 }], unpriced: 2 }),
    row({ amounts: [{ currency: 'USD', amount: 0.5 }, { currency: 'CNY', amount: 2 }] }),
  ]);
  assert.equal(got.requests, 2);
  assert.equal(got.unpriced, 2);
  assert.deepEqual(got.usage, { uncached: 20, cache_read: 180, cache_write: 0, output: 10 });
  assert.deepEqual(got.amounts, [{ currency: 'CNY', amount: 3 }, { currency: 'USD', amount: 0.5 }]);
  assert.deepEqual(sum([]), { requests: 0, usage: { uncached: 0, cache_read: 0, cache_write: 0, output: 0 }, amounts: [], unpriced: 0 });
});

test('花费：不换算不相加，一分钱以下四位小数，认不得的币种写代码', () => {
  assert.equal(money([{ currency: 'USD', amount: 1.274 }, { currency: 'CNY', amount: 12.92 }]), '$1.27 + ¥12.92');
  assert.equal(amountText({ currency: 'USD', amount: 0.00025 }), '$0.0003');
  assert.equal(amountText({ currency: 'USD', amount: 0 }), '$0.00');
  assert.equal(amountText({ currency: 'JPY', amount: 120 }), 'JPY 120.00');
  assert.equal(money([]), '');
});

test('时区写成核心认的 +09:00；时间段从那一天本地 0 点起，全部不写', () => {
  const fake = (/** @type {number} */ off) => /** @type {any} */ ({ getTimezoneOffset: () => off });
  assert.equal(offsetOf(fake(-540)), '+09:00');
  assert.equal(offsetOf(fake(-330)), '+05:30');
  assert.equal(offsetOf(fake(300)), '-05:00');
  assert.equal(offsetOf(fake(0)), '+00:00');
  const now = new Date(2026, 9, 20, 15, 30);
  assert.equal(fromOf('all', now), null);
  assert.equal(fromOf('1', now), new Date(2026, 9, 20).toISOString());
  assert.equal(fromOf('7', now), new Date(2026, 9, 14).toISOString());
  assert.equal(fromOf('30', now), new Date(2026, 8, 21).toISOString());
});

test('今天：24 个整点段首尾相接；现在之后的空着，现在这一根标出来', () => {
  const now = new Date(2026, 9, 20, 15, 30);
  const slots = hours(now);
  assert.equal(slots.length, 24);
  assert.equal(slots[0].from, midnight(now).toISOString());
  for (let i = 1; i < 24; i++) assert.equal(slots[i].from, slots[i - 1].until);
  assert.equal(slots[23].until, midnight(new Date(2026, 9, 21)).toISOString());
  const rows = Array.from({ length: 24 }, (_, i) => (i === 3 || i === 15 || i === 20 ? row() : i === 4 ? row({ requests: 0 }) : null));
  const bars = hourBars(rows, now, t);
  assert.deepEqual(bars.map((b, i) => (b.row ? i : -1)).filter((i) => i >= 0), [3, 15]);
  assert.deepEqual(bars.filter((b) => b.now).map((b) => b.key), ['15']);
  assert.deepEqual(bars.filter((b) => b.label).map((b) => b.key), ['0', '6', '12', '18']);
});

test('照天：n 根，最后一根是今天，没请求的那天空着', () => {
  const now = new Date(2026, 9, 20, 9);
  const bars = dayBars([row({ day: '2026-10-18' }), row({ day: '2026-10-20' })], 7, now, t);
  assert.equal(bars.length, 7);
  assert.equal(bars[0].key, '2026-10-14');
  assert.equal(bars[6].label, 'axis.today');
  assert.ok(bars[6].now && bars[6].row);
  assert.deepEqual(bars.map((b) => !!b.row), [false, false, false, false, true, false, true]);
  // 30 天每隔 5 天写一个
  const month = dayBars([], 30, now, t);
  assert.equal(month.filter((b) => b.label).length, 6);
});

test('全部：90 天以内照天（至少 7 根），超过的照月，一天都没有的是空的', () => {
  const now = new Date(2026, 9, 20, 9);
  assert.deepEqual(allBars([], now, t), { monthly: false, bars: [] });
  const short = allBars([row({ day: '2026-10-19' })], now, t);
  assert.equal(short.monthly, false);
  assert.equal(short.bars.length, 7);
  const near = allBars([row({ day: dayKey(midnight(now, 89)) })], now, t);
  assert.equal(near.monthly, false);
  assert.equal(near.bars.length, 90);
  const long = allBars([row({ day: '2026-03-02' }), row({ day: '2026-03-30' }), row({ day: '2026-10-01' })], now, t);
  assert.equal(long.monthly, true);
  assert.deepEqual(long.bars.map((b) => b.key), ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.equal(long.bars[0].row?.requests, 2);
  assert.equal(long.bars[1].row, null);
  assert.equal(long.bars[7].label, 'axis.this_month');
  // 跨年的月份照年接着
  assert.deepEqual(monthBars([row({ day: '2025-11-05' })], new Date(2026, 0, 3), t).map((b) => b.key), ['2025-11', '2025-12', '2026-01']);
});

test('纵轴：四格盖得住最高的那根，一格是 1、2、2.5、5 乘十的几次方，至少 1', () => {
  assert.equal(niceStep(6_800_000), 2_000_000);
  assert.equal(niceStep(4_000_000), 1_000_000);
  assert.equal(niceStep(9_000), 2_500);
  assert.equal(niceStep(3), 1);
  assert.equal(niceStep(0), 1);
  for (const max of [1, 7, 99, 12345, 6.1e8]) {
    const s = niceStep(max);
    assert.ok(s * 4 >= max, `${max} → ${s}`);
  }
});

test('排法：照 token 或请求从大到小，一样的照名字，null 在后', () => {
  const rows = [
    row({ model: 'b', requests: 5 }),
    row({ model: null, requests: 1, usage: { uncached: 0, cache_read: 0, cache_write: 0, output: 105 } }),
    row({ model: 'a', requests: 2 }),
    row({ model: 'c', requests: 1, usage: { uncached: 500, cache_read: 0, cache_write: 0, output: 0 } }),
  ];
  assert.deepEqual(sorted(rows, 'tokens', 'model').map((r) => r.model), ['c', 'a', 'b', null]);
  assert.deepEqual(sorted(rows, 'requests', 'model').map((r) => r.model), ['b', 'a', 'c', null]);
});

test('用途、场所、模型写成什么', () => {
  assert.equal(purposeKey(null), 'chat');
  assert.equal(purposeKey('memory'), 'memory');
  assert.equal(purposeKey('platform'), null);
  assert.deepEqual(venueOf(null), { key: 'other' });
  assert.deepEqual(venueOf('local'), { key: 'venue.local' });
  assert.deepEqual(venueOf('qq:group:123456'), { key: 'venue.qq_group', fields: { id: '123456' } });
  assert.deepEqual(venueOf('qq:private:10086'), { key: 'venue.qq_private', fields: { id: '10086' } });
  assert.deepEqual(venueOf('tg:chat:1'), { raw: 'tg:chat:1' });
  assert.deepEqual(splitModel('deepseek/deepseek-flash'), { provider: 'deepseek', name: 'deepseek-flash' });
  assert.deepEqual(splitModel('openrouter/z-ai/glm-5'), { provider: 'openrouter', name: 'z-ai/glm-5' });
  assert.deepEqual(splitModel('solo'), { provider: '', name: 'solo' });
});
