// @ts-check
//! 皮肤（软件包 `skin`，蓝图 `web.md`「皮肤」）：声明 `skin.packs`，皮肤包挂进来一格 `{id, name, tokens, css}`。照设置项 `pack` 选哪个
//! （空着的、选的没了的是出厂：什么都不写）；选了的在页面根上写 `data-skin`，把它的变量照现在的明暗写上，它的 CSS 把部件名换成页面里的
//! 选择器（`resources/parts.json`）接进页面。变量表（`styles/tokens.css`）里没有的名字、`{light, dark}` 缺一份的，不认这一格，控制台写明为什么。
//!
//! 提供服务 `skin`：现在是哪个、有哪几个。换了发事件 `skin.changed`（写好以后发）；头一次以后再换，整页一起淡过去（`src/lib/retheme.js`）。

import { retheme } from '../../src/lib/retheme.js';
import { packProblem, scopeProblems, translate, valuesOf, vocabulary } from './model.js';

/** @param {any} ctx */
export function apply(ctx) {
  ctx.slots.declare('skin.packs', 'list');
  const root = document.documentElement;
  const dark = matchMedia('(prefers-color-scheme: dark)');
  /** 变量表、部件名：读到以前什么皮肤都不认 @type {Set<string>|null} */
  let known = null;
  /** @type {import('./model.js').Parts} */
  let parts = {};
  /** 读过的皮肤 CSS（地址 → 换好的） @type {Map<string, string|null>} */
  const sheets = new Map();
  /** 写上去的变量 @type {string[]} */
  let written = [];
  /** @type {HTMLStyleElement|null} */
  let style = null;
  let shown = '';
  let painted = false;
  let gone = false;
  /** 不认的说过一遍就不再说 */
  const told = new Set();
  const tell = (/** @type {string} */ id, /** @type {string} */ why) => {
    if (told.has(`${id}:${why}`)) return;
    told.add(`${id}:${why}`);
    console.warn(`皮肤 ${id} 不认：${why}`);
  };

  const packs = () => (known ? ctx.slots.list('skin.packs').filter((/** @type {any} */ p) => {
    const why = packProblem(p, /** @type {Set<string>} */ (known));
    if (why) tell(p?.id ?? '?', why);
    return !why;
  }) : []);
  const chosen = () => packs().find((/** @type {any} */ p) => p.id === ctx.config.pack) ?? null;
  const isDark = () => ctx.theme?.dark?.() ?? dark.matches;

  /** 这一格的 CSS：读过的直接交；没读过的去读，读完再画一遍。不守规矩的整份不用 @param {any} pack */
  const sheetOf = (pack) => {
    if (!pack.css) return '';
    if (sheets.has(pack.css)) return sheets.get(pack.css) ?? '';
    sheets.set(pack.css, null);
    fetch(pack.css).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`)))).then((text) => {
      const bad = scopeProblems(text, pack.id);
      if (bad.length) { tell(pack.id, bad.join('；')); return; }
      const got = translate(text, parts, pack.css);
      if (got.unknown.length) tell(pack.id, `部件名表里没有 ${got.unknown.join('、')}`);
      sheets.set(pack.css, got.css);
      paint();
    }).catch((err) => tell(pack.id, `读不到样式：${err.message}`));
    return '';
  };

  const paint = () => {
    if (gone) return;
    const p = chosen();
    const d = isDark();
    const values = p ? valuesOf(p, d) : [];
    const css = p ? sheetOf(p) : '';
    const sig = p ? JSON.stringify([p.id, values, css.length]) : '';
    if (sig === shown) return;
    shown = sig;
    retheme(() => {
      for (const name of written) root.style.removeProperty(name);
      written = [];
      if (!p) {
        delete root.dataset.skin;
        style?.remove();
        style = null;
      } else {
        for (const [name, value] of values) {
          root.style.setProperty(name, value);
          written.push(name);
        }
        root.dataset.skin = p.id;
        if (!style) {
          style = document.createElement('style');
          style.dataset.skinOf = p.id;
          document.head.append(style);
        }
        style.dataset.skinOf = p.id;
        style.textContent = css;
      }
      ctx.emit('skin.changed', p?.id ?? null);
    }, { animate: painted });
    painted = true;
  };

  ctx.effect(() => {
    Promise.all([
      fetch(new URL('../../styles/tokens.css', import.meta.url)).then((r) => r.text()),
      fetch(new URL('../../resources/parts.json', import.meta.url)).then((r) => r.json()),
    ]).then(([css, table]) => {
      known = vocabulary(css);
      parts = table;
      paint();
    }).catch((err) => console.warn('皮肤：读不到变量表、部件名', err));
    return () => {};
  });
  ctx.slots.watch('skin.packs', paint);
  ctx.watchConfig(paint);
  ctx.on('theme.changed', paint);
  ctx.effect(() => {
    dark.addEventListener('change', paint);
    return () => dark.removeEventListener('change', paint);
  });
  ctx.effect(() => () => {
    gone = true;
    for (const name of written) root.style.removeProperty(name);
    delete root.dataset.skin;
    style?.remove();
  });

  ctx.provide('skin', {
    /** 现在用的那一格的编号，出厂是 `null` */
    current: () => chosen()?.id ?? null,
    /** 认的那几格 `{id, name}` */
    list: () => packs().map((/** @type {any} */ p) => ({ id: p.id, name: p.name ?? p.id })),
  });
}
