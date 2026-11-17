// @ts-check
//! 一个模型的详情（蓝图 `web.md`「设置页」第 14 条）：点供应商页的一个模型，设置框正中弹一个小窗（2026-11-17 主人验收第 8 条：原来从右边
//! 滑进来盖着右边整栏，W-1206；照添加供应商、MCP 的小窗：淡遮罩、正中一张卡、进出同它们），只有名字和控件：支持输入、上下文窗口、
//! 思考程度（2026-11-11 项目主人：原来叫「默认思考强度」）、默认温度、价格（四格加币种，改一项照显示的整份存）。`Esc`、✕、点遮罩收回。

import { h, icon } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { coreRow, textField } from './rows.js';
import { itemFor, inputText, writtenIn, expectFor, LAYER } from './model.js';
import { modelName } from './model-bits.js';

/**
 * 一个模型的详情：正中的小窗，只有名字和控件；`Esc`、✕、点遮罩收回。挂在设置框上（`providers.js`），每次重画换一张（存了一项重画时
 * 还是同一个模型的带 `is-settled`，不再弹一次）。
 */
export function detailModal(dialog, p, m) {
  if (!m) return null;
  const ctx = dialog.ctx;
  const names = { id: p.id, model: m.model };
  const f = m.facts ?? {};
  const item = (field, factOf) => itemFor(dialog.schema, dialog.got, `providers.<id>.models.<model>.${field}`, names, factOf ? { value: factOf.value } : undefined);
  const row = (field, factOf, label) => {
    const it = item(field, factOf);
    if (!it) return null;
    if (label) it.name = label;
    return coreRow(dialog, it, { compact: true });
  };
  // 思考强度：只列这个模型报的那几档，前面一个「默认」（选它是删掉这一项）
  const effort = item('effort');
  if (effort) {
    effort.name = ctx.text('models.effort');
    effort.control = 'select';
    effort.options = [{ value: null, name: ctx.text('default_mark') }, ...(f.reasoning?.value ?? []).map((v) => ({ value: v, name: v }))];
  }
  // 先缩回去再重画：重画只换掉没在收的那一张（`dialog.js` 的 `drawBody`）
  const close = () => {
    if (!modal.isConnected || modal.classList.contains('is-leaving')) return;
    leave(modal, () => modal.remove());
    dialog.modelDetail = null;
    dialog.drawBody();
  };
  const pop = h('div.set-tool-pop.set-model-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': modelName(m) },
    h('header.set-model-pop-head', h('div', h('strong', modelName(m)), h('code', m.model)), h('button.icon-button', { type: 'button', title: ctx.text('close'), 'aria-label': ctx.text('close'), onclick: close }, icon('x'))),
    h('div.set-rows',
      row('inputs', f.inputs, ctx.text('models.inputs')),
      row('window', f.window, ctx.text('models.window')),
      effort && effort.options && effort.options.length > 1 ? coreRow(dialog, effort, { compact: true }) : null,
      // 默认温度（核心 8-22）：这个模型收温度的才有这一行；空着是不带，照供应商的默认
      f.takes_temperature?.value !== false ? row('temperature', undefined, ctx.text('models.temperature')) : null),
    prices(dialog, item));
  const modal = h('div.set-tool-modal.set-model-modal', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, pop);
  modal.addEventListener('set-dismiss', close);
  return modal;
}

/** 价格一块：输入、输出、缓存读、缓存写两行两列，币种跟在后面；改一项时五项照显示的整份存（照终端第 4 条），空着的是删掉（不当成 0）。 */
function prices(dialog, item) {
  const ctx = dialog.ctx;
  const parts = ['input', 'output', 'cache_read', 'cache_write', 'currency'].map((name) => ({ name, it: item(`price.${name}`) })).filter((x) => x.it);
  /** @type {Map<string, HTMLInputElement>} */
  const inputs = new Map();
  // 照显示的整份写：有字的都写（没改的也写，五项一起成一套），空着的这一层写过才删
  const saveAll = async () => {
    const layer = LAYER;
    const changes = parts.flatMap(({ name, it }) => {
      const text = inputs.get(name)?.value.trim() ?? '';
      const expect = expectFor(it.entry, layer);
      if (text) return [{ key: it.key, input: text, expect }];
      return writtenIn(it.entry, layer) ? [{ key: it.key, unset: true, expect }] : [];
    });
    const why = await dialog.saveMany(layer, changes);
    if (why) dialog.toast(why);
  };
  let changed = false;
  const cells = parts.map(({ name, it }) => {
    changed ||= writtenIn(it.entry, LAYER);
    const field = /** @type {HTMLInputElement} */ (textField(inputText(it.entry?.value ?? ''), name === 'currency' ? 'text' : 'number', '', saveAll));
    inputs.set(name, field);
    return h(`label.set-price${name === 'currency' ? '.is-currency' : ''}`, h('span', ctx.text(`models.price_${name}`)), field);
  });
  return h('section.set-prices',
    h('div.set-prices-head', h('span', ctx.text('models.price')), changed ? h('em', ctx.text('changed')) : null),
    h('div.set-price-grid', cells));
}
