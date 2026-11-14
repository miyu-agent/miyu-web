// @ts-check
//! 手机上要的几样小东西（蓝图 `web.md`「手机上」）：可见区域多高（输入法弹出来以后）、浮层挪回屏幕里、手指划一下算不算收起、
//! 写剪贴板（不是安全上下文时的老办法）。算的那一半不碰页面，测试直接调；碰页面的在各自下面。

/**
 * 可见区域（地址栏收起、输入法弹出来以后真正看得见的那一块）多高、离页面顶多远、输入法开着没有。捏着放大的时候不跟
 * （整页缩成放大后看得见的那一小块就没法用了），交回 `null`。
 * @param {{height: number, offsetTop: number, scale: number}|null|undefined} vv 浏览器的 `visualViewport`
 * @param {number} layout 排版视口多高（`innerHeight`）
 * @returns {{height: number, top: number, keyboard: boolean}|null}
 */
export function visibleBox(vv, layout) {
  if (!vv || Math.abs((vv.scale ?? 1) - 1) > 0.01) return null;
  const height = Math.round(vv.height);
  if (!(height > 0)) return null;
  // 输入法：可见的比排版的矮一大截（地址栏伸缩只差几十像素，不算）
  return { height, top: Math.max(0, Math.round(vv.offsetTop)), keyboard: layout - height > KEYBOARD_MIN };
}
/** 可见区域比排版视口矮这么多（CSS 像素）以上的算输入法开着 */
export const KEYBOARD_MIN = 120;

/**
 * 不算输入法时可见区域有多高（`--app-height-rest`）：触屏上同一个宽度下见过的最高的那一次，宽度变了（转屏）重来；不是触屏的就照这一刻的
 * （拉窗口不当成输入法）。安卓 Chrome 照 `interactive-widget=resizes-content` 连排版视口一起缩，拿排版视口比看不出输入法开着，
 * 要拿这个比。纯的。
 * @param {{width: number, height: number}|null} prev 上一次的 @param {{height: number}|null} box `visibleBox` 算的
 * @param {number} width 排版视口多宽（`innerWidth`） @param {boolean} touch 是不是触屏（`pointer: coarse`）
 * @returns {{width: number, height: number}|null}
 */
export function restOf(prev, box, width, touch) {
  if (!box) return null;
  if (!touch || !prev || prev.width !== width) return { width, height: box.height };
  return { width, height: Math.max(prev.height, box.height) };
}

/**
 * 页面的高跟着可见区域（`--app-height`，`sidebar.css` 的 `.app-shell` 照它）：手机上输入法弹出来，输入框贴着它上沿、正文跟着缩，不被盖住。
 * 不算输入法的那个高另写 `--app-height-rest`（`restOf`）：设置窗照它，输入法盖在上面、不跟着挤（2026-11-14 主人验收：「覆盖就可以了」）。
 * 浏览器为了露出输入框把页面往上推了的（iOS：可见区域离页面顶不是 0）推回去——整页已经只有可见区域那么高，不用它推。
 * 输入法开着记在 `html.has-keyboard` 上。没有 `visualViewport` 的浏览器什么都不做（照 `100dvh`）。
 * @param {HTMLElement} root 整页那一层（写 `--app-height`）
 * @param {() => void} [changed] 高变了（正文要重新贴底）
 */
export function followVisible(root, changed) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const coarse = matchMedia('(pointer: coarse)');
  let last = '';
  /** @type {{width: number, height: number}|null} */
  let rest = null;
  const sync = () => {
    rest = restOf(rest, visibleBox(vv, innerHeight), innerWidth, coarse.matches);
    const box = visibleBox(vv, Math.max(innerHeight, rest?.height ?? 0));
    const next = box ? `${box.height}|${box.keyboard}|${rest?.height}` : '';
    if (box?.top) scrollTo(0, 0);
    if (next === last) return;
    last = next;
    if (box) root.style.setProperty('--app-height', `${box.height}px`);
    else root.style.removeProperty('--app-height');
    if (rest) root.style.setProperty('--app-height-rest', `${rest.height}px`);
    else root.style.removeProperty('--app-height-rest');
    document.documentElement.classList.toggle('has-keyboard', !!box?.keyboard);
    changed?.();
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
  return () => { vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync); };
}

/**
 * 输入法盖着的那一块里的框要往上挪多少（CSS 像素）：框的下沿 `bottom` 超过可见区域的下沿 `visible`（再留 `pad`）的那一截；没盖着的是 0。纯的。
 * @param {number} bottom @param {number} visible @param {number} [pad]
 */
export function coveredBy(bottom, visible, pad = 16) {
  return Math.max(0, Math.ceil(bottom - (visible - pad)));
}

/**
 * 不跟着输入法缩的那一层（设置窗）里，正在打字的框被输入法盖住时，把它所在那一格往上滚出来（`coveredBy`）：聚焦时、输入法弹完（可见区域变了）时各看一次。
 * 没有 `visualViewport` 的什么都不做。交回停下。
 * @param {HTMLElement} layer
 */
export function keepTypingVisible(layer) {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  const check = () => {
    const field = /** @type {HTMLElement|null} */ (document.activeElement);
    if (!field || !layer.contains(field) || !field.matches('input, textarea, [contenteditable="true"]')) return;
    const by = coveredBy(field.getBoundingClientRect().bottom, vv.height + vv.offsetTop);
    if (!by) return;
    for (let el = field.parentElement; el && el !== layer.parentElement; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
        el.scrollTop += by;
        return;
      }
    }
  };
  const later = () => setTimeout(check, 0);
  layer.addEventListener('focusin', later);
  vv.addEventListener('resize', check);
  return () => { layer.removeEventListener('focusin', later); vv.removeEventListener('resize', check); };
}

