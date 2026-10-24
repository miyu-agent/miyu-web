// @ts-check
//! 网页自己的设置（蓝图 `web.md`「设置页」第 11、12 条）：「外观」那一组是明暗和主题卡片；一个包的设置项（一个个颜色、重画间隔这类）在
//! 「软件包」页点那个包展开（`packageSettings`）。存在网页这边（内核的 `packages`：出厂 → 发行版 → 个人 · 这台设备），画法和核心的
//! 项同一个 `shell`，小字只在改过时写「已改」。

import { h, icon, replace } from '../../src/lib/dom.js';
import { inkOf } from '../../src/lib/md3/index.js';
import { shell, groupBlock, toggle, textField, select } from './rows.js';
import { editableKeys } from './model.js';

/** 一个先空着、读完再填的块（读包的设置是异步的）。 */
export function later(fill) {
  const el = h('div.set-later');
  fill(el).catch((err) => replace(el, h('p.set-empty.is-bad', err.message)));
  return el;
}

/**
 * 「通用」页最上面「主题」一组：一行「明暗」（跟随系统、浅色、深色），下面一排主题卡片（默认、跟随人格、跟随壁纸），小样照现在的明暗画
 * （蓝图 `web.md`「主题」，2026-10-11 项目主人：主题是成对的一套，跟随系统是明暗不是一个主题）。选着的那一套交了 `seeds()` 的（跟随人格、
 * 跟随壁纸，2026-10-14 项目主人定），卡片下面多一行「主色」（`seedRow`）。开着的时候那几套换了（换了壁纸、换了人格的头像），
 * 只重画这一组（`dialog.refreshLook`，设置包看着 `theme.palettes` 叫它；2026-10-15 项目主人：换了壁纸卡片和主色不当场换）。
 */
export function drawLook(dialog) {
  const ctx = dialog.ctx;
  const fill = async (/** @type {HTMLElement} */ el) => {
    const theme = await ctx.packages.settings('theme');
    const palettes = ctx.slots.list('theme.palettes');
    // 照主题包这时实际用的（没选的跟随人格，2026-10-20 项目主人）；点了哪一张就记哪一张，「默认」也记下来，不再跟人格
    const chosen = ctx.theme?.current?.()?.id ?? (palettes.some((p) => p.id === theme.values.palette) ? theme.values.palette : palettes[0]?.id);
    const set = async (config) => {
      await ctx.packages.set('theme', { config });
      dialog.drawBody();
    };
    const scheme = shell({
      name: ctx.text('scheme'),
      control: select(dialog, [
        { value: 'auto', name: ctx.text('follow_system') },
        { value: 'light', name: ctx.text('scheme_light') },
        { value: 'dark', name: ctx.text('scheme_dark') },
      ], theme.values.scheme ?? 'auto', (v) => set({ scheme: v })),
    });
    const colorsOf = (p) => (ctx.theme?.colorsOf ?? ((x) => x.render('light')))(p)?.page ?? {};
    const card = (p) => {
      const colors = colorsOf(p);
      return h(`button.set-theme${chosen === p.id ? '.is-on' : ''}`, { type: 'button', onclick: () => set({ palette: p.id }) },
        h('span.set-theme-sample', h('i', { style: { background: colors.sidebar_bg } }), h('i', { style: { background: colors.surface } },
          h('b', { style: { background: colors.accent } }), h('b', { style: { background: colors.text, opacity: '0.5' } }), h('b', { style: { background: colors.gold } }))),
        h('span.set-theme-name', p.name));
    };
    const current = palettes.find((p) => p.id === chosen);
    // 两组（2026-10-21 项目主人定叫法，照终端的外观页）：「主题」（形状和材质那一层，有主题包才有这一组）、「配色方案」（明暗、卡片、主色）
    // 「主题」一组还有「AI 输出样式」一行（蓝图 web.md「换画法」第 6 条）：不止一种样式才出
    const rows = [await skinRow(dialog), styleRow(dialog)].filter(Boolean);
    replace(el, h('div.set-look', rows.length ? groupBlock(ctx.text('skin'), rows) : null,
      groupBlock(ctx.text('palette_label'), [scheme.el, h('div.set-themes', palettes.map(card)), seedRow(dialog, current?.seeds?.())])));
  };
  const el = later(fill);
  dialog.refreshLook = () => {
    if (el.isConnected) fill(el).catch(() => {});
  };
  return el;
}

