// @ts-check
//! 读一张图的像素给取色用（`index.js` 的 `seedsOf`）：在浏览器里缩到长边 `side` 再读（取色只看颜色的分布，不用原图那么大）。

/**
 * @param {string} url 图的地址（`data:`、`blob:`、同源的）
 * @param {number} [side] 缩到的长边（像素）
 * @returns {Promise<Uint8ClampedArray|null>} RGBA；读不了的是 `null`
 */
export function pixelsOf(url, side = 128) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      if (!g) return resolve(null);
      g.drawImage(img, 0, 0, w, h);
      try {
        resolve(g.getImageData(0, 0, w, h).data);
      } catch (err) {
        console.error(`图读不了像素：${/** @type {any} */ (err)?.message ?? err}`);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
