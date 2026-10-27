// @ts-check
//! 管理员模式（蓝图 `web.md`「管理员模式」第 1 条，核心 Y-12下上）：哪些请求改的是系统那一层，管理员模式开着时外壳里要带 `"scope": "system"`。

/** 改系统那一层的方法（核心 `docs/reference/connection.md`「管理员模式」）：`config.set` 照 `layer`，`secret.*` 另算 */
const SYSTEM = new Set([
  'account.invite', 'account.invites', 'account.invite_revoke', 'account.list', 'account.disable', 'account.enable', 'account.set_admin',
  'package.install', 'package.remove', 'package.upgrade', 'package.enable', 'package.disable', 'package.clean', 'package.sync', 'package.restart', 'package.members',
  'extension.enable', 'extension.disable', 'extension.restart',
  'mcp.set', 'mcp.remove', 'mcp.login', 'mcp.login_finish', 'mcp.logout', 'mcp.restart',
  'provider.rename',
]);

/**
 * 这一个请求在管理员模式里要不要带 `scope`：系统那一层的方法、写系统那一层的 `config.set`、`secret.set`、`secret.delete`（不写 `layer` 的，
 * 管理员模式里存共用那一份；写了 `personal` 的照写的，不带）。
 * @param {string} method @param {any} params @returns {boolean}
 */
export function systemWrite(method, params) {
  if (SYSTEM.has(method)) return true;
  if (method === 'config.set') return params?.layer === 'system';
  if (method === 'secret.set' || method === 'secret.delete') return params?.layer !== 'personal';
  return false;
}