/**
 * 一条横着的东西（左右两头 `left`、`right`）放进 `[from + pad, to - pad]` 里要挪多少：超出右边的往左挪（负数），超出左边的往右挪；
 * 比那一段还宽的贴左边（右边超出去的由它自己的 `max-width` 管）。本来就在里面的是 0。
 * @param {number} left @param {number} right @param {number} from @param {number} to @param {number} [pad]
 */
export function shiftInto(left, right, from, to, pad = 8) {
  const lo = from + pad;
  const hi = to - pad;
  if (right - left >= hi - lo) return lo - left;
  if (right > hi) return hi - right;
  if (left < lo) return lo - left;
  return 0;
}

/**
 * 浮层（菜单、卡片）横着超出窗口的挪回来（用单独的 `translate`，不碰它自己的 `transform`、进场动画）；每次开、换内容时调。
 * @param {HTMLElement} el @param {number} [pad]
 */
export function keepInView(el, pad = 8) {
  el.style.translate = '';
  const r = el.getBoundingClientRect();
  if (!r.width) return;
  const dx = shiftInto(r.left, r.right, 0, document.documentElement.clientWidth, pad);
  // 整页放大了的（`--ui-scale`）：量的是屏幕像素，写回去的是它自己的 CSS 像素
  const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
  if (Math.abs(dx) >= 0.5) el.style.translate = `${dx / (scale || 1)}px 0`;
}

/** 手指划多远（CSS 像素）以上才算一划 */
export const SWIPE_MIN = 56;

/**
 * 手指从 `from` 划到 `to` 算往哪边划了一下：横着走够 `SWIPE_MIN`、而且横的比竖的多一倍以上（竖着滚列表时手指歪一点不算）才算；
 * 不算的是 `null`。
 * @param {{x: number, y: number}} from @param {{x: number, y: number}} to @returns {'left'|'right'|null}
 */
export function swipeOf(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 2) return null;
  return dx < 0 ? 'left' : 'right';
}

/**
 * 在 `el` 上手指往 `dir` 那边划一下就叫 `run`（抽屉、盖在上面的右栏：往它收回去的那边划就收起）。在能横着滚的东西里起手的不算
 * （表格、代码块自己要滚）。交回怎么不听。
 * @param {HTMLElement} el @param {'left'|'right'} dir @param {() => void} run
 */
export function onSwipe(el, dir, run) {
  /** @type {{x: number, y: number}|null} */
  let from = null;
  const scrollsX = (/** @type {Element|null} */ at) => {
    for (let a = at; a && a !== el; a = a.parentElement) if (a.scrollWidth > a.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(a).overflowX)) return true;
    return false;
  };
  const start = (/** @type {TouchEvent} */ e) => {
    const t = e.touches[0];
    from = e.touches.length === 1 && !scrollsX(/** @type {Element} */ (e.target)) ? { x: t.clientX, y: t.clientY } : null;
  };
  const end = (/** @type {TouchEvent} */ e) => {
    const t = e.changedTouches[0];
    if (from && t && swipeOf(from, { x: t.clientX, y: t.clientY }) === dir) run();
    from = null;
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', end, { passive: true });
  return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchend', end); };
}

/**
 * 写剪贴板：有 `navigator.clipboard` 的用它；没有的（经局域网 http 打开的页面不是安全上下文，浏览器不给这个接口——2026-11-11
 * 项目主人：手机上「发出去的 prompt 点复制按钮无效」）、被拒的退回老办法：临时放一个文本框、选中、`execCommand('copy')`。
 * 都不行的抛错，`reason` 是 `unsupported`（界面说「复制不了，请手动选中再复制」）。
 * @param {string} text
 * @param {{navigator?: any, document?: any}} [env] 测试换掉浏览器的那两样
 * @returns {Promise<'api'|'legacy'>} 走的哪条路
 */
export async function writeText(text, env = globalThis) {
  const api = env.navigator?.clipboard;
  if (typeof api?.writeText === 'function') {
    try {
      await api.writeText(text);
      return 'api';
    } catch { /* 被拒了（没权限、页面不在前面）：试老办法 */ }
  }
  if (legacyCopy(text, env.document)) return 'legacy';
  throw Object.assign(new Error('clipboard unsupported'), { reason: 'unsupported' });
}

/**
 * 老办法复制：临时文本框（只读，手机上不弹输入法；放在开着的对话框里，不然被它挡着聚不了焦）、选中、`execCommand('copy')`，
 * 完了拿掉、把焦点还回去。成了交 `true`。
 * @param {string} text @param {any} doc
 */
export function legacyCopy(text, doc) {
  if (!doc?.body || typeof doc.execCommand !== 'function') return false;
  const active = doc.activeElement;
  const box = doc.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;';
  (active?.closest?.('dialog[open]') ?? doc.body).append(box);
  let ok = false;
  try {
    box.focus({ preventScroll: true });
    box.select();
    box.setSelectionRange?.(0, text.length);
    ok = !!doc.execCommand('copy');
  } catch { ok = false; }
  box.remove();
  active?.focus?.({ preventScroll: true });
  return ok;
}
