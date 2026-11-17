// @ts-check
//! 账户余额（`src/lib/balance.js`，核心 QU-2 的 `session.quota` 里的 `balance`）：2026-11-17 主人照 DeepSeek 官网改成一行
//! 「DeepSeek 余额：$x + ¥y + 赠送 ¥z」（充值的美元在前、人民币在后，有赠送的接在最后，没有的不写；W-1206），不能用的整行红，
//! 不画条；一项都没有又不能用的写「DeepSeek 余额不足」，能用的、没查到的不画。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balanceRows, balanceAmount } from '../src/lib/balance.js';

const words = (/** @type {string} */ lang) => JSON.parse(readFileSync(new URL(`../resources/text/${lang}.json`, import.meta.url), 'utf8'));
const tr = (/** @type {any} */ table) => (/** @type {string} */ path, /** @type {any} */ fields = {}) => {
  const got = path.split('.').reduce((/** @type {any} */ o, k) => o?.[k], table);
  return typeof got === 'string' ? got.replace(/\{(\w+)\}/g, (_, k) => String(fields[k])) : path;
};
const t = tr(words('zh'));
const item = (/** @type {string} */ currency, /** @type {string} */ topped_up, /** @type {string} */ granted) => ({ currency, total: String(Number(topped_up) + Number(granted)), granted, topped_up });
const reply = (/** @type {boolean} */ available, /** @type {any[]} */ items) => ({ balance: { available, items } });

test('照官网：一行「DeepSeek 余额：」，写充值的那部分；有赠送的接「 + 赠送 ¥2.00」（W-1206）', () => {
  assert.deepEqual(balanceRows(reply(true, [item('CNY', '10.34', '2.00')]), t), [{ text: 'DeepSeek 余额：¥10.34 + 赠送 ¥2.00', out: false }]);
});

test('赠送是 0 的不写赠送', () => {
  assert.deepEqual(balanceRows(reply(true, [item('CNY', '10.34', '0.00')]), t), [{ text: 'DeepSeek 余额：¥10.34', out: false }]);
});

test('几种币一行、用「 + 」连：美元在前、人民币在后（核心交的先后不论），别的币照核心的先后接后面写代码；赠送的都在最后', () => {
  const rows = balanceRows(reply(true, [item('CNY', '3.12', '1.00'), item('EUR', '3.00', '0'), item('USD', '5.00', '1.50')]), t);
  assert.deepEqual(rows, [{ text: 'DeepSeek 余额：$5.00 + ¥3.12 + EUR 3.00 + 赠送 $1.50 + 赠送 ¥1.00', out: false }]);
  assert.equal(balanceAmount('JPY', '120'), 'JPY 120');
});

test('欠费的负数照官网写「-$0.01」：负号在记号前面', () => {
  assert.equal(balanceAmount('USD', '-0.01'), '-$0.01');
  assert.deepEqual(balanceRows(reply(true, [item('USD', '-0.01', '0'), item('CNY', '3.12', '0')]), t)[0].text, 'DeepSeek 余额：-$0.01 + ¥3.12');
});

test('没有充值那一格的（老核心）写总额，不另写赠送（总额里已经含着）', () => {
  assert.deepEqual(balanceRows(reply(true, [{ currency: 'CNY', total: '12.34', granted: '2.00' }]), t), [{ text: 'DeepSeek 余额：¥12.34', out: false }]);
});

test('官方说不能用的整行红', () => {
  assert.deepEqual(balanceRows(reply(false, [item('CNY', '0.00', '2.00')]), t), [{ text: 'DeepSeek 余额：¥0.00 + 赠送 ¥2.00', out: true }]);
});

test('一项都没有：不能用的写一行「DeepSeek 余额不足」，能用的不画', () => {
  assert.deepEqual(balanceRows(reply(false, []), t), [{ text: 'DeepSeek 余额不足', out: true }]);
  assert.deepEqual(balanceRows(reply(true, []), t), []);
});

test('没带余额的（{}、只有窗口、null、坏的）不画', () => {
  assert.deepEqual(balanceRows({}, t), []);
  assert.deepEqual(balanceRows(null, t), []);
  assert.deepEqual(balanceRows({ windows: [{ id: 'rolling', label: '5 小时', percent: 4 }] }, t), []);
  assert.deepEqual(balanceRows({ balance: { available: 'yes', items: [] } }, t), []);
  assert.deepEqual(balanceRows(reply(true, [{ currency: 'CNY', total: 12.34 }]), t), [], '金额不是字符串的那一项不画');
});

test('三种语言都有余额的字（同终端：zh「DeepSeek 余额：」、en「DeepSeek balance: 」）', () => {
  const want = {
    zh: ['DeepSeek 余额：¥10.34 + 赠送 ¥2.00', 'DeepSeek 余额不足'],
    en: ['DeepSeek balance: ¥10.34 + granted ¥2.00', 'DeepSeek balance exhausted'],
    ja: ['DeepSeek 残高：¥10.34 + 付与 ¥2.00', 'DeepSeek 残高不足'],
  };
  for (const [lang, [text, empty]] of Object.entries(want)) {
    const tl = tr(words(lang));
    assert.deepEqual(balanceRows(reply(true, [item('CNY', '10.34', '2.00')]), tl), [{ text, out: false }], lang);
    assert.equal(balanceRows(reply(false, []), tl)[0].text, empty, lang);
  }
});
