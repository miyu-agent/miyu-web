// @ts-check
//! 起页面时握手（蓝图 `web.md`「连核心」第 1 条下面几款；协议 `web-module.md` 第一条）：开一条线，照宿主给的凭据握手。走桥的不带凭据
//! （桥出示本机令牌）；直接连网页软件的带一次性码、交接票、设备令牌，都没有的先出「输入访问密码」，握手带 `password`（核心 SU-1：只有主人一个人，
//! 没有用户名；2026-10-28 项目主人定 Miyu 只给一个人用）。被拒的（`bad_login`、`bad_password`、`login_throttled`、`bad_code`、`password_not_set`）
//! 核心回完就断开：关掉这条线，在那一屏上写为什么，人再点时重新开一条。还没设访问密码（`password_not_set`）的不给密码框，写去这台电脑上用
//! `miyu web` 打开。握手回 `setup: true` 的（一次性码连上的）出「设置访问密码」一屏（引导的样子，步骤条第一段），`account.setup {password}`
//! 设好、交回设备令牌；照它重新开一条线。
//! 这几屏在软件包加载以前画（主题、引导还没来），样子在 `styles/signin.css`：同第一次引导的「像素关卡」场景，正中一张像素描边的卡片，吉祥物
//! 蹲在卡片上沿（静态图，2026-10-22 项目主人选的样板二 B）。

import { h, icon, replace } from '../lib/dom.js';
import { t } from '../util/res.js';
import { Connection, Refusal } from '../core/connection.js';
import { onThisComputer } from '../host/files.js';

/** 「账号」那一屏的步骤条：后面几段照引导（`packages/welcome` 的 `NUMBERED`） */
const STEPS = ['account', 'language', 'model', 'persona', 'theme', 'profile', 'preset', 'sandbox'];
/** 访问密码最长几个字节（核心 SU-1；只挡拿超长的串耗 argon2）。没有最短：2026-10-30 项目主人去掉了「至少 8 位」，只要不是空的、不全是空白 */
const PASSWORD_MAX = 1024;

/**
 * 握手被拒时登录框上写什么；不是登录这几种的交 `null`（照原来的出错走）。
 * @param {any} err
 * @returns {string|null}
 */
export function refusedText(err) {
  if (!(err instanceof Refusal)) return null;
  switch (err.reason) {
    case 'bad_login': return '';
    // 设过访问密码以后什么凭据都不带的（核心 SU-1）：出「输入访问密码」，不另说
    case 'bad_token': return '';
    case 'bad_password': return t('signin.bad_password');
    case 'login_throttled': return t('signin.throttled', { seconds: Math.max(1, Math.ceil((err.data?.retry_after_ms ?? 0) / 1000)) });
    case 'bad_code': return t('signin.bad_code');
    // 交接票作废了（过了 60 秒、用过了）：照没带票办（存着的令牌、输入访问密码），不另说
    case 'bad_ticket': return '';
    // 还没设访问密码（核心 SU-1）：那一屏换成去这台电脑上设
    case 'password_not_set': return '';
    default: return null;
  }
}

/**
 * 「设置访问密码」那一屏填的哪里不对：空的（全是空白也算）、太长、两次不一样；对的交 `null`。
 * @param {string} password @param {string} again
 */
export function passwordProblem(password, again) {
  const n = new TextEncoder().encode(password).length;
  if (!password.trim()) return t('signin.empty_password');
  if (n > PASSWORD_MAX) return t('signin.long_password', { max: PASSWORD_MAX });
  if (password !== again) return t('signin.mismatch');
  return null;
}

/**
 * 「访问」页设、改访问密码（核心 SU-1 补；蓝图「设置页」第 12c 条第 2 款）：`account.setup {password, old?}`，回了新的设备令牌的交给宿主换掉记着的那一份
 * （这条连接核心当场换成它）。成了交 `null`，拒了交给人看的一句：旧密码不对、试太多次、别的照核心的话。
 * @param {{request: (method: string, params: any) => Promise<any>}} conn @param {{renew?: (login: any) => void}} host
 * @param {string} password @param {string|null} old 设过、要带旧密码的（拿设备令牌连的）；不带的是 `null`
 * @returns {Promise<string|null>}
 */
