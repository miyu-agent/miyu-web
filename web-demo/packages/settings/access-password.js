// @ts-check
//! 访问密码（核心 SU-1 补；蓝图 `web.md`「设置页」第 12c 条第 2 款）：「访问」卡片里那一行（设没设、「设置」「修改」，点了下面展开一格）、
//! 没设密码时打开局域网弹的那个小窗（W-1153）、密码框右边的眼睛（登录那一屏、第一次引导也用）。

import { h, icon } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';

/**
 * 密码框右边一个眼睛：点了看得见写的字，再点藏起来（同登录那一屏的）；不进 Tab 的先后，按 Tab 到下一个框。第一次引导设访问密码那一格也用
 * （经服务 `settings` 的 `lan.secret`，W-1086）。
 * @param {HTMLInputElement} input @param {(k: string) => string} t
 */
export function withEye(input, t) {
  const eye = h('button.acc-eye', {
    type: 'button', tabindex: '-1', title: t('account.password_show'), 'aria-label': t('account.password_show'), 'aria-pressed': 'false',
    onmousedown: (/** @type {MouseEvent} */ e) => e.preventDefault(),
    onclick: () => {
      const shown = input.type === 'password';
      input.type = shown ? 'text' : 'password';
      const label = t(shown ? 'account.password_hide' : 'account.password_show');
      eye.setAttribute('aria-pressed', String(shown));
      eye.title = label;
      eye.setAttribute('aria-label', label);
    },
  }, icon('eye'));
  return h('span.acc-secret', input, eye);
}

/** 一格密码框 @param {(k: string) => string} t @param {string} name 占位的字的键 @param {string} auto `autocomplete` */
const field = (t, name, auto) => /** @type {HTMLInputElement} */ (h('input.set-input', { type: 'password', placeholder: t(name), 'aria-label': t(name), autocomplete: auto, spellcheck: 'false' }));

/** 浏览器记密码照这一格（没有用户名，给一个固定的藏着，同登录那一屏；不然会把上面的「端口」当成用户名） */
const hiddenUser = () => h('input', { type: 'text', autocomplete: 'username', value: 'Miyu', hidden: true, readonly: true, tabindex: '-1' });

/**
 * 「访问密码」一行：设没设、右边「设置」或「修改」；点了下面展开一格新的密码，右边一个眼睛（2026-10-31 项目主人：一个框加眼睛直接设，不再输两遍、
 * 本机的不要当前密码），从局域网别的设备连进来的改的时候多「当前访问密码」、「确定」「取消」。旧核心握手不说设没设的不出。
 * @param {any} dialog @returns {HTMLElement[]}
 */
export function passwordRows(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const access = dialog.ctx.host?.access;
  if (!access || access.set() === null) return [];
  const form = h('div.set-form.acc-password-form', { hidden: true });
  const desc = h('p.set-desc');
  const button = h('button.set-btn', { type: 'button', onclick: () => open() });
  const label = () => {
    desc.textContent = t(access.set() ? 'account.password_is_set' : 'account.password_unset');
    desc.classList.toggle('acc-lan-warn', !access.set());
    button.textContent = t(access.set() ? 'account.password_change' : 'account.password_set');
  };
  label();
  const close = () => { form.hidden = true; form.replaceChildren(); button.hidden = false; };
  // 设置框的 `Esc` 交到这里：点开着的收起来
  form.addEventListener('set-dismiss', close);
  const open = () => {
    const old = access.needsOld() ? field(t, 'account.password_old', 'current-password') : null;
    const fresh = field(t, 'account.password_new', 'new-password');
    const error = h('p.set-error', { hidden: true });
    const ok = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: () => submit() }, t('account.ok')));
    const fail = (/** @type {string} */ why) => { error.textContent = why; error.hidden = false; };
    const submit = async () => {
      const why = access.problem(fresh.value, fresh.value);
      if (why) return fail(why);
      ok.disabled = true;
      const refused = await access.change(fresh.value, old ? old.value : null);
      ok.disabled = false;
      if (refused) return fail(refused);
      close();
      label();
      dialog.toast(t('account.password_done'));
      dialog.drawBody?.();
    };
    for (const input of [old, fresh]) input?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) submit(); });
    form.replaceChildren(hiddenUser(), h('div.set-form-keyrow', old ? withEye(old, t) : null, withEye(fresh, t)), error,
      h('div.set-form-buttons', h('button.set-btn', { type: 'button', onclick: close }, t('account.cancel')), ok));
    form.hidden = false;
    button.hidden = true;
    queueMicrotask(() => (old ?? fresh).focus());
  };
  return [h('div.set-row', h('div.set-text', h('div.set-name', h('span', t('account.password'))), desc), h('div.acc-actions', button)), form];
}

/**
 * 没设访问密码时打开局域网：弹一个小窗先设（W-1153，2026-11-11 项目主人：密码那一行太靠下，人会忽略要设访问密码；「在没有设置访问密码的
 * 第一次开启此功能的时候直接弹出浮动窗口提示要设置访问密码」）。盖住设置框的一层、正中一张小卡片（同删除前问一句的那一层，`confirm.js`）：
 * 一句为什么、一格密码（带眼睛）、「取消」「确定」；回车同「确定」，`Esc`、点外面、「取消」都是不设。设成了交 `true`，没设交 `false`。
 * @param {any} dialog @param {Element|null} from 点的那个开关（找它所在的设置框）
 * @returns {Promise<boolean>}
 */
export function askPassword(dialog, from) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const access = dialog.ctx.host?.access;
  const host = from?.closest('.set-panel') ?? document.body;
  host.querySelector(':scope > .set-ask')?.remove();
  const back = /** @type {HTMLElement|null} */ (document.activeElement);
  return new Promise((resolve) => {
    let done = false;
    const answer = (/** @type {boolean} */ set) => {
      if (done) return;
      done = true;
      resolve(set);
      leave(layer, () => layer.remove());
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
    const fresh = field(t, 'account.password_new', 'new-password');
    const error = h('p.set-error', { hidden: true });
    const ok = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: () => submit() }, t('account.ask_password_ok')));
    const fail = (/** @type {string} */ why) => { error.textContent = why; error.hidden = false; };
    const submit = async () => {
      const why = access.problem(fresh.value, fresh.value);
      if (why) return fail(why);
      ok.disabled = true;
      const refused = await access.change(fresh.value, null);
      ok.disabled = false;
      if (refused) return fail(refused);
      dialog.toast(t('account.password_done'));
      answer(true);
    };
    fresh.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } });
    const title = t('account.ask_password_title');
    const card = h('div.set-ask-card.acc-ask', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('strong.acc-ask-title', title),
      h('p.set-ask-text', t('account.ask_password_text')),
      h('div.acc-ask-field', hiddenUser(), withEye(fresh, t), error),
      h('div.set-ask-foot', h('button.set-btn', { type: 'button', onclick: () => answer(false) }, t('account.cancel')), ok));
    const layer = h('div.set-ask', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) answer(false); } }, card);
    // 设置框的 `Esc` 先找开着的 `[data-set-dismiss]`，交到这里
    layer.addEventListener('set-dismiss', () => answer(false));
    layer.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && host === document.body) { e.stopPropagation(); answer(false); }
    });
    host.append(layer);
    fresh.focus({ preventScroll: true });
  });
}
