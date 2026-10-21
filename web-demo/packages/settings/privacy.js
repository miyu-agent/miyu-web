// @ts-check
//! 「隐私与安全」页的私密目录那一组（蓝图 `web.md`「设置页」第 12b 条；核心施工 5-15 下）：`sandbox.private.add`、`sandbox.private.remove`
//! 两项并成一张表画。表放在一个能滚的框里，顶上搜索；一行一个目录，出厂的带「出厂预设」，悬停露删除（先弹窗问）；框下面写目录的框
//! （一行一个，能一次加好几个），右边「添加」「恢复默认」。改一下存一下，拒了的照核心的话写在框下面。

import { h, icon, replace } from '../../src/lib/dom.js';
import { tilde } from '../../src/lib/format.js';
import { layerFor, expectFor } from './model.js';
import { confirmIn } from './confirm.js';
import { ADD, REMOVE, privateRows, dropChange, batchChange, canRestore, findRows } from './privacy-model.js';

/** 这一组里有没有私密目录那两项 @param {any[]} items */
export const hasPrivate = (items) => items.some((i) => i.key === ADD) && items.some((i) => i.key === REMOVE);

/**
 * 私密目录那一组：组名照核心的组名，说明照 `add` 那一项的。搜着的字记在 `dialog.privateQuery`（设置页重画还是它）。
 * @param {any} dialog @param {string} name @param {any[]} items 这一组的项（只用那两项）
 */
export function privateGroup(dialog, name, items) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const add = items.find((i) => i.key === ADD);
  const remove = items.find((i) => i.key === REMOVE);
  const home = dialog.ctx.host?.home ?? null;
  const error = h('p.set-error', { hidden: true });
  const say = (/** @type {string|null} */ why) => {
    error.hidden = !why;
    error.textContent = why ?? '';
  };
  /** 存几项（一条 `config.set`，成了设置页重读重画） @param {{key: string, value?: string[], unset?: true}[]} changes */
  const store = async (changes) => {
    if (!changes.length) return true;
    const layer = layerFor(add);
    const why = await dialog.saveMany(layer, changes.map((c) => {
      const item = c.key === ADD ? add : remove;
      return { ...c, expect: expectFor(item.entry, layer) };
    }));
    say(why);
    return !why;
  };
  const all = privateRows(add, remove);
  const list = h('div.pv-list');
  const drawList = () => {
    const rows = findRows(all, dialog.privateQuery ?? '');
    replace(list, rows.length ? rows.map((row) => h('div.pv-row',
      h('code.pv-path', { title: row.path }, home ? tilde(row.path, home) : row.path),
      row.shipped ? h('span.pv-tag', t('privacy.shipped')) : null,
      h('button.icon-button.pv-drop', {
        type: 'button', title: t('privacy.drop'), 'aria-label': t('privacy.drop'),
        // 先弹窗问（2026-10-21 项目主人）
        onclick: async (/** @type {Event} */ e) => {
          if (!(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('privacy.drop_ask'), yes: t('privacy.drop_yes'), no: t('privacy.cancel') }))) return;
          store([dropChange(row, add, remove)]);
        },
      }, icon('x')))) : h('p.set-empty.pv-empty', t(all.length ? 'privacy.no_match' : 'privacy.empty')));
  };
  const find = /** @type {HTMLInputElement} */ (h('input.pv-find-input', { type: 'search', value: dialog.privateQuery ?? '', placeholder: t('privacy.search'), 'aria-label': t('privacy.search'), spellcheck: 'false', autocomplete: 'off' }));
  find.addEventListener('input', () => {
    dialog.privateQuery = find.value;
    drawList();
  });
  drawList();
  const input = /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.pv-input', { rows: 2, placeholder: t('privacy.add_hint'), spellcheck: 'false', autocomplete: 'off' }));
  const submit = async () => {
    const got = batchChange(input.value, add, remove);
    if (!got.changes.length) {
      say(got.skipped.length ? t('privacy.already', { paths: got.skipped.join('、') }) : null);
      return;
    }
    if (await store(got.changes)) input.value = '';
  };
  // 回车加，Shift+回车换行写下一个
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  const restore = canRestore(remove)
    ? h('button.set-btn', { type: 'button', onclick: () => store([{ key: REMOVE, unset: true }]) }, t('privacy.restore'))
    : null;
  return h('section.set-group',
    h('h3.set-group-name', name),
    add.description ? h('p.set-desc.pv-desc', add.description) : null,
    h('div.pv-box', h('label.pv-find', icon('search'), find), list),
    h('div.pv-add', input, h('div.pv-buttons', h('button.set-btn.is-primary', { type: 'button', onclick: submit }, t('privacy.add')), restore)),
    error);
}
