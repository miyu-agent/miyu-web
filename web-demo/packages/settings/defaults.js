// @ts-check
//! 「模型」页的「默认模型」（蓝图 `web.md`「设置页」第 14 条；2026-10-11 项目主人定：默认文本模型、默认视觉模型、语义模型三个标签
//! 合成这一页，一个用途一行）：对话（`models.chat`）、看图（`models.vision`）右边一个选择按钮，点开按供应商分组的选择器
//! （`model-pick.js`）；语义检索（`models.embedding`）右边一个下拉（内置模型、关，没装的暗着）。选了当场存，不改开着的会话。

import { h, icon } from '../../src/lib/dom.js';
import { logoEl, hasLogos } from '../../src/lib/logo.js';
import { shell, select } from './rows.js';
import { plainItem, providerName, pickGroups, sameNamed, whereOf } from './model.js';
import { modelName, seesImages } from './model-bits.js';
import { pickModel } from './model-pick.js';

/** @param {any} dialog @param {{providers?: any[]}} list `model.list` */
export function drawDefaults(dialog, list) {
  return h('div.set-rows.set-uses', useRow(dialog, list, 'chat'), useRow(dialog, list, 'vision'), embeddingRow(dialog));
}

/** 对话、看图：名称、说明，右边一个按钮写着现在选的（图标、名字、哪一家）。 @param {'chat'|'vision'} which */
function useRow(dialog, list, which) {
  const ctx = dialog.ctx;
  const item = plainItem(dialog.schema, dialog.got, `models.${which}`);
  if (!item) return null;
  const current = item.entry?.value ?? null;
  const providers = list.providers ?? [];
  const found = providers.flatMap((p) => (p.models ?? []).map((m) => ({ p, m }))).find(({ m }) => m.ref === current);
  const logos = hasLogos(providers);
  const label = found
    // 哪一家和别家同名的，接上地址从哪来
    ? [logos ? logoEl(found.p.logo ?? null, providerName(found.p)) : null, h('span', modelName(found.m)),
      h('em', sameNamed(providers).has(found.p.id) ? `${providerName(found.p)} · ${whereOf(found.p.base_url) ?? found.p.id}` : providerName(found.p))]
    // 写着的找不到了（那一家删了、模型下架了）照原样写；没写的「未设置」
    : [h('span', current ? String(current) : ctx.text('models.unset'))];
  const button = h('button.set-select.set-use-pick', { type: 'button' }, ...label, icon('chevron-down'));
  let row;
  button.addEventListener('click', () => pickModel(dialog, button, pickGroups(providers, (m) => which !== 'vision' || seesImages(m), modelName), current, async (ref) => {
    row.busy();
    const why = await dialog.save(item, { value: ref });
    if (why) row.fail(why);
  }));
  row = shell({
    name: ctx.text(`models.uses.${which}`),
    description: ctx.text(`models.uses.${which}_desc`),
    problems: (item.problems ?? []).map((p) => ({ level: p.level, message: p.message })),
    control: button,
  });
  return row.el;
}

/**
 * 语义检索（`models.embedding`，记忆那一步 R-5；旧核心没有这一项的不出这一行）：下拉照 `options`（内置模型、关；没写的照内置
 * 模型），用不了的（内置模型那个小程序包没装）暗着、点不了；选着的正是它时下面一行黄字。
 */
function embeddingRow(dialog) {
  const ctx = dialog.ctx;
  const item = plainItem(dialog.schema, dialog.got, 'models.embedding');
  if (!item) return null;
  const written = item.entry?.value ?? null;
  // 没写的照内置模型（核心：不写就是 local）
  const current = typeof written === 'string' ? written : 'local';
  const options = (item.options ?? []).map((o) => ({ value: o.value, name: o.name, note: o.available === false ? ctx.text('models.not_installed') : o.note ?? undefined, off: o.available === false }));
  // 现在写的是一家供应商的模型（以前在别处写的）：照写着列出来，人能换回上面的
  if (!options.some((o) => o.value === current)) options.push({ value: current, name: current, note: undefined, off: false });
  let row;
  const using = (item.options ?? []).find((o) => o.value === current);
  row = shell({
    name: ctx.text('models.uses.embedding'),
    description: item.description ?? '',
    problems: [
      // 选着的是用不了的（内置模型没装）：说清现在怎样（设计 30 第二节：没装内置模型就只有关键词那一路）
      ...(using?.available === false ? [{ level: 'warn', message: ctx.text('models.embedding_missing', { name: using.name }) }] : []),
      ...(item.problems ?? []).map((p) => ({ level: p.level, message: p.message })),
    ],
    control: select(dialog, options, current, async (value) => {
      row.busy();
      const why = await dialog.save(item, { value });
      if (why) row.fail(why);
    }),
  });
  return row.el;
}
