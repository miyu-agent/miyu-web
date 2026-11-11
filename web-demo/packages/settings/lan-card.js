// @ts-check
//! 别的设备怎么打开（蓝图 `web.md`「设置页」第 12c 条第 1 款、「第一次引导」第 9 条下面「在别的设备上用」，W-1086）：设置「通用」的「访问」一组开着
//! 局域网时、第一次引导选了「开放」以后，两处用同一张卡（引导经服务 `settings` 的 `lan` 拿）：左边局域网地址的二维码，右边「在别的设备上打开」、
//! 等宽的地址和「复制」，下面一句「在手机上扫码，输入访问密码就能进」；别的网卡上还有地址的多一个「更多地址」（W-1153）。

import { h, icon } from '../../src/lib/dom.js';
import { qrMatrix, qrPath } from '../../src/lib/qr/index.js';

const SVG = 'http://www.w3.org/2000/svg';
/** 「复制」换成「已复制」多久换回来（毫秒） */
const COPIED_MS = 1500;

/**
 * @typedef {{url: string, card: string|null}} Addr 一个能开的地址和它在哪块网卡上
 * @typedef {{inset?: boolean, others?: Addr[], open?: boolean, remember?: (open: boolean) => void}} More
 *   `inset`：放在「访问」那张卡片里面的（铺暗一档的底、不带影子，不是卡片套卡片）；`others`：别的网卡上的地址，有的话多一个「更多地址」
 *   按钮，点了在下面一个一行列出来（地址、网卡名、「复制」），再点收起；`open` 是画出来时展开没有，`remember` 记下人点成了什么（整页重画以后照旧）
 */

/**
 * 一张卡：`url` 是 `GET /listen`、`POST /listen` 回的 `lan`，`card` 是它在哪块网卡上（`lans` 里那一项的，W-1135；不知道的不写）。
 * 地址放不下就换行，不截成「…」（W-1153，2026-11-11 项目主人：原来别的网卡的地址写成一句暗字，超过两行被省略）。
 * @param {any} ctx 设置包的 ctx（字、剪贴板） @param {string} url @param {string|null} [card] @param {More} [more]
 */
export function lanCard(ctx, url, card = null, more = {}) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => ctx.text(k, f);
  const others = more.others ?? [];
  const list = others.length
    ? h('div.acc-lan-list', { hidden: !more.open }, others.map((a) => h('div.acc-lan-item',
      h('code.acc-lan-url', a.url), a.card ? h('span.acc-lan-nic', a.card) : null, copyButton(ctx, a.url, true))))
    : null;
  const toggle = list ? /** @type {HTMLButtonElement} */ (h('button.set-btn.is-small.acc-lan-more', { type: 'button', 'aria-expanded': String(!!more.open), onclick: () => {
    const open = list.hidden;
    list.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('is-open', open);
    label.textContent = t(open ? 'account.lan_less' : 'account.lan_more', { count: others.length });
    more.remember?.(open);
  } })) : null;
  const label = h('span', t(more.open ? 'account.lan_less' : 'account.lan_more', { count: others.length }));
  if (toggle) {
    toggle.classList.toggle('is-open', !!more.open);
    toggle.append(label, icon('chevron-down'));
  }
  return h(`div.acc-lan-card${more.inset ? '.is-inset' : ''}`, qrImage(url),
    h('div.acc-lan-side',
      h('p.acc-lan-label', t('account.lan_open')),
      h('div.acc-lan-addr', h('code.acc-lan-url', url), card ? h('span.acc-lan-nic', card) : null, copyButton(ctx, url, false)),
      h('p.acc-lan-scan', t('account.lan_scan')),
      toggle ? h('div.acc-lan-foot', toggle) : null),
    list);
}

/** 「复制」：点了写进剪贴板，按钮上写「已复制」，一会儿换回来。 @param {any} ctx @param {string} text @param {boolean} small */
function copyButton(ctx, text, small) {
  const copy = /** @type {HTMLButtonElement} */ (h(`button.set-btn${small ? '.is-small' : ''}`, { type: 'button', onclick: async () => {
    await Promise.resolve(ctx.host?.clipboard?.write(text)).catch(() => null);
    copy.textContent = ctx.text('account.copied');
    setTimeout(() => { copy.textContent = ctx.text('account.copy'); }, COPIED_MS);
  } }, ctx.text('account.copy')));
  return copy;
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
