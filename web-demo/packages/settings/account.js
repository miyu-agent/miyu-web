// @ts-check
//! 设置「通用」页里的「访问」一组（网页自己的一组；蓝图 `web.md`「设置页」第 12c 条；2026-10-30 项目主人：原来单独一页，放进通用，网页默认只给本机，
//! 一个开关放开到局域网、能填监听地址和端口、写访问密码）：允许局域网访问、监听地址、端口、访问密码。头像挪到「用户身份」页（第 12d 条）。
//! 「退出登录」同一天项目主人定整行去掉：本机没设访问密码时点了会停在输不了密码的那一屏；要踢掉别的设备就改访问密码，或者 `miyu web --logout`。

import { h, icon } from '../../src/lib/dom.js';
import { sectionKit } from './kit.js';
import { coreRow, groupBlock, toggle } from './rows.js';
import { plainItem } from './model.js';
import { fold } from './privacy.js';

/** 改了要网页软件当场换监听的两项 */
export const LISTEN_KEYS = ['web.listen', 'web.port'];

/**
 * 「访问」一组（第 12c 条）。`withAvatar` 的（核心没有「用户身份」页）头像排最前。一行都没有的交 `null`。
 * @param {any} dialog @param {boolean} [withAvatar]
 */
export function accessGroup(dialog, withAvatar = false) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const listen = dialog.schema ? plainItem(dialog.schema, dialog.got ?? {}, 'web.listen') : null;
  const port = dialog.schema ? plainItem(dialog.schema, dialog.got ?? {}, 'web.port') : null;
  const rows = [withAvatar ? avatarRow(dialog) : null];
  if (listen) {
    const on = !loopbackOnly(listen.entry?.value ?? listen.default);
    // 打开时没设访问密码：先不写，展开下面几行、密码的格子直接打开，设好了接着写（第 12c 条第 1 款）
    if (on) dialog.lanPending = false;
    const pending = !on && !!dialog.lanPending;
    const shown = on || pending;
    if (on && dialog.lanInfo === undefined) lookUp(dialog);
    rows.push(lanRow(dialog, listen, on, pending));
    rows.push(fold(dialog, 'lan', !shown,
      coreRow(dialog, listen),
      port ? portRow(dialog, port, on) : null,
      ...passwordRows(dialog, pending ? {
        open: true,
        done: () => turnOn(dialog, listen),
        cancel: () => { dialog.lanPending = false; dialog.drawBody?.(); },
      } : {})));
  }
  return groupBlock(t('pages.account'), rows);
}

/** 「用户身份」页最上面的头像（第 12d 条）；没有的交 `null`。 @param {any} dialog */
export function avatarGroup(dialog) {
  return groupBlock(null, [avatarRow(dialog)]);
}

/** 写的地址是不是只有这台电脑（回环）：`127.*`、`::1`、`localhost`；别的（`0.0.0.0`、这台电脑的某一个地址）算听局域网。 @param {unknown} value */
export const loopbackOnly = (value) => {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return v === '' || v === 'localhost' || v === '::1' || v === '[::1]' || /^127\./.test(v);
};

/**
 * 「允许局域网访问」一行（网页软件的 `web.listen`，第 12c 条第 1 款）：开是 `0.0.0.0`，关是去掉这一项（回到出厂的 `127.0.0.1`）。没设访问密码的打开时
 * 先不写，等密码设好。开着、网页软件说得出别的设备怎么开的，下面多一行网址（点了复制）。
 * @param {any} dialog @param {any} item @param {boolean} on @param {boolean} pending
 */
function lanRow(dialog, item, on, pending) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const sw = toggle(on || pending, async (/** @type {boolean} */ next) => {
    if (next && dialog.ctx.host?.access?.set() === false) {
      dialog.lanPending = true;
      dialog.drawBody?.();
      return true;
    }
    dialog.lanPending = false;
    if (!next && !on) {
      dialog.drawBody?.();
      return true;
    }
    const why = await dialog.save(item, next ? { value: '0.0.0.0' } : { unset: true });
    if (why) dialog.toast(why);
    return !why;
  });
  const url = on ? dialog.lanInfo?.lan : null;
  const copy = async () => {
    await Promise.resolve(dialog.ctx.host?.clipboard?.write(url)).catch(() => null);
    dialog.toast(t('account.copied'));
  };
  return h('div.set-row', h('div.set-text', h('div.set-name', h('span', t('account.lan'))),
    h('p.set-desc', t('account.lan_desc')),
    // 明文 HTTP（2026-10-30 项目主人定不配证书，第二轮审查 W2-3）
    h('p.set-desc.acc-lan-warn', t('account.lan_risk')),
    pending ? h('p.set-desc.acc-lan-warn', t('account.lan_needs_password')) : null,
    url ? h('p.set-desc', t('account.lan_open'), ' ', h('button.acc-lan-url', { type: 'button', title: t('account.copy'), onclick: copy }, url)) : null), sw);
}

