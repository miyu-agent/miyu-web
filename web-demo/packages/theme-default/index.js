// @ts-check
//! 主题「默认」（软件包 `theme-default`，蓝图 `web.md`「主题」）：浅色是晨光，深色是 tokyonight，挂进主题包声明的 `theme.palettes`。
//! 颜色都是这个包的设置项（清单里的出厂值是原来 `theme-morning`、`theme-tokyonight` 的），都是 live 的，能单改、当场生效：浅色的
//! `light_`、深色的 `dark_` 打头；再往下 `t_` 打头的是终端那一组（`--t-名字`），别的是页面那一组（`--名字`）。

/** @param {any} ctx */
export function apply(ctx) {
  /** 照现在的设置项取一份（浅色或深色），分成两组 @param {'light'|'dark'} scheme */
  const split = (scheme) => {
    const prefix = `${scheme}_`;
    /** @type {Record<string, string>} */
    const page = {};
    /** @type {Record<string, string>} */
    const tui = {};
    for (const [key, v] of Object.entries(ctx.config)) {
      if (!key.startsWith(prefix)) continue;
      const k = key.slice(prefix.length);
      if (k.startsWith('t_')) tui[k.slice(2)] = /** @type {string} */ (v);
      else page[k] = /** @type {string} */ (v);
    }
    return { page, tui };
  };
  const mount = () => ctx.slots.mount('theme.palettes', { id: 'default', name: ctx.text('name'), order: 0, render: split });
  let undo = mount();
  // 单改了一个颜色：先挂新的再拿掉原来的，主题包当场重画
  ctx.watchConfig(() => {
    const before = undo;
    undo = mount();
    before();
  });
}
