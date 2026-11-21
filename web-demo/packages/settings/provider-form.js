// @ts-check
//! 添加、编辑供应商的表（蓝图 `web.md`「设置页」第 14 条，照 `tui.md`「全屏配置页」第 3、7 条）：编号（新建时写）、显示名、地址、
//! 接口、密钥（粘贴或者环境变量）。这一家没有的项（`model.list` 的 `needs` 写 `none`）不画，软件包给的值写成暗的占位字
//! （`provider-fields.js`，核心 FX-11）。存的先后：粘贴了密钥的先 `secret.set` 存成新名字，再一条 `config.set` 写别的几项和密钥的引用。
//! 明文只在框里，存完、取消就扔。
//! 表开在设置框正中的小窗里（同 MCP「添加服务」、模型详情的小窗：淡遮罩、正中一张卡，进出照它们的动画），后面的供应商列表不动；
//! `Esc`、✕、「取消」、点遮罩收起，回到原来的列表。小窗挂在设置框上、不在正文里：收到配置推送整页重画时它不动，写了一半的字不丢。

import { h, icon, replace } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { validId, secretName, providerChanges, LAYER } from './model.js';
import { formPlan, driverToWrite } from './provider-fields.js';
import { select } from './rows.js';

/**
 * 开这张表。`id` 是编辑的那一家，新建是 `null`。
 * @param {any} dialog @param {string|null} id
 */
