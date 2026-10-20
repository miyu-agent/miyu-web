// @ts-check
//! 皮肤（蓝图 `web.md`「皮肤」）：变量表、样式都经变量、皮肤包守规矩、部件名都在（`packages/skin/model.js`）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { packProblem, scopeProblems, translate, valuesOf, vocabulary } from '../../packages/skin/model.js';
import { tokens as pixel } from '../../packages/skin-pixel/index.js';

const at = (/** @type {string} */ p) => new URL(`../../${p}`, import.meta.url);
const read = (/** @type {string} */ p) => readFileSync(at(p), 'utf8');
const tokensCss = read('styles/tokens.css');
const known = vocabulary(tokensCss);
const parts = JSON.parse(read('resources/parts.json'));
/** 页面的样式：styles/ 和每个包的 style.css（变量表自己不算） */
const sheets = [
  ...readdirSync(at('styles')).filter((f) => f.endsWith('.css') && f !== 'tokens.css').map((f) => `styles/${f}`),
  ...readdirSync(at('packages')).map((d) => `packages/${d}/style.css`).filter((p) => existsSync(at(p))),
];
const strip = (/** @type {string} */ s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('变量表：每个名字都有一句说明，不和主题的颜色重名', () => {
  for (const m of tokensCss.matchAll(/@token\s+(--\S+)(.*)/g)) assert.ok(m[2].trim(), `${m[1]} 没有说明`);
  const palette = Object.keys(JSON.parse(read('packages/theme-default/manifest.json')).settings)
    .filter((k) => k.startsWith('light_') && !k.startsWith('light_t_')).map((k) => `--${k.slice(6).replaceAll('_', '-')}`);
  for (const name of palette) assert.ok(!known.has(name), `${name} 和主题的颜色重名`);
  for (const name of ['--round', '--blur', '--r-8', '--r-round', '--r-pill', '--font-ui', '--font-read', '--composer-elev', '--float-bg']) assert.ok(known.has(name), name);
});

test('样式里的圆角、虚化、字体都经变量：不再写死的 px（0、inherit 除外）', () => {
  for (const p of sheets) {
    const s = strip(read(p));
    for (const m of s.matchAll(/border-radius:\s*([^;}]+)/g)) {
      const bare = m[1].replace(/var\((?:[^()]|\([^()]*\))*\)/g, '').replace(/calc\([^)]*\)/g, '');
      assert.ok(!/\d+(\.\d+)?(px|%)/.test(bare), `${p}：border-radius: ${m[1]}`);
    }
    for (const m of s.matchAll(/blur\(((?:[^()]|\([^()]*\))*)\)/g)) {
      if (m[1].trim() === '0' || m[1].trim() === '0px') continue;
      assert.ok(m[1].includes('var(--blur)'), `${p}：blur(${m[1]}) 没乘 --blur`);
    }
    assert.ok(!/var\(--(sans|mono|code-font)\)/.test(s), `${p}：字体要经 --font-ui、--font-read、--font-mono、--font-code`);
  }
});

test('每一种材质的变量都有地方用、用的都在表里', () => {
  const all = sheets.map((p) => strip(read(p))).join('\n');
  const used = new Set([...all.matchAll(/var\((--[a-z][a-z0-9-]*),/g)].map((m) => m[1]));
  for (const m of tokensCss.matchAll(/@token\s+(--[a-z][a-z0-9-]*)\s/g)) {
    if (m[1] === '--r-数' || !/^--(composer|send|bubble|card|codeblock|float|modal|veil|item|ghost|btn|field|chip|switch|knob|seg|side)-/.test(m[1])) continue;
    assert.ok(used.has(m[1]), `${m[1]} 列了但没地方用`);
  }
});

test('组件里不另外定义表里的名字：写在根上的皮肤值才换得到（--tl-soft 这类组件自己的变量照它取值）', () => {
  /** @type {string[]} */
  const bad = [];
  for (const p of sheets) {
    for (const m of strip(read(p)).matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)) if (known.has(m[1])) bad.push(`${p}：${m[1]}`);
  }
  // 动效的几个出厂值写在 base.css 的 :root 上（同变量表）
  assert.deepEqual(bad.filter((x) => !/^styles\/base\.css：--(motion-|ease-|radius)/.test(x)), []);
});

test('认一格皮肤：表里没有的名字、{light, dark} 缺一份的不认；--skin- 打头的是它自己的', () => {
  assert.equal(packProblem({ id: 'ok', tokens: { '--round': '0', '--card-elev': { light: 'a', dark: 'b' }, '--skin-edge': 'x' } }, known), null);
  assert.match(String(packProblem({ id: 'x', tokens: { '--card-shadow': 'none' } }, known)), /变量表里没有 --card-shadow/);
  assert.match(String(packProblem({ id: 'x', tokens: { '--card-elev': { light: 'a' } } }, known)), /两份都有/);
  assert.match(String(packProblem({ id: 'Bad Id', tokens: {} }, known)), /编号不对/);
  assert.deepEqual(valuesOf({ id: 'x', tokens: { '--blur': '0', '--card-bg': { light: 'L', dark: 'D' } } }, true), [['--blur', '0'], ['--card-bg', 'D']]);
  assert.deepEqual(valuesOf({ id: 'x', tokens: { '--card-bg': { light: 'L', dark: 'D' } } }, false), [['--card-bg', 'L']]);
});

