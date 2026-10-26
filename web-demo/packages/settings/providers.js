// @ts-check
//! 「模型」页的「供应商」（蓝图 `web.md`「设置页」第 14 条；2026-10-11 项目主人看过说丑，改成这样）：左边一家一格两行（图标、名称，
//! 下面用不了的原因或者地址的主机名，同名的两家靠它分开）；右边头上图标、名称、地址和「测试连接」「编辑」，没设密钥的直接一个框
//! 填，模型一个一行（名字、「1M 上下文 · 看图」），点一行滑进详情（`model-detail.js`）。接口只在编辑表里（`provider-form.js`）。

import { h, icon, replace } from '../../src/lib/dom.js';
import { hasLogos, logoEl } from '../../src/lib/logo.js';
import { duplicates, inputText, providerName, hostOf, whereOf, sameNamed, secretName, keyChange, providerRemoval, providerSides, sharedOpen, providerLayer, keyIn } from './model.js';
import { modelName, metaOf, sharedState, loadingRow, searchable, refreshProvider, testLine } from './model-bits.js';
import { openForm } from './provider-form.js';
import { secretTag } from './rows.js';
import { confirmIn } from './confirm.js';
import { openAdd } from './add-provider.js';
import { drawer } from './model-detail.js';
import { SYSTEM_COPY, baseOf } from '../../src/lib/provider-copy.js';

/** 「共用」那一块开着没有：记在这台设备上（蓝图「设置页」第 14 条「供应商分两块」） */
const SHARED_OPEN = 'settings.shared_open';

/** @param {any} dialog @param {{providers?: any[]}} list `model.list` */
export function drawProviders(dialog, list) {
  const ctx = dialog.ctx;
  const all = list.providers ?? [];
  // 两块（2026-10-24 项目主人定）：自用在上、共用在下，两边都有的两块里各一格
  const { mine, shared, both, layered } = providerSides(all, dialog.got ?? {});
  // 记的是原编号、要看共用那一格的（管理员模式里刚存好、两份都有的一家）：共用那一格是 `<编号>@system`（核心 PL-1）
  const find = (/** @type {string} */ s, /** @type {string} */ id) => (s === 'shared' ? shared : mine).find((x) => x.id === id || (s === 'shared' && x.id === `${id}${SYSTEM_COPY}`));
  // 刚存好的那一家（`add-provider.js` 记的）：模型列表读回来、它在该在的那一块里了才选中它，之前照旧
  const want = dialog.wantProvider;
  const hit = want ? find(want.side, want.id) : null;
  if (want && hit) {
    dialog.provider = hit.id;
    dialog.providerSide = want.side;
    dialog.wantProvider = null;
  }
  const inSide = (/** @type {string} */ s) => find(s, dialog.provider);
  // 记着的那一格（编号、哪一块）；刚建好、模型列表还没读回来的不在表里时先看第一格，不改记着的
  let side = dialog.providerSide === 'shared' ? 'shared' : 'mine';
  let p = inSide(side);
  if (!p && inSide(side === 'mine' ? 'shared' : 'mine')) {
    side = side === 'mine' ? 'shared' : 'mine';
    p = inSide(side);
  }
  // 照记着的找到了的记成它的编号（原编号找到的共用那一格换成 `@system` 的）
  if (p) dialog.provider = p.id;
  if (!p) {
    side = mine.length ? 'mine' : 'shared';
    p = mine[0] ?? shared[0];
  }
  dialog.providerSide = side;
  const logos = hasLogos(all);
  const same = sameNamed(all);
  const stored = ctx.storage?.get(SHARED_OPEN, null);
  const open = sharedOpen(shared.length, typeof stored === 'boolean' ? stored : null);
  // 两块里都有的一家，「共用」那一格不写用不了的原因：核心合出来的状态是自用那一份的
  const item = (/** @type {any} */ x, /** @type {string} */ s) => providerItem(dialog, x, s, x.id === p?.id && s === side, logos, same.has(x.id), !layered && s === 'shared' && both.has(x.id));
  const list_ = h('div.set-prov-list',
    mine.length ? [h('div.set-prov-group', ctx.text('secret_scope.personal')), ...mine.map((x) => item(x, 'mine'))] : null,
    shared.length ? [
      h('button.set-prov-group.is-toggle', {
        type: 'button', 'aria-expanded': String(open),
        onclick: () => { ctx.storage?.set(SHARED_OPEN, !open); dialog.drawBody(); },
      }, icon(open ? 'chevron-down' : 'chevron-right'), h('span', open ? ctx.text('secret_scope.system') : ctx.text('models.shared_folded', { count: shared.length }))),
      ...(open ? shared.map((x) => item(x, 'shared')) : []),
    ] : null,
    h('button.set-prov.is-add', { type: 'button', onclick: () => openAdd(dialog) }, icon('plus'), h('span', ctx.text('models.add_provider'))));
  if (!p) return h('div.set-prov-wrap', list_);
  // 「共用」的只有管理员模式里能改（写系统配置）；平时（成员、没开管理员模式的管理员）只读：名称、地址、密钥那一行「已设置」，
  // 没有测试、编辑、删除、更换，模型点不进详情；那几个按钮的地方写「仅管理员可以修改」（管理员后面隔开一个「进入管理员模式」，成员只有那一句）（蓝图「设置页」第 14 条、「管理员模式」第 4 条）
  // 两块里都有的一家：「共用」那一格的密钥照系统那一层写的那一格（核心合出来的是自用盖过的那一份）
  // 核心给 `layer` 的（PL-1）：共用那一格是 `relay@system` 那一份，状态、密钥、模型都是它自己的，不用另找
  const sharedKey = !layered && side === 'shared' && both.has(p.id) ? keyIn(p.id, dialog.got ?? {}, 'system') : undefined;
  const readonly = side === 'shared' && (!!ctx.host?.member || !ctx.admin?.on);
  // 「优先用这一份」只有旧核心写（两份合成一份、自用盖过共用）；PL-1 起两份各用各的，照选的模型引用
  const view = { readonly, prefer: !layered && side === 'mine' && both.has(p.id), sharedKey, copyable: side === 'shared' && !both.has(baseOf(p.id)) };
  const main = h('div.set-prov-main', head(dialog, p, logos, view), keyBlock(dialog, p, view), models(dialog, p, view));
  // 详情盖着右边整栏（挂在 `.set-main` 上，滚正文时它不跟着走）
  const detail = dialog.modelDetail ? drawer(dialog, p, (p.models ?? []).find((m) => m.model === dialog.modelDetail)) : null;
  if (detail) {
    // 存了一项重画时还是同一个模型：不再滑进来一次
    if (dialog.drawerFor === dialog.modelDetail) detail.classList.add('is-settled');
    dialog.panel.querySelector('.set-main')?.append(detail);
  }
  dialog.drawerFor = dialog.modelDetail;
  return h('div.set-prov-wrap', list_, main);
}

