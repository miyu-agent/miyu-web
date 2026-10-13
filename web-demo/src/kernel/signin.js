// @ts-check
//! 起页面时握手（蓝图 `web.md`「连核心」第 1 条下面几款；协议 `web-module.md` 第一条）：开一条线，照宿主给的凭据握手。走桥的不带凭据
//! （桥出示本机令牌）；直接连网页软件的带一次性码、登录令牌，都没有的先出登录框，带用户名、密码。被拒的（`bad_login`、`bad_password`、
//! `login_throttled`、`bad_code`）核心回完就断开：关掉这条线（不让它自己重连），在登录框上写为什么，人再点「登录」时重新开一条。
//! 握手回 `setup: true` 的出「账号」一屏（引导的样子，步骤条第一段），`account.setup` 设好用户名和密码；同一条线接着用。
//! 这几屏在软件包加载以前画（主题、引导还没来），样子在 `styles/signin.css`。

import { h, replace } from '../lib/dom.js';
import { t } from '../util/res.js';
import { Connection, Refusal } from '../core/connection.js';

/** 「账号」那一屏的步骤条：后面几段照引导（`packages/welcome` 的 `NUMBERED`） */
const STEPS = ['account', 'language', 'model', 'persona', 'theme', 'profile', 'preset', 'sandbox'];
/** 用户名的写法（核心 `kernel/ids.md`「路径里的名字」） */
const USERNAME = /^[a-z][a-z0-9_-]{0,31}$/;
/** 密码最短几个字节（`web-module.md` 第一条第 4 款） */
const PASSWORD_MIN = 8;

/**
 * 握手被拒时登录框上写什么；不是登录这几种的交 `null`（照原来的出错走）。
 * @param {any} err
 * @returns {string|null}
 */
export function refusedText(err) {
  if (!(err instanceof Refusal)) return null;
  switch (err.reason) {
    case 'bad_login': return '';
    case 'bad_password': return t('signin.bad_password');
    case 'login_throttled': return t('signin.throttled', { seconds: Math.max(1, Math.ceil((err.data?.retry_after_ms ?? 0) / 1000)) });
    case 'bad_code': return t('signin.bad_code');
    default: return null;
  }
}

/**
 * 「账号」那一屏填的哪里不对：用户名不合写法、密码太短、两次不一样；对的交 `null`。
 * @param {string} username @param {string} password @param {string} again
 */
export function accountProblem(username, password, again) {
  if (!USERNAME.test(username)) return t('signin.bad_username');
  if (new TextEncoder().encode(password).length < PASSWORD_MIN || !password.trim()) return t('signin.short_password', { min: PASSWORD_MIN });
  if (password !== again) return t('signin.mismatch');
  return null;
}

/**
 * 一行：左边名字，右边框。
 * @param {string} name @param {HTMLInputElement} input
 */
const field = (name, input) => h('label.si-field', h('span.si-field-name', name), input);

/** @param {string} type @param {string} value @param {string} auto */
const input = (type, value, auto) => /** @type {HTMLInputElement} */ (h('input.si-input', { type, value, autocomplete: auto, spellcheck: 'false' }));

/**
 * 画一屏，等人点主按钮：`submit` 交回出错的字（留在这一屏再来）或者 `null`（走了）。
 * @param {HTMLElement} root
 * @param {{login: boolean, title: string, sub: string, fields: HTMLElement[], button: string, error?: string, submit: () => Promise<string|null>}} spec
 * @returns {Promise<void>}
 */
function screen(root, spec) {
  return new Promise((resolve) => {
    const error = h('p.si-error', { hidden: !spec.error }, spec.error ?? '');
    const btn = /** @type {HTMLButtonElement} */ (h('button.si-btn', { type: 'submit' }, spec.button));
    const head = spec.login ? null : h('div.si-head', h('span.si-brand', 'Miyu'),
      h('ol.si-steps', STEPS.map((s, i) => h(`li${i === 0 ? '.is-now' : ''}`, `${i + 1} ${t(`signin.steps.${s}`)}`))));
    const form = /** @type {HTMLFormElement} */ (h('form.si-col', head, h('h1.si-title', spec.title), h('p.si-sub', spec.sub),
      h('div.si-body', spec.fields), error, h('div.si-foot', btn)));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      error.hidden = true;
      const why = await spec.submit().catch((err) => err?.message ?? String(err));
      btn.disabled = false;
      if (why == null) return resolve();
      error.textContent = why;
      error.hidden = !why;
    });
    replace(root, h(`div.si${spec.login ? '.is-login' : ''}`, form));
    /** @type {HTMLElement|null} */ (form.querySelector('input'))?.focus();
  });
}

