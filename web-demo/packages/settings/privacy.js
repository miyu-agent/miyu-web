// @ts-check
//! 「隐私与安全」页的私密目录、只禁写两组（蓝图 `web.md`「设置页」第 12b 条；核心施工 5-15 下、5-17）：加了的、去掉的默认项
//! 两项并成一张表画（私密目录上面多一个总开关，关着的表灰掉）。表放在一个能滚的框里，顶上搜索；一行一个目录，出厂的带「出厂预设」，悬停露删除（先弹窗问）；框下面写目录的框
//! （一行一个，能一次加好几个），右边上下两个按钮「添加」「重置」。改一下存一下，拒了的照核心的话写在框下面。

import { h, icon, replace } from '../../src/lib/dom.js';
import { tilde } from '../../src/lib/format.js';
import { layerFor, expectFor } from './model.js';
import { confirmIn } from './confirm.js';
import { privateRows, dropChange, batchChange, canRestore, restoreChange, findRows, pairIn, inWorkspace } from './privacy-model.js';
import { coreRow } from './rows.js';

/** 这一组里有没有画成一张表的那一对（私密目录、只禁写） @param {any[]} items */
export const hasPrivate = (items) => !!pairIn(items);

/**
 * 私密目录那一组：组名照核心的组名，说明照 `add` 那一项的。搜着的字记在 `dialog.privateQuery`（设置页重画还是它）。
 * @param {any} dialog @param {string} name @param {any[]} items 这一组的项（只用那两项）
 */
export function privateGroup(dialog, name, items) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const pair = /** @type {NonNullable<ReturnType<typeof pairIn>>} */ (pairIn(items));
  // 这一组自己的说法（受保护的路径说「路径」），没有的照私密目录的
  const w = (/** @type {string} */ k, /** @type {any} */ f) => t(pair.words ? `privacy.${pair.words}.${k}` : `privacy.${k}`, f);
  const add = items.find((i) => i.key === pair.add);
  const remove = items.find((i) => i.key === pair.remove);
  // 总开关（私密目录有，核心 5-17）：在表上面，照通用的行画；关着的表灰掉、不能改
  const toggle = pair.enabled ? items.find((i) => i.key === pair.enabled) : null;
  const off = toggle ? (toggle.entry?.value ?? toggle.default) === false : false;
  // 这一组别的项（总开关、这一对以外的）照通用的行画在表上面
  const others = items.filter((i) => i.key !== pair.add && i.key !== pair.remove).map((i) => coreRow(dialog, i)).filter(Boolean);
  const queryKey = `privateQuery:${pair.add}`;
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
      const item = c.key === pair.add ? add : remove;
      return { ...c, expect: expectFor(item.entry, layer) };
    }));
    say(why);
    return !why;
  };
  const all = privateRows(add, remove);
  const list = h('div.pv-list');
  const drawList = () => {
    const rows = findRows(all, dialog[queryKey] ?? '');
    replace(list, rows.length ? rows.map((row) => h('div.pv-row',
      h('code.pv-path', { title: row.path }, home ? tilde(row.path, home) : row.path),
      // 相对路径（只禁写的 `.git/hooks` 这类）：每个工作区里的那一处
      inWorkspace(row.path) ? h('span.pv-tag', t('privacy.in_workspace')) : null,
      row.shipped ? h('span.pv-tag', t('privacy.shipped')) : null,
      h('button.icon-button.pv-drop', {
        type: 'button', title: t('privacy.drop'), 'aria-label': t('privacy.drop'),
        // 先弹窗问（2026-10-21 项目主人）
        onclick: async (/** @type {Event} */ e) => {
          if (!(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: w('drop_ask'), yes: t('privacy.drop_yes'), no: t('privacy.cancel') }))) return;
          store([dropChange(row, add, remove)]);
        },
      }, icon('x')))) : h('p.set-empty.pv-empty', w(all.length ? 'no_match' : 'empty')));
  };
  const find = /** @type {HTMLInputElement} */ (h('input.pv-find-input', { type: 'search', value: dialog[queryKey] ?? '', placeholder: w('search'), 'aria-label': w('search'), spellcheck: 'false', autocomplete: 'off' }));
  find.addEventListener('input', () => {
    dialog[queryKey] = find.value;
    drawList();
  });
  drawList();
  const input = /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.pv-input', { rows: 2, placeholder: w('add_hint'), spellcheck: 'false', autocomplete: 'off' }));
  const submit = async () => {
    const got = batchChange(input.value, add, remove);
    if (!got.changes.length) {
      say(got.skipped.length ? t('privacy.already', { paths: got.skipped.join('、') }) : null);
      return;
    }
    if (!(await store(got.changes))) return;
    input.value = '';
    // 加了别的、跳过了已经在的：也说一句（设置页重画以后写在新的那一块里）
    if (got.skipped.length) dialog.toast(t('privacy.already', { paths: got.skipped.join('、') }));
  };
  // 回车加，Shift+回车换行写下一个
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  // 一直都在，跟出厂一样的灰着：有时有有时没有，框的宽度会跟着变（2026-10-21 项目主人）
  const restore = h('button.set-btn', {
    type: 'button', disabled: !canRestore(add, remove),
    // 先弹窗问（2026-10-21 项目主人）：「确认重置私密目录列表至出厂状态吗？」，名字照组名
    onclick: async (/** @type {Event} */ e) => {
      if (!(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('privacy.restore_ask', { name }), yes: t('privacy.restore'), no: t('privacy.cancel') }))) return;
      store(restoreChange(add, remove));
    },
  }, t('privacy.restore'));
  return h('section.set-group',
    h('h3.set-group-name', name),
    others.length ? h('div.set-rows', others) : null,
    fold(dialog, pair.add, off,
      add.description ? h('p.set-desc.pv-desc', add.description) : null,
      h('div.pv-box', h('label.pv-find', icon('search'), find), list),
      h('div.pv-add', input, h('div.pv-buttons', h('button.set-btn.is-primary', { type: 'button', onclick: submit }, t('privacy.add')), restore)),
      error));
}

