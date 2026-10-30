import test from 'node:test';
import assert from 'node:assert/strict';
import { costParts, costText, addCosts, costKey, ratesOf, rateName } from '../src/lib/cost.js';

const usd = (amount) => ({ currency: 'USD', amount });
const cny = (amount) => ({ currency: 'CNY', amount });
const eur = (amount) => ({ currency: 'EUR', amount });

test('一行的花费：有 converted 写换算成的一个数，没换成的照币种接在后面；没有的不写金额（核心 UC-1，2026-10-26、10-31 项目主人）', () => {
  assert.equal(costText({ amounts: [usd(1.7), cny(0.1)], converted: { currency: 'CNY', amount: 12.3 } }), '¥12.30', '都换成了：只写一个数，不标 ≈');
  assert.equal(costText({ amounts: [usd(0.4), cny(12.3)], converted: { currency: 'CNY', amount: 12.3, rest: [usd(0.4)] } }), '¥12.30 + $0.40', '没换成的接在后面');
  assert.equal(costText({ amounts: [usd(1.27), cny(12.92)] }), '', '一笔都没换成（没有 converted）：不写，不把几种币种并排列');
  assert.equal(costText({ amounts: [] }), '');
  assert.equal(costText(null), '');
  assert.deepEqual(costParts({ amounts: [usd(1)], converted: { currency: 'CNY', amount: 7.1, rest: [eur(2)] } }), [cny(7.1), eur(2)]);
  assert.equal(costText({ amounts: [usd(0.004)], converted: { currency: 'USD', amount: 0.004 } }), '$0.0040', '一分钱以下的四位小数（同原来）');
});

test('几行加起来：换成同一个币种的加在一起，没换成的、整行没换算的并进 rest；一行都没换算过的没有 converted', () => {
  assert.deepEqual(addCosts([
    { amounts: [usd(1)], converted: { currency: 'CNY', amount: 7 } },
    { amounts: [usd(1), eur(1)], converted: { currency: 'CNY', amount: 7, rest: [eur(1)] } },
  ]), { amounts: [usd(2), eur(1)], converted: { currency: 'CNY', amount: 14, rest: [eur(1)] } });
  assert.deepEqual(addCosts([
    { amounts: [usd(1)], converted: { currency: 'CNY', amount: 7 } },
    { amounts: [usd(0.5)] },
    { amounts: [] },
  ]), { amounts: [usd(1.5)], converted: { currency: 'CNY', amount: 7, rest: [usd(0.5)] } }, '有一行没换算：它的 amounts 并进 rest');
  assert.deepEqual(addCosts([{ amounts: [usd(1)] }, { amounts: [cny(2), usd(1)] }]), { amounts: [usd(2), cny(2)] }, '都没换算：同原来照币种各加各的');
  assert.deepEqual(addCosts([]), { amounts: [] });
  assert.equal(costText(addCosts([{ amounts: [usd(1)], converted: { currency: 'CNY', amount: 7 } }, { amounts: [usd(0.4)] }])), '¥7.00 + $0.40');
  const rate = { source: 'open.er-api.com', url: 'https://www.exchangerate-api.com' };
  assert.deepEqual(addCosts([
    { amounts: [usd(1)], converted: { currency: 'CNY', amount: 7, rates: [rate] } },
    { amounts: [usd(1)], converted: { currency: 'CNY', amount: 7, rates: [rate] } },
  ]).converted?.rates, [rate], '来源去重');
});

test('照花费排的数：换算过的先比换成的那个数；没换算的照币种先后；没价格的最小', () => {
  const order = ['CNY', 'USD'];
  assert.deepEqual(costKey({ amounts: [usd(1)], converted: { currency: 'CNY', amount: 7 } }, order), [7, 0, 0]);
  assert.deepEqual(costKey({ amounts: [usd(1), cny(1)], converted: { currency: 'CNY', amount: 1, rest: [usd(1)] } }, order), [1, 0, 1]);
  assert.deepEqual(costKey({ amounts: [usd(2)] }, order), [0, 2]);
  assert.deepEqual(costKey({ amounts: [] }, order), [-1]);
});

test('汇率来源：顶上的 rates 连每一行带的，去重；open.er-api.com 写 ExchangeRate-API；只用了主源的没有', () => {
  const rate = { source: 'open.er-api.com', url: 'https://www.exchangerate-api.com' };
  assert.deepEqual(ratesOf({ rates: [rate], rows: [{ amounts: [], converted: { currency: 'CNY', amount: 1, rates: [rate] } }] }), [rate]);
  assert.deepEqual(ratesOf({ rows: [{ amounts: [], converted: { currency: 'CNY', amount: 1, rates: [rate] } }] }), [rate], '只在行里带的也算');
  assert.deepEqual(ratesOf({ rows: [{ amounts: [usd(1)], converted: { currency: 'CNY', amount: 7 } }] }), [], '只用主源：不写');
  assert.deepEqual(ratesOf(null), []);
  assert.equal(rateName(rate), 'ExchangeRate-API');
  assert.equal(rateName({ source: 'other.example', url: 'https://x' }), 'other.example');
});
