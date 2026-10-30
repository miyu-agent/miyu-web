// @ts-check
//! 主题「跟随壁纸」（软件包 `theme-wallpaper`，蓝图 `web.md`「主题」的「跟着人格的外观」第 5 条）：往主题包的 `theme.palettes` 挂一个
//! 生成的主题（浅、深两份都生成，`src/lib/md3/`）。经宿主的 `wallpaper(dark)` 读（浏览器那一份问桥），两个来处：
//! - matugen 生成的那份颜色（有就先照它，2026-10-11 项目主人定）：只取它的主色 `source`，再照 `src/lib/md3/` 那一套生成（2026-10-14：两个头
//!   同一个主色出一样的颜色，不直接用它的 MD3 角色）；认不出的（没有 `source`）当没有；
//! - 桌面壁纸：网页服务照图算好的候选色（`seeds`，最多四个、打分高的在前；2026-10-14 项目主人定壁纸取色归头，和核心算头像的是同一份
//!   Rust 代码），用设置项 `seed` 选的那个，没选的、选的不在这张壁纸的候选里的（换了壁纸）用第一个。设置页「主题」那一组的「主色」照这一套
//!   交的 `seeds()` 画，选了写 `seed`。
//! 读不到、取不出颜色的不挂，设置页就没有这一张。
//!
//! 换没换不轮询（2026-10-14 项目主人定）：宿主的 `wallpaperChanges` 推过来（桥盯着壁纸来处的文件）时问一次，回到前台、窗口拿回焦点、
//! 换了浅深（事件 `theme.changed`）时也问一次（只能经 IPC 换、不落文件的 hyprpaper、swaybg 靠这个跟上）；宿主交的记号 `sig` 变了才重取色。
//! 问的是页面这时的浅深（服务 `theme`，深浅可以各设一张壁纸）。同一张图取过、取不出的记着，不再取。问着的时候又推来「换了」的，问完
//! 再问一次（一次换壁纸常推来两回：先是壁纸程序的配置，再是 awww 的缓存）；一时问不到的（网页服务在算、连接断了）留着原来那一套，只有
//! 宿主说没有壁纸（`null`）的才拿掉（2026-10-15 项目主人验收 W-163：换了没跟着变，刷新后「跟随壁纸」不见了）。

import { themeOf, matugenOf } from '../../src/lib/md3/index.js';

/** 回到前台、拿回焦点隔多久以内只问一次（毫秒） */
const VISIBLE_GAP_MS = 1000;

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
  /** 问着的时候又该问了（推来「换了」、拿回焦点）：问完再问一次 */
  let again = false;

  /**
   * 挂一套：先挂新的再拿掉原来的（主题包不会在中间看到没有这一套）。
   * @param {string} seed 主色 @param {string[]} [seeds] 壁纸的候选色（matugen 那一份只有一个主色，没有这一行）
   */
  const mount = (seed, seeds) => {
    /** @type {Partial<Record<'light'|'dark', ReturnType<typeof themeOf>>>} */
    const made = {};
    const before = undo;
    undo = ctx.slots.mount('theme.palettes', {
      id: 'wallpaper', name: ctx.text('name'), order: ORDER,
      render: (/** @type {'light'|'dark'} */ scheme) => (made[scheme] ??= themeOf(seed, scheme)),
      seeds: seeds?.length ? () => ({
        colors: seeds, current: seed, auto: false,
        pick: (/** @type {string|null} */ hex) => ctx.packages.set('theme-wallpaper', { config: { seed: hex } }),
      }) : undefined,
    });
    before?.();
  };
  /** 这张壁纸的候选色（最近一次问到的；matugen 那一份的是 `null`） */
  let candidates = /** @type {string[]|null} */ (null);
  /** 照设置项 `seed` 挂：选的不在候选里的用第一个 */
  const mountSeeds = () => {
    if (!candidates?.length) return unmount();
    const chosen = ctx.config.seed;
    mount(candidates.includes(chosen) ? chosen : candidates[0], candidates);
  };
  const unmount = () => {
    undo?.();
    undo = null;
  };

  /** 问一次：换了的重取色；读不到的拿掉这一套。 */
  const check = async () => {
    if (document.hidden) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    again = false;
    try {
      const got = await ctx.host.wallpaper?.(dark())?.catch(() => undefined);
      // 一时问不到：留着原来那一套，下一次照样问
      if (got === undefined) return;
      if (!got) {
        seen = null;
        return unmount();
      }
      if (got.sig === seen) return;
      seen = got.sig;
      if (got.kind === 'matugen') {
        // 只取它的主色（`source`），照同一套算（2026-10-14 两个头一样）；认不出的当没有
        candidates = null;
        const m = matugenOf(got.colors);
        if (m) mount(m.source);
        else unmount();
        return;
      }
      // 换了壁纸、选的不在新的候选里：回到第一个，存的也删掉（和 Android 一样，换回原来那张也是第一个）
      if (ctx.config.seed && !got.seeds.includes(ctx.config.seed)) ctx.packages.set('theme-wallpaper', { config: { seed: null } }).catch(() => {});
      // 解不了的图（网页服务算不出候选色）：没有这一套
      candidates = got.seeds;
      mountSeeds();
    } finally {
      busy = false;
      if (again) check();
    }
  };

  // 回到前台、拿回焦点：一下子常来两三个（可见了、拿到焦点各一个），一秒内的只问一次（2026-10-30 桌面端在 Win11 上抓到：切一次窗口问好几次）
  let asked = -Infinity;
  const onVisible = () => {
    if (document.hidden) return;
    const now = performance.now();
    if (now - asked < VISIBLE_GAP_MS) return;
    asked = now;
    check();
  };
  ctx.effect(() => {
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  });
  // 桥推过来壁纸换了（页面在后台时不问，回到前台那一下问）
  ctx.effect(() => ctx.host.wallpaperChanges?.(check) ?? (() => {}));
  // 换了浅深（也会是自己挂上去引起的：记号一样，不再取）
  ctx.on('theme.changed', check);
  // 「主色」选了别的：照它重挂
  ctx.watchConfig(() => (candidates ? mountSeeds() : undefined));
  ctx.effect(() => () => unmount());
  check();
}
