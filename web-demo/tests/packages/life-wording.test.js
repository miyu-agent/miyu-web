// @ts-check
//! 循环、人生不说「醒」「睡」（核心 WK-2，2026-11-17 项目主人：一律说「继续」「下一轮」）：给人看的字里搜不到醒、睡、wake、目覚め；
//! 工具改名 `schedule_next`（旧名不留）、交进会话的标签改成 `<loop-round>`、`<life-round>`。吉祥物的 `awake`、`wake_ms` 是内部名字，不在这里。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';

const json = (/** @type {string} */ p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
/** 一样东西里的全部字（对象、数组一层层往下） @param {any} v @returns {string[]} */
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const WAKE = /醒|睡|[Ww]ak(e|es|ing|eup)|[Ss]leep|目覚|眠/;

/** 给人看、说循环和人生的那几处 @returns {[string, string][]} */
function lifeTexts() {
  /** @type {[string, string][]} */
  const out = [];
  const add = (/** @type {string} */ where, /** @type {any} */ v) => { for (const s of strings(v)) out.push([where, s]); };
  const life = json('packages/life/manifest.json');
  add('life', { name: life.name, summary: life.summary, description: life.description, text: life.text });
  const setup = json('packages/setup/manifest.json');
  for (const lang of ['zh', 'en', 'ja']) {
    add(`setup.${lang}.life`, setup.text[lang].life);
    add(`setup.${lang}.edit`, Object.fromEntries(Object.entries(setup.text[lang].edit).filter(([k]) => k.startsWith('life'))));
    const text = json(`resources/text/${lang}.json`);
    add(`text.${lang}.life`, text.life);
    add(`text.${lang}.notes.round`, text.notes.round);
  }
  add('schedules', json('packages/schedules/manifest.json').text);
  const parts = json('resources/parts.json');
  add('parts', Object.entries(parts).filter(([k]) => k.startsWith('life') || k.startsWith('setup.life')).map(([, v]) => v.zh));
  return out;
}

test('循环、人生给人看的字不说醒、睡：三种语言都换成继续、下一轮', () => {
  const bad = lifeTexts().filter(([, s]) => WAKE.test(s));
  assert.deepEqual(bad, []);
});

test('循环、人生到点交进来的那一行写「继续」：循环 · 继续、人生 · 继续', () => {
  assert.deepEqual(json('resources/text/zh.json').notes.round, { loop: '循环 · 继续', life: '人生 · 继续' });
  assert.equal(json('resources/layout.json').note_marks.round, '◷');
});

test('定下一轮的工具叫 schedule_next：时间线的图标照新名，旧名不留；核心的出厂资源里也是新名', () => {
  const icons = json('resources/timeline.json').icons;
  assert.equal(icons.schedule_next, 'clock');
  assert.equal('schedule_wakeup' in icons, false);
  const dir = process.env.MIYU_RESOURCES;
  if (dir) {
    assert.ok(existsSync(`${dir}/software/loop/tools/schedule_next.json`), '钉住的核心认 schedule_next');
    assert.equal(existsSync(`${dir}/software/loop/tools/schedule_wakeup.json`), false);
  }
});

test('网页的代码里不认旧名字：schedule_wakeup、loop-wakeup、life-wakeup', () => {
  const walk = (/** @type {string} */ dir) => readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.(js|json)$/.test(d.name) ? [`${dir}/${d.name}`] : []));
  const files = [...walk('src'), ...walk('packages'), ...walk('resources')];
  const hits = files.filter((f) => /schedule_wakeup|loop-wakeup|life-wakeup/.test(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')));
  assert.deepEqual(hits, []);
});
