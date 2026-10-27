// @ts-check
//! 起页面时握手（蓝图 `web.md`「连核心」第 1 条下面几款；协议 `web-module.md` 第一条）：开一条线，照宿主给的凭据握手。走桥的不带凭据
//! （桥出示本机令牌）；直接连网页软件的带一次性码、登录令牌，都没有的先出登录框，带用户名、密码。被拒的（`bad_login`、`bad_password`、
//! `login_throttled`、`bad_code`）核心回完就断开：关掉这条线（不让它自己重连），在登录框上写为什么，人再点「登录」时重新开一条。
//! 握手回 `setup: true` 的出「账号」一屏（引导的样子，步骤条第一段），`account.setup` 注册机主（核心 Y-12 中上起；已经有机主的是重设密码）；
//! 核心回完就断开这条线，照记下的登录令牌重新开一条（走桥的照旧出示本机令牌，这时就是机主）。
//! 凭邀请码注册（核心 Y-1 上）：地址带 `#invite=` 的、登录框里点「用邀请码注册」填的，握手带 `invite`；回 `register: true` 的出「注册账号」一屏，
//! `account.register` 拿到登录令牌，同一条线接着用。是谁照 `accessOf` 认（核心 Y-2下下上）：机主照常；成员照常起页面，用不了的由各处
//! 不露（`host.member`）；Y-2 以前的核心上的成员（只能调 `human.get`、`account.logout`）出一张卡「已登录」+「退出登录」，不往下起页面。
//! 选择账号（2026-10-27 项目主人定照 QQ 电脑版「选择账号登录」）：这台浏览器记着几个账号（宿主的 `accounts`），没有能用的令牌时先出一排头像和
//! 「+」；点存着令牌的直接握手，没存的出只要密码的登录；登录框多一格「自动登录」（宿主照它存令牌）；「账号管理」去掉一个，存着令牌的拿它
//! `account.logout`。
//! 这几屏在软件包加载以前画（主题、引导还没来），样子在 `styles/signin.css`：同第一次引导的「像素关卡」场景，正中一张像素描边的卡片，吉祥物
//! 蹲在卡片上沿（静态图，2026-10-22 项目主人选的样板二 B）。

import { h, icon, replace } from '../lib/dom.js';
import { t } from '../util/res.js';
import { Connection, Refusal } from '../core/connection.js';
import { initialOf } from '../model/accounts.js';

/** 「账号」那一屏的步骤条：后面几段照引导（`packages/welcome` 的 `NUMBERED`） */
const STEPS = ['account', 'language', 'model', 'persona', 'theme', 'profile', 'preset', 'sandbox'];
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
    // 交接票作废了（过了 60 秒、用过了）：照没带票办（存着的令牌、「选择账号」），不另说
    case 'bad_ticket': return '';
    // 停用的账号密码输对了（核心另给的原因；2026-10-22 项目主人：要说账号停用了）
    case 'account_disabled': return t('signin.account_disabled');
    default: return null;
  }
}

/**
 * 「账号」那一屏填的哪里不对：用户名不合账号编号的写法、密码太短、两次不一样；对的交 `null`。
 * @param {string} username @param {string} password @param {string} again
 */
