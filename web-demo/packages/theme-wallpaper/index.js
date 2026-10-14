// @ts-check
//! 主题「跟随壁纸」（软件包 `theme-wallpaper`，蓝图 `web.md`「主题」的「跟着人格的外观」第 5 条）：往主题包的 `theme.palettes` 挂一个
//! 生成的主题（浅、深两份都生成，`src/lib/md3/`）。经宿主的 `wallpaper(dark)` 读（浏览器那一份问桥），两个来处：
//! - matugen 生成的那份颜色（有就先照它，2026-10-11 项目主人定）：只取它的主色 `source`，再照 `src/lib/md3/` 那一套生成（2026-10-14：两个头
//!   同一个主色出一样的颜色，不直接用它的 MD3 角色）；认不出的（没有 `source`）当没有；
//! - 桌面壁纸：照图取主色。
//! 读不到、取不出颜色的不挂，设置页就没有这一张。
//!
//! 页面在前台时隔 `check_seconds` 秒问一次换没换（宿主交的记号 `sig` 变了才重取色），回到前台、窗口拿回焦点、换了浅深（事件
//! `theme.changed`）时当场问（niri 这类平铺的桌面上浏览器一直露着，不会有「回到前台」）；
//! 问的是页面这时的浅深（服务 `theme`，深浅可以各设一张壁纸）。同一张图取过、取不出的记着，不再取。

import { seedOf, themeOf, matugenOf } from '../../src/lib/md3/index.js';
import { pixelsOf } from '../../src/lib/md3/pixels.js';

/** 排在定的那几套、「跟随人格」后面 */
const ORDER = 11;

/** @param {any} ctx */
export function apply(ctx) {
  const system = matchMedia('(prefers-color-scheme: dark)');
  /** 页面这时是不是深色：照主题包的「明暗」，没有主题包的照系统 */
  const dark = () => ctx.theme?.dark?.() ?? system.matches;
  /** 挂着的那一套：拿掉用 @type {(() => void)|null} */
  let undo = null;
  /** 最近一次看过的记号（取出颜色的、取不出的都算） */
  let seen = /** @type {string|null} */ (null);
  let busy = false;

  /**
   * 挂一套：先挂新的再拿掉原来的（主题包不会在中间看到没有这一套）。
   * @param {(scheme: 'light'|'dark') => ReturnType<typeof themeOf>} make 浅或深那一份怎么生成
   */
  const mount = (make) => {
    /** @type {Partial<Record<'light'|'dark', ReturnType<typeof themeOf>>>} */
    const made = {};
    const before = undo;
    undo = ctx.slots.mount('theme.palettes', {
      id: 'wallpaper', name: ctx.text('name'), order: ORDER,
      render: (/** @type {'light'|'dark'} */ scheme) => (made[scheme] ??= make(scheme)),
    });
    before?.();
  };
  const unmount = () => {
    undo?.();
    undo = null;
  };

  /** 问一次：换了的重取色；读不到的拿掉这一套。 */
  const check = async () => {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const got = await ctx.host.wallpaper?.(dark());
      if (!got) {
        seen = null;
        return unmount();
      }
      if (got.sig === seen) return;
      seen = got.sig;
      if (got.kind === 'matugen') {
        // 只取它的主色（`source`），照同一套算（2026-10-14 两个头一样）；认不出的当没有
        const m = matugenOf(got.colors);
        if (m) mount((scheme) => themeOf(m.source, scheme));
        else unmount();
        return;
      }
      const rgba = await pixelsOf(got.url, ctx.config.sample_side);
      const seed = rgba ? seedOf(rgba) : null;
      // 解不了的图、灰的：没有这一套
      if (seed == null) unmount();
      else mount((scheme) => themeOf(seed, scheme));
    } finally {
      busy = false;
    }
  };

  let timer = 0;
  const schedule = () => {
    clearInterval(timer);
    timer = window.setInterval(check, ctx.config.check_seconds * 1000);
  };
  const onVisible = () => {
    if (!document.hidden) check();
  };
  ctx.effect(() => {
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  });
  // 换了浅深（也会是自己挂上去引起的：记号一样，不再取）
  ctx.on('theme.changed', check);
  // 改了间隔：照新的重排
  ctx.watchConfig(schedule);
  ctx.effect(() => () => {
    clearInterval(timer);
    unmount();
  });
  schedule();
  check();
}
