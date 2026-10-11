// @ts-check
//! 裁头像（蓝图 `web.md`「跟着人格的外观」第 8 条，2026-10-11 项目主人定：比例不对才弹）：选的图不是正方形（长宽差过 2%）先弹一个
//! 窗口：图上一个圆的框（框外压暗），拖图挪位置、滑杆或滚轮放大，「取消」「确定」；确定了裁成正方形交回。正方形的直接交回原图。

import { h } from '../../src/lib/dom.js';
import { floatCard } from './float.js';

/** 框的边长（CSS 像素） */
const VIEW = 280;
/** 最多放大到铺满框的几倍 */
const MAX_ZOOM = 4;
/** 长宽差多少以内算正方形 */
const SQUARE = 0.02;
/** 裁出来最大多大（再交给 `avatars.js` 的 `shrink` 缩到存的大小） */
const OUT = 1024;

/**
 * 框里摆图的算法（纯函数，测试用）：图按 `scale` 画，左上角在 `(x, y)`；挪、放大以后夹住，框里不露空。
 * @param {{w: number, h: number}} img 原图的大小 @param {number} zoom 1 是刚好铺满框
 */
export function coverScale(img, zoom) {
  return (VIEW / Math.min(img.w, img.h)) * zoom;
}

/**
 * 夹住位置：图不能挪到露出框外的空。
 * @param {{w: number, h: number}} img @param {number} scale @param {number} x @param {number} y
 */
export function clampAt(img, scale, x, y) {
  return { x: Math.min(0, Math.max(VIEW - img.w * scale, x)), y: Math.min(0, Math.max(VIEW - img.h * scale, y)) };
}

/**
 * 框里这时对着原图的哪一块（正方形）。
 * @param {number} scale @param {number} x @param {number} y
 */
export function sourceSquare(scale, x, y) {
  return { sx: -x / scale, sy: -y / scale, side: VIEW / scale };
}

/** 是不是（差不多）正方形。 @param {{w: number, h: number}} img */
export const isSquare = (img) => Math.abs(img.w - img.h) / Math.max(img.w, img.h) <= SQUARE;

/**
 * 弹窗裁头像。
 * @param {{text: (key: string) => string, kit: import('./form.js').Kit, from: HTMLElement}} env 字、控件、从哪弹（找它所在的设置框）
 * @param {Blob} file
 * @returns {Promise<Blob|null>} 裁好的、原图（正方形的）；取消的是 `null`
 */
export async function cropAvatar(env, file) {
  const bitmap = await createImageBitmap(file);
  const img = { w: bitmap.width, h: bitmap.height };
  if (isSquare(img)) {
    bitmap.close();
    return file;
  }
  return new Promise((resolve) => {
    const t = env.text;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const canvas = /** @type {HTMLCanvasElement} */ (h('canvas.setup-crop-canvas', { width: Math.round(VIEW * dpr), height: Math.round(VIEW * dpr) }));
    const g = canvas.getContext('2d');
    let zoom = 1;
    let scale = coverScale(img, zoom);
    let at = clampAt(img, scale, (VIEW - img.w * scale) / 2, (VIEW - img.h * scale) / 2);
    const draw = () => {
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, VIEW, VIEW);
      g.drawImage(bitmap, at.x, at.y, img.w * scale, img.h * scale);
    };
    /** 放大到 `next`，框的正中对着的那一点不动 @param {number} next */
    const zoomTo = (next) => {
      zoom = Math.min(MAX_ZOOM, Math.max(1, next));
      const before = scale;
      scale = coverScale(img, zoom);
      const c = VIEW / 2;
      at = clampAt(img, scale, c - ((c - at.x) / before) * scale, c - ((c - at.y) / before) * scale);
      slider.value = String(zoom);
      draw();
    };
    const slider = /** @type {HTMLInputElement} */ (h('input.setup-range.setup-crop-zoom', { type: 'range', min: '1', max: String(MAX_ZOOM), step: '0.01', value: '1', 'aria-label': t('edit.crop_zoom') }));
    slider.addEventListener('input', () => zoomTo(Number(slider.value)));
    const stage = h('div.setup-crop-stage', canvas, h('div.setup-crop-ring', { 'aria-hidden': 'true' }));
    /** @type {{id: number, x: number, y: number}|null} */
    let drag = null;
    stage.addEventListener('pointerdown', (e) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      at = clampAt(img, scale, at.x + e.clientX - drag.x, at.y + e.clientY - drag.y);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      draw();
    });
    const drop = () => { drag = null; };
    stage.addEventListener('pointerup', drop);
    stage.addEventListener('pointercancel', drop);
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomTo(zoom * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    let done = false;
    /** @param {Blob|null} blob */
    const finish = (blob) => {
      if (done) return;
      done = true;
      bitmap.close();
      card.close();
      resolve(blob);
    };
    const ok = () => {
      const { sx, sy, side } = sourceSquare(scale, at.x, at.y);
      const out = Math.max(1, Math.min(OUT, Math.round(side)));
      const c = document.createElement('canvas');
      c.width = out;
      c.height = out;
      const cg = c.getContext('2d');
      if (!cg) return finish(null);
      cg.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
      c.toBlob((b) => finish(b), 'image/png');
    };
    const body = h('div.setup-crop', stage, slider,
      h('div.setup-foot', h('span.setup-grow'), env.kit.button(t('edit.cancel'), {}, () => finish(null)), env.kit.button(t('edit.crop_ok'), { primary: true }, ok)));
    const card = floatCard({ title: t('edit.crop_title'), body, close: t('edit.close'), onDismiss: () => finish(null) });
    card.el.classList.add('setup-crop-scrim');
    // 放进设置框里的跟着设置框；开在整页上（左上角点进来的编辑卡片）的盖在整页上
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
