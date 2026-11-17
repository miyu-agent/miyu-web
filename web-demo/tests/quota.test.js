// @ts-check
//! 供应商额度（`src/lib/quota.js`，核心 QU-1 的 `session.quota`；2026-11-14 主人定：一行一个窗口，名字、条、百分比、多久后重置，
//! 80% 起黄、满了红，24 小时内写「x 小时后重置」、再远写日期时刻；只在有数据时出现）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quotaRows, quotaTitle, percentText, resetText, QUOTA_WARN } from '../src/lib/quota.js';

const zh = JSON.parse(readFileSync(new URL('../resources/text/zh.json', import.meta.url), 'utf8'));
const t = (/** @type {string} */ path, /** @type {any} */ fields = {}) => {
  const got = path.split('.').reduce((/** @type {any} */ o, k) => o?.[k], zh);
  return typeof got === 'string' ? got.replace(/\{(\w+)\}/g, (_, k) => String(fields[k])) : path;
};
const now = new Date(2026, 10, 14, 6, 30);
const at = (/** @type {number} */ ms) => new Date(now.getTime() + ms).toISOString();
const H = 3_600_000;

test('一行一个窗口，照核心的先后；百分比、颜色、多久后重置', () => {
  const rows = quotaRows({ windows: [
    { id: 'rolling', label: '5 小时', percent: 4, status: 'ok', resets_at: at(2 * H + 5 * 60_000) },
    { id: 'weekly', label: '每周', percent: 80, status: 'ok', resets_at: at(3 * 24 * H) },
    { id: 'monthly', label: '每月', percent: 100, status: 'ok', resets_at: at(20 * 60_000) },
  ] }, now, t);
  assert.deepEqual(rows.map((r) => [r.id, r.tone]), [['rolling', 'ok'], ['weekly', 'warn'], ['monthly', 'full']]);
  assert.equal(rows[0].reset, '2 小时后重置');
  assert.equal(rows[2].reset, '20 分钟后重置', '不到一小时写分钟');
  const far = new Date(now.getTime() + 3 * 24 * H);
  assert.equal(rows[1].reset, `${far.getMonth() + 1}月${far.getDate()}日 ${String(far.getHours()).padStart(2, '0')}:${String(far.getMinutes()).padStart(2, '0')} 重置`, '24 小时以外写日期时刻');
  assert.equal(QUOTA_WARN, 80);
});

test('没额度的（{}、null、坏的）不画；百分比带小数留一位；读不出、过了的重置时刻不写', () => {
  assert.deepEqual(quotaRows({}, now, t), []);
  assert.deepEqual(quotaRows(null, now, t), []);
  assert.deepEqual(quotaRows({ windows: [{ id: 'rolling', label: '5 小时', percent: 'x' }, { id: 'weekly', percent: 3 }] }, now, t), []);
  assert.equal(percentText(4), '4%');
  assert.equal(percentText(4.36), '4.4%');
  assert.equal(resetText('not a date', now, t), null);
  assert.equal(resetText(at(-60_000), now, t), null);
});

test('三种语言都有额度的字', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const q = JSON.parse(readFileSync(new URL(`../resources/text/${lang}.json`, import.meta.url), 'utf8')).context_pop.quota;
    for (const k of ['title', 'title_of', 'in_hours', 'in_minutes', 'at']) assert.equal(typeof q?.[k], 'string', `${lang} ${k}`);
  }
});

test('有窗口的（现在只有 opencode Go）那一段的头写「Opencode GO 额度情况」，只有余额的照旧写「额度」（2026-11-17 主人，W-1206）', () => {
  const go = quotaRows({ windows: [{ id: 'rolling', label: '5 小时', percent: 4, resets_at: at(H) }] }, now, t);
  assert.equal(quotaTitle(go, t, 'Opencode GO'), 'Opencode GO 额度情况');
  assert.equal(quotaTitle([], t, 'DeepSeek'), '额度', '只有余额的：余额那一行自己写着是哪一家');
});

test('额度那一块对齐成一张网格（2026-11-17 主人验收第 36 条，W-1206）：几行共用列、条一样长，和头一行的字左边对齐', () => {
  const css = readFileSync(new URL('../styles/composer.css', import.meta.url), 'utf8');
  const rule = (/** @type {string} */ sel) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`))?.[2] ?? '';
  const box = rule('.ctx-quota');
  assert.match(box, /display: grid/, '整块一张网格');
  assert.match(box, /grid-template-columns: auto minmax\(40px, 1fr\) auto auto/, '名字、条、百分比、重置四列');
  // 头一行字前面是箭头那一格（12px）加间距（8px）：几行照它往里缩
  assert.match(box, /padding-left: calc\(20px \* var\(--space\)\)/, '和头一行的字左边对齐');
  assert.match(rule('.ctx-quota-row'), /display: contents/, '一行不再自己一张网格（各行各算列宽，条长短不一）');
  assert.match(rule('.ctx-balance-row'), /grid-column: 1 \/ -1/, '余额那一行占满整行');
});

test('额度那一段的头照会话这一刻的供应商的显示名写「X 额度情况」，不写死 Opencode GO；不知道是哪一家的写「额度」（W-1206 第 36 条）', () => {
  const go = quotaRows({ windows: [{ id: 'rolling', label: '5 小时', percent: 4, resets_at: at(H) }] }, now, t);
  assert.equal(quotaTitle(go, t, '我的 Go'), '我的 Go 额度情况');
  assert.equal(quotaTitle(go, t, null), '额度');
});
