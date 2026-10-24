// @ts-check
//! 添加、编辑 MCP 服务的小窗（蓝图 `web.md`「设置页」第 20 条）：设置框正中弹出（同用量页的细则、知识库的新建：后面淡遮罩，点遮罩、`Esc`、
//! 「取消」收起），挂在设置框上（不在右边那一栏里：服务的状态推来重画右边时不冲掉正在填的）。「保存」发 `mcp.set`（整条换），拒了的照核心的话
//! 写在小窗底下，成了收起、重读。

import { h, icon } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { serverParams, formOf, TIMEOUT_DEFAULT_S } from './tool-model.js';
import { refresh } from './tool-pages.js';

/**
 * 开小窗。`server` 是编辑的那一项（`mcp.list` 的），新建是 `null`。
 * @param {any} dialog @param {any|null} server
 */
export function openServerForm(dialog, server) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => dialog.ctx.text(key, fields);
  dialog.panel.querySelector('.set-tool-modal')?.remove();
  const start = server ? formOf(server) : { kind: 'command', name: '', command: '', env: '', url: '', bearer: '', headers: '', timeout: '' };
  /** 本机命令还是网址（核心 X-32 下）：编辑的照它是哪一种，不能换 */
  let kind = start.kind;
  const input = (/** @type {string} */ value, /** @type {string} */ hint, /** @type {boolean} */ mono) => /** @type {HTMLInputElement} */ (h(`input.set-input.set-tool-input${mono ? '.is-mono' : ''}`,
    { type: 'text', value, placeholder: hint, spellcheck: 'false', autocomplete: 'off' }));
  const area = (/** @type {string} */ value, /** @type {string} */ hint) => /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.set-tool-area.is-mono',
    { rows: 3, placeholder: hint, spellcheck: 'false', autocomplete: 'off' }, value));
  const fields = {
    name: input(start.name, t('tools.form.name_hint'), true),
    // 整条命令一个框（2026-10-20 项目主人：命令、参数分两格不合理）
    command: input(start.command, t('tools.form.command_hint'), true),
    env: area(start.env, t('tools.form.env_hint')),
    url: input(start.url, t('tools.form.url_hint'), true),
    bearer: input(start.bearer, t('tools.form.bearer_hint'), true),
    headers: area(start.headers, t('tools.form.headers_hint')),
    timeout: input(start.timeout, String(TIMEOUT_DEFAULT_S), false),
  };
  if (server) fields.name.readOnly = true;
  fields.timeout.inputMode = 'numeric';
  const error = h('p.set-tool-error', { role: 'alert', hidden: true });
  const say = (/** @type {string} */ text, /** @type {HTMLElement|null} */ at) => {
    error.textContent = text;
    error.hidden = false;
    at?.focus();
  };
  const save = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: async () => {
    const got = serverParams({
      kind, name: fields.name.value, command: fields.command.value, env: fields.env.value,
      url: fields.url.value, bearer: fields.bearer.value, headers: fields.headers.value, timeout: fields.timeout.value,
    }, server ?? {});
    if ('problem' in got) {
      say(t(`tools.form.bad.${got.problem}`, { line: got.line ?? 0 }), /** @type {any} */ (fields)[got.field] ?? null);
      return;
    }
    if (dialog.adminGuard()) return;
    save.disabled = true;
    save.textContent = t('tools.form.saving');
    try {
      await dialog.ctx.core.request('mcp.set', got.params);
    } catch (err) {
      save.disabled = false;
      save.textContent = t('tools.form.save');
      say(err?.reason === 'mcp_invalid' && err.data?.problem ? String(err.data.problem) : err?.message ?? String(err), null);
      return;
    }
    close();
    await refresh(dialog, 'mcp');
  } }, t('tools.form.save')));
  const row = (/** @type {string} */ label, /** @type {any} */ control) => h('label.set-tool-field', h('span.set-tool-label', label), control);
  const commandRows = h('div.set-tool-group', row(t('tools.field.command'), fields.command), row(t('tools.form.env'), fields.env));
  const urlRows = h('div.set-tool-group', row(t('tools.field.url'), fields.url), row(t('tools.field.bearer'), fields.bearer), row(t('tools.field.headers'), fields.headers));
  // 添加时最上面一个分段切换「本机命令 | 网址」（2026-10-21 项目主人定）；编辑的不画
  const kindButtons = /** @type {const} */ (['command', 'url']).map((k) => h('button.set-seg-item', { type: 'button', onclick: () => { kind = k; drawKind(); (k === 'url' ? fields.url : fields.command).focus(); } }, t(`tools.form.kind_${k}`)));
  const kinds = server ? null : h('div.set-seg.set-tool-kinds', kindButtons);
  const drawKind = () => {
    commandRows.hidden = kind !== 'command';
    urlRows.hidden = kind !== 'url';
    kindButtons.forEach((b, i) => b.classList.toggle('is-on', (i === 0 ? 'command' : 'url') === kind));
    error.hidden = true;
  };
  const pop = h('div.set-tool-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': server ? t('tools.form.edit_title', { name: server.name }) : t('tools.form.add_title') },
    h('div.set-tool-pop-head', h('strong', server ? t('tools.form.edit_title', { name: server.name }) : t('tools.form.add_title')),
      h('button.icon-button', { type: 'button', title: t('close'), 'aria-label': t('close'), onclick: () => close() }, icon('x'))),
    kinds,
    row(t('tools.field.name'), fields.name),
    commandRows,
    urlRows,
    row(t('tools.form.timeout'), h('div.set-tool-timeout', fields.timeout, h('span', t('tools.form.seconds')))),
    error,
    h('div.set-tool-pop-foot', h('button.set-btn', { type: 'button', onclick: () => close() }, t('tools.form.cancel')), save));
  const modal = h('div.set-tool-modal', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget) close(); } }, pop);
  const close = () => leave(modal, () => modal.remove());
  modal.addEventListener('set-dismiss', close);
  drawKind();
  dialog.panel.append(modal);
  (server ? (kind === 'url' ? fields.url : fields.command) : fields.name).focus();
}
