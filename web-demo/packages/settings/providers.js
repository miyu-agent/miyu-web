// @ts-check
//! 「模型」页的「供应商」（蓝图 `web.md`「设置页」第 14 条；2026-10-11 项目主人看过说丑，改成这样）：左边一家一格两行（图标、名称，
//! 下面用不了的原因或者地址的主机名，同名的两家靠它分开）；右边头上图标、名称、地址和「测试连接」「编辑」，没设密钥的直接一个框
//! 填，模型一个一行（名字、「1M 上下文 · 看图」），点一行滑进详情（`model-detail.js`）。接口只在编辑表里（`provider-form.js`）。

import { h, icon, replace } from '../../src/lib/dom.js';
import { hasLogos, logoEl } from '../../src/lib/logo.js';
import { duplicates, inputText, providerName, hostOf, whereOf, sameNamed, layerFor, secretName, keyChange, providerRemoval } from './model.js';
import { modelName, metaOf, sharedState, loadingRow, searchable, refreshProvider, testLine } from './model-bits.js';
import { openForm } from './provider-form.js';
import { secretScope, secretTag } from './rows.js';
import { confirmIn } from './confirm.js';
import { openAdd } from './add-provider.js';
import { drawer } from './model-detail.js';

/** @param {any} dialog @param {{providers?: any[]}} list `model.list` */
export function drawProviders(dialog, list) {
  const ctx = dialog.ctx;
  const all = list.providers ?? [];
  // 记着的那一家（刚建好、模型列表还没读回来的）不在表里时先看第一家，不改记着的
  const p = all.find((x) => x.id === dialog.provider) ?? all[0];
  const logos = hasLogos(all);
  const same = sameNamed(all);
  const side = h('div.set-prov-list',
    all.map((x) => providerItem(dialog, x, x.id === p?.id, logos, same.has(x.id))),
    h('button.set-prov.is-add', { type: 'button', onclick: () => openAdd(dialog) }, icon('plus'), h('span', ctx.text('models.add_provider'))));
  if (!p) return h('div.set-prov-wrap', side);
  const main = h('div.set-prov-main', head(dialog, p, logos), keyBlock(dialog, p), models(dialog, p));
  // 详情盖着右边整栏（挂在 `.set-main` 上，滚正文时它不跟着走）
  const detail = dialog.modelDetail ? drawer(dialog, p, (p.models ?? []).find((m) => m.model === dialog.modelDetail)) : null;
  if (detail) {
    // 存了一项重画时还是同一个模型：不再滑进来一次
    if (dialog.drawerFor === dialog.modelDetail) detail.classList.add('is-settled');
    dialog.panel.querySelector('.set-main')?.append(detail);
  }
  dialog.drawerFor = dialog.modelDetail;
  return h('div.set-prov-wrap', side, main);
}

/**
 * 左边一格：图标、名称，下面暗色小字：用不了的原因（warn 色），能用的写地址的主机名；和别家同名的多一行地址从哪来（主机名、
 * `$环境变量`），好分开。
 */
function providerItem(dialog, x, on, logos, same) {
  const ctx = dialog.ctx;
  const shared = sharedState(x.models ?? []);
  const reason = shared ? h('small.is-warn', ctx.text(`models.short_states.${shared}`)) : null;
  const where = same ? whereOf(x.base_url) : reason ? null : hostOf(x.base_url);
  // 两样都有的各占一行（一行放不下，原因会被截掉）
  const sub = [where ? h('small', where) : null, reason];
  return h(`button.set-prov${on ? '.is-on' : ''}`, {
    type: 'button',
    onclick: () => { dialog.provider = x.id; dialog.modelDetail = null; dialog.keyEdit = null; dialog.tested = null; if (dialog.modelQuery) dialog.modelQuery.providers = ''; dialog.drawBody(); },
  }, logos ? logoEl(x.logo ?? null, providerName(x)) : null, h('span.set-prov-text', h('span', providerName(x)), sub));
}

