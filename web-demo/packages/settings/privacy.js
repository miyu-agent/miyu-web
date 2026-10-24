// @ts-check
//! 「隐私与安全」页的私密目录、只禁写两组（蓝图 `web.md`「设置页」第 12b 条；核心施工 5-15 下、5-17）：加了的、去掉的默认项
//! 两项并成一张表画（私密目录上面多一个总开关，关着的表灰掉）。表放在一个能滚的框里，顶上搜索；一行一个目录，出厂的带「出厂预设」，悬停露删除（先弹窗问）；框下面写目录的框
//! （一行一个，能一次加好几个），右边上下两个按钮「添加」「重置」。改一下存一下，拒了的照核心的话写在框下面。

import { h, icon, replace } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { tilde } from '../../src/lib/format.js';
import { layerOf, expectFor } from './model.js';
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
  const others = items.filter((i) => i.key !== pair.add && i.key !== pair.remove).map((i) => {
    const row = coreRow(dialog, i);
    // 总开关一拨就收起、展开，不等存完（开关自己先滑完圆点再存，要两三百毫秒）
    if (row && i === toggle) row.addEventListener('click', (e) => {
      const sw = /** @type {Element} */ (e.target).closest('.set-switch');
      if (sw && !(/** @type {HTMLButtonElement} */ (sw)).disabled && body.isConnected) queueMicrotask(() => fold.go(dialog, pair.add, !sw.classList.contains('is-on'), body));
    });
    return row;
  }).filter(Boolean);
  const queryKey = `privateQuery:${pair.add}`;
  const home = dialog.ctx.host?.home ?? null;
  const error = h('p.set-error', { hidden: true });
  const say = (/** @type {string|null} */ why) => {
    error.hidden = !why;
    error.textContent = why ?? '';
  };
  /**
   * 存几项（一条 `config.set`，成了设置页重读重画），交回拒了的话（成了是 `null`）；`quiet` 的不写在组下面（添加的小框自己写）。
   * @param {{key: string, value?: string[], unset?: true}[]} changes @param {boolean} [quiet]
   */
  const store = async (changes, quiet = false) => {
    if (!changes.length) return null;
    const layer = layerOf(add, !!dialog.ctx.admin?.on);
    const why = await dialog.saveMany(layer, changes.map((c) => {
      const item = c.key === pair.add ? add : remove;
      return { ...c, expect: expectFor(item.entry, layer) };
    }));
    if (!quiet) say(why);
    return why ?? null;
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
  // 搜索框右边两个图标按钮：「+」点了弹一个写路径的小框，「↺」重置（2026-10-22 项目主人：去掉表下面写路径的框）；一直都在，跟出厂一样的「重置」灰着
  const plus = /** @type {HTMLButtonElement} */ (h('button.icon-button.pv-tool', {
    type: 'button', title: t('privacy.add'), 'aria-label': t('privacy.add'),
    onclick: () => openAdd(dialog, w('add_title'), w('add_hint'), async (text) => {
      const got = batchChange(text, add, remove);
      if (!got.changes.length) return got.skipped.length ? t('privacy.already', { paths: got.skipped.join('、') }) : '';
      const why = await store(got.changes, true);
      if (why) return why;
      // 加了别的、跳过了已经在的：也说一句
      if (got.skipped.length) dialog.toast(t('privacy.already', { paths: got.skipped.join('、') }));
      return null;
    }),
  }, icon('plus')));
  const restore = h('button.icon-button.pv-tool', {
    type: 'button', title: t('privacy.restore'), 'aria-label': t('privacy.restore'), disabled: !canRestore(add, remove),
    // 先弹窗问（2026-10-21 项目主人）：「确认重置私密目录列表至出厂状态吗？」，名字照组名
    onclick: async (/** @type {Event} */ e) => {
      if (!(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('privacy.restore_ask', { name }), yes: t('privacy.restore'), no: t('privacy.cancel') }))) return;
      store(restoreChange(add, remove));
    },
  }, icon('rotate-ccw'));
  const body = fold(dialog, pair.add, off,
    add.description ? h('p.set-desc.pv-desc', add.description) : null,
    h('div.pv-box', h('div.pv-find', icon('search'), find, plus, restore), list),
    error);
  return h('section.set-group',
    h('h3.set-group-name', name),
    others.length ? h('div.set-rows', others) : null,
    body);
}

/**
 * 「+」点了在设置框正中弹的窗口（同「添加 MCP 服务」：后面淡遮罩，点遮罩、`Esc`、「取消」收起；2026-10-22 项目主人：原来挂在按钮下面像个下拉框）：
 * 标题照组名，写路径的框（一行一个，`Enter` 加、`Shift+Enter` 换行），「取消」「添加」。`submit` 交回拒了的话（写在窗口里）、空的字（什么也不说，
 * 留着），`null` 是成了（收起）。
 * @param {any} dialog @param {string} title @param {string} hint @param {(text: string) => Promise<string|null>} submit
 */
