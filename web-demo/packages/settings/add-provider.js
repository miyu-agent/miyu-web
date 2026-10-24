// @ts-check
//! 「模型」页的「＋ 添加供应商」（蓝图 `web.md`「第一次引导」第 12 条：和引导用同一份，2026-10-08 项目主人）：一个浮窗里接一家供应商的
//! 几屏（`onboard/flow.js`，设置页的那一种：最后的按钮是「保存」，只写这一家）。浮窗同 MCP「添加服务」（`mcp-form.js`：盖一层淡底、正中一张卡，
//! 进出照它的动画，2026-10-24 项目主人：原来占了右边整页），后面的供应商列表不动。存好了关上浮窗、选中它。还想照原来那张表一项项填的
//! （自己起编号、写显示名、写环境变量名），选一家那一屏最下面「手动填写…」关上浮窗、打开原来的表（`provider-form.js`）。
//! 浮窗挂在设置框上、不在正文里：收到配置推送整页重画时它不动，写了一半的字不丢。

import { h, icon, replace } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { ProviderFlow } from './onboard/flow.js';

/** 开始添加：开浮窗，先画选一家。 @param {any} dialog */
export function openAdd(dialog) {
  dialog.panel.querySelector('.set-add-modal')?.remove();
  dialog.modelDetail = null;
  dialog.providerForm = null;
  const pop = h('div.set-tool-pop.set-add-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': dialog.ctx.text('models.add_provider') });
  /** 现在这一屏：`Esc`、点外面照它走 @type {import('./onboard/flow.js').Screen|null} */
  let current = null;
  const close = () => {
    if (!modal.isConnected || modal.classList.contains('is-leaving')) return;
    leave(modal, () => modal.remove());
  };
  // `Esc`：在一家那一屏回到选一家，选一家那一屏关掉；点外面关掉
  const modal = h('div.set-tool-modal.set-add-modal', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, pop);
  modal.addEventListener('set-dismiss', () => (current?.back ? current.back() : close()));
  /** @type {HTMLElement|null} */
  let node = null;
  const flow = new ProviderFlow(dialog.ctx, {
    panel: dialog.panel,
    show: (screen) => {
      if (!modal.isConnected) return;
      current = screen;
      node = frame(dialog, screen, close);
      replace(pop, node);
    },
    ready: () => node?.dispatchEvent(new CustomEvent('ob-ready')),
    done: (got) => {
      close();
      dialog.provider = got.id;
      // 管理员模式里加的写在系统配置（「共用」那一块），平时的在「自用」
      dialog.providerSide = dialog.ctx.admin?.on ? 'shared' : 'mine';
      Promise.resolve(dialog.modelsPromise).then(() => dialog.drawBody());
    },
    manual: () => {
      close();
      dialog.providerForm = { id: null };
      dialog.drawBody();
    },
  }, 'settings');
  replace(pop, h('p.set-empty', dialog.ctx.text('loading')));
  dialog.panel.append(modal);
  flow.start();
}

/**
 * 浮窗里的一屏（同 MCP「添加服务」的浮窗）：头上标题、右边 ✕，内容、出错的字，下面一排「‹ 上一步」或「取消」、「保存」。
 * @param {any} dialog @param {import('./onboard/flow.js').Screen} screen @param {() => void} close
 */
function frame(dialog, screen, close) {
  const t = (/** @type {string} */ key) => dialog.ctx.text(key);
  const error = h('p.set-error', { hidden: true });
  const next = screen.next;
  const labelOf = () => (typeof next?.label === 'function' ? next.label() : next?.label ?? '');
  const save = next ? /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: async () => {
    if (!next.ready() || save.disabled) return;
    save.disabled = true;
    error.hidden = true;
    const why = await next.run();
    if (why) {
      error.textContent = why;
      error.hidden = false;
    }
    sync();
  } }, labelOf())) : null;
  // 能不能点、写什么（测试连接那一屏的跟着测的结果变：「测试连接」「正在测试…」「保存」「跳过」）
  const sync = () => {
    if (!save) return;
    save.disabled = !next?.ready();
    if (save.textContent !== labelOf()) save.textContent = labelOf();
  };
  sync();
  const back = screen.back
    ? h('button.set-btn', { type: 'button', onclick: screen.back }, icon('chevron-left'), t('onboard.back'))
    : h('button.set-btn', { type: 'button', onclick: close }, t('models.form.cancel'));
  const el = h('section.ob-in-settings',
    h('div.set-tool-pop-head', h('strong', screen.title || t('models.add_provider')),
      h('button.icon-button', { type: 'button', title: t('close'), 'aria-label': t('close'), onclick: close }, icon('x'))),
    screen.sub ? h('p.set-desc', screen.sub) : null,
    screen.body, error, h('div.set-tool-pop-foot', back, save));
  el.addEventListener('ob-ready', sync);
  if (screen.focus) queueMicrotask(() => screen.focus?.focus({ preventScroll: true }));
  return el;
}
