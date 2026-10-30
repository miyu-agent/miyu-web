// @ts-check
//! 欢迎页右边字符拼的吉祥物剪影（蓝图 `web.md`「第一次引导」第 2a 条，2026-10-30 项目主人照官网样板要的）：剪影里填 `miyu` 四个字母，
//! 边上一圈半盖着的写 `·`；刚出来时字符乱跳一阵、从中间往外落定；鼠标划过的一带换成乱码再慢慢回来，点一下从那里扩散一圈波纹。
//!
//! 照样板（`miyu-homepage` 的 `field`）改了一处：样板随机闪动、每帧都画，这里平时静止——只在刚出来那一阵、鼠标停在上面、波纹没散完时
//! 一帧一帧画，都停了就不再请下一帧（WebKitGTK 里一直画整页都按帧重画，蓝图「动效」第 4 条）。系统要求减少动效的不乱跳、不画波纹。

import { h } from '../../src/lib/dom.js';
import { FIGURE, MASK, SIZE } from './glyph-mask.js';

/** 乱码用的字符 */
const SYMS = '!<>-_\\/[]{}=+*^?#~;:%$@&01';

/** 解开的点阵：亮色照剪影（黑的圆盘），暗色照反面（女孩），同原图在暗底上的样子（2026-10-30 项目主人：logo 本来就是白色的） @type {Map<string, Uint8Array>} */
const decoded = new Map();
/** @param {boolean} dark */
const mask = (dark) => {
  const key = dark ? 'figure' : 'mask';
  const hit = decoded.get(key);
  if (hit) return hit;
  const raw = atob(dark ? FIGURE : MASK);
  const bits = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) bits[i] = (raw.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  decoded.set(key, bits);
  return bits;
};

/** 字色是亮的（暗色主题）：照字色的亮度认，不管是哪个主题、哪种写法 @param {string} color */
function light(color) {
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return false;
  c.fillStyle = color;
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128;
}

/** 这一格被剪影盖住了几成（3×3 取样） @param {number} x @param {number} y @param {number} cols @param {number} rows @param {boolean} dark */
function cover(x, y, cols, rows, dark) {
  const b = mask(dark);
  let s = 0;
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const u = Math.min(SIZE - 1, Math.floor(((x + (i + 0.5) / 3) / cols) * SIZE));
      const v = Math.min(SIZE - 1, Math.floor(((y + (j + 0.5) / 3) / rows) * SIZE));
      s += b[v * SIZE + u];
    }
  }
  return s / 9;
}

const pick = () => SYMS[Math.floor(Math.random() * SYMS.length)];

/**
 * @typedef {{px: number, py: number, kind: 0|1|2, zone: boolean, base: string, g: string, heat: number, settle: number}} Cell
 */

/**
 * 一块画着剪影的画布。交回放进页面的那一格（`div.wl-glyphs`）；拿出页面以后不再画、不再听。
 * @returns {HTMLElement}
 */