/**
 * 左边一格：图标、名称，下面暗色小字：用不了的原因（warn 色），能用的写地址的主机名；和别家同名的多一行地址从哪来（主机名、
 * `$环境变量`），好分开。
 */
function providerItem(dialog, x, side, on, logos, same, merged = false) {
  const ctx = dialog.ctx;
  const shared = merged ? null : sharedState(x.models ?? []);
  const reason = shared ? h('small.is-warn', ctx.text(`models.short_states.${shared}`)) : null;
  const where = same ? whereOf(x.base_url) : reason ? null : hostOf(x.base_url);
  // 两样都有的各占一行（一行放不下，原因会被截掉）
  const sub = [where ? h('small', where) : null, reason];
  return h(`button.set-prov${on ? '.is-on' : ''}`, {
    type: 'button',
    onclick: () => { dialog.provider = x.id; dialog.providerSide = side; dialog.wantProvider = null; dialog.modelDetail = null; dialog.keyEdit = null; dialog.tested = null; if (dialog.modelQuery) dialog.modelQuery.providers = ''; dialog.drawBody(); },
  }, logos ? logoEl(x.logo ?? null, providerName(x)) : null, h('span.set-prov-text', h('span', providerName(x)), sub));
}

/**
 * 头上：图标、名称、地址，「测试连接」「编辑」；接口是猜的写一行；测试的结果写在下面。看「共用」的平时（`readonly`）没有按钮，写一行「仅管理员可以修改」；
 * 两块里都有的「自用」那一格名称下面一行「优先用这一份」（核心照自用盖过共用，`prefer`）。
 * @param {any} dialog @param {any} p @param {boolean} logos @param {{readonly?: boolean, prefer?: boolean, copyable?: boolean}} [view]
 */
