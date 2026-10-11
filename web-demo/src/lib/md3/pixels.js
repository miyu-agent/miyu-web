// @ts-check
//! 读一张图的像素给取色用（`index.js` 的 `seedsOf`）：在浏览器里缩到长边 `side` 再读（取色只看颜色的分布，不用原图那么大）。
//! 大图一次缩到底，浏览器只挑几个点、不平均，颜色的分布就偏了（2026-10-11：4416 宽的壁纸一步缩出来主色是深蓝 `#1c4c67`，对半对半
//! 缩的是 `#527487`，和 matugen 取的 `#5b7c8e` 一路）：先一次缩一半，缩到两倍以内再缩到底。

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
      /** @type {CanvasImageSource} */
      let src = img;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;
      while (sw / 2 >= w && sh / 2 >= h) {
        sw = Math.round(sw / 2);
        sh = Math.round(sh / 2);
        const half = document.createElement('canvas');
        half.width = sw;
        half.height = sh;
        half.getContext('2d')?.drawImage(src, 0, 0, sw, sh);
        src = half;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      if (!g) return resolve(null);
      g.drawImage(src, 0, 0, w, h);
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