test('皮肤的 CSS：都在 :root[data-skin="编号"] 下面、只挑部件名，可以带 @font-face', () => {
  assert.deepEqual(scopeProblems('@font-face { font-family: x; } :root[data-skin="a"] [data-part="card"]:hover { color: red; }', 'a'), []);
  assert.equal(scopeProblems('[data-part="card"] { color: red; }', 'a').length, 1, '没在 data-skin 下面');
  assert.equal(scopeProblems(':root[data-skin="b"] [data-part="card"] {}', 'a').length, 1, '别人的编号');
  assert.equal(scopeProblems(':root[data-skin="a"] .composer {}', 'a').length, 1, '类名');
  assert.equal(scopeProblems(':root[data-skin="a"] [data-part="card"]:not(.x) {}', 'a').length, 1, ':not 里的类名');
  assert.deepEqual(scopeProblems('@media (max-width: 600px) { :root[data-skin="a"] [data-part="card"] { color: red; } }', 'a'), []);
});

test('接进页面：部件名换成选择器，字体的相对地址换成绝对的，不认得的部件名交出来', () => {
  const got = translate(':root[data-skin="a"] [data-part="composer"], [data-part="nope"] { x: 1 } @font-face { src: url("fonts/a.woff2"); }',
    parts, 'http://h/packages/a/skin.css');
  assert.match(got.css, /:root\[data-skin="a"\] :is\(\.composer\)/);
  assert.match(got.css, /url\("http:\/\/h\/packages\/a\/fonts\/a\.woff2"\)/);
  assert.deepEqual(got.unknown, ['nope']);
  assert.match(translate(':root[data-skin="a"] [data-part="item"][data-state="on"], [data-part="composer"][data-state="has-stash"] {}', parts, 'http://h/').css,
    /:is\([^)]*\)\.is-on, :is\(\.composer\)\.has-stash/);
});

test('看得见的都有部件名：样式里画了东西（底、边、影、字、颜色……）的类都归到某个部件名下面', () => {
  const VIS = /(?:^|;)\s*(background|border|box-shadow|color|font|outline|filter|mask|opacity|text-decoration|backdrop-filter|-webkit-backdrop-filter|fill|stroke|text-shadow)[\w-]*\s*:/;
  const covered = new Set();
  for (const p of Object.values(parts)) {
    for (const sel of p.select) for (const one of sel.split(',')) {
      for (const m of one.trim().split(/[\s>+~]+/).at(-1).matchAll(/\.([a-z][\w-]*)/g)) covered.add(m[1]);
    }
  }
  /** 主体是元素的那一条：「最近的那个类 元素」，主体带类的交 null @param {string} sel */
  const pairOf = (sel) => {
    const comps = sel.trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
    const last = comps.at(-1) ?? '';
    const el = /^([a-z][a-z0-9]*)/.exec(last)?.[1];
    if (/\.[a-z]/.test(last) || !el) return null;
    for (const c of comps.slice(0, -1).reverse()) {
      const cls = [...c.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]).filter((x) => !/^(is|has)-/.test(x));
      if (cls.length) return `.${cls.at(-1)} ${el}`;
    }
    return null;
  };
  const pairs = new Set();
  for (const p of Object.values(parts)) for (const sel of p.select) for (const one of sel.split(',')) { const x = pairOf(one); if (x) pairs.add(x); }
  /** @type {string[]} */
  const missing = [];
  for (const p of sheets) {
    for (const m of strip(read(p)).matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      if (!VIS.test(m[2])) continue;
      for (const one of m[1].split(',')) {
        const sel = one.trim();
        if (!sel || /^(from|to|\d)/.test(sel)) continue;
        for (const c of sel.split(/[\s>+~]+/).at(-1).matchAll(/\.([a-z][\w-]*)/g)) {
          if (!/^(is|has)-/.test(c[1]) && !covered.has(c[1])) missing.push(`${p}：.${c[1]}`);
        }
        // 主体是元素的（`.markdown-body blockquote`）：照「最近的类 + 元素」那一对
        const pair = pairOf(sel);
        if (pair && !pairs.has(pair)) missing.push(`${p}：${pair}`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], [], '这些类没有部件名：加进 resources/parts.json（状态的类用 is- 打头）');
});

test('部件名：每个都有说明、选择器里的类在样式里真有', () => {
  const all = sheets.map((p) => strip(read(p))).join('\n');
  for (const [name, p] of Object.entries(parts)) {
    assert.ok(p.zh, `${name} 没有说明`);
    assert.ok(p.select.length, `${name} 没有选择器`);
    for (const sel of p.select) for (const m of sel.matchAll(/\.([a-z][\w-]*)/g)) assert.ok(all.includes(`.${m[1]}`), `${name}：.${m[1]} 不在样式里`);
  }
});

test('像素风：变量都认、CSS 守规矩、用到的部件名都在、字和授权随包带着', () => {
  assert.equal(packProblem({ id: 'pixel', tokens: pixel }, known), null);
  const css = read('packages/skin-pixel/skin.css');
  assert.deepEqual(scopeProblems(css, 'pixel'), []);
  assert.deepEqual(translate(css, parts, 'http://h/packages/skin-pixel/skin.css').unknown, []);
  for (const m of css.matchAll(/url\("([^"]+)"\)/g)) assert.ok(existsSync(at(`packages/skin-pixel/${m[1]}`)), m[1]);
  assert.ok(existsSync(at('packages/skin-pixel/fonts/OFL-fusion-pixel.txt')));
  // 颜色只用主题的变量：不写颜色字面量
  for (const [name, v] of Object.entries(pixel)) {
    for (const s of typeof v === 'string' ? [v] : [v.light, v.dark]) assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(s), `${name}：${s}`);
  }
});
