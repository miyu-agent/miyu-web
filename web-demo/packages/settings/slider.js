// @ts-check
//! 滑块（蓝图 `web.md`「设置页」第 5 条「软件包配置项的词汇」，核心设计 53 第三节、PC-1）：`int`、`number` 写了 `slider = true` 的项，
//! `config.schema` 给 `control: "slider"`、`min`、`max`、`step`。一根滑杆，右边等宽字写现在的数；拖的时候数跟着变，松手存（交数）；
//! 键盘左右一格一格挪，停下来 0.4 秒再存。没写过的照默认值画（改没改过照这一行右边的「默认」「恢复默认」看）。

import { h } from '../../src/lib/dom.js';

/** 键盘挪完停多久再存 */
const SETTLE_MS = 400;

/**
 * `step` 有几位小数，写数照它（0.05 写两位）。
 * @param {number} step
 */
export function digitsOf(step) {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const text = String(step);
  const e = /e-(\d+)$/.exec(text);
  if (e) return Number(e[1]);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

/**
 * 滑块的几样：范围、一格多大（核心给的；没给的 `int` 是 1、小数是范围的百分之一）、现在画在哪（值，没有的照默认、再没有的照最小）。
 * @param {{type?: string, min?: number, max?: number, step?: number, default?: any}} item @param {any} value
 */
export function sliderOf(item, value) {
  const min = Number(item.min ?? 0);
  const max = Number(item.max ?? 100);
  const step = Number(item.step) > 0 ? Number(item.step) : item.type === 'int' ? 1 : (max - min) / 100;
  const set = typeof value === 'number' && Number.isFinite(value);
  const fallback = typeof item.default === 'number' ? item.default : min;
  const now = Math.min(max, Math.max(min, set ? value : fallback));
  return { min, max, step, now, set, digits: digitsOf(step) };
}

/**
 * 画一根滑块。
 * @param {{type?: string, min?: number, max?: number, step?: number, default?: any}} item @param {any} value
 * @param {(n: number) => any} save
 */
export function slider(item, value, save) {
  const s = sliderOf(item, value);
  const input = /** @type {HTMLInputElement} */ (h('input.set-slider', { type: 'range', min: String(s.min), max: String(s.max), step: String(s.step), value: String(s.now) }));
  const shown = h('span.set-slider-value', s.now.toFixed(s.digits));
  const box = h('span.set-slider-box', input, shown);
  const fill = () => {
    const at = s.max > s.min ? ((Number(input.value) - s.min) / (s.max - s.min)) * 100 : 0;
    input.style.setProperty('--fill', `${at}%`);
    shown.textContent = Number(input.value).toFixed(s.digits);
  };
  fill();
  /** @type {any} */
  let timer = 0;
  let saved = s.now;
  const commit = () => {
    clearTimeout(timer);
    const n = Number(Number(input.value).toFixed(s.digits));
    if (n === saved) return;
    saved = n;
    save(n);
  };
  input.addEventListener('input', fill);
  // 指针松手当场存；键盘一下一下的停 0.4 秒再存
  input.addEventListener('pointerup', commit);
  input.addEventListener('change', () => {
    clearTimeout(timer);
    timer = setTimeout(commit, SETTLE_MS);
  });
  return box;
}
