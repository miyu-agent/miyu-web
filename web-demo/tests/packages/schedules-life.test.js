// @ts-check
//! 人生循环那一行（核心 LF-13；2026-11-17 项目主人本机验收第 23 条，「人生-卡」，W-1211）：定时表里 `loop` 是 `life` 的那一行点开是人生卡，
//! 不是定时任务那张；卡写推演人生、人格、开始、下次继续、上一轮、状态，不写第几轮；暂停、继续、结束照 `life.pause`、`life.resume`、`life.kill`
//! （通用的定时方法对它回 `life_schedule`）。设置页那一页、右侧栏卡片这一行同样。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLifeRow, lifeCard, lifeCall, lifePersona, lifeRowText } from '../../packages/schedules/model.js';

const manifest = JSON.parse(readFileSync(new URL('../../packages/schedules/manifest.json', import.meta.url), 'utf8'));
/** @param {'zh'|'en'|'ja'} lang */
const textOf = (lang) => (/** @type {string} */ path, /** @type {any} */ fields = {}) => {
  const got = path.split('.').reduce((/** @type {any} */ o, k) => o?.[k], manifest.text[lang]);
  return typeof got === 'string' ? got.replace(/\{(\w+)\}/g, (_, k) => String(fields[k])) : path;
};
const t = textOf('zh');
const local = (/** @type {number[]} */ [y, mo, d, hh = 0, mm = 0]) => new Date(y, mo - 1, d, hh, mm);
const now = local([2026, 11, 18, 9, 30]);
const at = (/** @type {number[]} */ p) => local(p).toISOString();
/** @type {import('../../packages/schedules/model.js').Schedule} */
const life = {
  id: 't9', loop: 'life', persona: 'miyu', when: { at: at([2026, 11, 18, 14, 5]) }, next: at([2026, 11, 18, 14, 5]), paused: false,
  created: at([2026, 11, 17, 20, 0]), last: { at: at([2026, 11, 18, 8, 0]), result: 'ran' }, target: { session: 's1' }, by: { kind: 'person' }, prompt: 'Live your day.', rounds: 42,
};

test('认人生那一行：loop 是 life 的才算', () => {
  assert.equal(isLifeRow(life), true);
  assert.equal(isLifeRow({ ...life, loop: 'dynamic' }), false);
  assert.equal(isLifeRow({ ...life, loop: undefined }), false);
});

test('人生卡：标题推演人生、人格名；开始、下次继续、上一轮、状态，没有的不写；不写第几轮', () => {
  const card = lifeCard(life, 'Miyu', now, t);
  assert.equal(card.title, '推演人生');
  assert.equal(card.name, 'Miyu');
  assert.deepEqual(card.rows, [['开始', '11月17日 20:00'], ['下次继续', '今天 14:05'], ['上一轮', '今天 08:00'], ['状态', '进行中']]);
  assert.doesNotMatch(JSON.stringify(card), /42/);
  const paused = lifeCard({ ...life, paused: true, next: undefined, last: undefined }, 'Miyu', now, t);
  assert.deepEqual(paused.rows, [['开始', '11月17日 20:00'], ['状态', '已暂停']]);
});

test('暂停、继续、结束调 life.*，参数是人格（不调 schedule.pause 这些：核心回 life_schedule）；行里没带人格的照会话的', () => {
  assert.deepEqual(lifeCall('pause', 'miyu'), { method: 'life.pause', params: { persona: 'miyu' } });
  assert.deepEqual(lifeCall('resume', 'miyu'), { method: 'life.resume', params: { persona: 'miyu' } });
  assert.deepEqual(lifeCall('kill', 'miyu'), { method: 'life.kill', params: { persona: 'miyu' } });
  assert.equal(lifePersona(life, () => 'other'), 'miyu');
  assert.equal(lifePersona({ ...life, persona: undefined }, (id) => (id === 's1' ? 'bea' : null)), 'bea');
  assert.equal(lifePersona({ ...life, persona: undefined, target: {} }, () => 'x'), null);
});

test('设置页那一行：写推演人生 · 人格名（不写交给模型的那段话），下面一行下次继续或已暂停', () => {
  assert.deepEqual(lifeRowText(life, 'Miyu', now, t), { name: '推演人生 · Miyu', meta: '下次继续 今天 14:05' });
  assert.deepEqual(lifeRowText({ ...life, paused: true }, 'Miyu', now, t), { name: '推演人生 · Miyu', meta: '已暂停' });
});

test('人生卡的字三种语言都有，结束要点第二下，不说醒', () => {
  for (const lang of ['zh', 'en', 'ja']) {
    const l = manifest.text[lang].life;
    for (const key of ['title', 'row', 'started', 'next', 'next_at', 'last', 'state', 'running', 'paused', 'pause', 'resume', 'kill', 'kill_sure']) assert.ok(l?.[key], `${lang} life.${key}`);
  }
  const src = readFileSync(new URL('../../packages/schedules/life-card.js', import.meta.url), 'utf8');
  assert.match(src, /arming/);
  for (const f of ['loop-tag.js', 'card.js', 'page.js']) assert.match(readFileSync(new URL(`../../packages/schedules/${f}`, import.meta.url), 'utf8'), /isLifeRow/, `${f} 认人生那一行`);
});