/** 头上：图标、名称、地址，「测试连接」「编辑」；接口是猜的写一行；测试的结果写在下面。 */
function head(dialog, p, logos) {
  const ctx = dialog.ctx;
  const address = typeof p.base_url === 'object' && p.base_url?.env ? ctx.text('from_env', { name: p.base_url.env }) : inputText(p.base_url);
  // 测的结果记在弹窗上（`dialog.tested`）：测成了会重读这一家的模型、整块重画，结果照它画回来（原来写在这一次画的元素上，重画就没了）
  const shown = dialog.tested?.id === p.id ? dialog.tested : null;
  const result = h(`p.set-test${shown?.tone ? `.is-${shown.tone}` : ''}`, { hidden: !shown }, shown ? (shown.text ?? icon('loader-circle')) : null);
  const show = (/** @type {{id: string, tone?: string, text?: string}} */ next) => {
    dialog.tested = next;
    result.hidden = false;
    result.className = `set-test${next.tone ? ` is-${next.tone}` : ''}`;
    replace(result, next.text ?? icon('loader-circle'));
  };
  const test = h('button.set-btn', { type: 'button', disabled: !!shown && shown.text == null, onclick: async () => {
    test.disabled = true;
    show({ id: p.id });
    try {
      const r = await ctx.core.request('provider.test', { provider: p.id, ...(dialog.modelDetail ? { model: dialog.modelDetail } : {}) });
      show({ id: p.id, tone: r.ok ? 'good' : 'bad', text: testLine(ctx, r) });
      // 测成了：核心顺手存了供应商列出来的模型，重读这一家
      if (r.ok) refreshProvider(dialog, p.id, false);
    } catch (err) {
      show({ id: p.id, tone: 'bad', text: err.message });
    }
    test.disabled = false;
  } }, ctx.text('models.test'));
  const logo = logos ? logoEl(p.logo ?? null, providerName(p)) : null;
  logo?.classList.add('is-big');
  // 别的「用不了」（没有密钥的在密钥那一块说）在头下面写一次
  const shared = sharedState(p.models ?? []);
  return h('div.set-prov-head',
    h('div.set-prov-title', logo, h('div', h('strong', providerName(p)), h('span', { title: address }, address)),
      h('div.set-prov-buttons', test, h('button.set-btn', { type: 'button', onclick: openForm(dialog, p.id) }, ctx.text('models.edit')), removeButton(dialog, p))),
    // 核心推不出接口、先照 openai-chat 用的（`driver_from: default`，核心 8-26）：写明是猜的，猜错了请求会出错
    p.driver_from === 'default' ? h('p.set-prov-note', ctx.text('models.driver_guess_line', { driver: p.driver ?? '' })) : null,
    shared && shared !== 'no_key' ? h('p.set-prov-warn', ctx.text(`models.states.${shared}`)) : null,
    result);
}

/**
 * 「删除」（2026-10-19 项目主人：原来少了删除）：弹窗问一句（2026-10-20 项目主人：不要点一下变「确认删除」），默认模型用的是它的问的话里写上；
 * 确认了照写着这一家的那一层把 `providers.<id>.*` 各 `unset`。这一层没写它的（别的层写的、核心自带的）不出这个按钮。
 * @param {any} dialog @param {any} p
 */
function removeButton(dialog, p) {
  const ctx = dialog.ctx;
  const template = dialog.schema.items.find((/** @type {any} */ i) => i.key === 'providers.<id>.driver');
  const layer = layerFor(template ?? { layers: ['personal'] });
  const removal = providerRemoval(p.id, dialog.got, layer);
  if (!removal.length) return null;
  const chat = dialog.got?.items?.['models.chat']?.value;
  const inUse = typeof chat === 'string' && chat.startsWith(`${p.id}/`);
  const note = h('small.set-prov-danger', { hidden: true });
  const button = h('button.set-btn', { type: 'button', onclick: async () => {
    const text = ctx.text(inUse ? 'models.remove_confirm_in_use' : 'models.remove_confirm', { name: providerName(p) });
    if (!await confirmIn(button, { text, yes: ctx.text('ask_yes'), no: ctx.text('ask_no') })) return;
    button.setAttribute('disabled', '');
    const why = await dialog.saveMany(layer, removal);
    if (why) {
      button.removeAttribute('disabled');
      note.textContent = why;
      note.hidden = false;
      return;
    }
    dialog.provider = null;
    dialog.modelDetail = null;
    dialog.drawBody();
  } }, ctx.text('models.remove'));
  return h('span.set-prov-remove', button, note);
}

/**
 * 密钥（一家一个，核心 8-25）：写了、取不到的一块淡的 warn 底，直接填（粘贴，或者改用环境变量）；设了的一行「已设置」和「更换」。
 * 配置里没写密钥的（没有 `key` 这一格：核心照不带认证头用，本机的服务这类）同样一个框能补，不写「不可用」（2026-10-13 验收 W-139）。
 * 存的先后同编辑表：粘贴的先 `secret.set` 存成新名字，再一条 `config.set` 写引用。明文只在框里，存完就扔。
 */
