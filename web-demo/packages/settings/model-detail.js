// @ts-check
//! 一个模型的详情（蓝图 `web.md`「设置页」第 14 条）：点供应商页的一个模型，从右边滑进来（宽 380px，盖着右边整栏），只有名字和控件：
//! 支持输入、上下文窗口、默认思考强度、默认温度、价格（四格加币种，改一项照显示的整份存）。`Esc`、✕ 收回。

import { h, icon } from '../../src/lib/dom.js';
import { coreRow, textField } from './rows.js';
import { itemFor, inputText, layerOf, writtenIn, expectFor } from './model.js';
import { modelName } from './model-bits.js';
import { baseOf } from '../../src/lib/provider-copy.js';

/** 一个模型的详情：从右边滑进来，只有名字和控件；`Esc`、✕ 收回。 */
export function drawer(dialog, p, m) {
  if (!m) return null;
  const ctx = dialog.ctx;
  // 共用那份（`relay@system`，核心 PL-1）的配置写在原编号底下
  const names = { id: baseOf(p.id), model: m.model };
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
  const close = () => { dialog.modelDetail = null; dialog.drawBody(); };
  const el = h('aside.set-drawer',
    h('header.set-drawer-head', h('div', h('strong', modelName(m)), h('code', m.model)), h('button.icon-button', { type: 'button', 'aria-label': ctx.text('close'), onclick: close }, icon('x'))),
    h('div.set-rows',
      row('inputs', f.inputs, ctx.text('models.inputs')),
      row('window', f.window, ctx.text('models.window')),
      effort && effort.options && effort.options.length > 1 ? coreRow(dialog, effort, { compact: true }) : null,
      // 默认温度（核心 8-22）：这个模型收温度的才有这一行；空着是不带，照供应商的默认
      f.takes_temperature?.value !== false ? row('temperature', undefined, ctx.text('models.temperature')) : null),
    prices(dialog, item));
  el.addEventListener('set-dismiss', close);
  return el;
}

/** 价格一块：输入、输出、缓存读、缓存写两行两列，币种跟在后面；改一项时五项照显示的整份存（照终端第 4 条），空着的是删掉（不当成 0）。 */
function prices(dialog, item) {
  const ctx = dialog.ctx;
  const parts = ['input', 'output', 'cache_read', 'cache_write', 'currency'].map((name) => ({ name, it: item(`price.${name}`) })).filter((x) => x.it);
  /** @type {Map<string, HTMLInputElement>} */
  const inputs = new Map();
  // 照显示的整份写：有字的都写（没改的也写，五项一起成一套），空着的这一层写过才删
  const saveAll = async () => {
    const layer = layerOf(parts[0].it);
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
    changed ||= writtenIn(it.entry, layerOf(it));
    const field = /** @type {HTMLInputElement} */ (textField(inputText(it.entry?.value ?? ''), name === 'currency' ? 'text' : 'number', '', saveAll));
    inputs.set(name, field);
    return h(`label.set-price${name === 'currency' ? '.is-currency' : ''}`, h('span', ctx.text(`models.price_${name}`)), field);
  });
  return h('section.set-prices',
    h('div.set-prices-head', h('span', ctx.text('models.price')), changed ? h('em', ctx.text('changed')) : null),
    h('div.set-price-grid', cells));
}
