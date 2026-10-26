// @ts-check
//! 选一个模型的选择器（蓝图 `web.md`「设置页」第 14 条，「默认模型」的对话、看图；2026-10-11 项目主人定：点开一个选择器，按供应商
//! 分组）：浮在按钮下面，顶上搜索框，下面一家一组（组头图标、名称，用不了的写原因），组里一个模型一行（名字、重了的写模型名、右边
//! 暗字「1M · 看图」），现在选的打勾，用不了的暗着、点不了。点一行选定、关上；回车选第一个对得上的；`Esc`、点外面关（类名
//! `set-menu`：弹窗的 `Esc` 先关它）。

import { h, icon } from '../../src/lib/dom.js';
import { logoEl } from '../../src/lib/logo.js';
import { filterModels, providerName, sameNamed, whereOf } from './model.js';
import { modelName, metaOf, sharedState } from './model-bits.js';
import { twinsOf, copyOf } from '../../src/lib/provider-copy.js';

/**
 * @param {any} dialog
 * @param {HTMLElement} anchor 在哪个按钮下面
 * @param {ReturnType<typeof import('./model.js').pickGroups>} groups 照供应商分好的组
 * @param {string|null} current 现在选的（模型的 `ref`）
 * @param {(ref: string) => void} done
 */
export function pickModel(dialog, anchor, groups, current, done) {
  const ctx = dialog.ctx;
  dialog.panel.querySelector('.set-menu')?.dispatchEvent(new CustomEvent('set-dismiss'));
  const logos = groups.some((g) => 'logo' in g.provider);
  // 和别家同名的组头多写地址从哪来
  const same = sameNamed(groups.map((g) => g.provider));
  // 同一家自用、共用两份都有的（核心 PL-1）：两组的组名后面暗字「自用」「共用」，只有一份的不标；照整份列表认（看图那一行可能只剩一份）
  const twins = twinsOf(dialog.models?.providers ?? groups.map((g) => g.provider));
  /** 一组一组画好，搜索时只藏 @type {{head: HTMLElement, rows: {name: string, model: string, provider: string, node: HTMLElement, off: boolean, ref: string}[]}[]} */
  const drawn = groups.map(({ provider, models }) => {
    const reason = sharedState(provider.models ?? []);
    const where = same.has(provider.id) ? whereOf(provider.base_url) : null;
    const copy = copyOf(provider.id, twins);
    const head = h('div.set-pick-group', logos ? logoEl(provider.logo ?? null, providerName(provider)) : null, h('span', providerName(provider)),
      copy ? h('small', ctx.text(`secret_scope.${copy}`)) : null, where ? h('small', where) : null, reason ? h('em', ctx.text(`models.short_states.${reason}`)) : null);
    const rows = models.map(({ m, dup }) => {
      const off = !!m.state && m.state !== 'ok' && m.state !== 'cooling';
      const on = m.ref === current;
      const node = h(`button.set-pick-row${on ? '.is-on' : ''}${off ? '.is-off' : ''}`, { type: 'button', disabled: off, onclick: () => { close(); if (!on) done(m.ref); } },
        h('span.set-model-name', modelName(m), dup ? h('code.set-model-id', m.model) : null),
        h('span.set-model-meta', metaOf(ctx, m)),
        h('span.set-pick-check', on ? icon('check') : null));
      return { name: modelName(m), model: m.model, provider: copy ? `${providerName(provider)} ${ctx.text(`secret_scope.${copy}`)}` : providerName(provider), node, off, ref: m.ref };
    });
    return { head, rows };
  });
  const empty = h('p.set-empty', { hidden: true }, ctx.text('models.no_match'));
  const list = h('div.set-picker-list', drawn.flatMap((g) => [g.head, ...g.rows.map((r) => r.node)]), empty);
  const search = /** @type {HTMLInputElement} */ (h('input.set-search', { type: 'search', placeholder: ctx.text('models.search'), spellcheck: 'false', autocomplete: 'off' }));
  const apply = () => {
    let any = false;
    for (const g of drawn) {
      const shown = new Set(filterModels(g.rows, search.value));
      for (const r of g.rows) r.node.hidden = !shown.has(r);
      g.head.hidden = shown.size === 0;
      any ||= shown.size > 0;
    }
    empty.hidden = any;
  };
  search.addEventListener('input', apply);
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    drawn.flatMap((g) => g.rows).find((r) => !r.node.hidden && !r.off)?.node.click();
  });
  // 搜索框和左栏那个一个样子：放大镜、底色一块、不画描边
  const el = h('div.set-menu.set-picker.is-single', h('label.set-search-box', icon('search'), search), list);
  const outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(); };
  const close = () => {
    document.removeEventListener('pointerdown', outside, true);
    el.remove();
  };
  el.addEventListener('set-dismiss', close);
  // 照按钮的位置放：右边对齐按钮，下面放不下往上开
  const box = dialog.panel.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const scale = box.width / dialog.panel.offsetWidth || 1;
  dialog.panel.append(el);
  el.style.right = `${Math.max(12, (box.right - at.right) / scale)}px`;
  el.style.top = `${(at.bottom - box.top) / scale + 6}px`;
  if (el.getBoundingClientRect().bottom > box.bottom - 8) el.style.top = `${Math.max(12, (at.top - box.top) / scale - el.offsetHeight - 6)}px`;
  document.addEventListener('pointerdown', outside, true);
  // 现在选的那一行滚进来
  list.querySelector('.set-pick-row.is-on')?.scrollIntoView({ block: 'center' });
  search.focus();
  return el;
}
