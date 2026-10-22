// @ts-check
//! 起页面时握手（蓝图 `web.md`「连核心」第 1 条下面几款；协议 `web-module.md` 第一条）：开一条线，照宿主给的凭据握手。走桥的不带凭据
//! （桥出示本机令牌）；直接连网页软件的带一次性码、登录令牌，都没有的先出登录框，带用户名、密码。被拒的（`bad_login`、`bad_password`、
//! `login_throttled`、`bad_code`）核心回完就断开：关掉这条线（不让它自己重连），在登录框上写为什么，人再点「登录」时重新开一条。
//! 握手回 `setup: true` 的出「账号」一屏（引导的样子，步骤条第一段），`account.setup` 设好用户名和密码；同一条线接着用。
//! 凭邀请码注册（核心 Y-1 上）：地址带 `#invite=` 的、登录框里点「用邀请码注册」填的，握手带 `invite`；回 `register: true` 的出「注册账号」一屏，
//! `account.register` 拿到登录令牌，同一条线接着用。成员（核心 Y-2 以前只能调 `human.get`、`account.logout`）：试一次 `config.get` 被拒成
//! `not_permitted` 的出一张卡「已登录」+「退出登录」，不往下起页面。
//! 这几屏在软件包加载以前画（主题、引导还没来），样子在 `styles/signin.css`：同第一次引导的「像素关卡」场景，正中一张像素描边的卡片，吉祥物
//! 蹲在卡片上沿（静态图，2026-10-22 项目主人选的样板二 B）。

import { h, replace } from '../lib/dom.js';
import { t } from '../util/res.js';
import { Connection, Refusal } from '../core/connection.js';

/** 「账号」那一屏的步骤条：后面几段照引导（`packages/welcome` 的 `NUMBERED`） */
const STEPS = ['account', 'language', 'model', 'persona', 'theme', 'profile', 'preset', 'sandbox'];
/** 用户名的写法（核心 `kernel/ids.md`「路径里的名字」） */
const USERNAME = /^[a-z][a-z0-9_-]{0,31}$/;
/** 注册的用户名就是账号编号：小写字母开头，只用小写字母、数字、`-`，最多 32 个，不能叫 `users`（核心 Y-1 上） */
const MEMBER_NAME = /^[a-z][a-z0-9-]{0,31}$/;
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
    case 'bad_invite': return t('signin.bad_invite');
    // 停用的账号密码输对了（核心另给的原因；2026-10-22 项目主人：要说账号停用了）
    case 'account_disabled': return t('signin.account_disabled');
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
 * 「注册账号」那一屏填的哪里不对：用户名不合账号编号的写法、密码太短、两次不一样；对的交 `null`。
 * @param {string} username @param {string} password @param {string} again
 */
export function registerProblem(username, password, again) {
  if (!MEMBER_NAME.test(username) || username === 'users') return t('signin.bad_member_name');
  return accountProblem(username, password, again);
}

/**
 * 一行：名字放进框里当占位（2026-10-22 项目主人：不再左边一列名字），读屏照旧读得到名字。
 * @param {string} name @param {HTMLInputElement} input
 */
const field = (name, input) => {
  input.placeholder = name;
  return h('label.si-field', h('span.si-field-name', name), input);
};

/** @param {string} type @param {string} value @param {string} auto */
const input = (type, value, auto) => /** @type {HTMLInputElement} */ (h('input.si-input', { type, value, autocomplete: auto, spellcheck: 'false' }));

/**
 * 画一屏，等人点主按钮：`submit` 交回出错的字（留在这一屏再来）或者 `null`（走了）。`link` 是主按钮下面一个暗色链接（登录框的
 * 「用邀请码注册」、「返回登录」），点了这一屏也走、交回 `'link'`；`note` 是字段上面的一段暗字。
 * @param {HTMLElement} root
 * @param {{login: boolean, title: string, sub: string, note?: string, fields: HTMLElement[], button: string, error?: string, link?: string, submit: () => Promise<string|null>}} spec
 * @returns {Promise<'done'|'link'>}
 */
function screen(root, spec) {
  return new Promise((resolve) => {
    const error = h('p.si-error', { hidden: !spec.error }, spec.error ?? '');
    const btn = /** @type {HTMLButtonElement} */ (h('button.si-btn', { type: 'submit' }, spec.button));
    // 第一次设账号的：卡片顶上引导的关卡格子（第一格「账号」），同引导一路走下来
    const head = spec.login ? null : h('div.si-head',
      h('ol.si-steps', STEPS.map((s, i) => h(`li${i === 0 ? '.is-now' : ''}`, { title: t(`signin.steps.${s}`) }))),
      h('p.si-where', `STAGE 0/${STEPS.length - 1}`));
    const link = spec.link ? h('button.si-link', { type: 'button', onclick: () => resolve('link') }, spec.link) : null;
    const form = /** @type {HTMLFormElement} */ (h('form.si-col', h('img.si-mascot', { src: 'resources/assets/mascot.png', alt: '', 'aria-hidden': 'true' }),
      head, h('h1.si-title', spec.title), spec.sub ? h('p.si-sub', spec.sub) : null,
      h('div.si-body', spec.fields), error, h('div.si-foot', btn, link), spec.note ? h('p.si-note', spec.note) : null));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      error.hidden = true;
      const why = await spec.submit().catch((err) => err?.message ?? String(err));
      btn.disabled = false;
      if (why == null) return resolve('done');
      error.textContent = why;
      error.hidden = !why;
    });
    replace(root, h(`div.si${spec.login ? '.is-login' : ''}`, form));
    /** @type {HTMLElement|null} */ (form.querySelector('input'))?.focus();
  });
}

