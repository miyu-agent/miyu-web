// @ts-check
//! 「自动」这一刻照哪一套（蓝图 `web.md`「主题」的「自动」）：纯函数；挂主题在 `index.js`。

/** 挂进 `theme.palettes` 的一套（同主题包的 `Palette`，只用到这几格） @typedef {{id: string, render: (scheme: 'light'|'dark') => any}} Palette */

/** 先后：跟随人格（这个会话的人格有主色）、跟随壁纸（读得到壁纸） */
export const SOURCES = ['persona', 'wallpaper'];

/**
 * 挂着的几套里按 `SOURCES` 的先后，第一个这时交得出颜色的；都交不出的是 `null`（主题包照默认那一份）。
 * @param {Palette[]} all @param {'light'|'dark'} scheme
 */
export function sourceOf(all, scheme) {
  for (const id of SOURCES) {
    const p = all.find((x) => x.id === id);
    if (p?.render(scheme)) return p;
  }
  return null;
}