/**
 * 登录框：交回填的用户名、密码。
 * @param {HTMLElement} root @param {string} error 上一次为什么没进去（空的不写） @param {string} last 上一次填的用户名
 * @returns {Promise<{user: string, password: string}>}
 */
async function loginBox(root, error, last) {
  const user = input('text', last, 'username');
  const password = input('password', '', 'current-password');
  /** @type {{user: string, password: string}} */
  let got = { user: '', password: '' };
  await screen(root, {
    login: true, title: t('signin.login_title'), sub: t('signin.login_sub'), button: t('signin.login'), error,
    fields: [field(t('signin.username'), user), field(t('signin.password'), password)],
    submit: async () => {
      if (!user.value.trim() || !password.value) return t('signin.empty');
      got = { user: user.value.trim(), password: password.value };
      return null;
    },
  });
  return got;
}

/**
 * 「账号」那一屏：`account.setup` 设好用户名和密码，交回登录令牌。
 * @param {HTMLElement} root @param {Connection} conn
 * @returns {Promise<{token: string, expires?: string}>}
 */
async function accountScreen(root, conn) {
  const user = input('text', 'admin', 'username');
  const password = input('password', '', 'new-password');
  const again = input('password', '', 'new-password');
  /** @type {any} */
  let login = null;
  await screen(root, {
    login: false, title: t('signin.account_title'), sub: t('signin.account_sub'), button: t('signin.next'),
    fields: [field(t('signin.username'), user), field(t('signin.password'), password), field(t('signin.again'), again)],
    submit: async () => {
      const why = accountProblem(user.value.trim(), password.value, again.value);
      if (why) return why;
      try {
        const got = await conn.request('account.setup', { username: user.value.trim(), password: password.value });
        login = got?.login ?? null;
        return login?.token ? null : t('signin.failed');
      } catch (err) {
        return /** @type {any} */ (err)?.message ?? String(err);
      }
    },
  });
  return login;
}

/**
 * 开线、握手，交回连上的线、握手的回应、这一次设没设账号（设了的引导第一段「账号」算走过，不再出欢迎页）。
 * @param {ReturnType<typeof import('../host/browser.js').browserHost> & {}} host
 * @param {any} greeting `hello` 的参数（不带凭据）
 * @param {HTMLElement} root 页面的根
 * @param {(err: any) => Promise<never>} offline 线开不了时照原来的写法抛
 * @returns {Promise<{conn: Connection, hello: any, setup: boolean}>}
 */
export async function signIn(host, greeting, root, offline, retry = /** @type {number[]} */ ([])) {
  let error = '';
  let last = '';
  for (;;) {
    let credential = host.credential();
    if (!credential && host.kind === 'served') {
      const got = await loginBox(root, error, last);
      last = got.user;
      credential = got;
      replace(root, h('div.boot-wait', t('boot.connecting_web')));
    }
    const conn = new Connection(host.channel, retry, host.check);
    await conn.connect().catch(offline);
    try {
      const hello = await conn.request('hello', { ...greeting, ...(credential ?? {}) });
      if (hello?.login?.token) host.remember(hello.login);
      if (!hello?.setup) return { conn, hello, setup: false };
      const login = await accountScreen(root, conn);
      host.remember(login);
      replace(root);
      return { conn, hello, setup: true };
    } catch (err) {
      const why = refusedText(err);
      conn.close();
      if (why == null) throw err;
      if (/** @type {any} */ (err).reason === 'bad_login') host.forget();
      error = why;
    }
  }
}