function keyBlock(dialog, p) {
  const ctx = dialog.ctx;
  const t = (k, f) => ctx.text(`models.${k}`, f);
  const key = p.key ?? { set: false, ref: null };
  const unwritten = !p.key;
  const changing = dialog.keyEdit === p.id;
  if (key.set && !changing) {
    // 存在哪一份照 `secret.list`（「已设置 · 大家共用」「已设置 · 只给我」，蓝图「连核心」第 1 条「存密钥存到哪一份」）
    const state = key.ref?.startsWith('env:') ? ctx.text('from_env', { name: key.ref.slice(4) }) : t('key_saved') + secretTag(dialog, key.ref);
    return h('div.set-key-line', h('span', t('key')), h('span.set-key-state', state),
      h('button.set-btn.is-small', { type: 'button', onclick: () => { dialog.keyEdit = p.id; dialog.drawBody(); } }, t('key_change')));
  }
  dialog.keyKind ??= 'secret';
  const kind = dialog.keyKind;
  const field = /** @type {HTMLInputElement} */ (h('input.set-input', kind === 'secret'
    ? { type: 'password', placeholder: ctx.text('models.form.key_paste'), autocomplete: 'off' }
    : { type: 'text', placeholder: 'DEEPSEEK_API_KEY', spellcheck: 'false', autocomplete: 'off' }));
  const error = h('p.set-error', { hidden: true });
  // 管理员选存到哪一份；成员只有自己那一份（环境变量的不出）
  const scope = kind === 'secret' ? secretScope(dialog) : { el: null, params: () => ({}) };
  const save = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: async () => {
    const text = field.value.trim();
    if (!text) return field.focus();
    save.disabled = true;
    error.hidden = true;
    const template = dialog.schema.items.find((i) => i.key === 'providers.<id>.key') ?? dialog.schema.items.find((i) => i.key === 'providers.<id>.driver');
    const layer = layerFor(template ?? { layers: ['personal'] });
    let ref;
    if (kind === 'secret') {
      const name = secretName(p.id, Date.now());
      try {
        await ctx.core.request('secret.set', { name, value: text, ...scope.params() });
      } catch (err) {
        save.disabled = false;
        error.textContent = err.message;
        error.hidden = false;
        return;
      }
      field.value = '';
      ref = { secret: name };
    } else ref = { env: text };
    const why = await dialog.saveMany(layer, keyChange(p.id, ref, dialog.got, layer));
    if (why) {
      save.disabled = false;
      error.textContent = why;
      error.hidden = false;
      return;
    }
    // 等模型列表读回来（这一家的模型从「未设置密钥」变成能用）再画
    dialog.keyEdit = null;
    await dialog.modelsPromise;
    dialog.drawBody();
  } }, t('key_save')));
  // 打了字的算正在改：别处改了配置也不重画冲掉它（`dialog.editing()`），焦点走了再补画
  field.addEventListener('input', () => { field.dataset.dirty = '1'; });
  field.addEventListener('blur', () => { delete field.dataset.dirty; dialog.flush(); });
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); });
  const swap = h('button.set-link', { type: 'button', onclick: () => { dialog.keyKind = kind === 'secret' ? 'env' : 'secret'; dialog.drawBody(); } }, t(kind === 'secret' ? 'key_use_env' : 'key_use_paste'));
  const cancel = changing ? h('button.set-btn', { type: 'button', onclick: () => { dialog.keyEdit = null; dialog.drawBody(); } }, ctx.text('models.form.cancel')) : null;
  const missing = !key.set && !unwritten;
  return h(`div.set-key-block${missing ? '.is-missing' : ''}`,
    missing ? h('p.set-key-why', t('states.no_key')) : null,
    unwritten ? h('span.set-key-label', t('key')) : null,
    h('div.set-key-row', field, scope.el, save, cancel, swap),
    error);
}

/** 模型：一行「模型 N」和搜索框，下面一个一行；点一行滑进详情。 */
function models(dialog, p) {
  const ctx = dialog.ctx;
  const all = p.models ?? [];
  // 还没有模型的一家：请核心去拉一次（这个弹窗里每家一次），拉的时候写「正在读模型列表」
  if (!all.length && !dialog.refreshed?.has(p.id)) queueMicrotask(() => refreshProvider(dialog, p.id, true));
  if (!all.length) return dialog.loadingProvider === p.id || dialog.modelsLoading ? loadingRow(ctx) : h('p.set-empty', ctx.text('models.no_models'));
  const shared = sharedState(all);
  const dup = duplicates(all.map(modelName));
  const rows = all.map((m) => ({
    name: modelName(m), model: m.model,
    node: h(`button.set-model${dialog.modelDetail === m.model ? '.is-on' : ''}`, { type: 'button', onclick: () => { dialog.modelDetail = m.model; dialog.drawBody(); } },
      h('span.set-model-name', modelName(m), dup.has(modelName(m)) ? h('code.set-model-id', m.model) : null),
      !shared && m.state && m.state !== 'ok' ? h('em.set-model-state', ctx.text(`models.states.${m.state}`)) : null,
      h('span.set-model-meta', metaOf(ctx, m, true))),
  }));
  const find = searchable(dialog, 'providers', rows);
  return h('section.set-models',
    h('div.set-models-head', h('span', ctx.text('models.count', { count: all.length })), find.input),
    h('div.set-model-list', rows.map((r) => r.node)),
    find.empty);
}
