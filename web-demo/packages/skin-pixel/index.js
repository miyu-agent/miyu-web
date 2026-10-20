// @ts-check
//! 皮肤「像素风」（软件包 `skin-pixel`，蓝图 `web.md`「皮肤」第 6 条）：挂进 `skin` 包声明的 `skin.packs`。照第一次引导的「像素关卡」：
//! 全直角、不虚化；浮起来的、贴在页面上的东西四边一圈 3px 的像素边、四个角各缺一格（四道错开的影画的，不是真的描边），往右下错开
//! 的实色块影；界面上的字用像素字体（`skin.css` 的 `@font-face`），读的字、代码照旧。颜色都从主题掺出来（`--skin-` 打头的是这一格自己的）。

/** 四道错开 3px 的影：一圈像素边，四个角各缺一格 @param {string} c */
const frame = (c) => `0 -3px 0 0 ${c}, 0 3px 0 0 ${c}, -3px 0 0 0 ${c}, 3px 0 0 0 ${c}`;
/** 往右下错开的实色块影 @param {number} n */
const drop = (n) => `${n}px ${n}px 0 0 var(--skin-ground)`;

/** 8px 一格的淡格子，铺在主题的底上 */
const GRID = 'linear-gradient(color-mix(in srgb, var(--text) 5%, transparent) 1px, transparent 1px) 0 0 / 8px 8px, '
  + 'linear-gradient(90deg, color-mix(in srgb, var(--text) 5%, transparent) 1px, transparent 1px) 0 0 / 8px 8px, var(--surface)';
const EDGE = 'var(--skin-edge)';
const SOFT = 'var(--skin-soft)';
const ON = 'var(--accent)';

export const tokens = {
  // 自己的几格：照引导的像素格从主题掺出来
  '--skin-edge': 'color-mix(in srgb, var(--accent) 45%, var(--surface-3))',
  '--skin-soft': 'color-mix(in srgb, var(--accent) 22%, var(--surface-3))',
  '--skin-ground': 'color-mix(in srgb, var(--accent) 24%, var(--surface-3))',
  '--skin-cell': 'color-mix(in srgb, var(--accent) 10%, var(--surface-2))',
  '--skin-cell-hi': 'color-mix(in srgb, var(--accent) 16%, var(--surface-2))',
  '--skin-cell-on': 'color-mix(in srgb, var(--accent) 26%, var(--surface-2))',
  '--skin-deep': { light: 'color-mix(in srgb, var(--accent) 60%, var(--text))', dark: 'color-mix(in srgb, var(--accent) 55%, var(--surface))' },
  // 形状
  '--round': '0',
  '--blur': '0',
  '--font-ui': '"Miyu Pixel UI", var(--sans)',
  // 大块的区域：整页、对话区铺 8px 一格的淡格子（淡出那两截换成图以后不要了），左栏那条线、头像框、名字、分隔线、聚焦框、滚动条都换成像素的
  '--page-bg': GRID,
  '--stage-bg': GRID,
  '--stage-fade': 'none',
  '--stage-fade-top': 'none',
  '--crumbs-bg': 'var(--skin-cell)',
  '--side-edge': 'inset -3px 0 0 0 var(--skin-edge)',
  '--side-peek': `${frame(EDGE)}, ${drop(6)}`,
  '--avatar-border': '3px solid var(--skin-edge)',
  '--avatar-radius': '0',
  '--brand-font': '"Miyu Pixel UI", var(--serif)',
  '--brand-size': '18px',
  '--divider': '2px dashed var(--skin-soft)',
  '--focus-ring': '3px solid var(--accent)',
  '--scrollbar-color': 'var(--skin-edge) var(--skin-cell)',
  // 材质
  '--composer-bg': 'var(--surface-1)',
  '--composer-elev': `${frame(EDGE)}, ${drop(6)}`,
  '--composer-elev-focus': `${frame(ON)}, ${drop(6)}`,
  '--send-hover': 'color-mix(in srgb, var(--accent) 85%, var(--text))',
  '--send-bg-disabled': 'var(--skin-cell-hi)',
  '--bubble-bg': 'var(--skin-cell)',
  '--bubble-elev': frame('var(--skin-cell-on)'),
  '--bubble-pad': '10px 16px',
  '--card-elev': `${frame(SOFT)}, ${drop(4)}`,
  '--card-elev-hover': `${frame(EDGE)}, ${drop(6)}`,
  '--codeblock-elev': frame(SOFT),
  '--float-bg': 'var(--surface-1)',
  '--float-border': '0',
  '--float-elev': `${frame(EDGE)}, ${drop(6)}`,
  '--modal-bg': 'var(--surface)',
  '--modal-border': '0',
  '--modal-elev': `${frame(EDGE)}, ${drop(8)}`,
  '--veil-bg': 'color-mix(in srgb, var(--surface) 72%, transparent)',
  '--item-hover': 'var(--skin-cell-hi)',
  '--item-active': 'var(--skin-cell-on)',
  '--item-elev-active': 'inset 3px 0 0 0 var(--accent)',
  '--ghost-hover': 'var(--skin-cell-hi)',
  '--btn-bg': 'var(--skin-cell)',
  '--btn-hover': 'var(--skin-cell-on)',
  '--field-bg': 'var(--skin-cell)',
  '--field-hover': 'var(--skin-cell-hi)',
  '--field-bg-focus': 'var(--surface-1)',
  '--field-elev-focus': frame(ON),
  '--chip-bg': 'var(--skin-cell)',
  '--chip-hover': 'var(--skin-cell-on)',
  '--chip-active': 'var(--skin-cell-on)',
  '--switch-bg': 'var(--skin-cell-on)',
  '--knob-elev': 'none',
  '--seg-bg': 'var(--skin-cell)',
  '--seg-thumb-elev': '0 2px 0 0 var(--skin-ground)',
};

/** @param {any} ctx */
export function apply(ctx) {
  ctx.slots.mount('skin.packs', { id: 'pixel', name: ctx.text('name'), order: 10, tokens, css: new URL('skin.css', import.meta.url).href });
}
