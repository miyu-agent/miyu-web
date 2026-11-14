// @ts-check
//! 2026-11-14 UI review（桌面、手机 × 默认、Claude 风格、大肥鱼）查出来的几条排版毛病，守住修法本身：都是样式表里的规矩，
//! 照字面查（同 `schedules-loop-tag.test.js` 查 dock.css 的做法）。截图前后对比在验收记录 W-1186。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (/** @type {string} */ path) => readFileSync(join(root, path), 'utf8');
/** 仓库里的样式表（页面自己的、软件包的） @param {string} dir @returns {string[]} */
const sheets = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
  const path = join(dir, name);
  return statSync(join(root, path)).isDirectory() ? sheets(path) : name.endsWith('.css') ? [path] : [];
});
/** 一张样式表里一条规矩：选择器后面紧跟的那一块 @param {string} css @param {string} selector */
const block = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `没有 ${selector}`);
  return css.slice(at, css.indexOf('}', at) + 1);
};

test('第 1 条：内容区里选中的一项不退回左栏的选中色（大肥鱼的左栏选中是深蓝，退回它就是深蓝底深字）', () => {
  for (const path of [...sheets('styles'), ...sheets('packages')]) {
    if (path === join('styles', 'sidebar.css')) continue;
    for (const line of read(path).split('\n')) {
      // 只认底色那一个（`--sidebar-active-shadow` 是影，不算）
      if (!/var\(--sidebar-active[,)]/.test(line)) continue;
      // 设置页的左栏（`.set-tab`）是左栏，照左栏的
      assert.match(line.trim(), /^\.set-tab\.is-on \{/, `${path}：${line.trim().slice(0, 80)}`);
    }
  }
  assert.match(block(read('packages/settings/style.css'), '.set-prov.is-on'), /background: var\(--item-active, var\(--surface-3\)\)/);
});

test('第 3 条：手机上用量表照内容排宽、横着滚，名字不压后面几列；表头一律对中线', () => {
  const css = read('packages/usage/style.css');
  const phone = css.slice(css.lastIndexOf('@media (max-width: 640px)'));
  assert.match(phone, /\.use-table \{ width: max-content; min-width: 100%; table-layout: auto; \}/);
  assert.match(block(css, '.use-table th button'), /vertical-align: middle/);
});

test('第 4 条：↺、转圈不占地方；占满一行的框浮在框右上角上面', () => {
  const css = read('packages/settings/style.css');
  assert.match(block(css, '.set-control > :is(.set-reset, .set-status)'), /position: absolute/);
  assert.match(block(css, '.set-row:is(.is-wide, :has(.set-area)) > .set-control > :is(.set-reset, .set-status)'), /bottom: calc\(100% \+ 4px \* var\(--space\)\)/);
});

test('第 5 条：手机上只有名字的一行，名字照字宽，下拉能收、自己截字，不整个掉到下一行', () => {
  const css = read('packages/settings/style.css');
  assert.match(block(css, '  .set-row:not(:has(.set-desc, .set-source, .set-problem)) > .set-text'), /flex: 0 1 auto/);
  assert.match(block(css, '  .set-row > .set-control:has(> .set-select)'), /flex: 0 1 auto; min-width: 0/);
  assert.match(block(css, '  .set-control > .set-select > span'), /text-overflow: ellipsis/);
});

test('第 7 条：手机上框下面那一行左边给用量小圈留位置；后台任务按钮藏着时中间那格不占地方', () => {
  const css = read('styles/composer.css');
  assert.match(css, /\.composer-footer:has\(\.footer-usage\) \.footer-left \{ max-width: calc\(100% - 36px \* var\(--space\)\); \}/);
  assert.match(css, /\.footer-middle:empty, \.footer-middle:not\(:has\(> :not\(\[hidden\]\)\)\) \{ display: none; \}/);
});

test('第 9 条：设置页各页空着、读着的那一句一律居中（同知识库、记忆）', () => {
  assert.match(block(read('packages/settings/style.css'), '.set-empty'), /text-align: center/);
});

test('第 10 条：有悬停时卡片头的「放大看」没露不占地方', () => {
  const css = read('packages/dashboard/style.css');
  const hover = css.slice(css.indexOf('@media (hover: hover)'));
  assert.match(hover, /\.dash-zoom \{ width: 0; overflow: hidden;/);
});

test('第 11 条：手指点的，小控件点得到的地方往外扩（看着的大小不变）', () => {
  const css = read('styles/base.css');
  const coarse = css.slice(css.lastIndexOf('@media (pointer: coarse)'));
  for (const sel of ['.set-switch', '.set-back', '.set-seg-item', '.use-seg button', '.dash-icon-btn', '.dash-remove', '.loop-pill', '.goal-pill', '.session-group-button', '.footer-usage']) {
    assert.ok(coarse.includes(sel), sel);
  }
  assert.match(coarse, /::after \{ content: ""; position: absolute; inset: -6px; \}/);
});
