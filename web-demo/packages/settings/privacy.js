// @ts-check
//! 「隐私与安全」页的私密目录那一组（蓝图 `web.md`「设置页」第 12b 条；核心施工 5-15 下）：`sandbox.private.add`、`sandbox.private.remove`
//! 两项并成一张表画：一行一个目录，出厂的带「出厂」，每行悬停露删除；下面写目录的框和「添加」；去掉过出厂项的组头右边「恢复默认」。
//! 改一下存一下，拒了的照核心的话写在框下面。

import { h, icon } from '../../src/lib/dom.js';
import { tilde } from '../../src/lib/format.js';
import { ADD, REMOVE, privateRows, dropChange, addChange, canRestore } from './privacy-model.js';

/** 这一组里有没有私密目录那两项 @param {any[]} items */
export const hasPrivate = (items) => items.some((i) => i.key === ADD) && items.some((i) => i.key === REMOVE);

/**
 * 私密目录那一组：组名照核心的组名。
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
  /** 存一项（成了设置页照推来的 `config.changed` 重读重画） @param {{key: string, value?: string[], unset?: true}} change */
  const store = async (change) => {
    const item = change.key === ADD ? add : remove;
    const why = await dialog.save(item, change.unset ? { unset: true } : { value: change.value });
    say(why);
    return !why;
  };
  const rows = privateRows(add, remove).map((row) => h('div.set-row.pv-row',
    h('code.pv-path', { title: row.path }, home ? tilde(row.path, home) : row.path),
    row.shipped ? h('span.pv-tag', t('privacy.shipped')) : null,
    h('button.icon-button.pv-drop', { type: 'button', title: t('privacy.drop'), 'aria-label': t('privacy.drop'), onclick: () => store(dropChange(row, add, remove)) }, icon('x'))));
  const input = /** @type {HTMLInputElement} */ (h('input.set-input.pv-input', { type: 'text', placeholder: t('privacy.add_hint'), spellcheck: 'false', autocomplete: 'off' }));
  const submit = async () => {
    const change = addChange(input.value, add, remove);
    if (!change) {
      say(input.value.trim() ? t('privacy.already') : null);
      return;
    }
    if (await store(change)) input.value = '';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); }
  });
  const restore = canRestore(remove)
    ? h('button.set-btn.pv-restore', { type: 'button', onclick: () => store({ key: REMOVE, unset: true }) }, t('privacy.restore'))
    : null;
  return h('section.set-group',
    h('div.set-group-head', h('h3.set-group-name', name), restore),
    add.description ? h('p.set-desc.pv-desc', add.description) : null,
    h('div.set-rows.pv-rows', rows.length ? rows : h('p.set-empty', t('privacy.empty'))),
    h('div.pv-add', input, h('button.set-btn', { type: 'button', onclick: submit }, t('privacy.add'))),
    error);
}
