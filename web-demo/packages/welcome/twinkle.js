// @ts-check
//! 第一次引导里一格一格变的几样（蓝图 `web.md`「动效」第 4 条、「第一次引导」第 3 条）：一闪一闪的（步骤条现在那一格、「PRESS ENTER」、
//! 选中那一项前面的 ▶）和慢慢闪的星点。原来是 CSS `steps()` 的无限动画，样子照旧，改成一个计时器换亮度：无限动画在 WebKitGTK 里让整页
//! 一直按帧重画（桌面端 DT-1 量过，空闲时一成多的核），计时器只在换的那一下重画。

/** 一个格子多久（毫秒，乘页面的 `--motion-scale`）：闪的一轮四格、星点一档四格 */
export const TICK_MS = 250;
/** 闪的四格亮度：原来 `wl-blink` 一秒一轮、`steps(2)`、50% 处 0.25（两段关键帧各分两格） */
export const BLINK = [1, 0.625, 0.25, 0.625];
/** 星点的六档亮度：原来 `wl-twinkle` 六秒一轮、`steps(3)`、0.15 → 0.7 → 0.15，一档一秒 */
export const STAR = [0.15, 0.333, 0.517, 0.7, 0.517, 0.333];
/** 一档几格 */
const PER_LEVEL = 4;

/**
 * 第 `tick` 格时一颗星点的亮度：从第 `phase` 档起（随机，各颗不齐），每颗在一秒里自己那一格（`slot`，0–3）换档，十几颗不挤在同一下。
 * @param {number} tick @param {number} phase @param {number} slot
 */
export function starLevel(tick, phase, slot) {
  const step = Math.floor((tick + PER_LEVEL - 1 - slot) / PER_LEVEL);
  return STAR[(phase + step) % STAR.length];
}

/**
 * 开始换：`layer` 上写 `--wl-blink`，每颗星点写 `--o`。减少动画、`--motion-scale` 是 0 的只摆好不动；交回停掉的函数。
 * 标签页在后台时不换（浏览器本来也会把计时器放慢）。
 * @param {HTMLElement} layer @param {HTMLElement[]} stars @param {{reduced?: boolean, random?: () => number}} [opts]
 */
export function twinkle(layer, stars, { reduced = false, random = Math.random } = {}) {
  const scale = Number.parseFloat(getComputedStyle(layer).getPropertyValue('--motion-scale'));
  const ms = TICK_MS * (Number.isFinite(scale) ? scale : 1);
  const seeds = stars.map(() => ({ phase: Math.floor(random() * STAR.length), slot: Math.floor(random() * PER_LEVEL) }));
  let tick = 0;
  const draw = () => {
    layer.style.setProperty('--wl-blink', String(BLINK[tick % BLINK.length]));
    stars.forEach((star, i) => {
      const level = String(starLevel(tick, seeds[i].phase, seeds[i].slot));
      if (star.style.getPropertyValue('--o') !== level) star.style.setProperty('--o', level);
    });
  };
  draw();
  if (reduced || !(ms > 0)) {
    layer.style.removeProperty('--wl-blink');
    return () => {};
  }
  const timer = setInterval(() => {
    if (document.hidden) return;
    tick += 1;
    draw();
  }, ms);
  return () => clearInterval(timer);
}
