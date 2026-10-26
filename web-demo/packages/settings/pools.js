// @ts-check
//! 模型池（蓝图 `web.md`「设置页」第 14 条）：一个池一张卡片：头上 `@名字`、调用方式（固定、轮换）、「＋ 添加」（从还没进来的模型里
//! 勾）、删除；下面成员一行一个（序号、名字、哪一家，悬停露出往上、往下、✕），最下面一行「子代理能选」开关。卡片下面一行
//! 「＋ 新建模型池」（同「＋ 添加供应商」，2026-10-11：原来是一整块淡底的大卡），点了原地变成一张白卡写名字，回车建好。改了当场存，
//! 写进个人设置。三个固定池（核心 Q-1：`fixed`）排最前、没有删除。

import { h, icon } from '../../src/lib/dom.js';
import { pickModels } from './picker.js';
import { toggle } from './rows.js';
import { itemFor, layerOf, validId, keySegment, moveMember, poolRemoval, duplicates, providerName, poolOrder } from './model.js';
import { twinsOf, copyOf } from '../../src/lib/provider-copy.js';
import { isFixedPool } from '../../src/lib/fixed-pools.js';

/** 卡片头上的池名：固定池写显示名、后面暗字接 `@flagship`。 @param {any} ctx @param {string} name */
const poolHead = (ctx, name) => (isFixedPool(name)
  ? h('strong', ctx.text(`models.fixed_pools.${name}`), h('code.set-pool-ref', `@${name}`))
  : h('strong', `@${name}`));

/**
 * @param {any} dialog
 * @param {{pools?: any[], providers?: any[]}} list `model.list`
 */
