// @ts-check
//! 「访问」那张卡片要算的（蓝图 `web.md`「设置页」第 12c 条，W-1153）：开没开、打开时要不要先设密码、别的设备能开的地址怎么列、端口那一格写得对不对。
//! 纯的，不碰页面。

/** 写的地址是不是只有这台电脑（回环）：`127.*`、`::1`、`localhost`；别的（`0.0.0.0`、这台电脑的某一个地址）算听局域网。 @param {unknown} value */
export const loopbackOnly = (value) => {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return v === '' || v === 'localhost' || v === '::1' || v === '[::1]' || /^127\./.test(v);
};

/** 打开开关写进 `web.listen` 的：这台电脑的所有地址 */
export const ALL = '0.0.0.0';

/**
 * 打开开关走哪条路（第 12c 条第 1 款）：没设访问密码的先弹窗设（`ask`），设好了才写；设了的、旧核心不说设没设的（`null`）直接写（`write`）。
 * @param {boolean|null|undefined} passwordSet 握手说的设没设
 * @returns {'ask'|'write'}
 */
export const turnOnWay = (passwordSet) => (passwordSet === false ? 'ask' : 'write');

/**
 * 别的设备能开的地址（网页软件 `GET /listen` 回的 `lan`、`lans`，W-1135）：`main` 是卡上画二维码的那一个（`lan`，带它的网卡名），`others` 是别的
 * 网卡上的，照网页软件给的先后、去掉重的。没有 `lan` 的（没开、问不到）`main` 是 `null`、`others` 是空的。
 * @param {any} info
 * @returns {{main: {url: string, card: string|null}|null, others: {url: string, card: string|null}[]}}
 */
export function lanAddrs(info) {
  const url = typeof info?.lan === 'string' && info.lan ? info.lan : null;
  if (!url) return { main: null, others: [] };
  /** @type {{url: string, card: string|null}[]} */
  const all = [];
  for (const l of Array.isArray(info.lans) ? info.lans : []) {
    if (typeof l?.url !== 'string' || !l.url || all.some((a) => a.url === l.url)) continue;
    all.push({ url: l.url, card: typeof l.card === 'string' && l.card ? l.card : null });
  }
  return { main: { url, card: all.find((a) => a.url === url)?.card ?? null }, others: all.filter((a) => a.url !== url) };
}

/**
 * 端口那一格写的字：`1`–`65535` 的整数才算；空的是 `''`（去掉这一项，回到出厂的端口）；别的是 `null`（不收，放回原来的）。
 * @param {string} text @returns {number|''|null}
 */
export function portOf(text) {
  const t = text.trim();
  if (t === '') return '';
  if (!/^\d{1,5}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 65535 ? n : null;
}
