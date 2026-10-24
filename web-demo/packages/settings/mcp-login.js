// @ts-check
//! 网址的 MCP 服务要浏览器登录的（蓝图 `web.md`「设置页」第 20 条；核心 X-42 上）：`state` 停着、`reason` 是 `needs_login`。
//! 「登录」发 `mcp.login {service}`，回来的授权页在新标签页开；开了以后写「等待在浏览器中完成登录…」、按钮换「重新打开登录页」。
//! 网页不另等结果：登录成了核心推 `mcp.changed`，状态换成运行中，记着的「等待」跟着去掉。记着的只在设置弹窗开着时算（`dialog.close` 清掉）。

import { h } from '../../src/lib/dom.js';
import { confirmIn } from './confirm.js';

/**
 * 「退出登录」（核心 X-42 下再补：`logged_in` 的服务，详情卡片里）：先问一句，确认了发 `mcp.logout {service}`；服务停在「需要登录」照推来的
 * `mcp.changed` 画，拒了的（`not_logged_in` 这类）照核心的话提示。
 * @param {any} dialog @param {string} service @param {string} name 给人看的名字
 */
export function logoutButton(dialog, service, name) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  return h('button.set-btn.mcp-logout', {
    type: 'button',
    onclick: async (/** @type {Event} */ e) => {
      e.stopPropagation();
      if (dialog.adminGuard()) return;
      if (!(await confirmIn(/** @type {Element} */ (e.currentTarget), { text: t('mcp_login.logout_ask', { name }), yes: t('mcp_login.logout'), no: t('mcp_login.cancel') }))) return;
      try {
        await dialog.ctx.core.request('mcp.logout', { service });
      } catch (err) {
        dialog.toast(/** @type {any} */ (err)?.message ?? String(err));
      }
    },
  }, t('mcp_login.logout'));
}

/**
 * 这个服务现在要不要登录。
 * @param {any} s 服务那一格（`state`、`reason`、`covered`） @param {boolean} on 服务和它所在的包都开着
 */
export const needsLogin = (s, on) => on && !s.covered && s.state === 'stopped' && s.reason === 'needs_login';

/** 记着的：在等的服务名、拒了的话（服务名 → 字）。 @param {any} dialog */
function memo(dialog) {
  dialog.mcpLogin ??= { waiting: new Set(), errors: new Map() };
  return /** @type {{waiting: Set<string>, errors: Map<string, string>}} */ (dialog.mcpLogin);
}

/**
 * 这个服务的登录状态：不用登录了的把记着的清掉（登录成了、关了、删了）。
 * @param {any} dialog @param {any} s @param {boolean} on
 * @returns {{needs: boolean, waiting: boolean, error: string|null}}
 */
export function loginState(dialog, s, on) {
  const m = memo(dialog);
  if (!needsLogin(s, on)) {
    m.waiting.delete(s.name);
    m.errors.delete(s.name);
    return { needs: false, waiting: false, error: null };
  }
  return { needs: true, waiting: m.waiting.has(s.name), error: m.errors.get(s.name) ?? null };
}

/** 状态那一句：要登录的「需要登录」，开了授权页的「等待在浏览器中完成登录…」。 @param {(k: string) => string} t @param {{waiting: boolean}} st */
export const loginText = (t, st) => t(st.waiting ? 'mcp_login.waiting' : 'mcp_login.needs');

/**
 * 拒了的话：照错误码写（蓝图第 20 条），别的照核心的话。
 * @param {(k: string, f?: any) => string} t @param {any} err
 */
export function loginError(t, err) {
  if (err?.reason === 'oauth_unregistered') return t('mcp_login.unregistered');
  if (err?.reason === 'oauth_failed') {
    const why = typeof err?.data?.why === 'string' && err.data.why ? err.data.why : null;
    return why ? t('mcp_login.failed_why', { why }) : t('mcp_login.failed');
  }
  return err?.message ?? String(err);
}

/**
 * 「登录」（开了授权页的是「重新打开登录页」）。点了要授权页、新标签页开；被浏览器拦了的提示一句，按钮照旧能再点。
 * @param {any} dialog @param {string} service @param {{waiting: boolean}} st @param {{primary?: boolean, small?: boolean}} [opts]
 */
export function loginButton(dialog, service, st, opts = {}) {
  const t = (/** @type {string} */ k, /** @type {any} */ f) => dialog.ctx.text(k, f);
  const m = memo(dialog);
  const cls = `button.set-btn${opts.primary ? '.is-primary' : ''}${opts.small ? '.is-small' : ''}.mcp-login`;
  return h(cls, {
    type: 'button',
    onclick: async (/** @type {MouseEvent} */ e) => {
      e.stopPropagation();
      if (dialog.adminGuard()) return;
      const button = /** @type {HTMLButtonElement} */ (e.currentTarget);
      button.disabled = true;
      try {
        const got = await dialog.ctx.core.request('mcp.login', { service });
        m.errors.delete(service);
        // 点了以后才拿到地址：这时还算人点的那一下（浏览器给的那几秒里），一般不会被拦
        if (typeof got?.url === 'string' && dialog.ctx.host?.open(got.url)) m.waiting.add(service);
        else dialog.toast(t('mcp_login.blocked'));
      } catch (err) {
        m.waiting.delete(service);
        m.errors.set(service, loginError(t, err));
      }
      button.disabled = false;
      dialog.drawBody();
    },
  }, t(st.waiting ? 'mcp_login.reopen' : 'mcp_login.login'));
}

/** 拒了的话写在按钮那一行下面（红字）。 @param {{error: string|null}} st */
export const loginErrorNode = (st) => (st.error ? h('p.set-desc.is-error.mcp-login-error', st.error) : null);
