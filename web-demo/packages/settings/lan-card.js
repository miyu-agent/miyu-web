// @ts-check
//! 别的设备怎么打开（蓝图 `web.md`「设置页」第 12c 条第 1 款、「第一次引导」第 9 条下面「在别的设备上用」，W-1086）：设置「通用」的「访问」一组开着
//! 局域网时、第一次引导选了「开放」以后，两处用同一张卡（引导经服务 `settings` 的 `lan` 拿）：左边局域网地址的二维码，右边「在别的设备上打开」、
//! 等宽的地址和「复制」，下面一句「在手机上扫码，输入访问密码就能进」。

import { h } from '../../src/lib/dom.js';
import { qrMatrix, qrPath } from '../../src/lib/qr/index.js';

const SVG = 'http://www.w3.org/2000/svg';
/** 「复制」换成「已复制」多久换回来（毫秒） */
const COPIED_MS = 1500;

/**
 * 一张卡：`url` 是 `GET /listen`、`POST /listen` 回的 `lan`，`card` 是它在哪块网卡上（`lans` 里那一项的，W-1135；不知道的不写）。
 * @param {any} ctx 设置包的 ctx（字、剪贴板） @param {string} url @param {string|null} [card]
 */
export function lanCard(ctx, url, card = null) {
  const t = (/** @type {string} */ k) => ctx.text(k);
  const copy = /** @type {HTMLButtonElement} */ (h('button.set-btn', { type: 'button', onclick: async () => {
    await Promise.resolve(ctx.host?.clipboard?.write(url)).catch(() => null);
    copy.textContent = t('account.copied');
    setTimeout(() => { copy.textContent = t('account.copy'); }, COPIED_MS);
  } }, t('account.copy')));
  return h('div.acc-lan-card', qrImage(url),
    h('div.acc-lan-side',
      h('p.acc-lan-label', t('account.lan_open')),
      h('div.acc-lan-addr', h('code.acc-lan-url', url), card ? h('span.acc-lan-nic', card) : null, copy),
      h('p.acc-lan-scan', t('account.lan_scan'))));
}

/**
 * 地址画成二维码（`src/lib/qr/`）：白底黑块、四边留白，暗色主题也不反过来（反色的二维码有的手机扫不出来）；一格画成整像素，不糊边。
 * @param {string} url
 */
function qrImage(url) {
  const { path, size } = qrPath(qrMatrix(url));
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'acc-lan-qr');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', url);
  const paper = document.createElementNS(SVG, 'rect');
  paper.setAttribute('width', String(size));
  paper.setAttribute('height', String(size));
  paper.setAttribute('fill', '#fff');
  const ink = document.createElementNS(SVG, 'path');
  ink.setAttribute('d', path);
  ink.setAttribute('fill', '#000');
  svg.append(paper, ink);
  return svg;
}
