// @ts-check
//! 新建定时任务的浮窗（蓝图 `web.md`「定时任务」第 1 条）：同 MCP「添加服务」那一个（设置框正中一张卡、后面一层淡遮罩，点遮罩、`Esc`、
//! 「取消」收起，进出同它的动画；挂在 `document.body` 上，设置页重画时不冲掉写了一半的字）。说什么；什么时候（每天 | 每隔 | 一次 | 自定义）；
//! 在哪跑（每次新开会话：人格、预设、工作目录 | 跑在会话）。「新建」发 `schedule.add`，拒了照 `data.problem` 写在那一格下面。

import { h, icon } from '../../src/lib/dom.js';
import { leave } from '../../src/lib/motion.js';
import { whenOf, fieldOf, localZone } from './model.js';

/**
 * 开浮窗。`session` 是从右侧栏卡片点进来的那个会话（「跑在会话」默认选它），别的是 `null`。
 * @param {any} ctx `schedules` 包的 ctx @param {any} kit 设置页交来的控件 @param {import('./store.js').ScheduleStore} store
 * @param {{session: string|null, done: (id: string) => void}} opts
 */
export function openForm(ctx, kit, store, opts) {
  const t = (/** @type {string} */ key, /** @type {any} */ fields) => ctx.text(key, fields);
  document.querySelector('.sch-modal')?.remove();
  /** @type {'daily'|'every'|'once'|'cron'} */
  let kind = 'daily';
  /** @type {'new'|'session'} */
  let where = opts.session ? 'session' : 'new';
  /** 人格：`undefined` 照默认（不写），`null` 无人格 @type {string|null|undefined} */
  let persona;
  /** @type {string|undefined} */
  let preset;
  /** @type {'minutes'|'hours'|'days'} */
  let unit = 'hours';
  const sessions = (ctx.sessions?.index?.all?.() ?? []).filter((/** @type {any} */ e) => !e.parent && !e.oneshot && e.kind !== 'dream');
  let session = opts.session ?? sessions[0]?.session ?? null;
  const titleOf = (/** @type {string} */ id) => ctx.chat?.title?.(id) ?? sessions.find((/** @type {any} */ e) => e.session === id)?.title ?? id;

  const input = (/** @type {string} */ type, /** @type {string} */ value, /** @type {string} */ hint, /** @type {string} */ extra = '') => /** @type {HTMLInputElement} */ (h(`input.set-input.set-tool-input${extra}`,
    { type, value, placeholder: hint || null, spellcheck: 'false', autocomplete: 'off' }));
  const prompt = /** @type {HTMLTextAreaElement} */ (h('textarea.set-input.set-tool-area', { rows: 3, placeholder: t('form.prompt_hint'), spellcheck: 'false' }));
  const time = input('time', '08:00', '');
  const n = input('text', '1', '');
  n.inputMode = 'numeric';
  const at = input('datetime-local', localNow(new Date(Date.now() + 3600_000)), '');
  const cron = input('text', '', '0 8 * * 1-5', '.is-mono');
  const cwd = input('text', '', t('form.cwd_hint'), '.is-mono');

  /** 每一格下面的错（照 `fieldOf` 的格） */
  const errs = {
    prompt: h('p.set-tool-error', { hidden: true }), when: h('p.set-tool-error', { hidden: true }), target: h('p.set-tool-error', { hidden: true }),
    persona: h('p.set-tool-error', { hidden: true }), preset: h('p.set-tool-error', { hidden: true }),
  };
  const bottom = h('p.set-tool-error', { role: 'alert', hidden: true });
  const clear = () => { for (const el of [...Object.values(errs), bottom]) el.hidden = true; };
  const say = (/** @type {HTMLElement} */ el, /** @type {string} */ text) => { el.textContent = text; el.hidden = false; };

  const seg = (/** @type {string[]} */ keys, /** @type {() => string} */ now, /** @type {(k: any) => void} */ pick) => {
    const buttons = keys.map((k) => h('button.set-seg-item', { type: 'button', onclick: () => { pick(k); paint(); } }, t(`form.${k}`)));
    const paint = () => buttons.forEach((b, i) => b.classList.toggle('is-on', keys[i] === now()));
    paint();
    return { el: h('div.set-seg.set-tool-kinds', buttons), paint };
  };
  const kinds = seg(['daily', 'every', 'once', 'cron'], () => kind, (k) => { kind = k; drawKind(); });
  const wheres = seg(['where_new', 'where_session'], () => (where === 'new' ? 'where_new' : 'where_session'), (k) => { where = k === 'where_new' ? 'new' : 'session'; drawWhere(); });

  const units = choose(kit, ['minutes', 'hours', 'days'].map((u) => ({ value: u, name: t(`form.unit.${u}`) })), unit, (/** @type {any} */ v) => { unit = v; });
  const personaBox = choose(kit, [{ value: '', name: t('form.default') }], '', () => {});
  const presetBox = choose(kit, [{ value: '', name: t('form.default') }], '', () => {});
  const sessionBox = sessions.length
    ? choose(kit, sessions.map((/** @type {any} */ e) => ({ value: e.session, name: titleOf(e.session) })), session, (/** @type {any} */ v) => { session = v; })
    : h('span.sch-none', t('form.no_sessions'));
  // 人格、预设照核心读（`persona.list`、`preset.list`）：第一项「默认」（不写，照建的这一刻新会话的默认），人格多一项「无人格」
  Promise.all([
    ctx.core.request('persona.list', {}).then((/** @type {any} */ r) => r?.personas ?? [], () => []),
    ctx.core.request('preset.list', {}).then((/** @type {any} */ r) => r?.presets ?? [], () => []),
  ]).then(([personas, presets]) => {
    personaBox.replaceWith(choose(kit, [{ value: '', name: t('form.default') }, { value: '-', name: t('form.no_persona') },
      ...personas.filter((/** @type {any} */ p) => p?.persona && !p.problem).map((/** @type {any} */ p) => ({ value: p.persona, name: p.name ?? p.persona }))], '',
    (/** @type {string} */ v) => { persona = v === '' ? undefined : v === '-' ? null : v; }));
    presetBox.replaceWith(choose(kit, [{ value: '', name: t('form.default') },
      ...presets.filter((/** @type {any} */ p) => p?.preset && !p.problem).map((/** @type {any} */ p) => ({ value: p.preset, name: p.name ?? p.preset }))], '',
    (/** @type {string} */ v) => { preset = v === '' ? undefined : v; }));
  });

  const row = (/** @type {string} */ label, /** @type {any[]} */ ...kids) => h('div.set-tool-field', h('span.set-tool-label', label), h('div.sch-cell', ...kids));
  const whenRows = {
    daily: row(t('form.daily'), time),
    every: row(t('form.every'), h('div.sch-inline', n, units)),
    once: row(t('form.once'), at),
    cron: row(t('form.cron'), cron, h('p.set-desc.sch-hint', t('form.cron_hint'))),
  };
  const newRows = h('div.set-tool-group', row(t('form.persona'), personaBox, errs.persona), row(t('form.preset'), presetBox, errs.preset), row(t('form.cwd'), cwd));
  const sessionRows = h('div.set-tool-group', row(t('form.session'), sessionBox));
  const drawKind = () => {
    for (const [k, el] of Object.entries(whenRows)) el.hidden = k !== kind;
    errs.when.hidden = true;
  };
  const drawWhere = () => {
    newRows.hidden = where !== 'new';
    sessionRows.hidden = where !== 'session';
    errs.target.hidden = true;
  };

  const create = /** @type {HTMLButtonElement} */ (h('button.set-btn.is-primary', { type: 'button', onclick: async () => {
    clear();
    const text = prompt.value.trim();
    if (!text) {
      say(errs.prompt, t('bad.prompt'));
      prompt.focus();
      return;
    }
    const form = kind === 'daily' ? { kind, time: time.value } : kind === 'every' ? { kind, n: n.value, unit } : kind === 'once' ? { kind, at: at.value } : { kind, cron: cron.value };
    const got = whenOf(/** @type {any} */ (form), new Date(), localZone());
    if ('problem' in got) {
      say(errs.when, t(`bad.${got.problem}`));
      return;
    }
    if (where === 'session' && !session) {
      say(errs.target, t('bad.session'));
      return;
    }
    const fresh = { ...(persona !== undefined ? { persona } : {}), ...(preset ? { preset } : {}), ...(cwd.value.trim() ? { cwd: cwd.value.trim() } : {}) };
    const target = where === 'session' ? { session } : { new: fresh };
    create.disabled = true;
    create.textContent = t('form.creating');
    try {
      const done = await store.act('schedule.add', { when: got.when, prompt: text, target });
      close();
      opts.done(done?.schedule?.id ?? '');
    } catch (err) {
      create.disabled = false;
      create.textContent = t('form.create');
      const f = fieldOf(err);
      if (f.field && f.key) say(/** @type {any} */ (errs)[f.field], t(f.key));
      else say(bottom, /** @type {any} */ (err)?.message ?? String(err));
    }
  } }, t('form.create')));

  const pop = h('div.set-tool-pop.sch-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('form.title') },
    h('div.set-tool-pop-head', h('strong', t('form.title')),
      h('button.icon-button', { type: 'button', title: t('form.close'), 'aria-label': t('form.close'), onclick: () => close() }, icon('x'))),
    row(t('form.prompt'), prompt, errs.prompt),
    h('div.set-tool-field', h('span.set-tool-label', t('form.when')), h('div.sch-cell', kinds.el)),
    ...Object.values(whenRows),
    h('div.sch-err-row', errs.when),
    h('div.set-tool-field', h('span.set-tool-label', t('form.where')), h('div.sch-cell', wheres.el)),
    newRows, sessionRows,
    h('div.sch-err-row', errs.target),
    bottom,
    h('div.set-tool-pop-foot', h('button.set-btn', { type: 'button', onclick: () => close() }, t('form.cancel')), create));
  // 点遮罩：写了字的不收（同记忆页的小窗），`Esc`、✕、「取消」照收
  const modal = h('div.set-tool-modal.sch-modal', { 'data-set-dismiss': '1', onclick: (/** @type {Event} */ e) => { if (e.target === e.currentTarget && !prompt.value.trim()) close(); } }, pop);
  const close = () => { if (modal.isConnected && !modal.classList.contains('is-leaving')) leave(modal, () => modal.remove()); };
  modal.addEventListener('set-dismiss', close);
  drawKind();
  drawWhere();
  // 挂在设置框上（`Esc` 照设置框的规矩先发给它）；没有设置框的挂到页面上
  (document.querySelector('.set-panel') ?? document.body).append(modal);
  prompt.focus();
}

/**
 * 下拉（设置页那一个，`kit.select`）：选了换成写着新选的那一个（`kit.select` 自己不换字）。
 * @param {any} kit @param {{value: any, name: string}[]} options @param {any} value @param {(v: any) => void} pick @returns {HTMLElement}
 */
function choose(kit, options, value, pick) {
  const box = h('span.sch-select');
  const draw = (/** @type {any} */ now) => box.replaceChildren(kit.select(options, now, (/** @type {any} */ v) => { pick(v); draw(v); }));
  draw(value);
  return box;
}

/** `datetime-local` 那一格的值：本地时间 `YYYY-MM-DDTHH:MM` @param {Date} d */
function localNow(d) {
  const two = (/** @type {number} */ x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:00`;
}