/**
 * 「端口」一行（`web.port`，照通用的行）：网页软件实际听的和配置里的不一样的（出厂端口被占、回退了）下面多一行暗字写现在用的。
 * @param {any} dialog @param {any} item @param {boolean} on
 */
function portRow(dialog, item, on) {
  const row = coreRow(dialog, item);
  const now = dialog.lanInfo?.port;
  const wrote = item.entry?.value ?? item.default;
  if (on && row && typeof now === 'number' && now !== wrote) row.querySelector('.set-text')?.append(h('p.set-desc', dialog.ctx.text('account.port_now', { port: now })));
  return row;
}

/** 没设密码时打开的：密码设好了，接着写 `0.0.0.0` @param {any} dialog @param {any} item */
async function turnOn(dialog, item) {
  dialog.lanPending = false;
  const why = await dialog.save(item, { value: '0.0.0.0' });
  if (why) dialog.toast(why);
}

/** 问网页软件一次在听的（`GET /listen`）：拿到了记下、重画；问不到的记成 `null`，不再问。 @param {any} dialog */
function lookUp(dialog) {
  const listen = dialog.ctx.host?.listen;
  dialog.lanInfo = null;
  if (!listen?.get) return;
  listen.get().then((/** @type {any} */ got) => {
    dialog.lanInfo = got ?? null;
    if (got?.lan && dialog.current === 'general') dialog.drawBody?.();
  }, () => {});
}

/**
 * 存完 `web.listen`、`web.port`（这一组、「软件包」页都算）：网页软件自己跟着核心的配置换（`web-ui.md` 第一条第 11 款），这里再 `POST /listen` 拿换完的样子
 * （第 12c 条第 1 款）：换不了的、端口换了的提示一句。端口换走了、这个页面请不到它的，照新端口提示新地址；走桥的不提示。
 * @param {any} dialog @param {string[]} keys 这一次存了的键
 */
export async function relisten(dialog, keys) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const listen = dialog.ctx.host?.listen;
  if (!listen?.relisten) return;
  const got = await listen.relisten().catch(() => null);
  if (!got) {
    const item = dialog.schema ? plainItem(dialog.schema, dialog.got ?? {}, 'web.port') : null;
    const port = item?.entry?.value ?? item?.default;
    if (!keys.includes('web.port') || typeof port !== 'number') return;
    dialog.toast(t('account.lan_port_moved', { port }));
    // 记着的照新端口改（网页软件已经跟着配置换过去了；局域网的网址只换端口）
    const was = dialog.lanInfo;
    if (was) dialog.lanInfo = { ...was, port, lan: typeof was.lan === 'string' ? was.lan.replace(/:\d+$/, `:${port}`) : was.lan };
    if (dialog.current === 'general') dialog.drawBody?.();
    return;
  }
  const before = dialog.lanInfo;
  dialog.lanInfo = got;
  if (typeof got.error === 'string') dialog.toast(t('account.lan_failed', { error: got.error }));
  else if (typeof got.port === 'number' && String(got.port) !== (globalThis.location?.port ?? '')) dialog.toast(t('account.lan_port_moved', { port: got.port }));
  if (got.lan !== before?.lan && dialog.current === 'general') dialog.drawBody?.();
}

/**
 * 「头像」一行（核心 AV-1，只有你那一张；蓝图第 12d 条）：左边圆的头像（有图的画图，没有的画一个人的图标），右边「更换头像」（选图、不是正方形的先裁、
 * 缩小、传上去、`account.set_avatar`）、有头像的「移除」。走桥的（宿主不记头像）、人格那一套不在的不出「更换头像」。
 * @param {any} dialog
 */
