// @ts-check
//! 选背景图的焦点（蓝图 `web.md`「跟着人格的外观」第 6 条，核心 P-7；2026-10-11 项目主人定：背景图不裁、只选焦点）：一个窗口「背景图焦点」，
//! 整张图照比例放进框里，点一下或拖那个圆点定焦点；下面两个小框照窄的、宽的窗口画出会露哪一块。拖的时候发 `look.preview`，正在看的
//! 就是这个人格的整页当场跟着变。「居中」删掉焦点、「取消」不动、「确定」存。

import { h } from '../../src/lib/dom.js';
import { floatCard } from './float.js';

/** 框最大多大（CSS 像素） */
const BOX_W = 440;
const BOX_H = 260;

/**
 * 指针落在图上哪一点（百分数，整数，夹在 0–100）。
 * @param {{left: number, top: number, width: number, height: number}} rect 图在页面上的位置 @param {number} x @param {number} y
 * @returns {[number, number]}
 */
export function pointAt(rect, x, y) {
  const pct = (/** @type {number} */ v, /** @type {number} */ from, /** @type {number} */ size) => Math.round(Math.min(100, Math.max(0, ((v - from) / Math.max(1, size)) * 100)));
  return [pct(x, rect.left, rect.width), pct(y, rect.top, rect.height)];
}

/**
 * 图照比例放进框里多大。
 * @param {{w: number, h: number}} img
 */
export function fitBox(img) {
  const k = Math.min(BOX_W / img.w, BOX_H / img.h);
  return { w: Math.round(img.w * k), h: Math.round(img.h * k) };
}

/**
 * 开窗口选焦点。
 * @param {{text: (key: string) => string, kit: import('./form.js').Kit, from: HTMLElement, preview: (focus: [number, number]|null) => void}} env
 *   字、控件、从哪弹、整页预览（`null` 是不预览了）
 * @param {string} url 背景图 @param {[number, number]|null} focus 现在的焦点（没设的是 `null`，居中）
 * @returns {Promise<[number, number]|'center'|null>} 选定的、「居中」、取消
 */
export async function chooseFocus(env, url, focus) {
  const t = env.text;
  const img = new Image();
  img.src = url;
  await img.decode();
  const size = fitBox({ w: img.naturalWidth, h: img.naturalHeight });
  return new Promise((resolve) => {
    let at = /** @type {[number, number]} */ (focus ?? [50, 50]);
    const dot = h('span.setup-focus-dot', { 'aria-hidden': 'true' });
    const pic = h('div.setup-focus-pic', { style: `width: ${size.w}px; height: ${size.h}px; background-image: url("${url}")` }, dot);
    const sample = (/** @type {string} */ cls, /** @type {string} */ label) => h('figure.setup-focus-sample', h(`span.setup-focus-frame.${cls}`, { style: `background-image: url("${url}")` }), h('figcaption', label));
    const narrow = sample('is-narrow', t('edit.focus_narrow'));
    const wide = sample('is-wide', t('edit.focus_wide'));
    const draw = () => {
      dot.style.left = `${at[0]}%`;
      dot.style.top = `${at[1]}%`;
      for (const f of [narrow, wide]) /** @type {HTMLElement} */ (f.firstChild).style.backgroundPosition = `${at[0]}% ${at[1]}%`;
    };
    /** @type {number|null} */
    let drag = null;
    const move = (/** @type {PointerEvent} */ e) => {
      at = pointAt(pic.getBoundingClientRect(), e.clientX, e.clientY);
      draw();
      env.preview(at);
    };
    pic.addEventListener('pointerdown', (e) => {
      drag = e.pointerId;
      pic.setPointerCapture(e.pointerId);
      move(e);
    });
    pic.addEventListener('pointermove', (e) => { if (drag === e.pointerId) move(e); });
    const drop = () => { drag = null; };
    pic.addEventListener('pointerup', drop);
    pic.addEventListener('pointercancel', drop);

    let done = false;
    /** @param {[number, number]|'center'|null} result */
    const finish = (result) => {
      if (done) return;
      done = true;
      // 取消的回到原样；存的等存好、人格重读以后照新的铺
      if (result === null) env.preview(null);
      card.close();
      resolve(result);
    };
    const body = h('div.setup-focus', pic, h('div.setup-focus-samples', narrow, wide),
      h('div.setup-foot', env.kit.button(t('edit.focus_center'), {}, () => finish('center')), h('span.setup-grow'),
        env.kit.button(t('edit.cancel'), {}, () => finish(null)), env.kit.button(t('edit.ok'), { primary: true }, () => finish(at))));
    const card = floatCard({ title: t('edit.focus_title'), body, close: t('edit.close'), onDismiss: () => finish(null) });
    card.el.classList.add('setup-crop-scrim');
    card.mount(env.from);
    if (card.el.parentElement === document.body) card.el.classList.add('is-page');
    card.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      finish(null);
    });
    draw();
    const box = /** @type {HTMLElement|null} */ (card.el.querySelector('.setup-float'));
    box?.setAttribute('tabindex', '-1');
    box?.focus({ preventScroll: true });
  });
}