export function drawPools(dialog, list) {
  const ctx = dialog.ctx;
  const t = (k, f) => ctx.text(`models.${k}`, f);
  // 同一家自用、共用两份都有的（核心 PL-1）：供应商后面接「 · 自用」「 · 共用」
  const twins = twinsOf(list.providers);
  const named = (/** @type {any} */ p) => { const copy = copyOf(p.id, twins); return copy ? `${providerName(p)} · ${ctx.text(`secret_scope.${copy}`)}` : providerName(p); };
  const all = (list.providers ?? []).flatMap((p) => (p.models ?? []).map((m) => ({ ref: m.ref, model: m.model, name: m.facts?.name?.value ?? m.model, provider: named(p) })));
  const byRef = new Map(all.map((r) => [r.ref, r]));
  const field = (id, name) => itemFor(dialog.schema, dialog.got, `pools.<id>.${name}`, { id });
  const layer = layerOf(dialog.schema.items.find((i) => i.key === 'pools.<id>.models') ?? { layers: ['personal'] }, !!ctx.admin?.on);
  const report = (why) => { if (why) dialog.toast(why); };
  // 成员那一块最高 `pool_rows` 行，多了自己滚；每个池滚到哪记在弹窗上，挪、删以后重画回到原处
  dialog.poolScroll ??= new Map();
  const scrolls = /** @type {Map<string, number>} */ (dialog.poolScroll);
  const scroller = (name, rows) => {
    const box = h('div.set-members', { style: `--rows: ${ctx.config.pool_rows}` }, rows);
    // 上下边缘渐隐：滚到顶的不隐上沿，滚到底的不隐下沿
    const edges = () => {
      box.classList.toggle('is-top', box.scrollTop <= 1);
      box.classList.toggle('is-bottom', box.scrollTop + box.clientHeight >= box.scrollHeight - 1);
    };
    // 被下一次重画换掉的这一块，浏览器把它归 0 时也发 scroll：不记
    box.addEventListener('scroll', () => { if (box.isConnected) { scrolls.set(name, box.scrollTop); edges(); } });
    requestAnimationFrame(() => {
      // 存一项会连着重画几次：已经被下一次换掉的这一块不动记着的位置（它量出来是 0）
      if (!box.isConnected) return;
      const at = scrolls.get(name) ?? 0;
      box.scrollTop = at === Infinity ? box.scrollHeight : at;
      scrolls.set(name, box.scrollTop);
      edges();
    });
    return box;
  };

  // 「子代理能选」那一行：三个固定池是写死的键（`pools.lite.subagent`，核心 Q-1），人建的照 `pools.<id>.subagent`；清单里没有的不画
  const subagentRow = (/** @type {any} */ pool) => {
    const item = itemFor(dialog.schema, dialog.got, `pools.${keySegment(pool.name)}.subagent`, {}) ?? field(pool.name, 'subagent');
    if (!item) return null;
    const on = typeof item.entry?.value === 'boolean' ? item.entry.value : !!pool.subagent;
    const locked = !item.layers.includes('personal') && !!dialog.adminLocked;
    const sw = toggle(on, async (/** @type {boolean} */ next) => { const why = await dialog.save(item, { value: next }); report(why); return !why; });
    return h('div.set-pool-foot', h('span', item.name), locked ? h('span.is-admin-locked', { inert: '' }, sw) : sw);
  };

  const card = (pool) => {
    const members = field(pool.name, 'models');
    const strategy = field(pool.name, 'strategy');
    const now = /** @type {string[]} */ (members?.entry?.value ?? pool.models ?? []);
    const setMembers = async (next) => members && report(await dialog.save(members, { value: next }));
    const removal = poolRemoval(pool.name, dialog.got, layer);
    const seg = h('div.set-seg', ['pin', 'rotate'].map((s) => h(`button.set-seg-item${pool.strategy === s ? '.is-on' : ''}`, {
      type: 'button',
      onclick: async () => { if (strategy && pool.strategy !== s) report(await dialog.save(strategy, { value: s })); },
    }, t(`strategies.${s}`))));
    // 成员一行一个：序号、名字（池里重了的写模型名分开）、哪一家；悬停露出往上、往下、✕。配置里写着、认不出的照原样写
    const known = now.map((ref) => byRef.get(ref) ?? { ref, name: ref, model: ref, provider: '' });
    // 同一个模型在自用、共用两份里（核心 PL-1）不算重名：哪一份写在「哪一家」那一格
    const dup = duplicates([...new Map(known.map((r) => [`${r.name}\n${r.model}`, r.name])).values()]);
    // 第一行的往上、最后一行的往下留着位置不露（一列一列对齐）
    const tool = (label, name, onclick, off) => h(`button.set-member-tool${off ? '.is-off' : ''}`, { type: 'button', title: label, 'aria-label': label, disabled: off ? true : null, onclick }, icon(name));
    const rows = known.map((r, i) => h('div.set-member',
      h('span.set-member-n', String(i + 1)),
      h('span.set-model-name', { title: r.provider ? `${r.provider} / ${r.model}` : r.ref }, r.name, dup.has(r.name) ? h('code.set-model-id', r.model) : null),
      h('span.set-pick-provider', r.provider),
      h('span.set-member-tools',
        tool(t('pool_up'), 'arrow-up', () => setMembers(moveMember(now, i, -1)), i === 0),
        tool(t('pool_down'), 'arrow-down', () => setMembers(moveMember(now, i, 1)), i === now.length - 1),
        tool(t('pool_remove'), 'x', () => setMembers(now.filter((_, n) => n !== i))))));
    // 「＋ 添加」在头上：浮出选模型的小窗，能勾好几个，照勾的先后接在最后
    const add = h('button.set-btn.is-small', { type: 'button' }, icon('plus'), t('pool_add'));
    add.addEventListener('click', () => pickModels(dialog, add, all.filter((r) => !now.includes(r.ref)), (picked) => {
      // 加进来的在最后：重画以后滚到最下面露出来
      scrolls.set(pool.name, Infinity);
      setMembers([...now, ...picked]);
    }));
    return h('div.set-pool',
      // 固定池写显示名，后面暗字接 `@flagship`（2026-10-26 项目主人定名，同终端）；人建的照旧写 `@名字`
      h('div.set-pool-head', poolHead(ctx, pool.name), seg, add,
        // 固定池没有删除，垃圾桶那一格留着空位（各张卡片的调用方式、「添加」上下对齐）
        pool.fixed ? h('span.set-pool-gap', { 'aria-hidden': 'true' })
          : removal.length ? h('button.set-reset.is-shown', { type: 'button', title: t('pool_delete'), 'aria-label': t('pool_delete'), onclick: async () => report(await dialog.saveMany(layer, removal)) }, icon('trash-2')) : null),
      rows.length ? scroller(pool.name, rows) : h('span.set-muted', t('pool_empty')),
      subagentRow(pool));
  };
  const pools = poolOrder(list.pools ?? []);

  // 新建：卡片下面一行「＋ 新建模型池」，点了原地变成一张白卡：头上「@」加名字框，下面一行「回车创建 · Esc 取消」；回车建好（固定、
  // 没有成员），`Esc`、空着点别处回到那一行
  const create = h('button.set-prov.is-add.set-pool-new', { type: 'button' }, icon('plus'), h('span', t('new_pool')));
  create.addEventListener('click', () => {
    const hint = h('span.set-new-hint', t('pool_new_hint'));
    const input = /** @type {HTMLInputElement} */ (h('input.set-input', { type: 'text', placeholder: t('pool_name_hint'), spellcheck: 'false', autocomplete: 'off' }));
    const box = h('div.set-pool.is-editing', h('div.set-pool-head', h('span.set-new-at', '@'), input), hint);
    const cancel = () => box.replaceWith(create);
    const fail = (why) => { hint.textContent = why; hint.classList.add('is-bad'); };
    box.addEventListener('set-dismiss', cancel);
    input.addEventListener('blur', () => setTimeout(() => { if (box.isConnected && !input.value.trim()) cancel(); }, 120));
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const id = input.value.trim();
      if (!validId(id)) return fail(ctx.text('models.form.bad_id'));
      if ((list.pools ?? []).some((p) => p.name === id)) return fail(ctx.text('models.form.taken_id', { id }));
      const base = `pools.${keySegment(id)}`;
      const why = await dialog.saveMany(layer, [{ key: `${base}.strategy`, value: 'pin', expect: {} }, { key: `${base}.models`, value: [], expect: {} }]);
      if (why) fail(why);
    });
    create.replaceWith(box);
    input.focus();
  });
  return h('div.set-pools', pools.map(card), create);
}
