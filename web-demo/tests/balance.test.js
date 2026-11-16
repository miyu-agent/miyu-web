// @ts-check
//! 账户余额（`src/lib/balance.js`，核心 QU-2 的 `session.quota` 里的 `balance`；2026-11-16 主人定：一种币一行「余额 ¥12.34」，
//! 有赠送的暗字「含赠送 ¥2.00」，不能用的整行红，不画条；一项都没有又不能用的写「余额不足」，能用的、没查到的不画）。

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
const item = (/** @type {string} */ currency, /** @type {string} */ total, /** @type {string} */ granted) => ({ currency, total, granted, topped_up: '0' });
const reply = (/** @type {boolean} */ available, /** @type {any[]} */ items) => ({ balance: { available, items } });

test('一种人民币带赠送：「余额 ¥12.34」后面暗字「含赠送 ¥2.00」', () => {
  assert.deepEqual(balanceRows(reply(true, [item('CNY', '12.34', '2.00')]), t), [{ text: '余额 ¥12.34', granted: '含赠送 ¥2.00', out: false }]);
});

test('赠送是 0 的不写暗字', () => {
  assert.deepEqual(balanceRows(reply(true, [item('CNY', '10.34', '0.00')]), t), [{ text: '余额 ¥10.34', granted: null, out: false }]);
});

test('美元写 $，别的币写代码在前；一种币一行，照核心的先后', () => {
  const rows = balanceRows(reply(true, [item('USD', '5.00', '1.50'), item('EUR', '3.00', '0')]), t);
  assert.deepEqual(rows.map((r) => [r.text, r.granted]), [['余额 $5.00', '含赠送 $1.50'], ['余额 EUR 3.00', null]]);
  assert.equal(balanceAmount('JPY', '120'), 'JPY 120');
});

test('官方说不能用的整行红', () => {
  assert.deepEqual(balanceRows(reply(false, [item('CNY', '0.00', '2.00')]), t), [{ text: '余额 ¥0.00', granted: '含赠送 ¥2.00', out: true }]);
});

test('一项都没有：不能用的写一行「余额不足」，能用的不画', () => {
  assert.deepEqual(balanceRows(reply(false, []), t), [{ text: '余额不足', granted: null, out: true }]);
  assert.deepEqual(balanceRows(reply(true, []), t), []);
});

test('没带余额的（{}、只有窗口、null、坏的）不画', () => {
  assert.deepEqual(balanceRows({}, t), []);
  assert.deepEqual(balanceRows(null, t), []);
  assert.deepEqual(balanceRows({ windows: [{ id: 'rolling', label: '5 小时', percent: 4 }] }, t), []);
  assert.deepEqual(balanceRows({ balance: { available: 'yes', items: [] } }, t), []);
  assert.deepEqual(balanceRows(reply(true, [{ currency: 'CNY', total: 12.34 }]), t), [], '金额不是字符串的那一项不画');
});

test('三种语言都有余额的字', () => {
  const want = {
    zh: ['余额 ¥12.34', '含赠送 ¥2.00', '余额不足'],
    en: ['Balance ¥12.34', 'incl. ¥2.00 granted', 'Balance exhausted'],
    ja: ['残高 ¥12.34', 'うち付与 ¥2.00', '残高不足'],
  };
  for (const [lang, [text, granted, empty]] of Object.entries(want)) {
    const tl = tr(words(lang));
    assert.deepEqual(balanceRows(reply(true, [item('CNY', '12.34', '2.00')]), tl), [{ text, granted, out: false }], lang);
    assert.equal(balanceRows(reply(false, []), tl)[0].text, empty, lang);
  }
});
