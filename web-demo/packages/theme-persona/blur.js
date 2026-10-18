// @ts-check
//! 背景图预先糊好（蓝图 `web.md`「跟着人格的外观」第 6 条的「模糊」，核心 P-7 补）：不在每一帧做滤镜，照模糊程度在画布上糊好一张
//! （缩到长边 960，拖滑杆预览时 480），铺糊好的那张。边上多画一圈（图放大一点盖过画布的边），免得糊出透明的边。糊好的几张留着
//! （同一张图、同一个程度、同一个大小不再糊），多了拿掉最早的。浏览器的画布不支持滤镜的交 `null`（不模糊）。

import { BLUR_SIDE, bakeSize, blurRadius } from './look.js';

/** 留几张糊好的 */
const KEEP = 6;
/** @type {Map<string, Promise<{url: string, width: number, height: number}|null>>} */
const made = new Map();
/** 读过的原图（拖滑杆时不用每次重读） @type {Map<string, Promise<ImageBitmap>>} */
const sources = new Map();

/** 这个浏览器的画布能不能糊 */
const canBlur = (() => {
  try {
    const c = document.createElement('canvas').getContext('2d');
    return !!c && 'filter' in c;
  } catch {
    return false;
  }
})();

/** @param {string} url */
function source(url) {
  let got = sources.get(url);
  if (!got) {
    got = fetch(url).then((r) => r.blob()).then((b) => createImageBitmap(b));
    got.catch(() => sources.delete(url));
    sources.clear();
    sources.set(url, got);
  }
  return got;
}

/**
 * 糊好的那张（`blob:` 地址，和原图多大）；糊不了的 `null`。
 * @param {string} url 原图 @param {number} amount 模糊程度 1–100 @param {boolean} [quick] 拖滑杆的预览：糊小一点的
 * @returns {Promise<{url: string, width: number, height: number}|null>}
 */
export function baked(url, amount, quick = false) {
  if (!canBlur) return Promise.resolve(null);
  const side = quick ? BLUR_SIDE / 2 : BLUR_SIDE;
  const key = `${url}\n${amount}\n${side}`;
  let got = made.get(key);
  if (got) return got;
  got = source(url).then(async (bmp) => {
    const { width, height } = bakeSize(bmp.width, bmp.height, side);
    const r = blurRadius(amount, width);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    c.filter = `blur(${r}px)`;
    c.drawImage(bmp, -2 * r, -2 * r, width + 4 * r, height + 4 * r);
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.9));
    return blob ? { url: URL.createObjectURL(blob), width: bmp.width, height: bmp.height } : null;
  }).catch(() => null);
  made.set(key, got);
  while (made.size > KEEP) {
    const [oldest, gone] = made.entries().next().value;
    made.delete(oldest);
    gone.then((g) => g && setTimeout(() => URL.revokeObjectURL(g.url), 2000));
  }
  return got;
}