export function openProviderForm(dialog, id) {
  const ctx = dialog.ctx;
  const t = (/** @type {string} */ k, /** @type {any} */ f) => ctx.text(`models.form.${k}`, f);
  dialog.panel.querySelector('.set-prov-modal')?.remove();
  dialog.modelDetail = null;
  const editing = id;
  const providers = dialog.models?.providers ?? [];
  const p = providers.find((/** @type {any} */ x) => x.id === editing) ?? null;
  const template = (/** @type {string} */ field) => dialog.schema.items.find((/** @type {any} */ i) => i.key === `providers.<id>.${field}`);
  const layer = LAYER;

  const input = (/** @type {any} */ attrs) => /** @type {HTMLInputElement} */ (h('input.set-input', { type: 'text', spellcheck: 'false', autocomplete: 'off', ...attrs }));
  const idField = editing ? h('strong.set-form-fixed', editing) : input({ placeholder: t('id_hint') });
  const nameWritten = p?.name && typeof p.name === 'object' && p.name.from === 'config' ? p.name.value : '';
  // 占位写空着时显示什么：编辑的照现在退到的名字（目录的、编号），新建的是编号
  const fallback = p && typeof p.name === 'object' && p.name.from !== 'config' ? p.name.value : editing;
  const nameField = input({ value: nameWritten, placeholder: fallback ? t('name_empty', { name: fallback }) : t('name_empty_new') });
  // 画哪几项、包给的值（核心 FX-11）：地址是环境变量引用的、包给的，框空着就是不改（占位写「来自环境变量 X」、包给的地址）
  const plan = formPlan(p, dialog.got, editing);
  const hint = plan.url?.hint;
  const urlField = plan.url ? input({ value: plan.url.value, placeholder: hint && 'env' in hint ? ctx.text('from_env', { name: hint.env }) : hint && 'package' in hint ? hint.package : 'https://…' }) : null;
  // 接口：用这一页自己的下拉（浏览器自带的下拉有边框），选了换掉按钮
  const drivers = template('driver')?.options ?? [];
  let driver = plan.driver.current ?? drivers[0]?.value ?? '';
  const driverBox = h('div.set-form-select');
  const drawDriver = () => replace(driverBox, select(dialog, drivers, driver, (/** @type {string} */ v) => { driver = v; drawDriver(); }));
  drawDriver();
  // 密钥：粘贴（密码框，编辑时空着是不改）或者环境变量的名字
  const keyRef = p?.key?.ref ?? '';
  let keyKind = keyRef.startsWith('env:') ? 'env' : 'secret';
  const secretField = input({ type: 'password', placeholder: p?.key?.set ? t('key_keep') : t('key_paste') });
  const envField = input({ value: keyRef.startsWith('env:') ? keyRef.slice(4) : '', placeholder: 'DEEPSEEK_API_KEY' });
  const keyBox = h('div.set-form-key');
  const kindButtons = ['secret', 'env'].map((kind) => h('button.set-seg-item', { type: 'button', onclick: () => { keyKind = kind; drawKey(); } }, t(`key_${kind}`)));
  const drawKey = () => {
    kindButtons.forEach((b, n) => b.classList.toggle('is-on', ['secret', 'env'][n] === keyKind));
    replace(keyBox, keyKind === 'secret' ? secretField : envField);
  };
  drawKey();

  const close = () => {
    if (!modal.isConnected || modal.classList.contains('is-leaving')) return;
    leave(modal, () => modal.remove());
  };
  const error = h('p.set-error', { hidden: true });
  const fail = (/** @type {string} */ why) => { error.textContent = why; error.hidden = false; saveButton.disabled = false; };
  const saveButton = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: async () => {
    error.hidden = true;
    const id = editing ? editing : /** @type {HTMLInputElement} */ (idField).value.trim();
    if (!editing && !validId(id)) return fail(t('bad_id'));
    if (!editing && providers.some((/** @type {any} */ x) => x.id === id)) return fail(t('taken_id', { id }));
    saveButton.disabled = true;
    let secret = null;
    if (keyKind === 'secret' && secretField.value) {
      secret = secretName(id, Date.now());
      try {
        await ctx.core.request('secret.set', { name: secret, value: secretField.value });
      } catch (err) {
        return fail(/** @type {any} */ (err).message);
      }
      secretField.value = '';
    }
    const form = {
      name: nameField.value,
      base_url: !urlField || (plan.url?.keepWhenEmpty && !urlField.value.trim()) ? null : urlField.value,
      driver: driverToWrite(plan, driver),
      key: { kind: /** @type {'secret'|'env'|'keep'} */ (!plan.key || (keyKind === 'secret' && !secret) ? 'keep' : keyKind), value: envField.value },
    };
    const why = await dialog.saveMany(layer, providerChanges(id, form, dialog.got, layer, secret));
    if (why) return fail(secret ? `${why}\n${t('secret_kept', { name: secret })}` : why);
    // 等模型列表读回来（新建的那一家要在表里）再收起小窗，选中它
    await dialog.modelsPromise;
    close();
    dialog.provider = editing ?? id;
    dialog.drawBody();
  } }, t('save')));
  const title = editing ? t('edit_title', { name: (typeof p?.name === 'object' ? p.name.value : p?.name) || editing }) : t('new_title');
  const pop = h('div.set-tool-pop.set-prov-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div.set-tool-pop-head', h('strong', title),
      h('button.icon-button', { type: 'button', title: ctx.text('close'), 'aria-label': ctx.text('close'), onclick: close }, icon('x'))),
    h('div.set-prov-form',
      row(t('id'), idField),
      row(t('name'), nameField),
      plan.url ? row(t('url'), urlField) : null,
      row(t('driver'), driverBox),
      plan.key ? row(t('key'), h('div.set-form-keyrow', h('div.set-seg', kindButtons), keyBox)) : null),
    error,
    h('div.set-tool-pop-foot', h('button.set-btn', { type: 'button', onclick: close }, t('cancel')), saveButton));
  const modal = h('div.set-tool-modal.set-prov-modal', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, pop);
  modal.addEventListener('set-dismiss', close);
  dialog.panel.append(modal);
  /** @type {HTMLElement} */ (editing ? nameField : idField).focus();
}

const row = (/** @type {string} */ label, /** @type {any} */ control) => h('label.set-form-row', h('span', label), control);