/**
 * 登录框：交回填的用户名、密码；点了「用邀请码注册」换成填邀请码的一屏，交回邀请码（「返回登录」回来）。
 * @param {HTMLElement} root @param {string} error 上一次为什么没进去（空的不写） @param {string} last 上一次填的用户名
 * @returns {Promise<{user: string, password: string}|{invite: string}>}
 */
async function loginBox(root, error, last) {
  for (;;) {
    const user = input('text', last, 'username');
    const password = input('password', '', 'current-password');
    /** @type {{user: string, password: string}} */
    let got = { user: '', password: '' };
    const went = await screen(root, {
      login: true, title: t('signin.login_title'), sub: '', button: t('signin.login'), error, link: t('signin.invite_link'),
      fields: [field(t('signin.username'), user), field(t('signin.password'), password)],
      submit: async () => {
        if (!user.value.trim() || !password.value) return t('signin.empty');
        got = { user: user.value.trim(), password: password.value };
        return null;
      },
    });
    if (went === 'done') return got;
    const code = input('text', '', 'off');
    let invite = '';
    const back = await screen(root, {
      login: true, title: t('signin.invite_title'), sub: '', button: t('signin.next'), link: t('signin.back_login'),
      fields: [field(t('signin.invite_code'), code)],
      submit: async () => {
        invite = code.value.trim();
        return invite ? null : t('signin.invite_empty');
      },
    });
    if (back === 'done') return { invite };
    error = '';
  }
}

/**
 * 「注册账号」那一屏（凭邀请码连上的）：`account.register` 注册好，交回注册的账号和登录令牌。
 * @param {HTMLElement} root @param {Connection} conn
 * @returns {Promise<{account: string, login: {token: string, expires?: string}}>}
 */
async function registerScreen(root, conn) {
  const user = input('text', '', 'username');
  const password = input('password', '', 'new-password');
  const again = input('password', '', 'new-password');
  /** @type {any} */
  let got = null;
  await screen(root, {
    login: true, title: t('signin.register_title'), sub: t('signin.register_sub'), note: t('signin.register_note'), button: t('signin.register'),
    fields: [field(t('signin.username'), user), field(t('signin.password'), password), field(t('signin.again'), again)],
    submit: async () => {
      const why = registerProblem(user.value.trim(), password.value, again.value);
      if (why) return why;
      try {
        got = await conn.request('account.register', { username: user.value.trim(), password: password.value });
        return got?.login?.token ? null : t('signin.failed');
      } catch (err) {
        if (err instanceof Refusal && err.reason === 'username_taken') return t('signin.username_taken');
        return /** @type {any} */ (err)?.message ?? String(err);
      }
    },
  });
  return { account: got.account ?? got.username, login: got.login };
}

/**
 * 成员的那张卡（核心 Y-2 以前成员什么都调不了）：「已登录：名字」「成员能用的功能还在做」、「退出登录」。点了作废这个登录令牌、
 * 忘掉它、重新载入出登录框；一直不交回。
 * @param {HTMLElement} root @param {Connection} conn @param {string} account @param {{forget: () => void}} host
 * @returns {Promise<never>}
 */
function memberCard(root, conn, account, host) {
  const out = /** @type {HTMLButtonElement} */ (h('button.si-btn', { type: 'button', onclick: async () => {
    out.disabled = true;
    await conn.request('account.logout', {}).catch(() => null);
    host.forget();
    location.reload();
  } }, t('signin.logout')));
  replace(root, h('div.si.is-login', h('div.si-col', h('img.si-mascot', { src: 'resources/assets/mascot.png', alt: '', 'aria-hidden': 'true' }),
    h('h1.si-title', t('signin.member_title', { name: account })), h('p.si-sub', t('signin.member_sub')), h('div.si-foot', out))));
  return new Promise(() => {});
}

/**
 * 成员能不能照常用：试一次 `config.get`，被拒成 `not_permitted` 的是还不能（核心 Y-2 以前）；别的错照常往下起（旧核心没有这个方法之类）。
 * @param {Connection} conn
 */
async function memberBlocked(conn) {
  try {
    await conn.request('config.get', { keys: ['ui.language'] });
    return false;
  } catch (err) {
    return err instanceof Refusal && err.reason === 'not_permitted';
  }
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
    login: false, title: t('signin.account_title'), sub: '', note: t('signin.account_sub'), button: t('signin.next'),
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
      // 凭邀请码连上的：先注册，这条线从此是注册的账号
      if (hello?.register) {
        const got = await registerScreen(root, conn);
        host.remember(got.login);
        hello.account = got.account;
        delete hello.register;
        replace(root, h('div.boot-wait', t('boot.connecting_web')));
      }
      if (hello?.account && hello.account !== 'admin' && await memberBlocked(conn)) await memberCard(root, conn, hello.account, host);
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