/**
 * 「皮肤」一行（蓝图 `web.md`「皮肤」第 5 条）：下拉，出厂，再照 `skin.packs` 一套一项（皮肤包认的那几格，服务 `skin` 列的）；当场换。
 * 没有皮肤包（停用了 `skin`，或一个皮肤包都没装）的不出这一行。
 * @param {any} dialog
 */
async function skinRow(dialog) {
  const ctx = dialog.ctx;
  const packs = ctx.slots.list('skin.packs').length ? (ctx.skin?.list() ?? []) : [];
  if (!packs.length) return null;
  const skin = await ctx.packages.settings('skin');
  const chosen = packs.some((p) => p.id === skin.values.pack) ? skin.values.pack : '';
  const pick = select(dialog, [{ value: '', name: ctx.text('skin_factory') }, ...packs.map((p) => ({ value: p.id, name: p.name }))], chosen, async (v) => {
    await ctx.packages.set('skin', { config: { pack: v } });
    dialog.drawBody();
  });
  return shell({ name: ctx.text('skin'), control: pick }).el;
}

/** 「AI 输出样式」管的两个职能（时间线的一段、回答的排版）。 */
const STYLE_SEAMS = ['render.timeline', 'render.markdown'];

/**
 * 「AI 输出样式」一行（2026-10-23 项目主人：「时间线」「回答排版」两行合成一行）：两个职能里同一个编号的并成一项，名字照先登记的那个；
 * 选了两样都换成它，只提供了一样的另一样用出厂的。两样不是同一个编号的（旧的选法）照非出厂的那一个写。只有一种样式的不出这一行。
 * @param {any} dialog
 */
function styleRow(dialog) {
  const ctx = dialog.ctx;
  const seams = ctx.packages.seams;
  if (!seams) return null;
  /** @type {Map<string, string>} 编号 → 名字 */
  const styles = new Map();
  for (const seam of STYLE_SEAMS) for (const p of seams.list(seam)) if (!styles.has(p.id)) styles.set(p.id, p.name);
  if (styles.size < 2) return null;
  const now = STYLE_SEAMS.map((seam) => seams.current(seam));
  const chosen = now.find((id) => id && id !== 'default') ?? now.find(Boolean) ?? '';
  const pick = select(dialog, [...styles].map(([value, name]) => ({ value, name })), chosen, (/** @type {string} */ v) => {
    for (const seam of STYLE_SEAMS) seams.set(seam, seams.list(seam).some((/** @type {any} */ p) => p.id === v) ? v : 'default');
    dialog.drawBody();
  });
  return shell({ name: ctx.text('output_style'), control: pick }).el;
}

/**
 * 「主色」一行：一排色块，打分高的在前，现在用的画一个勾（不描边）；能「自动」的（跟随人格：不存就照第一个）前面多一块写 A，
 * 自选的不在候选里的后面多一块。点了当场存，
 * 存好重画。没有候选色的不出这一行。
 * @param {any} dialog @param {{colors: string[], current: string|null, auto: boolean, pick: (hex: string|null) => Promise<any>}|undefined} seeds
 */
function seedRow(dialog, seeds) {
  if (!seeds?.colors.length) return null;
  const ctx = dialog.ctx;
  /** @type {ReturnType<typeof shell>} */
  let row;
  const pick = async (/** @type {string|null} */ hex) => {
    if (hex === seeds.current) return;
    row.busy();
    try {
      await seeds.pick(hex);
      row.done();
      dialog.drawBody();
    } catch (err) {
      row.fail(/** @type {any} */ (err)?.message ?? String(err));
    }
  };
  const block = (/** @type {string|null} */ hex, /** @type {string} */ fill, /** @type {string} */ title, /** @type {any} */ mark) => {
    const on = hex === seeds.current;
    return h(`button.set-seed${on ? '.is-on' : ''}`, {
      type: 'button', title, 'aria-label': title, 'aria-pressed': String(on), onclick: () => pick(hex),
      style: { background: fill, color: inkOf(fill) },
    }, on ? icon('check') : mark);
  };
  row = shell({
    name: ctx.text('main_color'),
    control: h('div.set-seeds',
      seeds.auto ? block(null, seeds.colors[0], ctx.text('main_color_auto'), 'A') : null,
      seeds.colors.map((hex) => block(hex, hex, hex, null)),
      // 自选的不在候选里的（人格卡片里「+」选的）：后面多画一块，画上勾（同人格卡片）
      seeds.current && !seeds.colors.includes(seeds.current) ? block(seeds.current, seeds.current, seeds.current, null) : null),
  });
  return row.el;
}

