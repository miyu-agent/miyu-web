// @ts-check
//! 「模型」页几块共用的（蓝图 `web.md`「设置页」第 14 条）：模型的显示名、看不看得了图、一行暗字写窗口和「看图」、一家都一样的
//! 「用不了」、「正在读模型列表」、搜索框、重读一家的模型。

import { h, icon } from '../../src/lib/dom.js';
import { shortCount, filterModels } from './model.js';

/** 模型的显示名：目录给的名字，没有的写模型名。 */
export const modelName = (m) => m.facts?.name?.value ?? m.model;
/** 看得了图。 */
export const seesImages = (m) => (m.facts?.inputs?.value ?? []).includes('image');

/**
 * 一行暗字：窗口、看得了图的写「看图」（原来是一个没说明的小图标）。`long` 的窗口后面写「上下文」（供应商那一页地方够）。
 * @param {any} ctx @param {any} m @param {boolean} [long]
 */
export function metaOf(ctx, m, long = false) {
  const n = shortCount(m.facts?.window?.value);
  const parts = [n ? (long ? ctx.text('models.meta_window', { n }) : n) : null, seesImages(m) ? ctx.text('models.meta_vision') : null].filter(Boolean);
  return parts.join(' · ');
}

/** 这一家每个模型都一样的「用不了」（没有密钥这类）：交回它，写一次，不在每个模型上重复。 */
export const sharedState = (models) => {
  const states = new Set(models.map((m) => m.state ?? 'ok'));
  const [only] = states;
  return states.size === 1 && only !== 'ok' && only !== 'cooling' ? only : null;
};

/** 「正在读模型列表」那一行，前面一个转圈。 */
export const loadingRow = (ctx) => h('p.set-loading', icon('loader-circle'), ctx.text('models.loading'));

/**
 * 搜索框：照显示名、模型名、供应商名就地藏掉对不上的行（不重画，打字不丢焦点）；字记在弹窗上，重画以后照旧。
 * @param {any} dialog @param {string} slot 记在哪一格 @param {{name: string, model: string, provider?: string, node: HTMLElement}[]} rows
 */
export function searchable(dialog, slot, rows) {
  dialog.modelQuery ??= {};
  const input = /** @type {HTMLInputElement} */ (h('input.set-input.set-model-search', { type: 'search', placeholder: dialog.ctx.text('models.search'), value: dialog.modelQuery[slot] ?? '', spellcheck: 'false', autocomplete: 'off' }));
  const empty = h('p.set-empty', { hidden: true }, dialog.ctx.text('models.no_match'));
  const apply = () => {
    dialog.modelQuery[slot] = input.value;
    const shown = new Set(filterModels(rows, input.value));
    for (const r of rows) r.node.hidden = !shown.has(r);
    empty.hidden = shown.size > 0;
  };
  input.addEventListener('input', apply);
  apply();
  return { input, empty };
}

/**
 * 重读一家的模型（`refresh` 的请核心先去供应商那边拉一遍）：读的时候那一块写「正在读模型列表」，读完换上、重画。
 * @param {any} dialog @param {string} id @param {boolean} refresh
 */
export async function refreshProvider(dialog, id, refresh) {
  dialog.refreshed ??= new Set();
  dialog.refreshed.add(id);
  dialog.loadingProvider = id;
  if (dialog.isOpen) dialog.drawBody();
  try {
    const got = await dialog.ctx.core.request('model.list', { provider: id, ...(refresh ? { refresh: true } : {}) });
    const fresh = got?.providers?.find((x) => x.id === id);
    if (fresh && dialog.models) dialog.models.providers = dialog.models.providers.map((x) => (x.id === id ? fresh : x));
  } catch {
    // 读不到的照旧显示原来的（没有模型的写「还没有模型」）
  } finally {
    dialog.loadingProvider = null;
    if (dialog.isOpen && !dialog.editing()) dialog.drawBody();
  }
}

/**
 * 测试连接的结果那一行（核心 8-11 五补）：只列了模型的写列出几个，发了一句的写模型和首字；没成的照原话，要模型名的接一句怎么再测。
 * @param {any} ctx @param {any} r `provider.test` 的回应
 */
export function testLine(ctx, r) {
  if (r.ok) return r.checked === 'list' ? ctx.text('models.test_listed', { count: (r.models ?? []).length }) : ctx.text('models.test_ok', { model: r.model, ms: r.first_token_ms });
  const raw = r.error?.message ?? r.stage;
  return r.need_model ? `${raw} · ${ctx.text('models.test_need_model')}` : raw;
}