function openAdd(dialog, title, hint, submit) {
  const t = (/** @type {string} */ k) => dialog.ctx.text(k);
  dialog.panel.querySelector('.pv-add-modal')?.remove();
  const input = /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.pv-input', { rows: 6, placeholder: hint, spellcheck: 'false', autocomplete: 'off' }));
  const error = h('p.set-error', { hidden: true });
  const close = () => leave(modal, () => modal.remove());
  const go = async () => {
    const why = await submit(input.value);
    if (why === null) { close(); return; }
    error.hidden = !why;
    error.textContent = why;
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); }
  });
  const pop = h('div.set-tool-pop.pv-add-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.set-tool-pop-head', h('strong', title),
      h('button.icon-button', { type: 'button', title: t('close'), 'aria-label': t('close'), onclick: () => close() }, icon('x'))),
    input, error,
    h('div.set-tool-pop-foot', h('button.set-btn', { type: 'button', onclick: () => close() }, t('privacy.cancel')), h('button.set-btn.is-primary', { type: 'button', onclick: go }, t('privacy.add'))));
  const modal = h('div.set-tool-modal.pv-add-modal', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, pop);
  modal.addEventListener('set-dismiss', close);
  dialog.panel.append(modal);
  input.focus();
}

/**
 * 设置页右边那一栏的最底下垫 `px` 高的空（`--set-hold`）：收起页尾那一块时滚着的位置不往回缩。垫的只留够现在这个位置要的那么多，往上滚了跟着缩，缩到 0 就不管了。
 * @param {HTMLElement} el 收起的那一块 @param {number} px
 */
function holdBottom(el, px) {
  const box = /** @type {HTMLElement|null} */ (el.closest('.set-body'));
  if (!box) return;
  const held = () => Number.parseFloat(box.style.getPropertyValue('--set-hold')) || 0;
  box.style.setProperty('--set-hold', `${held() + px}px`);
  const trim = () => {
    // 不垫的话内容多高；现在这个位置往下还要多少才够得着窗口底
    const need = Math.max(0, Math.ceil(box.scrollTop + box.clientHeight - (box.scrollHeight - held())));
    if (need < held()) box.style.setProperty('--set-hold', `${need}px`);
    if (need === 0) {
      box.style.removeProperty('--set-hold');
      box.removeEventListener('scroll', trim);
    }
  };
  box.addEventListener('scroll', trim, { passive: true });
  setTimeout(trim, FOLD_MS * 2);
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
  const el = h('div.pv-fold', h('div.pv-body', ...kids));
  const was = (dialog.pvOff ??= {})[key];
  if (!was) dialog.pvOff[key] = { off, at: -Infinity };
  // 重画的那一块当场接着走（照上一次量的高）：放进页面以后页面会照原来的位置滚回去，这时它要已经是走到一半的高，不然先量成 0、整页往上一跳
  // （2026-10-22 项目主人：受保护的路径那一组在最底下，拨开关整页跳一下）；还没量过的进了页面再量
  fold.go(dialog, key, off, el);
  if (!dialog.pvOff[key].full) queueMicrotask(() => { if (el.isConnected) fold.go(dialog, key, off, el); });
  return el;
}

/**
 * 把那一块拨到开着、关着：跟记下的不一样的从这一刻起走，一样的照记下的那一刻接着走（走完了的直接是那个样子）。
 * @param {any} dialog @param {string} key @param {boolean} off @param {HTMLElement} el `div.pv-fold`
 */
fold.go = (dialog, key, off, el) => {
  const now = performance.now();
  if (dialog.pvOff[key].off !== off) dialog.pvOff[key] = { off, at: now, full: dialog.pvOff[key].full };
  const body = /** @type {HTMLElement} */ (el.firstElementChild);
  for (const a of [...el.getAnimations(), ...body.getAnimations()]) a.cancel();
  const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-scale'));
  const ms = FOLD_MS * (Number.isFinite(scale) ? scale : 1);
  const since = now - dialog.pvOff[key].at;
  const moving = ms > 0 && since < ms;
  // 先量、先垫，再换成收着的样子、接上动画：换了以后再量会照高 0 排一遍，滚着的位置当场往回缩（整页跳一下）
  // 照里面那一块实际多高走（收着的时候外面高 0，里面照样排着）；不在页面里的照上一次量的
  if (moving && el.isConnected && body.offsetHeight) dialog.pvOff[key].full = body.offsetHeight;
  // 收起的是页尾那一块时（受保护的路径在最底下）：底下先垫上收掉的那么高，整页不跟着往下滑，只有表收起；往上滚的时候垫的跟着缩回去
  // （2026-10-22 项目主人：拨开关的动画怪怪的，录屏里整页跳了一下）
  if (moving && off && el.isConnected && since === 0 && dialog.pvOff[key].full) holdBottom(el, dialog.pvOff[key].full);
  el.classList.toggle('is-off', off);
  el.inert = off;
  if (!moving || !dialog.pvOff[key].full) return;
  const full = `${dialog.pvOff[key].full}px`;
  const go = (/** @type {Element} */ node, /** @type {Keyframe[]} */ frames) => { node.animate(frames, { duration: ms, easing: 'ease' }).currentTime = since; };
  go(el, off ? [{ height: full }, { height: '0px' }] : [{ height: '0px' }, { height: full }]);
  go(body, off ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }]);
};