/** 收起来的「高级（N）」：点开看。 */
function fold(ctx, rows) {
  if (!rows.length) return null;
  const box = h('div.set-fold', { hidden: true }, rows);
  const head = h('button.set-fold-head', { type: 'button', onclick: () => { box.hidden = !box.hidden; head.classList.toggle('is-open', !box.hidden); } },
    icon('chevron-right'), ctx.text('advanced', { count: rows.length }));
  return h('div', head, box);
}

/**
 * 一个包的设置项（「软件包」页展开时）：`advanced` 的收在最后「高级（N）」里；主题的颜色包把终端那一组（`t_` 打头）也收进去。
 * @param {any} dialog @param {string} id 包
 */
export function packageSettings(dialog, id, skip = /** @type {string[]} */ ([])) {
  const ctx = dialog.ctx;
  return later(async (el) => {
    const got = await ctx.packages.settings(id);
    const specs = got.manifest.settings ?? {};
    // 只列有控件能改的；结构复杂的（json、map、list）改不了，不列；包自己画的那一块管着的（`skip`）不再单列
    const keys = editableKeys(specs).filter((k) => !skip.includes(k));
    const hidden = (k) => specs[k].advanced || (id.startsWith('theme-') && /^(light_|dark_)?t_/.test(k));
    const rowOf = (k) => packageRow(dialog, id, k, got, () => replace(el, packageSettings(dialog, id, skip)));
    replace(el, h('div.set-rows', keys.filter((k) => !hidden(k)).map(rowOf)), fold(ctx, keys.filter(hidden).map(rowOf)));
  });
}

/**
 * 网页包的一项：改了写进个人那一层，↺ 删掉个人这一项；小字只在改过时写「已改」。
 * @param {any} dialog @param {string} id 包 @param {string} key @param {{manifest: any, values: any, origins: any, errors: any[]}} got
 * @param {() => void} redraw 存好了重画这个包
 */
function packageRow(dialog, id, key, got, redraw) {
  const ctx = dialog.ctx;
  const spec = got.manifest.settings[key];
  const value = got.values[key];
  const changed = got.origins[key] === 'user';
  /** @type {ReturnType<typeof shell>} */
  let row;
  const set = async (v) => {
    row.busy();
    try {
      await ctx.packages.set(id, { config: { [key]: v } });
      row.done();
      setTimeout(redraw, 300);
      return true;
    } catch (err) {
      row.fail(err.message);
      return false;
    }
  };
  row = shell({
    name: ctx.local(spec.name ?? key),
    description: spec.description ? ctx.local(spec.description) : '',
    source: changed ? ctx.text('changed') : null,
    problems: got.errors.filter((e) => e.key === key).map((e) => ({ level: 'error', message: e.error })),
    control: packageControl(dialog, spec, value, set),
    reset: changed ? () => set(null) : null,
    resetTitle: ctx.text('reset'),
  });
  return row.el;
}

/** 网页包设置项的控件，照清单的 `type`（只会是 `editableKeys` 认的那几种）。 */
function packageControl(dialog, spec, value, set) {
  if (spec.type === 'boolean') return toggle(!!value, set);
  if (spec.type === 'choice') return select(dialog, (spec.choices ?? []).map((c) => ({ value: c, name: c })), value, set);
  if (spec.type === 'number' || spec.type === 'duration') {
    return textField(String(value), 'number', [spec.min, spec.max].some((x) => x != null) ? `${spec.min ?? ''} – ${spec.max ?? ''}` : '', (text) => {
      const n = Number(text);
      if (Number.isFinite(n)) set(n);
    });
  }
  if (spec.type === 'color') {
    const hex = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    const field = textField(String(value), 'text', '', (text) => set(text));
    if (!hex) return field;
    const swatch = h('input.set-color', { type: 'color', value, onchange: (e) => set(e.target.value) });
    return h('div.set-color-row', swatch, field);
  }
  return textField(String(value ?? ''), 'text', '', set);
}
