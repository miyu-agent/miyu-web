// 桌面端启动时的等待页 `miyu-webui/loading.html`（蓝图 `web.md`「第一次引导」第 2a 条，2026-10-31 项目主人）：网页软件起来之前外壳从磁盘读、
// 当 `data:` 页面开，所以一个文件自带一切，不引别的文件、不连网。正中是欢迎页的字符剪影：照 `packages/welcome/glyphs.js`、`glyph-mask.js`
// 原样内联（去掉 `import`、`export` 那几个字），加一个最小的 `h`；明暗照系统的；下面一行小字是占位 `{{starting}}`，外壳照系统语言换。
//
//   node tools/loading.mjs        重出 miyu-webui/loading.html（剪影改了跟着重出；测试 web-demo/tests/loading.test.js 查它对得上）

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
export const OUTPUT = new URL('miyu-webui/loading.html', ROOT);
const read = (/** @type {string} */ path) => readFileSync(new URL(path, ROOT), 'utf8');

/** 模块写法换成一份脚本里的：去掉 `// @ts-check`、`import` 行，`export` 去掉。 @param {string} code */
const plain = (code) => code
  .replace(/^\/\/ @ts-check\n/m, '')
  .replace(/^import [^\n]*;\n/gm, '')
  .replace(/^export (const|function|let) /gm, '$1 ');

/** 剪影要的那一点 `h`：`标签.类.类`、属性表、子节点、字。 */
const H = `const h = (tag, ...rest) => {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const a of rest.flat()) {
    if (a == null || a === false) continue;
    if (a instanceof Node) el.append(a);
    else if (typeof a === 'object') for (const [k, v] of Object.entries(a)) { if (v != null) el.setAttribute(k, String(v)); }
    else el.append(String(a));
  }
  return el;
};`;

/** 生成整份。 @returns {string} */
export function build() {
  const mask = plain(read('web-demo/packages/welcome/glyph-mask.js'));
  const glyphs = plain(read('web-demo/packages/welcome/glyphs.js'));
  return `<!doctype html>
<!-- 生成的文件，别手改：node tools/loading.mjs（照 web-demo/packages/welcome/glyphs.js、glyph-mask.js）。桌面端启动时的等待页，下面那一行的占位（两个大括号包着 starting，整份只出现一次）由外壳换成给人看的字。 -->
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Miyu</title>
<style>
:root { color-scheme: light dark; --surface: #faf9f7; --text: #1d1c1a; --text-soft: #625d56; --text-faint: #9c968d; }
@media (prefers-color-scheme: dark) { :root { --surface: #1a1b26; --text: #c0caf5; --text-soft: #9aa3c7; --text-faint: #6b7394; } }
html, body { height: 100%; margin: 0; }
body { display: grid; place-content: center; justify-items: center; gap: 18px; overflow: hidden; background: var(--surface); color: var(--text-soft); font: 13px/1.5 ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; user-select: none; }
.wl-glyphs { display: grid; width: min(72vmin, 520px); aspect-ratio: 1; }
.wl-glyphs canvas { width: 100%; height: 100%; }
.starting { margin: 0; letter-spacing: 0.02em; }
</style>
</head>
<body>
<p class="starting">{{starting}}</p>
<script>
(() => {
${H}
${mask}
${glyphs}
document.body.prepend(glyphArt());
// 系统换了明暗：剪影照根上属性变了重读颜色（glyphs.js 的 MutationObserver），这里替它写一个
const dark = matchMedia('(prefers-color-scheme: dark)');
const mark = () => { document.documentElement.dataset.scheme = dark.matches ? 'dark' : 'light'; };
mark();
dark.addEventListener('change', mark);
})();
</script>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT, build());
  console.log(`${fileURLToPath(OUTPUT)}：${Buffer.byteLength(build())} 字节`);
}