export async function changePassword(conn, host, password, old) {
  try {
    const got = await conn.request('account.setup', old === null ? { password } : { password, old });
    if (got?.login?.token) host.renew?.(got.login);
    return null;
  } catch (err) {
    if (/** @type {any} */ (err)?.reason === 'bad_password') return t('signin.wrong_old');
    return refusedText(err) || /** @type {any} */ (err)?.message || String(err);
  }
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

/** @param {string} type @param {string} value @param {string} auto */
const input = (type, value, auto) => /** @type {HTMLInputElement} */ (h('input.si-input', { type, value, autocomplete: auto, spellcheck: 'false' }));

/** 卡片上沿：像素关卡蹲着的吉祥物、黑白剪影的剪影标志（两套各露各的） */
const mascot = () => [h('img.si-mascot', { src: 'resources/assets/mascot.png', alt: '', 'aria-hidden': 'true' }), h('i.si-mark', { 'aria-hidden': 'true' })];

/**
 * 「自动登录」那一格（方块勾选框）：勾了的令牌存在这台浏览器（30 天），没勾的只在这个标签页（关了要再输密码）。
 * @param {boolean} on 默认勾不勾（输入访问密码那一屏不勾，第一次设密码的勾上）
 */
function keepBox(on) {
  const box = /** @type {HTMLInputElement} */ (h('input.si-check', { type: 'checkbox' }));
  box.checked = on;
  return { box, row: h('label.si-keep', box, h('span', t('signin.keep'))) };
}

/**
 * 画一屏，等人点主按钮：`submit` 交回出错的字（留在这一屏再来）或者 `null`（走了）。`note` 是字段下面的一段暗字；`face` 是标题上面画的头像
 * （这台浏览器记着的那张，没有的不画）。
 * @param {HTMLElement} root
 * @param {{login: boolean, title: string, sub: string, note?: string, faceImg?: string|null, fields: HTMLElement[], button: string, error?: string, submit: () => Promise<string|null>}} spec
 * @returns {Promise<'done'>}
 */
function screen(root, spec) {
  return new Promise((resolve) => {
    const error = h('p.si-error', { hidden: !spec.error }, spec.error ?? '');
    const btn = /** @type {HTMLButtonElement} */ (h('button.si-btn', { type: 'submit' }, spec.button));
    // 第一次设账号的：卡片顶上引导的关卡格子（第一格「账号」），同引导一路走下来
    const head = spec.login ? null : h('div.si-head',
      h('ol.si-steps', STEPS.map((s, i) => h(`li${i === 0 ? '.is-now' : ''}`, { title: t(`signin.steps.${s}`) }))),
      h('p.si-where', `STAGE 0/${STEPS.length - 1}`));
    const form = /** @type {HTMLFormElement} */ (h('form.si-col', mascot(),
      head, spec.faceImg ? h('span.si-face.is-big', { 'aria-hidden': 'true' }, h('img.si-face-img', { src: spec.faceImg, alt: '' })) : null, h('h1.si-title', spec.title), spec.sub ? h('p.si-sub', spec.sub) : null,
      h('div.si-body', spec.fields), error, h('div.si-foot', btn), spec.note ? h('p.si-note', spec.note) : null));
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

/**
 * 「输入访问密码」（直接连网页软件、这台浏览器没有能用的设备令牌时）：交回密码和勾没勾「自动登录」。
 * @param {HTMLElement} root @param {string} error 上一次为什么没进去（空的不写） @param {string|null} img 记着的头像
 * @returns {Promise<{password: string, keep: boolean}>}
 */
async function passwordBox(root, error, img) {
  // 浏览器记密码照这一格（没有用户名，给一个固定的藏着）
  const user = h('input', { type: 'text', autocomplete: 'username', value: 'Miyu', hidden: true, readonly: true, tabindex: '-1' });
  const password = input('password', '', 'current-password');
  const keep = keepBox(false);
  let got = { password: '', keep: false };
  await screen(root, {
    // 页面在本机地址上的：提示用 `miyu web` 开不用密码（2026-10-30 起本机打开不逼着设访问密码，没设的人到这一屏没有密码可输）
    login: true, faceImg: img, title: t('signin.login_title'), sub: '', button: t('signin.login'), error, note: onThisComputer() ? t('signin.local_hint') : '',
    fields: [user, field(t('signin.password'), password), keep.row],
    submit: async () => {
      if (!password.value) return t('signin.empty_password');
      got = { password: password.value, keep: keep.box.checked };
      return null;
    },
  });
  return got;
}

/**
 * 还没设访问密码（核心 `password_not_set`，从局域网开的）：不给密码框，写去这台电脑上用 `miyu web` 打开、设好密码；「重试」重新握手。
 * @param {HTMLElement} root
 * @returns {Promise<void>}
 */
function notSetCard(root) {
  return new Promise((resolve) => {
    const again = /** @type {HTMLButtonElement} */ (h('button.si-btn', { type: 'button', onclick: () => resolve() }, t('signin.retry')));
    replace(root, h('div.si.is-login', h('div.si-col', mascot(), h('h1.si-title', t('signin.not_set_title')), h('p.si-sub', t('signin.not_set_sub')),
      h('div.si-foot', again)), schemeButton()));
    again.focus();
  });
}

/**
 * 「设置访问密码」那一屏（一次性码连上的，`#setup=`）：`account.setup {password}` 设好，交回设备令牌、勾没勾「自动登录」（默认勾上：本机终端开的，
 * 是主人自己）。
 * @param {HTMLElement} root @param {Connection} conn
 * @returns {Promise<{login: {token: string, expires?: string}|null, keep: boolean}>}
 */
async function setupScreen(root, conn) {
  const password = input('password', '', 'new-password');
  const again = input('password', '', 'new-password');
  const keep = keepBox(true);
  /** @type {any} */
  let login = null;
  await screen(root, {
    login: false, title: t('signin.setup_title'), sub: '', note: t('signin.setup_sub'), button: t('signin.next'),
    fields: [field(t('signin.password'), password), field(t('signin.again'), again), keep.row],
    submit: async () => {
      const why = passwordProblem(password.value, again.value);
      if (why) return why;
      try {
        const got = await conn.request('account.setup', { password: password.value });
        login = got?.login ?? null;
        return login?.token ? null : t('signin.failed');
      } catch (err) {
        return /** @type {any} */ (err)?.message ?? String(err);
      }
    },
  });
  return { login, keep: keep.box.checked };
}

/**
 * 开线、握手，交回连上的线、握手的回应、这一次设没设访问密码（设了的引导第一段算走过，不再出欢迎页）。
 * @param {ReturnType<typeof import('../host/browser.js').browserHost> & {}} host
 * @param {any} greeting `hello` 的参数（不带凭据）
 * @param {HTMLElement} root 页面的根
 * @param {(err: any) => Promise<never>} offline 线开不了时照原来的写法抛
 * @returns {Promise<{conn: Connection, hello: any, setup: boolean}>}
 */
export async function signIn(host, greeting, root, offline, retry = /** @type {number[]} */ ([])) {
  schemeStore = host.store ?? null;
  /** 上一次为什么没进去；还没设访问密码的出那张卡 */
  const s = { error: '', notSet: false };
  /** 这一次在「设置访问密码」一屏设过：重连上来的那一次照它交 `setup: true` */
  let registered = false;
  for (;;) {
    /** @type {any} */
    let credential = host.credential();
    /** 这一次登录勾没勾「自动登录」 */
    let keep = false;
    if (!credential && host.kind === 'served') {
      if (s.notSet) {
        await notSetCard(root);
        s.notSet = false;
      } else {
        const got = await passwordBox(root, s.error, /** @type {any} */ (host).avatar?.get() ?? null);
        keep = got.keep;
        credential = { password: got.password };
      }
      replace(root, h('div.boot-wait', t('boot.connecting_web')));
    }
    const conn = new Connection(host.channel, retry, host.check);
    await conn.connect().catch(offline);
    try {
      const hello = await conn.request('hello', { ...greeting, ...(credential ?? {}) });
      if (hello?.login?.token) host.remember(hello.login, keep);
      if (!hello?.setup) return { conn, hello, setup: registered };
      const made = await setupScreen(root, conn);
      if (made.login) host.remember(made.login, made.keep);
      // 设好了：关掉这一条、照记下的设备令牌重新握手；这一次设过密码，引导第一段算走过
      conn.close();
      registered = true;
      // 这一屏照旧留着，重连上来直接换成引导（2026-10-23 项目主人：原来先换成「正在连接」一屏，像刷新了一下）
      continue;
    } catch (err) {
      const why = refusedText(err);
      conn.close();
      if (why == null) throw err;
      s.error = why;
      const reason = /** @type {any} */ (err).reason;
      if (reason === 'password_not_set') s.notSet = true;
      // 令牌作废了（别处改了密码、退出了所有设备）：扔掉那一份，出「输入访问密码」
      if (reason === 'bad_login') {
        host.forget();
        s.error = t('signin.expired');
      }
    }
  }
}
