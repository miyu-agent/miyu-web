// @ts-check
//! 「模型」页（蓝图 `web.md`「设置页」第 14 条，照 `tui.md`「全屏配置页」）：三个标签：供应商（`providers.js`）、默认模型（`defaults.js`）、
//! 模型池（`pools.js`）。2026-10-11 项目主人看过说丑、定了改：原来五个标签，默认文本模型、默认视觉模型、语义模型三个只是各选一样东西，
//! 合成「默认模型」。列表照 `model.list`，存照 `config.set`。添加、编辑供应商的表在 `provider-form.js`，一个模型的详情在
//! `model-detail.js`，选模型的选择器在 `model-pick.js`。

import { h } from '../../src/lib/dom.js';
import { providerForm } from './provider-form.js';
import { drawProviders } from './providers.js';
import { drawDefaults } from './defaults.js';
import { drawPools } from './pools.js';
import { loadingRow } from './model-bits.js';

const TABS = ['providers', 'defaults', 'pools'];

/** 这一页。 */
export function drawModels(dialog) {
  const ctx = dialog.ctx;
  if (!TABS.includes(dialog.modelTab)) dialog.modelTab = 'providers';
  const tabs = h('div.set-tabs', { role: 'tablist' }, TABS.map((id) => h(`button.set-tabbar${dialog.modelTab === id ? '.is-on' : ''}`, {
    type: 'button',
    role: 'tab',
    onclick: () => { dialog.modelTab = id; dialog.modelDetail = null; dialog.providerForm = null; dialog.keyEdit = null; dialog.drawBody(); },
  }, ctx.text(`models.tabs.${id}`))));
  const list = dialog.models;
  if (!list) return [tabs, dialog.modelsLoading ? loadingRow(ctx) : h('p.set-empty.is-bad', ctx.text('load_failed', { reason: 'model.list' }))];
  if (dialog.modelTab === 'providers') return [tabs, dialog.providerForm ? providerForm(dialog, list.providers ?? []) : drawProviders(dialog, list)];
  if (dialog.modelTab === 'pools') return [tabs, drawPools(dialog, list)];
  return [tabs, drawDefaults(dialog, list)];
}