function avatarRow(dialog) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const me = dialog.ctx.host?.avatar ?? null;
  if (!me) return null;
  const face = () => {
    const img = me.get();
    return img ? h('span.acc-avatar.is-pic', h('img', { src: img, alt: '' })) : h('span.acc-avatar', icon('user-round'));
  };
  const holder = h('span.acc-avatar-slot', face());
  const say = (/** @type {any} */ err) => {
    const why = err?.reason === 'avatar_not_image' ? t('account.avatar_not_image') : err?.reason === 'avatar_too_big' ? t('account.avatar_too_big')
      : err?.reason === 'avatar_conflict' ? t('account.avatar_conflict') : err?.message ?? String(err);
    dialog.toast(why);
  };
  /** 设成这张（`null` 是移除）：成了记下、当场换；别处刚改过的照新的取一次 @param {{blob: string, image: Blob}|null} got */
  const apply = async (got) => {
    try {
      const done = await dialog.ctx.core.request('account.set_avatar', { ...(got ? { blob: got.blob } : { unset: true }), expect: me.version() });
      await me.set(done?.avatar ?? null, got?.image ?? null);
    } catch (err) {
      if (/** @type {any} */ (err)?.reason === 'avatar_conflict') {
        const now = await dialog.ctx.core.request('account.avatar', {}).catch(() => null);
        await me.set(now?.avatar ?? null, now?.data ? new Blob([Uint8Array.from(atob(now.data), (c) => c.charCodeAt(0))], { type: now.media_type ?? 'image/png' }) : null);
      }
      say(err);
    }
  };
  const picker = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, onchange: async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    try {
      const got = await dialog.ctx.personas.avatarUpload(sectionKit(dialog), holder, file);
      if (got) await apply(got);
    } catch (err) {
      say(err);
    }
  } }));
  const canPick = typeof dialog.ctx.personas?.avatarUpload === 'function';
  const actions = h('div.acc-actions');
  const drawActions = () => actions.replaceChildren(...[
    canPick ? h('button.set-btn', { type: 'button', onclick: () => picker.click() }, t('account.avatar_change')) : null,
    me.get() ? h('button.set-btn', { type: 'button', onclick: () => apply(null) }, t('account.avatar_remove')) : null,
    picker,
  ].filter((x) => x !== null));
  drawActions();
  const stop = me.watch(() => {
    if (!holder.isConnected) return stop();
    holder.replaceChildren(face());
    drawActions();
  });
  return h('div.set-row.acc-avatar-row', h('div.set-text', h('div.set-name', h('span', t('account.avatar')))), h('div.acc-avatar-control', holder, actions));
}

/**
 * 密码框右边一个眼睛：点了看得见写的字，再点藏起来（同登录那一屏的）；不进 Tab 的先后，按 Tab 到下一个框。
 * @param {HTMLInputElement} input @param {(k: string) => string} t
 */
function withEye(input, t) {
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

/**
 * 「访问密码」一行（核心 SU-1 补；蓝图第 12c 条第 2 款）：设没设、右边「设置」或「修改」；点了下面展开一格新的密码，右边一个眼睛（2026-10-31
 * 项目主人：一个框加眼睛直接设，不再输两遍、本机的不要当前密码），从局域网别的设备连进来的改的时候多「当前访问密码」）、
 * 「确定」「取消」。旧核心握手不说设没设的不出。`open` 的（打开局域网时还没设密码）格子直接打开，设好了叫 `done`、取消了叫 `cancel`。
 * @param {any} dialog @param {{open?: boolean, done?: () => void, cancel?: () => void}} [how] @returns {HTMLElement[]}
 */
function passwordRows(dialog, how = {}) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const access = dialog.ctx.host?.access;
  if (!access || access.set() === null) return [];
  const form = h('div.set-form.acc-password-form', { hidden: true });
  const desc = h('p.set-desc');
  const button = h('button.set-btn', { type: 'button', onclick: () => open() });
  const label = () => {
    desc.textContent = t(access.set() ? 'account.password_is_set' : 'account.password_unset');
    button.textContent = t(access.set() ? 'account.password_change' : 'account.password_set');
  };
  label();
  const close = () => { form.hidden = true; form.replaceChildren(); button.hidden = false; };
  const open = (focus = true) => {
    const field = (/** @type {string} */ name, /** @type {string} */ auto) => /** @type {HTMLInputElement} */ (h('input.set-input', { type: 'password', placeholder: t(name), 'aria-label': t(name), autocomplete: auto, spellcheck: 'false' }));
    const old = access.needsOld() ? field('account.password_old', 'current-password') : null;
    const fresh = field('account.password_new', 'new-password');
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
      if (how.done) how.done();
      else dialog.drawBody?.();
    };
    const cancel = () => {
      close();
      how.cancel?.();
    };
    for (const input of [old, fresh]) input?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) submit(); });
    // 浏览器记密码照这一格（没有用户名，给一个固定的藏着，同登录那一屏；不然会把上面的「端口」当成用户名）
    const user = h('input', { type: 'text', autocomplete: 'username', value: 'Miyu', hidden: true, readonly: true, tabindex: '-1' });
    form.replaceChildren(user, h('div.set-form-keyrow', old ? withEye(old, t) : null, withEye(fresh, t)), error,
      h('div.set-form-buttons', h('button.set-btn', { type: 'button', onclick: cancel }, t('account.cancel')), ok));
    form.hidden = false;
    button.hidden = true;
    if (focus) queueMicrotask(() => (old ?? fresh).focus());
  };
  if (how.open) open(true);
  return [h('div.set-row', h('div.set-text', h('div.set-name', h('span', t('account.password'))), desc), h('div.acc-actions', button)), form];
}
