// @ts-check
//! 设置页「模型」里一个模型的详情（`packages/settings/model-detail.js`）：2026-11-17 主人验收第 8 条，点开是设置框正中的小窗、不是右边
//! 滑进来的抽屉（W-1206）。照添加供应商、MCP 那几个小窗的写法：`set-tool-modal` 淡遮罩、`set-tool-pop` 卡片、`role=dialog`、
//! `data-set-dismiss`（`Esc`、手机返回键先收它），挂在设置框上。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (/** @type {string} */ path) => readFileSync(new URL(`../../packages/settings/${path}`, import.meta.url), 'utf8');

test('模型详情是正中的小窗：遮罩、卡片、dialog、Esc 收得掉，挂在设置框上', () => {
  const src = read('model-detail.js');
  assert.match(src, /h\('div\.set-tool-modal\.set-model-modal'/, '淡遮罩那一层同别的小窗');
  assert.match(src, /'div\.set-tool-pop\.set-model-pop'/, '卡片同别的小窗');
  assert.match(src, /role: 'dialog'/);
  assert.match(src, /'data-set-dismiss': '1'/, 'Esc、手机返回键先收它');
  assert.match(read('providers.js'), /dialog\.panel\.append\(detail\)/, '挂在设置框上，不挂右边那一栏');
});

test('右边的抽屉没了：脚本、样式里都不再有 set-drawer', () => {
  for (const f of ['model-detail.js', 'providers.js', 'dialog.js', 'style.css']) assert.ok(!read(f).includes('set-drawer'), f);
});