function head(dialog, p, logos, view = {}) {
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
  // 只有共用、还没有自用那份的：「另配一份自用的」（蓝图「设置页」第 14 条，2026-10-26 项目主人），成员、管理员平时和管理员模式里都有
  const copy = view.copyable ? h('button.set-btn', { type: 'button', onclick: () => openAdd(dialog, { copy: baseOf(p.id) }) }, ctx.text('models.copy_mine')) : null;
  const logo = logos ? logoEl(p.logo ?? null, providerName(p)) : null;
  logo?.classList.add('is-big');
  // 别的「用不了」（没有密钥的在密钥那一块说）在头下面写一次
  const shared = sharedState(p.models ?? []);
  return h('div.set-prov-head',
    h('div.set-prov-title', logo, h('div', h('strong', providerName(p)), h('span', { title: address }, address),
      view.prefer ? h('small.set-prov-prefer', ctx.text('models.prefer_mine')) : null),
      view.readonly ? h('div.set-prov-buttons', copy, dialog.lockLine(true))
        : h('div.set-prov-buttons', copy, test, h('button.set-btn', { type: 'button', onclick: openForm(dialog, p.id) }, ctx.text('models.edit')), removeButton(dialog, p))),
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
  const layer = providerLayer(dialog.providerSide, template);
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
function keyBlock(dialog, p, view = {}) {
  const ctx = dialog.ctx;
  const t = (k, f) => ctx.text(`models.${k}`, f);
  // 照系统那一层写的（两块里都有的「共用」那一格）：设没设照 `secret.list`（环境变量的照合出来的）
  const key = view.sharedKey !== undefined
    ? { set: view.sharedKey?.startsWith('secret:') ? dialog.secretLayers?.get(view.sharedKey.slice(7)) != null : !!view.sharedKey && !!p.key?.set, ref: view.sharedKey }
    : p.key ?? { set: false, ref: null };
  const unwritten = !p.key;
  const changing = dialog.keyEdit === p.id;
  // 只读的「共用」那一格：只一行「已设置」（管理员看得到是哪一份；没设的写没有密钥），换不了
  if (view.readonly) return h('div.set-key-line', h('span', t('key')), h('span.set-key-state', key.set ? t('key_saved') + (ctx.host?.member ? '' : secretTag(dialog, key.ref)) : t('states.no_key')));
  if (key.set && !changing) {
    // 存在哪一份照 `secret.list`（「已设置 · 共用」「已设置 · 自用」，蓝图「连核心」第 1 条「存密钥存到哪一份」）
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
  const save = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: async () => {
    const text = field.value.trim();
    if (!text) return field.focus();
    save.disabled = true;
    error.hidden = true;
    const template = dialog.schema.items.find((i) => i.key === 'providers.<id>.key') ?? dialog.schema.items.find((i) => i.key === 'providers.<id>.driver');
    const layer = providerLayer(dialog.providerSide, template);
    let ref;
    if (kind === 'secret') {
      const name = secretName(p.id, Date.now());
      try {
        await ctx.core.request('secret.set', { name, value: text });
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
    h('div.set-key-row', field, save, cancel, swap),
    error);
}

/** 模型：一行「模型 N」和搜索框，下面一个一行；点一行滑进详情（成员看「共用」的点不进，`readonly`）。 */
function models(dialog, p, view = {}) {
  const ctx = dialog.ctx;
  const all = p.models ?? [];
  // 还没有模型的一家：请核心去拉一次（这个弹窗里每家一次），拉的时候写「正在读模型列表」
  if (!all.length && !dialog.refreshed?.has(p.id)) queueMicrotask(() => refreshProvider(dialog, p.id, true));
  if (!all.length) return dialog.loadingProvider === p.id || dialog.modelsLoading ? loadingRow(ctx) : h('p.set-empty', ctx.text('models.no_models'));
  const shared = sharedState(all);
  const dup = duplicates(all.map(modelName));
  const rows = all.map((m) => ({
    name: modelName(m), model: m.model,
    node: h(view.readonly ? 'div.set-model.is-static' : `button.set-model${dialog.modelDetail === m.model ? '.is-on' : ''}`, view.readonly ? {} : { type: 'button', onclick: () => { dialog.modelDetail = m.model; dialog.drawBody(); } },
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