export function accountProblem(username, password, again) {
  // 用户名就是机主的账号编号（核心 Y-12 中上），写法同注册的
  if (!MEMBER_NAME.test(username)) return t('signin.bad_member_name');
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

/** 这几屏自己记的明暗（主题还没起来，2026-10-23 项目主人：创建账号界面无法切换明暗）；引导起来以后照它换成主题的设置（`welcome`） */
export const SIGNIN_SCHEME = 'miyu.signin.scheme';

/** 记明暗的地方：宿主的 `store`（`signIn` 一开始交进来；不碰平台的存储） @type {{getItem: (k: string) => string|null, setItem: (k: string, v: string) => void}|null} */
let schemeStore = null;

/** 现在是不是深色：点过的照点的，没点过的照系统 */
const signinDark = () => {
  const set = document.documentElement.dataset.siScheme;
  return set ? set === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

/** 右上角的明暗按钮：同引导右上角那一个（深色时太阳、浅色时月亮），点了换到另一种，记在这台设备上交给引导 */
function schemeButton() {
  try {
    const kept = schemeStore?.getItem(SIGNIN_SCHEME);
    if (kept === 'dark' || kept === 'light') document.documentElement.dataset.siScheme = kept;
  } catch {
    // 存不了的照系统
  }
  const btn = h('button.si-corner', { type: 'button' });
  const draw = () => {
    const dark = signinDark();
    replace(btn, icon(dark ? 'sun' : 'moon'));
    const label = t(dark ? 'signin.to_light' : 'signin.to_dark');
    btn.title = label;
    btn.setAttribute('aria-label', label);
  };
  btn.addEventListener('click', () => {
    const next = signinDark() ? 'light' : 'dark';
    document.documentElement.dataset.siScheme = next;
    try {
      schemeStore?.setItem(SIGNIN_SCHEME, next);
    } catch {
      // 存不了的只这一屏换
    }
    draw();
  });
  draw();
  return btn;
}

/**
 * 一行：名字放进框里当占位（2026-10-22 项目主人：不再左边一列名字），读屏照旧读得到名字。
 * @param {string} name @param {HTMLInputElement} input
 */
const field = (name, input) => {
  input.placeholder = name;
  // 密码框右边一个眼睛，点了显示、再点藏起（2026-10-23 项目主人：密码框要不要支持显示密码）
  const eye = input.type === 'password' ? h('button.si-eye', {
    // 不进 Tab 的先后（2026-10-23 项目主人：输了密码按 Tab 期望到下一个框，不是到眼睛上）
    type: 'button', tabindex: '-1', title: t('signin.show_password'), 'aria-label': t('signin.show_password'), 'aria-pressed': 'false',
    onmousedown: (/** @type {MouseEvent} */ e) => e.preventDefault(),
    onclick: (/** @type {MouseEvent} */ e) => {
      e.preventDefault();
      const shown = input.type === 'password';
      input.type = shown ? 'text' : 'password';
      const label = t(shown ? 'signin.hide_password' : 'signin.show_password');
      /** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-pressed', String(shown));
      /** @type {HTMLElement} */ (e.currentTarget).title = label;
      /** @type {HTMLElement} */ (e.currentTarget).setAttribute('aria-label', label);
    },
  }, icon('eye')) : null;
  return h(`label.si-field${eye ? '.has-eye' : ''}`, h('span.si-field-name', name), input, eye);
};

/** 占位里名字后面接一句写法（「用户名（小写字母开头）」） @param {HTMLElement} row @param {HTMLInputElement} input @param {string} hint */
const withHint = (row, input, hint) => {
  input.placeholder = hint;
  return row;
};

/** @param {string} type @param {string} value @param {string} auto */
const input = (type, value, auto) => /** @type {HTMLInputElement} */ (h('input.si-input', { type, value, autocomplete: auto, spellcheck: 'false' }));

/** 蹲在卡片上沿的吉祥物 */
const mascot = () => h('img.si-mascot', { src: 'resources/assets/mascot.png', alt: '', 'aria-hidden': 'true' });

/**
 * 「自动登录」那一格（方块勾选框）：勾了的令牌存在这台浏览器（30 天），没勾的只在这个标签页（关了要再输密码）。
 * @param {boolean} on 默认勾不勾（登录框不勾，第一次设账号的勾上，注册的不勾）
 */
function keepBox(on) {
  const box = /** @type {HTMLInputElement} */ (h('input.si-check', { type: 'checkbox' }));
  box.checked = on;
  return { box, row: h('label.si-keep', box, h('span', t('signin.keep'))) };
}

/**
 * 画一屏，等人点主按钮：`submit` 交回出错的字（留在这一屏再来）或者 `null`（走了）。`links` 是主按钮下面几个暗色链接（登录框的
 * 「用邀请码注册」、「返回」），点了这一屏也走、交回那一个的 `key`；`note` 是字段上面的一段暗字；`face` 是标题上面画头像的账号（只要密码的登录）。
 * @param {HTMLElement} root
 * @param {{login: boolean, title: string, sub: string, note?: string, face?: string, fields: HTMLElement[], button: string, error?: string, links?: {label: string, key: string}[], submit: () => Promise<string|null>}} spec
 * @returns {Promise<string>} `'done'` 或者点了的链接
 */
function screen(root, spec) {
  return new Promise((resolve) => {
    const error = h('p.si-error', { hidden: !spec.error }, spec.error ?? '');
    const btn = /** @type {HTMLButtonElement} */ (h('button.si-btn', { type: 'submit' }, spec.button));
    // 第一次设账号的：卡片顶上引导的关卡格子（第一格「账号」），同引导一路走下来
    const head = spec.login ? null : h('div.si-head',
      h('ol.si-steps', STEPS.map((s, i) => h(`li${i === 0 ? '.is-now' : ''}`, { title: t(`signin.steps.${s}`) }))),
      h('p.si-where', `STAGE 0/${STEPS.length - 1}`));
    const links = (spec.links ?? []).map((l) => h('button.si-link', { type: 'button', onclick: () => resolve(l.key) }, l.label));
    const form = /** @type {HTMLFormElement} */ (h('form.si-col', mascot(),
      head, spec.face != null ? h('span.si-face.is-big', { 'aria-hidden': 'true' }, initialOf(spec.face)) : null, h('h1.si-title', spec.title), spec.sub ? h('p.si-sub', spec.sub) : null,
      h('div.si-body', spec.fields), error, h('div.si-foot', btn, links.length > 1 ? h('div.si-links', links) : links), spec.note ? h('p.si-note', spec.note) : null));
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
    replace(root, h(`div.si${spec.login ? '.is-login' : ''}`, form, schemeButton()));
    /** @type {HTMLElement|null} */ (form.querySelector('.si-input'))?.focus();
  });
}

/** 填邀请码的一屏：交回邀请码，点了「返回」的交 `'back'` @param {HTMLElement} root @param {string} back 返回的那个链接写什么 */
async function inviteBox(root, back) {
  const code = input('text', '', 'off');
  let invite = '';
  const went = await screen(root, {
    login: true, title: t('signin.invite_title'), sub: '', button: t('signin.next'), links: [{ label: back, key: 'back' }],
    fields: [field(t('signin.invite_code'), code)],
    submit: async () => {
      invite = code.value.trim();
      return invite ? null : t('signin.invite_empty');
    },
  });
  return went === 'done' ? { invite } : 'back';
}

/**
 * 登录框：交回填的用户名、密码、勾没勾「自动登录」；点了「用邀请码注册」换成填邀请码的一屏，交回邀请码（「返回登录」回来）。
 * 这台浏览器记着账号的（`back`，从「选择账号」的「+」进来的）那个链接换成「返回」，交回 `'back'`。
 * @param {HTMLElement} root @param {string} error 上一次为什么没进去（空的不写） @param {string} last 上一次填的用户名 @param {boolean} [back]
 * @returns {Promise<{user: string, password: string, keep: boolean}|{invite: string}|'back'>}
 */
async function loginBox(root, error, last, back = false) {
  for (;;) {
    const user = input('text', last, 'username');
    const password = input('password', '', 'current-password');
    const keep = keepBox(false);
    /** @type {{user: string, password: string, keep: boolean}} */
    let got = { user: '', password: '', keep: false };
    const went = await screen(root, {
      login: true, title: t('signin.login_title'), sub: '', button: t('signin.login'), error,
      links: back ? [{ label: t('signin.back'), key: 'back' }] : [{ label: t('signin.invite_link'), key: 'invite' }],
      fields: [field(t('signin.username'), user), field(t('signin.password'), password), keep.row],
      submit: async () => {
        if (!user.value.trim() || !password.value) return t('signin.empty');
        got = { user: user.value.trim(), password: password.value, keep: keep.box.checked };
        return null;
      },
    });
    if (went === 'done') return got;
    if (went === 'back') return 'back';
    const code = await inviteBox(root, t('signin.back_login'));
    if (code !== 'back') return code;
    error = '';
  }
}

/**
 * 只要密码的登录（点了没存令牌的头像、令牌作废了、左下角换过去的）：用户名就是这个账号、不能改；交回密码和勾没勾「自动登录」，
 * 点了「返回」交 `'back'`（回「选择账号」）。
 * @param {HTMLElement} root @param {string} account @param {string} error
 * @returns {Promise<{user: string, password: string, keep: boolean}|'back'>}
 */
async function passwordBox(root, account, error) {
  // 用户名放一个藏着的框里，浏览器记的密码照它填
  const user = h('input', { type: 'text', autocomplete: 'username', value: account, hidden: true, readonly: true, tabindex: '-1' });
  const password = input('password', '', 'current-password');
  const keep = keepBox(false);
  let got = { user: account, password: '', keep: false };
  const went = await screen(root, {
    login: true, face: account, title: account, sub: '', button: t('signin.login'), error, links: [{ label: t('signin.back'), key: 'back' }],
    fields: [user, field(t('signin.password'), password), keep.row],
    submit: async () => {
      if (!password.value) return t('signin.empty_password');
      got = { user: account, password: password.value, keep: keep.box.checked };
      return null;
    },
  });
  return went === 'done' ? got : 'back';
}

/**
 * 「选择账号」：一排头像（账号名的首字，下面写名字）和最后一个「+」（用别的账号登录）；底下「账号管理」「有邀请码？注册」。
 * @param {HTMLElement} root @param {{account: string, saved: boolean}[]} shown @param {string} error
 * @returns {Promise<{account: string}|'add'|'manage'|'invite'>}
 */
function chooser(root, shown, error) {
  return new Promise((resolve) => {
    const tile = (/** @type {any} */ face, /** @type {string} */ name, /** @type {() => void} */ run, cls = '') =>
      h(`button.si-account${cls}`, { type: 'button', title: name, onclick: run }, h('span.si-face', { 'aria-hidden': 'true' }, face), h('span.si-account-name', name));
    const col = h('div.si-col', mascot(), h('h1.si-title', t('signin.pick_title')),
      h('div.si-accounts', shown.map((a) => tile(initialOf(a.account), a.account, () => resolve({ account: a.account }))),
        tile(icon('plus'), t('signin.add_account'), () => resolve('add'), '.is-add')),
      h('p.si-error', { hidden: !error }, error),
      h('div.si-foot', h('div.si-links',
        h('button.si-link', { type: 'button', onclick: () => resolve('manage') }, t('signin.manage')),
        h('button.si-link', { type: 'button', onclick: () => resolve('invite') }, t('signin.invite_link')))));
    replace(root, h('div.si.is-login', col, schemeButton()));
    /** @type {HTMLElement|null} */ (col.querySelector('.si-account'))?.focus();
  });
}

/** 等一会儿，过了时候不等（开线去 `account.logout` 的：网页软件没在跑也不卡在这一屏） @template T @param {Promise<T>} p @param {number} ms @returns {Promise<T>} */
const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

/**
 * 拿一份令牌开一条线 `account.logout`（不写 `all`，只作废它这一份）；成不成都不管。
 * @param {any} host @param {any} greeting @param {{login: string}} credential
 */
async function logoutWith(host, greeting, credential) {
  const conn = new Connection(host.channel, [], host.check);
  try {
    await within(conn.connect(), 5000);
    await within(conn.request('hello', { ...greeting, ...credential }), 5000);
    await within(conn.request('account.logout', {}), 5000);
  } catch {
    // 作废不了的（网页软件没在跑、令牌早就作废了）照样从这台浏览器去掉
  } finally {
    conn.close();
  }
}

/**
 * 账号管理：一个账号一行（头像、名字、存着令牌的写「已保存登录」），右边「从这台浏览器去掉」；底下「返回」。点了「返回」交回。
 * @param {HTMLElement} root @param {any} host @param {any} greeting
 * @returns {Promise<void>}
 */
function manageScreen(root, host, greeting) {
  return new Promise((resolve) => {
    const rows = h('div.si-manage');
    const draw = () => {
      const shown = host.accounts().list;
      replace(rows, shown.length ? shown.map((/** @type {{account: string, saved: boolean}} */ a) => {
        const out = /** @type {HTMLButtonElement} */ (h('button.si-remove', { type: 'button', onclick: async () => {
          out.disabled = true;
          const tokens = host.dropAccount(a.account);
          await Promise.all(tokens.map((/** @type {{login: string}} */ c) => logoutWith(host, greeting, c)));
          draw();
        } }, t('signin.remove')));
        return h('div.si-manage-row', h('span.si-face', { 'aria-hidden': 'true' }, initialOf(a.account)),
          h('div.si-manage-text', h('span.si-account-name', a.account), a.saved ? h('span.si-manage-note', t('signin.saved')) : null), out);
      }) : h('p.si-sub', t('signin.no_accounts')));
    };
    draw();
    const back = /** @type {HTMLButtonElement} */ (h('button.si-btn', { type: 'button', onclick: () => resolve() }, t('signin.back')));
    replace(root, h('div.si.is-login', h('div.si-col', mascot(), h('h1.si-title', t('signin.manage')), rows, h('div.si-foot', back)), schemeButton()));
    back.focus();
  });
}

/**
 * 没有能用的令牌时问人：「选择账号」、「+」进的登录框、只要密码的、账号管理、填邀请码几屏来回走，交回握手带的凭据（`keep` 是勾没勾
 * 「自动登录」）；点了存着令牌的头像交 `null`（宿主已经换成那一份，再问一次 `credential`）。`s` 是这一回问到哪儿了，被拒了照它回到同一屏。
 * @param {HTMLElement} root @param {any} host @param {any} greeting
 * @param {{error: string, last: string, ask: string|null, view: 'login'|'manage'|null}} s
 * @returns {Promise<{user: string, password: string, keep: boolean}|{invite: string}|null>}
 */
async function askFor(root, host, greeting, s) {
  for (;;) {
    const shown = host.accounts?.().list ?? [];
    if (s.view === 'manage') {
      await manageScreen(root, host, greeting);
      s.view = null;
      s.error = '';
      continue;
    }
    if (s.ask != null) {
      const got = await passwordBox(root, s.ask, s.error);
      if (got !== 'back') return got;
      s.ask = null;
      s.error = '';
      continue;
    }
    if (s.view === 'login' || !shown.length) {
      const got = await loginBox(root, s.error, s.last, shown.length > 0);
      if (got !== 'back') return got;
      s.view = null;
      s.error = '';
      continue;
    }
    const got = await chooser(root, shown, s.error);
    s.error = '';
    if (got === 'add') s.view = 'login';
    else if (got === 'manage') s.view = 'manage';
    else if (got === 'invite') {
      const code = await inviteBox(root, t('signin.back'));
      if (code !== 'back') return code;
    } else if (host.choose(got.account)) return null;
    else s.ask = got.account;
  }
}

/**
 * 「注册账号」那一屏（凭邀请码连上的）：`account.register` 注册好，交回注册的账号和登录令牌。
 * @param {HTMLElement} root @param {Connection} conn
 * @returns {Promise<{account: string, login: {token: string, expires?: string}, keep: boolean}>}
 */
async function registerScreen(root, conn) {
  const user = input('text', '', 'username');
  const password = input('password', '', 'new-password');
  const again = input('password', '', 'new-password');
  // 凭邀请码注册的默认不勾「自动登录」（多半不是自己的电脑）
  const keep = keepBox(false);
  /** @type {any} */
  let got = null;
  await screen(root, {
    login: true, title: t('signin.register_title'), sub: t('signin.register_sub'), note: t('signin.register_note'), button: t('signin.register'),
    fields: [field(t('signin.username'), user), field(t('signin.password'), password), field(t('signin.again'), again), keep.row],
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
  return { account: got.account ?? got.username ?? user.value.trim(), login: got.login, keep: keep.box.checked };
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
 * 这个连接是谁（蓝图「连核心」第 1 条下面「成员」那一款）：`owner` 机主；`member` 成员（核心 Y-2下下中 起：有自己那一份配置）；
 * `member-old` 老核心（Y-2下下上）上的成员（照常起页面，配置调不了）；`blocked` 是 Y-2 以前的核心上的成员（什么都调不了）。
 * 握手带 `admin`（核心 Y-2下下中上 起）的照它；没带账号的（走桥的、旧核心）是机主；别的先试 `persona.list`（成员 Y-2下下上 起才调得了）、
 * 再试 `config.get`（Y-2下下上 的成员调不了）。只有 `not_permitted` 算数，别的错照机主往下起。
 * @param {{request: (method: string, params: any) => Promise<any>}} conn @param {any} hello
 * @returns {Promise<'owner'|'member'|'member-old'|'blocked'>}
 */
export async function accessOf(conn, hello) {
  if (typeof hello?.admin === 'boolean') return hello.admin ? 'owner' : 'member';
  if (!hello?.account || hello.account === 'admin') return 'owner';
  const refused = (/** @type {string} */ method, /** @type {any} */ params) => conn.request(method, params)
    .then(() => false, (err) => err instanceof Refusal && err.reason === 'not_permitted');
  if (await refused('persona.list', {})) return 'blocked';
  return (await refused('config.get', { keys: ['ui.language'] })) ? 'member-old' : 'owner';
}

/**
 * 「账号」那一屏：`account.setup` 设好用户名和密码，交回登录令牌、账号、勾没勾「自动登录」（默认勾上：本机终端开的，是机主自己）。
 * @param {HTMLElement} root @param {Connection} conn
 * @returns {Promise<{login: {token: string, expires?: string}, account: string, keep: boolean}>}
 */
async function accountScreen(root, conn) {
  // 用户名就是机主的账号编号（核心 Y-12 中上）：空着，不再先填 admin（admin 是系统、不能登录）
  const user = input('text', '', 'username');
  const password = input('password', '', 'new-password');
  const again = input('password', '', 'new-password');
  const keep = keepBox(true);
  /** @type {any} */
  let login = null;
  await screen(root, {
    login: false, title: t('signin.account_title'), sub: '', note: t('signin.account_sub'), button: t('signin.next'),
    fields: [withHint(field(t('signin.username'), user), user, t('signin.username_hint')), field(t('signin.password'), password), field(t('signin.again'), again), keep.row],
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
  return { login, account: user.value.trim(), keep: keep.box.checked };
}

/**
 * 开线、握手，交回连上的线、握手的回应、这一次设没设账号（设了的引导第一段「账号」算走过，不再出欢迎页）。
 * @param {ReturnType<typeof import('../host/browser.js').browserHost> & {}} host
 * @param {any} greeting `hello` 的参数（不带凭据）
 * @param {HTMLElement} root 页面的根
 * @param {(err: any) => Promise<never>} offline 线开不了时照原来的写法抛
 * @returns {Promise<{conn: Connection, hello: any, setup: boolean, member: boolean, configless: boolean}>}
 */
export async function signIn(host, greeting, root, offline, retry = /** @type {number[]} */ ([])) {
  schemeStore = host.store ?? null;
  // 左下角菜单点过来的：换过去的那个账号没存令牌的出只要密码的登录；「添加账号」出登录框；「账号管理」出账号管理
  const intent = /** @type {any} */ (host).intent?.() ?? null;
  /** 问到哪儿了：上一次为什么没进去、填的用户名、只要密码的那个账号、在哪一屏 */
  const s = { error: '', last: '', ask: /** @type {string|null} */ (intent?.pick ?? null), view: /** @type {'login'|'manage'|null} */ (intent?.manage ? 'manage' : intent?.add ? 'login' : null) };
  /** 这一次在「账号」一屏设过账号：重连上来的那一次照它交 `setup: true` */
  let registered = false;
  for (;;) {
    /** @type {any} */
    let credential = host.credential();
    /** 这一次登录勾没勾「自动登录」 */
    let keep = false;
    if (!credential && host.kind === 'served') {
      const got = await askFor(root, host, greeting, s);
      if (got && 'password' in got) {
        s.last = got.user;
        keep = got.keep;
        credential = { user: got.user, password: got.password };
      } else credential = got ?? host.credential();
      replace(root, h('div.boot-wait', t('boot.connecting_web')));
    }
    const conn = new Connection(host.channel, retry, host.check);
    await conn.connect().catch(offline);
    try {
      const hello = await conn.request('hello', { ...greeting, ...(credential ?? {}) });
      if (hello?.login?.token) host.remember(hello.login, hello.account ?? s.last, keep);
      // 拿记着的令牌连上的：账号名照回应填上（旧的那一份迁过来的不知道名字）、记一下这次用的
      else if (credential?.login && typeof hello?.account === 'string') /** @type {any} */ (host).signedIn?.(hello.account);
      // 凭邀请码连上的：先注册，这条线从此是注册的账号
      if (hello?.register) {
        const got = await registerScreen(root, conn);
        host.remember(got.login, got.account, got.keep);
        hello.account = got.account;
        delete hello.register;
        replace(root, h('div.boot-wait', t('boot.connecting_web')));
      }
      const access = hello?.setup ? 'owner' : await accessOf(conn, hello);
      if (access === 'blocked') await memberCard(root, conn, hello.account, host);
      if (!hello?.setup) return { conn, hello, setup: !!registered, member: access === 'member' || access === 'member-old', configless: access === 'member-old' };
      const made = await accountScreen(root, conn);
      host.remember(made.login, made.account, made.keep);
      // 核心回完就断开（核心 Y-12 中上）：关掉这一条、照记下的登录令牌重新握手；这一次设过账号，引导第一段算走过
      conn.close();
      registered = true;
      // 这一屏照旧留着，重连上来直接换成引导（2026-10-23 项目主人：从创建账号到引导像刷新了一下：原来先换成「正在连接」一屏）
      continue;
    } catch (err) {
      const why = refusedText(err);
      conn.close();
      if (why == null) throw err;
      s.error = why;
      // 令牌作废了（别处改了密码、退出了所有设备）：扔掉那一份、账号留着，出它只要密码的登录
      if (/** @type {any} */ (err).reason === 'bad_login') {
        const who = host.forget();
        s.ask = typeof who === 'string' && who ? who : null;
        s.view = null;
        s.error = s.ask ? t('signin.expired') : '';
      }
    }
  }
}