/** 收起、展开走多久（毫秒，乘上动效快慢） */
const FOLD_MS = 240;

/**
 * 开关下面那一块：关着的收起（高度收到 0、淡出），开了展开（2026-10-22 项目主人：原来灰掉、不能改）。拨了开关设置页整个重画，
 * 而且一拨会重画两次（存的回执、核心推来的改动各一次），新画的那一块接着上一块走到哪儿往下走：记下哪一刻换的，走的时候照过了多久接上；
 * 头一次画的直接是现在的样子。
 * @param {any} dialog @param {string} key 记上一次样子用的 @param {boolean} off @param {...any} kids
 */
function fold(dialog, key, off, ...kids) {
  const was = (dialog.pvOff ??= {})[key];
  const now = performance.now();
  if (!was || was.off !== off) dialog.pvOff[key] = { off, at: was ? now : -Infinity };
  const body = h('div.pv-body', ...kids);
  const el = h(`div.pv-fold${off ? '.is-off' : ''}`, { inert: off || undefined }, body);
  const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale'));
  const ms = FOLD_MS * (Number.isFinite(scale) ? scale : 1);
  const since = now - dialog.pvOff[key].at;
  if (ms > 0 && since < ms) {
    const go = (/** @type {Element} */ node, /** @type {Keyframe[]} */ frames) => { node.animate(frames, { duration: ms, easing: 'ease' }).currentTime = since; };
    go(el, off ? [{ gridTemplateRows: '1fr' }, { gridTemplateRows: '0fr' }] : [{ gridTemplateRows: '0fr' }, { gridTemplateRows: '1fr' }]);
    go(body, off ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }]);
  }
  return el;
}