export function glyphArt() {
  const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { role: 'img', 'aria-label': 'Miyu' }));
  const node = h('div.wl-glyphs', canvas);
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** @type {Cell[]} */
  let cells = [];
  let width = 0;
  let cw = 0;
  let t0 = performance.now();
  /** @type {{x: number, y: number}|null} */
  let pointer = null;
  /** @type {{x: number, y: number, t: number}[]} */
  let ripples = [];
  let frame = 0;
  /** 颜色照主题的几格（换了明暗、配色重读） */
  const colors = { ink: '', mute: '', faint: '' };
  /** 字色是亮的：字符填女孩那一块（换了要重排格子） */
  let dark = false;
  const readColors = () => {
    const cs = getComputedStyle(node);
    colors.ink = cs.getPropertyValue('--text').trim() || '#000';
    colors.mute = cs.getPropertyValue('--text-soft').trim() || colors.ink;
    colors.faint = cs.getPropertyValue('--text-faint').trim() || colors.mute;
    dark = light(colors.ink);
  };

  const layout = () => {
    if (!ctx) return;
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    width = r.width;
    const height = r.height;
    if (!width) return;
    readColors();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = width < 300 ? 44 : width < 420 ? 54 : 64;
    cw = width / cols;
    const ch = cw * 1.5;
    const rows = Math.floor(height / ch);
    const oy = (height - rows * ch) / 2;
    cells = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cov = cover(x, (oy / ch) + y, cols, height / ch, dark);
        const px = (x + 0.5) * cw;
        const py = oy + (y + 0.5) * ch;
        const kind = cov >= 0.5 ? 2 : cov > 0.12 ? 1 : 0;
        const dx = px / width - 0.5;
        const dy = py / height - 0.5;
        const zone = dx * dx + dy * dy < 0.25;
        if (!zone && kind === 0) continue;
        cells.push({ px, py, kind, zone, base: kind === 2 ? 'miyu'[(x + y * 3) % 4] : '·', g: pick(), heat: 0,
          settle: still ? 0 : 250 + Math.hypot(dx, dy) * 1500 + Math.random() * 450 });
      }
    }
    ctx.font = `500 ${(cw * 1.32).toFixed(2)}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    wake();
  };

  /** 画一帧；交回下一帧还要不要画（还在落定、有热的格子、有没散完的波纹） @param {number} now */
  const draw = (now) => {
    if (!ctx || !width) return false;
    const t = now - t0;
    let busy = false;
    if (pointer) {
      const R = width * 0.13;
      for (const c of cells) {
        const d = Math.hypot(c.px - pointer.x, c.py - pointer.y);
        if (d < R) c.heat = Math.max(c.heat, 1 - d / R);
      }
      busy = true;
    }
    ripples = ripples.filter((r) => {
      const rr = (now - r.t) * 0.55;
      if (rr > width * 1.2) return false;
      for (const c of cells) if (Math.abs(Math.hypot(c.px - r.x, c.py - r.y) - rr) < cw * 2.2) c.heat = Math.max(c.heat, 0.95);
      return true;
    });
    if (ripples.length) busy = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const c of cells) {
      let ch;
      let alpha = 1;
      let color = colors.ink;
      if (t < c.settle) {
        busy = true;
        if (!c.zone) continue;
        if (Math.random() < 0.3) c.g = pick();
        ch = c.g;
        color = colors.faint;
      } else if (c.heat > 0.06) {
        busy = true;
        if (Math.random() < c.heat * 0.6) c.g = pick();
        ch = c.g;
        color = c.kind === 2 ? colors.mute : colors.ink;
        alpha = c.kind === 0 ? c.heat * 0.6 : c.kind === 1 ? 0.45 + c.heat * 0.55 : 1;
      } else {
        if (c.kind === 0) continue;
        ch = c.base;
        if (c.kind === 1) alpha = 0.4;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillText(ch, c.px, c.py);
      c.heat *= 0.92;
    }
    ctx.globalAlpha = 1;
    return busy;
  };

  const tick = (/** @type {number} */ now) => {
    frame = 0;
    if (!node.isConnected) return stop();
    if (draw(now)) frame = requestAnimationFrame(tick);
  };
  /** 有事了：没在画的请一帧 */
  const wake = () => {
    if (!frame && node.isConnected) frame = requestAnimationFrame(tick);
  };

  const pos = (/** @type {PointerEvent} */ e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointermove', (e) => { if (still) return; pointer = pos(e); wake(); });
  canvas.addEventListener('pointerleave', () => { pointer = null; wake(); });
  canvas.addEventListener('pointerdown', (e) => {
    if (still) return;
    const p = pos(e);
    ripples.push({ ...p, t: performance.now() });
    if (e.pointerType !== 'mouse') pointer = p;
    wake();
  });
  canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pointer = null; });
  const sized = new ResizeObserver(() => {
    if (!node.isConnected) return stop();
    t0 = performance.now() - 10000;
    layout();
  });
  sized.observe(canvas);
  // 换了明暗、配色（根上的属性、样式变了）：重读颜色、画一帧；明暗换了照另一面重排格子
  const themed = new MutationObserver(() => {
    if (!node.isConnected) return stop();
    const was = dark;
    readColors();
    if (dark !== was) layout();
    else wake();
  });
  themed.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-scheme', 'data-theme', 'data-skin'] });
  const stop = () => {
    sized.disconnect();
    themed.disconnect();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  // 第一次排好以后才算起点：刚出来那一阵从这时起
  requestAnimationFrame(() => { t0 = performance.now(); });
  return node;
}
